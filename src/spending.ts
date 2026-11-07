import type { BankTransaction } from './types'

export const spendingCategories = ['groceries', 'dining', 'transport', 'shopping', 'bills', 'health', 'sport', 'services', 'fees', 'cash', 'transfers', 'internal_transfer', 'other'] as const
export type SpendingCategory = typeof spendingCategories[number]
export type CategoryRule = { owner_id: string; match_type: 'transaction' | 'merchant'; match_key: string; category: SpendingCategory; created_at: string }

// Conservative matching: normalise banking wrappers, never use amounts or fuzzy substrings.
export function merchantPattern(transaction: BankTransaction): string | null {
  let text = (transaction.counterparty?.trim() || transaction.description).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\bpresso\s+/.test(text)) text = text.split(/\bpresso\s+/).pop() || ''
  text = text.replace(/^pagam(?:ento|\.)?\s*(?:tramite\s*)?pos\s*/i, '')
    .replace(/\b(?:carta|card|abi|cod|rif|reference|id transazione)\b.*$/i, '')
    .replace(/\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?.*$/, '')
    .replace(/\b\d{4,}\b/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length < 4 || text.length > 200 || /^(pagamento|pagam|pos|bonifico|transfer|paypal|transaction|movimento|carta|card)(\s+(pos|effettuato|tramite|a|da|favore|di))*$/.test(text)) return null
  return text
}

export function resolvedCategory(transaction: BankTransaction, rules: CategoryRule[] = []): SpendingCategory {
  const exact = rules.find(rule => rule.match_type === 'transaction' && rule.match_key === transaction.id)
  if (exact) return exact.category
  const pattern = merchantPattern(transaction)
  const learned = pattern ? rules.filter(rule => rule.match_type === 'merchant' && rule.match_key === pattern) : []
  const categories = new Set(learned.map(rule => rule.category))
  return categories.size === 1 ? learned[0].category : spendingCategory(transaction)
}
export const categoryColors: Record<SpendingCategory, string> = {
  internal_transfer: '#929ca8', services: '#c58eae', groceries: '#399c88', dining: '#e3a15b', transport: '#618ee0', shopping: '#aa82cf',
  bills: '#5da9bd', health: '#d97d98', sport: '#8aa35a', fees: '#b79666',
  cash: '#7c8baf', transfers: '#bc8980', other: '#929ca8',
}

export function bankDate(transaction: BankTransaction) {
  const date = transaction.booking_date || transaction.transaction_date || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null
}

export function isSavingsMovement(transaction: BankTransaction) {
  return /salvadanaio/i.test(`${transaction.counterparty || ''} ${transaction.description}`)
}

export function spendingCategory(transaction: BankTransaction): SpendingCategory {
  const text = `${transaction.counterparty || ''} ${transaction.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/prelievo|prel\.?\s*(sport|atm)|cash withdrawal/.test(text)) return 'cash'
  if (/conad distributore|carburant|benzina|\b(q8|eni|esso|tamoil|ip station)\b|easypark|trainline|trenitalia|italo treno|autostrade|telepass|\b(uber|taxi|atac)\b/.test(text)) return 'transport'
  if (/\b(conad|eurospin|lidl|aldi|carrefour|esselunga|coop|supermercato|ipertriscount|md market|penny market)\b/.test(text)) return 'groceries'
  if (/ristorant|birrificio|birreria|gelateria|pasticceria|pizzeria|\bpizza\b|\bbar\b|caffe|coffee|mcdonald|burger king|deliveroo|just eat|glovo|trattoria|sushi/.test(text)) return 'dining'
  if (/farmacia|pharmacy|dentist|dentale|medic|ospedale|clinica/.test(text)) return 'health'
  if (/tennis|piscina|nuoto|swimming|palestra|fitness/.test(text)) return 'sport'
  if (/canone|commission|imposta|bollo|bank fee/.test(text)) return 'fees'
  if (/netflix|spotify|migadu|vodafone|iliad|fastweb|enel|a2a energia|bolletta|assicuraz/.test(text)) return 'bills'
  if (/amazon|ikea|zalando|decathlon|\bh&m\b|zara|unieuro|mediaworld/.test(text)) return 'shopping'
  if (/bonifico|giroconto|transfer|ricarica revolut|top.?up/.test(text)) return 'transfers'
  return 'other'
}

export function calendarMonth(today: string, offset = 0) {
  const date = new Date(`${today}T12:00:00`)
  const first = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
  const key = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return { start: key(first), end: key(last) }
}

export function summarizeSpending(transactions: BankTransaction[], start: string, end: string, currency: string, includePending: boolean, rules: CategoryRule[] = []) {
  const period = transactions.filter(item => {
    const date = bankDate(item)
    return date && date >= start && date <= end && item.currency === currency && Number.isFinite(Number(item.amount))
  })
  const outgoing = period.filter(item => Number(item.amount) < 0 && !isSavingsMovement(item) && resolvedCategory(item, rules) !== 'internal_transfer')
  const booked = outgoing.filter(item => item.status === 'booked')
  const pending = outgoing.filter(item => item.status === 'pending')
  const included = includePending ? outgoing : booked
  const cents = (items: BankTransaction[]) => items.reduce((sum, item) => sum + Math.round(Math.abs(Number(item.amount)) * 100), 0)
  const groups = spendingCategories.map(category => {
    const items = included.filter(item => resolvedCategory(item, rules) === category)
    return { category, items, cents: cents(items) }
  }).filter(group => group.items.length).sort((a, b) => b.cents - a.cents)
  return { groups, totalCents: cents(included), bookedCents: cents(booked), pendingCents: cents(pending),
    pendingCount: pending.length, count: included.length,
    savingsMovementCount: period.filter(isSavingsMovement).length,
    undatedCount: transactions.filter(item => item.currency === currency && Number(item.amount) < 0 && !bankDate(item) && !isSavingsMovement(item)).length,
  }
}
