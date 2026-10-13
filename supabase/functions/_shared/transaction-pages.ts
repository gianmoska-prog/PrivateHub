type Transaction = Record<string, any>

// Keep the original date range unchanged across pages, including empty pages.
export async function fetchTransactionPages(
  uid: string,
  dateFrom: string,
  fetchPage: (path: string) => Promise<unknown>,
  maxPages = 100,
) {
  const transactions: Transaction[] = []
  const seen = new Set<string>()
  let continuation: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({ date_from: dateFrom })
    if (continuation) query.set('continuation_key', continuation)
    const body = await fetchPage(`/accounts/${uid}/transactions?${query}`)
    const result = body as { transactions?: Transaction[]; continuation_key?: string | null }
    const items = Array.isArray(body) ? body : result?.transactions
    if (!Array.isArray(items)) throw new Error('TRANSACTION_RESPONSE_INVALID')
    transactions.push(...items)
    const next = Array.isArray(body) ? null : result.continuation_key
    if (next == null || next === '') return { transactions, pages: page + 1 }
    if (typeof next !== 'string' || seen.has(next)) throw new Error('TRANSACTION_PAGINATION_INVALID')
    seen.add(next)
    continuation = next
  }
  throw new Error('TRANSACTION_PAGE_LIMIT')
}

export function transactionStatus(value: unknown): 'pending' | 'booked' {
  const status = String(value || '').toUpperCase()
  // The provider uses ISO codes, not just the English word "pending".
  return ['PDNG', 'HOLD', 'SCHD'].includes(status) || status.includes('PENDING') ? 'pending' : 'booked'
}

export function requireSaved(result: { error?: unknown }, code: string) {
  if (result.error) throw new Error(code)
}
