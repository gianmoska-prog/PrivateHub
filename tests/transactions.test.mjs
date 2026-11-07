import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newestTransactionsFirst } from '../src/transactions.ts'

test('Movimenti uses newest bank dates first, with pending date fallback and undated entries last', () => {
  const transactions = [
    { id: 'july', booking_date: '2026-07-15', transaction_date: '2026-07-14', created_at: '2026-11-07' },
    { id: 'unknown', booking_date: null, transaction_date: null, created_at: '2026-11-08' },
    { id: 'salary', booking_date: '2026-11-06', transaction_date: '2026-11-05', created_at: '2026-11-06' },
    { id: 'pending', booking_date: null, transaction_date: '2026-11-07', created_at: '2026-11-07' },
    { id: 'same-day', booking_date: '2026-11-06', transaction_date: null, created_at: '2026-11-07' },
  ]
  const original = [...transactions]
  assert.deepEqual(newestTransactionsFirst(transactions).map(item => item.id), ['pending', 'same-day', 'salary', 'july', 'unknown'])
  assert.deepEqual(transactions, original)
  assert.deepEqual(newestTransactionsFirst([]), [])
})
