import type { PredictedExpense, PredictedExpenseInput } from './types'

export type Translate = (key: string, vars?: Record<string, string | number>) => string
export type ExpenseTiming = 'overdue' | 'today' | 'tomorrow' | 'week' | 'soon' | 'later' | 'undated'

// Calendar days, like the existing locale-aware header, rather than elapsed 24-hour periods.
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function calendarDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86400000
}

export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false
  return new Date(calendarDay(value) * 86400000).toISOString().slice(0, 10) === value
}

export function daysUntil(date: string | null, today: string): number | null {
  return date && validDateKey(date) ? calendarDay(date) - calendarDay(today) : null
}

export function expenseTiming(date: string | null, today: string): ExpenseTiming {
  const days = daysUntil(date, today)
  if (days == null) return 'undated'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return 'week'
  if (days <= 14) return 'soon'
  return 'later'
}

export function expenseTotal(items: PredictedExpense[]) {
  return {
    // Sum integer cents to avoid 0.10 + 0.20 becoming a projected rounding error.
    amount: items.reduce((sum, item) => sum + Math.round(Number(item.amount ?? 0) * 100), 0) / 100,
    estimated: items.some(item => item.amount_status === 'estimated'),
    unknown: items.filter(item => item.amount == null).length,
    count: items.length,
  }
}

export function summarizeExpenses(expenses: PredictedExpense[], today: string) {
  const upcoming = expenses.filter(item => item.status === 'upcoming' && !item.deleted_at)
    .sort((a, b) => (a.expected_date || '9999-12-31').localeCompare(b.expected_date || '9999-12-31') || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const within = (days: number) => upcoming.filter(item => {
    const distance = daysUntil(item.expected_date, today)
    return distance != null && distance >= 0 && distance <= days
  })
  const overdue = upcoming.filter(item => expenseTiming(item.expected_date, today) === 'overdue')
  return {
    upcoming,
    completed: expenses.filter(item => item.status === 'completed' && !item.deleted_at).sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at)),
    total: expenseTotal(upcoming),
    dueSoon: expenseTotal(within(7)),
    next14: within(14),
    overdue,
    undated: upcoming.filter(item => !item.expected_date),
  }
}

export function formatExpenseTotal(total: ReturnType<typeof expenseTotal>, locale: string, t: Translate): string {
  if (total.count && total.unknown === total.count) return t('expenses.amountUnknown')
  const amount = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(total.amount)
  const known = `${total.estimated ? '~' : ''}${amount}`
  return total.unknown ? t('expenses.partialTotal', { amount: known, count: total.unknown }) : known
}

export function formatExpenseAmount(item: PredictedExpense, locale: string, t: Translate): string {
  return formatExpenseTotal(expenseTotal([item]), locale, t)
}

export function validateExpense(input: PredictedExpenseInput): boolean {
  return Boolean(input.title.trim() && input.title.trim().length <= 160
    && (input.amount_status === 'estimated' || input.amount_status === 'confirmed')
    && (input.status === 'upcoming' || input.status === 'completed')
    && (input.amount == null ? input.amount_status === 'estimated' : Number.isFinite(input.amount) && input.amount >= 0 && input.amount <= 9999999999.99 && Math.abs(input.amount * 100 - Math.round(input.amount * 100)) < 0.001)
    && (!input.expected_date || validDateKey(input.expected_date))
    && (input.category?.trim().length || 0) <= 80 && (input.notes?.trim().length || 0) <= 3000)
}

// One forward-looking context shared by the overview review and the expenses page.
// Limit named items to two; paid/deleted records never enter any review signal.
export function predictedExpenseReview(expenses: PredictedExpense[], today: string, locale: string, t: Translate): string[] {
  const summary = summarizeExpenses(expenses, today)
  if (!summary.upcoming.length) return []
  const money = (items: PredictedExpense[]) => formatExpenseTotal(expenseTotal(items), locale, t)
  const detail = (item: PredictedExpense) => `${item.title} (${formatExpenseAmount(item, locale, t)})`
  const lines: string[] = []
  if (summary.overdue.length) lines.push(t(summary.overdue.length === 1 ? 'expenses.reviewOverdueOne' : 'expenses.reviewOverdue', { count: summary.overdue.length, expense: detail(summary.overdue[0]) }))
  const todayItems = summary.next14.filter(item => expenseTiming(item.expected_date, today) === 'today')
  if (todayItems.length) lines.push(t(todayItems.length === 1 ? 'expenses.reviewTodayOne' : 'expenses.reviewToday', { count: todayItems.length, amount: money(todayItems) }))
  const coming = summary.next14.filter(item => expenseTiming(item.expected_date, today) !== 'today')
  if (coming.length) {
    const examples = [...coming].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 2).map(detail).join(', ')
    lines.push(t('expenses.reviewSoon', { amount: money(summary.next14), examples }))
  }
  const later = summary.upcoming.filter(item => !summary.overdue.includes(item) && !summary.next14.includes(item))
  const large = [...later].filter(item => Number(item.amount || 0) >= 500).sort((a, b) => Number(b.amount) - Number(a.amount))[0]
  if (large) lines.push(t('expenses.reviewLarge', { expense: detail(large) }))
  else if (!summary.overdue.length && !summary.next14.length && later.length) lines.push(t(later.length === 1 ? 'expenses.reviewLaterOne' : 'expenses.reviewLater', { count: later.length, amount: money(later) }))
  if (summary.undated.length) lines.push(t(summary.undated.length === 1 ? 'expenses.reviewUndatedOne' : 'expenses.reviewUndated', { count: summary.undated.length }))
  return lines
}
