import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarMonth, summarizeSpending, spendingCategory } from '../src/spending.ts'
import { spendingMessages } from '../src/spendingMessages.ts'

const tx = (id, amount, description, date = '2026-11-06', extra = {}) => ({ id, amount, description, booking_date: date, transaction_date: null, currency: 'EUR', status: 'booked', counterparty: null, bank_connection_id: 'intesa', created_at: date, ...extra })

test('calendar months handle year rollover, leap years and local DST boundaries', () => {
  assert.deepEqual(calendarMonth('2026-01-01', -1), { start: '2025-12-01', end: '2025-12-31' })
  assert.deepEqual(calendarMonth('2024-03-31', -1), { start: '2024-02-01', end: '2024-02-29' })
  assert.deepEqual(calendarMonth('2026-11-07', -1), { start: '2026-10-01', end: '2026-10-31' })
})

test('money held in Salvadanaio and withdrawn piecemeal never doubles spending or becomes new savings', () => {
  const transactions = [tx('deposit', -2000, 'MOVIM. SALVADANAIO Accantonamento'), tx('withdraw1', 30, 'Riunione somme dal Salvadanaio'), tx('withdraw2', 50, 'Riunione somme dal Salvadanaio'), tx('return', -10, 'Accantonamento Salvadanaio'), tx('purchase1', -29.99, 'CONAD MANZIANA'), tx('purchase2', -40, 'Trainline'), tx('income', 2001, 'Salary'), tx('refund', 5, 'Refund CONAD')]
  const result = summarizeSpending(transactions, '2026-11-01', '2026-11-30', 'EUR', false)
  assert.equal(result.totalCents, 6999)
  assert.equal(result.count, 2)
  assert.equal(result.savingsMovementCount, 4)
  assert.deepEqual(result.groups.map(group => group.category), ['transport', 'groceries'])
})

test('boundaries, pending status, currency and undated outgoings remain separate', () => {
  const transactions = [tx('first', -0.1, 'CONAD', '2026-10-01'), tx('last', -0.2, 'LIDL', '2026-10-31'), tx('previous', -100, 'CONAD', '2026-09-30'), tx('next', -200, 'CONAD', '2026-11-01'), tx('pending', -15, 'Pizza', null, { transaction_date: '2026-10-31', status: 'pending' }), tx('foreign', -1000, 'CONAD', '2026-10-02', { currency: 'BRL' }), tx('undated', -25, 'Merchant', null), tx('bad', NaN, 'Merchant'), tx('invalid', -99, 'Merchant', 'invalid')]
  const booked = summarizeSpending(transactions, '2026-10-01', '2026-10-31', 'EUR', false)
  assert.equal(booked.totalCents, 30)
  assert.equal(booked.pendingCents, 1500)
  assert.equal(booked.undatedCount, 2)
  const withPending = summarizeSpending(transactions, '2026-10-01', '2026-10-31', 'EUR', true)
  assert.equal(withPending.totalCents, 1530)
  assert.equal(withPending.groups.reduce((sum, group) => sum + group.cents, 0), withPending.totalCents)
})

test('fuel is distinguished from groceries and ambiguous merchants are not invented', () => {
  assert.equal(spendingCategory(tx('fuel', -30, 'CONAD DISTRIBUTORE BRACCIANO')), 'transport')
  assert.equal(spendingCategory(tx('shop', -30, 'CONAD MANZIANA')), 'groceries')
  assert.equal(spendingCategory(tx('unknown', -30, 'PAYPAL *UNKNOWN')), 'other')
  assert.equal(spendingCategory(tx('cash', -30, 'PREL. SPORT. AUT Prelievo Cardless')), 'cash')
  assert.equal(spendingCategory(tx('transfer', -30, 'Bonifico Mario Rossi')), 'transfers')
  assert.deepEqual(summarizeSpending([], '2026-11-01', '2026-11-30', 'EUR', false).groups, [])
})

test('analysis translations are complete in every supported language', () => {
  const keys = Object.keys(spendingMessages.en).sort()
  for (const language of ['it', 'es']) assert.deepEqual(Object.keys(spendingMessages[language]).sort(), keys)
})
