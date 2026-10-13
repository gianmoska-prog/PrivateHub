import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchTransactionPages, transactionStatus, requireSaved } from '../supabase/functions/_shared/transaction-pages.ts'

test('fetches all pages and preserves dates and encoded cursor through empty pages', async () => {
  const paths = []
  const responses = [{ transactions: [{ uid: 'old' }], continuation_key: 'a+/?' }, { transactions: [], continuation_key: 'b' }, { transactions: [{ uid: 'new' }], continuation_key: null }]
  const result = await fetchTransactionPages('account', '2026-07-15', async (path) => { paths.push(path); return responses.shift() })
  assert.deepEqual(result, { transactions: [{ uid: 'old' }, { uid: 'new' }], pages: 3 })
  paths.forEach(path => assert.equal(new URL(path, 'https://example.test').searchParams.get('date_from'), '2026-07-15'))
  assert.equal(new URL(paths[1], 'https://example.test').searchParams.get('continuation_key'), 'a+/?')
})
test('supports a terminal array and empty terminal response', async () => {
  assert.equal((await fetchTransactionPages('a', '2026-07-15', async () => [])).pages, 1)
  assert.deepEqual((await fetchTransactionPages('a', '2026-07-15', async () => ({ transactions: [] }))).transactions, [])
})
test('rejects malformed, cyclic, capped and failed pagination rather than claiming success', async () => {
  await assert.rejects(fetchTransactionPages('a', '2026-07-15', async () => ({})), /RESPONSE_INVALID/)
  await assert.rejects(fetchTransactionPages('a', '2026-07-15', async () => ({ transactions: [], continuation_key: 'repeat' })), /PAGINATION_INVALID/)
  await assert.rejects(fetchTransactionPages('a', '2026-07-15', async () => ({ transactions: [], continuation_key: 'more' }), 1), /PAGE_LIMIT/)
  await assert.rejects(fetchTransactionPages('a', '2026-07-15', async () => { throw new Error('ENABLE_BANKING_429') }), /429/)
})
test('provider pending codes remain pending and persistence errors cannot pass', () => {
  for (const code of ['PDNG', 'HOLD', 'SCHD', 'pending']) assert.equal(transactionStatus(code), 'pending')
  assert.equal(transactionStatus('BOOK'), 'booked')
  assert.throws(() => requireSaved({ error: { message: 'db failure' } }, 'TRANSACTION_SAVE_FAILED'), /TRANSACTION_SAVE_FAILED/)
  assert.doesNotThrow(() => requireSaved({ error: null }, 'TRANSACTION_SAVE_FAILED'))
})
