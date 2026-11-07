import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merchantPattern, resolvedCategory, summarizeSpending } from '../src/spending.ts'
const tx = (id, description, amount = -20) => ({ id, description, counterparty: null, amount, booking_date: '2026-11-06', currency: 'EUR', status: 'booked' })
const rule = (match_type, match_key, category) => ({ match_type, match_key, category })

test('merchant matching removes bank wrappers, variable dates, cards and references without merging distinct merchants', () => {
  const first = tx('a', 'PAGAMENTO POS EFFETTUATO IL 03/11/2026 ALLE ORE 12:20 MEDIANTE LA CARTA 1234 PRESSO CODELMAR S.R.L. MANZIANA')
  const next = tx('b', 'PAGAMENTO POS EFFETTUATO IL 06/11/2026 ALLE ORE 08:20 MEDIANTE LA CARTA 5678 PRESSO CODELMAR S.R.L. MANZIANA')
  assert.equal(merchantPattern(first), merchantPattern(next))
  assert.equal(merchantPattern(tx('c', 'PAGAM. TRAMITE POS CODELMAR S.R.L. PIAZZA DON 28/10-11:09 - Carta n.4138 ABI 09515')), 'codelmar s r l piazza don')
  assert.equal(merchantPattern(tx('generic', 'PAYPAL')), null)
  assert.notEqual(merchantPattern(first), merchantPattern(tx('other', 'CODELMAR RESTAURANT ROMA')))
})

test('correction moves a transaction out of Other and updates percentages without changing total', () => {
  const a = tx('a', 'Unrecognised merchant'), b = tx('b', 'CONAD', -30)
  const rules = [rule('transaction', 'a', 'dining')]
  const before = summarizeSpending([a, b], '2026-11-01', '2026-11-30', 'EUR', false)
  const after = summarizeSpending([a, b], '2026-11-01', '2026-11-30', 'EUR', false, rules)
  assert.equal(after.totalCents, before.totalCents)
  assert.equal(after.groups.find(group => group.category === 'dining').cents / after.totalCents, .4)
  assert.equal(after.groups.some(group => group.category === 'other'), false)
})

test('future merchant matches inherit categories; explicit corrections win; unrelated and ambiguous matches do not', () => {
  const item = tx('new', 'Unknown merchant')
  const rules = [rule('merchant', merchantPattern(item), 'sport')]
  assert.equal(resolvedCategory(item, rules), 'sport')
  assert.equal(resolvedCategory(item, [...rules, rule('transaction', 'new', 'health')]), 'health')
  assert.equal(resolvedCategory(tx('different', 'Unknown merchant roma'), rules), 'other')
  assert.equal(resolvedCategory(item, [...rules, rule('merchant', merchantPattern(item), 'health')]), 'other')
})

test('category corrections cannot turn savings transfers into spending', () => {
  const item = tx('saving', 'MOVIM. SALVADANAIO Accantonamento', -2000)
  assert.equal(summarizeSpending([item], '2026-11-01', '2026-11-30', 'EUR', false, [rule('transaction', 'saving', 'shopping')]).totalCents, 0)
})

test('confirmed own-account transfers are excluded from monthly and annual spending without removing transactions', () => {
  const items = [tx('internal', 'Sent from Revolut', -3017.19), tx('purchase', 'CONAD', -25)]
  items.forEach(item => { item.booking_date = '2026-07-11' })
  const rules = [rule('transaction', 'internal', 'internal_transfer')]
  for (const [start,end] of [['2026-07-01','2026-07-31'],['2026-01-01','2026-12-31']]) {
    const result = summarizeSpending(items,start,end,'EUR',false,rules)
    assert.equal(result.totalCents,2500)
    assert.equal(result.count,1)
  }
  assert.equal(items.length,2)
})

test('excluding one transaction leaves similar purchases included and restoring its category restores totals', () => {
  const items = [tx('one', 'CONAD', -20), tx('two', 'CONAD', -30)]
  const excluded = [rule('transaction','one','internal_transfer')]
  assert.equal(summarizeSpending(items,'2026-11-01','2026-11-30','EUR',false,excluded).totalCents,3000)
  const restored = [rule('transaction','one','groceries')]
  assert.equal(summarizeSpending(items,'2026-11-01','2026-11-30','EUR',false,restored).totalCents,5000)
})
