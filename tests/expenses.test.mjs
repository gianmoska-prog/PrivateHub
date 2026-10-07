import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysUntil, expenseTiming, expenseTotal, formatExpenseTotal, predictedExpenseReview, summarizeExpenses, validDateKey, validateExpense } from '../src/expenses.ts'
import { expenseMessages } from '../src/expenseMessages.ts'

const today = '2026-10-07'
const t = (key, vars = {}) => Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)), expenseMessages.en[key] || key)
const expense = (overrides = {}) => ({ id: 'test', title: 'Dental visit', amount: 100, amount_status: 'confirmed', expected_date: today, category: null, notes: null, status: 'upcoming', completed_at: null, deleted_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...overrides })

test('calendar boundaries and DST are evaluated as dates, with no UTC/local shift', () => {
  for (const [date, expected] of [['2026-10-06', 'overdue'], [today, 'today'], ['2026-10-08', 'tomorrow'], ['2026-10-14', 'week'], ['2026-10-15', 'soon'], ['2026-10-21', 'soon'], ['2026-10-22', 'later'], [null, 'undated']]) assert.equal(expenseTiming(date, today), expected)
  assert.equal(daysUntil('2026-10-26', '2026-10-25'), 1)
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(validDateKey('2026-02-29'), false)
  assert.equal(validDateKey('2028-02-29'), true)
  assert.equal(validDateKey('2026-13-01'), false)
})

test('completed and deleted entries never affect outstanding totals or review warnings', () => {
  const entries = [expense(), expense({ id: 'paid', title: 'Paid secret', status: 'completed', completed_at: '2026-10-07T01:00:00Z', expected_date: '2026-10-01', amount: 1000 }), expense({ id: 'deleted', title: 'Deleted secret', deleted_at: '2026-10-07T01:00:00Z', amount: 5000 })]
  const summary = summarizeExpenses(entries, today)
  assert.equal(summary.total.amount, 100)
  assert.equal(summary.total.count, 1)
  assert.equal(summary.completed.length, 1)
  assert.equal(summary.overdue.length, 0)
  assert.doesNotMatch(predictedExpenseReview(entries, today, 'en-GB', t).join(' '), /Paid secret|Deleted secret/)
  assert.deepEqual(predictedExpenseReview(entries.slice(1), today, 'en-GB', t), [])
  assert.equal(summarizeExpenses([expense({ status: 'upcoming', completed_at: null, amount: 1000 })], today).total.amount, 1000)
})

test('totals preserve estimate and unknown flags without treating missing amounts as zero', () => {
  const items = [expense({ amount: 0.1 }), expense({ amount: 0.2, amount_status: 'estimated' }), expense({ amount: null, amount_status: 'estimated' })]
  const total = expenseTotal(items)
  assert.equal(total.amount, 0.3)
  assert.equal(total.unknown, 1)
  assert.match(formatExpenseTotal(total, 'en-GB', t), /^~.*0\.30.*1 unknown$/)
  assert.equal(formatExpenseTotal(expenseTotal([items[2]]), 'en-GB', t), 'Amount to confirm')
  assert.doesNotMatch(formatExpenseTotal(expenseTotal([expense()]), 'en-GB', t), /~/)
})

test('overdue, dated and undated expenses are grouped without double counting', () => {
  const items = [expense({ id: 'overdue', expected_date: '2026-10-06' }), expense({ id: 'week', expected_date: '2026-10-14', amount: 200 }), expense({ id: 'later', expected_date: '2026-10-22', amount: 300 }), expense({ id: 'unknown', expected_date: null, amount: 400 })]
  const summary = summarizeExpenses(items, today)
  assert.equal(summary.total.amount, 1000)
  assert.equal(summary.dueSoon.amount, 200)
  assert.equal(summary.overdue.length, 1)
  assert.equal(summary.next14.length, 1)
  assert.equal(summary.undated.length, 1)
  assert.deepEqual(summary.upcoming.map(item => item.id), ['overdue', 'week', 'later', 'unknown'])
})

test('review prioritises actionable context and bounds named near-term examples', () => {
  const items = [expense({ title: 'Overdue dental', expected_date: '2026-10-06' }), expense({ title: 'Due today' }), expense({ title: 'Service', amount: 500, expected_date: '2026-10-10' }), expense({ title: 'Insurance', amount: 280, amount_status: 'estimated', expected_date: '2026-10-12' }), expense({ title: 'Small third', amount: 5, expected_date: '2026-10-12' }), expense({ title: 'Large later', amount: 1000, expected_date: '2026-11-01' }), expense({ title: 'Unknown date', expected_date: null })]
  const review = predictedExpenseReview(items, today, 'en-GB', t).join(' ')
  assert.match(review, /Overdue dental.*Confirm whether/)
  assert.match(review, /expected today/)
  assert.match(review, /~.*885\.00.*Service.*Insurance/)
  assert.doesNotMatch(review, /Small third/)
  assert.match(review, /Large later/)
  assert.match(review, /no confirmed date/)
})

test('validation accepts uncertain, zero and past-date entries, rejects invalid data', () => {
  assert.equal(validateExpense(expense({ amount: null, amount_status: 'estimated', expected_date: null })), true)
  assert.equal(validateExpense(expense({ amount: 0, expected_date: '2026-10-01' })), true)
  for (const values of [{ title: '   ' }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { amount: 1.234 }, { amount: 10000000000 }, { amount: null }, { expected_date: '2026-02-30' }, { status: 'nonsense' }, { category: 'x'.repeat(81) }]) assert.equal(validateExpense(expense(values)), false, JSON.stringify(values))
})

test('all supported languages have complete expense translations', () => {
  for (const language of ['it', 'es']) assert.deepEqual(Object.keys(expenseMessages[language]).sort(), Object.keys(expenseMessages.en).sort())
})
