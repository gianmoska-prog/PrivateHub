import type { BankTransaction } from './types'

// Bank dates, rather than import order, determine the visible chronology.
export function newestTransactionsFirst(transactions: BankTransaction[]): BankTransaction[] {
  return [...transactions].sort((a, b) => {
    const dateA = a.booking_date || a.transaction_date || ''
    const dateB = b.booking_date || b.transaction_date || ''
    return dateB.localeCompare(dateA) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)
  })
}
