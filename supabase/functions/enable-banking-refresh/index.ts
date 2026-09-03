import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, cors, ebFetch, json, requireUser, safeError } from '../_shared/enable-banking.ts'

const numberValue = (value: unknown) => Number(typeof value === 'object' && value ? (value as Record<string, unknown>).amount : value)
const amountInfo = (transaction: Record<string, unknown>) => (transaction.transaction_amount || transaction.amount || {}) as Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const user = await requireUser(req)
    const { accountId } = await req.json()
    const db = admin()
    const { data: connection } = await db.from('bank_connections').select('*').eq('canonical_account_id', accountId).eq('owner_id', user.id).single()
    if (!connection?.provider_account_uid) return json({ error: 'NOT_CONNECTED' }, 409)
    if (connection.last_attempted_sync && Date.now() - Date.parse(connection.last_attempted_sync) < 60_000) return json({ error: 'REFRESH_COOLDOWN' }, 429)
    await db.from('bank_connections').update({ last_attempted_sync: new Date().toISOString() }).eq('id', connection.id)
    try {
      const uid = encodeURIComponent(connection.provider_account_uid)
      const [balancesBody, transactionsBody] = await Promise.all([ebFetch(`/accounts/${uid}/balances`), ebFetch(`/accounts/${uid}/transactions?date_from=${new Date(Date.now()-90*86400000).toISOString().slice(0,10)}`)])
      const balances = Array.isArray(balancesBody) ? balancesBody : (balancesBody.balances || [])
      const current = balances.find((item: Record<string, unknown>) => ['CLBD','ITAV','closingBooked'].includes(String(item.balance_type || item.name))) || balances[0]
      const available = balances.find((item: Record<string, unknown>) => ['ITBD','XAVL','interimAvailable'].includes(String(item.balance_type || item.name)))
      const currency = String((current?.balance_amount || current)?.currency || connection.currency || 'EUR')
      const transactions = Array.isArray(transactionsBody) ? transactionsBody : (transactionsBody.transactions || [])
      const rows = transactions.map((item: Record<string, unknown>, index: number) => {
        const amount = amountInfo(item)
        const externalId = String(item.transaction_id || item.entry_reference || item.uid || `${item.booking_date || item.value_date}-${amount.amount}-${index}`)
        const credit = String(item.credit_debit_indicator || '').toUpperCase() === 'CRDT' ? 1 : -1
        return { owner_id: user.id, bank_connection_id: connection.id, external_transaction_id: externalId,
          transaction_date: item.value_date || item.transaction_date || null, booking_date: item.booking_date || item.value_date || null,
          description: String(item.remittance_information || item.description || item.bank_transaction_code?.description || ''),
          counterparty: item.creditor?.name || item.debtor?.name || item.counterparty || null,
          amount: Math.abs(numberValue(amount)) * credit, currency: String(amount.currency || currency),
          status: String(item.status || '').toLowerCase().includes('pending') ? 'pending' : 'booked' }
      })
      if (rows.length) await db.from('bank_transactions').upsert(rows, { onConflict: 'bank_connection_id,external_transaction_id' })
      const syncedAt = new Date().toISOString()
      await db.from('bank_connections').update({ current_balance: numberValue(current?.balance_amount || current), available_balance: available ? numberValue(available.balance_amount || available) : null,
        currency, status: 'connected', last_successful_sync: syncedAt, last_error_code: null }).eq('id', connection.id)
      return json({ ok: true, lastSuccessfulSync: syncedAt })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INTEGRATION_ERROR'
      const status = code.includes('401') || code.includes('403') ? 'reconnect_required' : 'temporarily_unavailable'
      await db.from('bank_connections').update({ status, last_error_code: code.slice(0, 80) }).eq('id', connection.id)
      return json({ error: 'UNABLE_TO_REFRESH' }, 502)
    }
  } catch (error) {
    const code = safeError(error); return json({ error: code }, code === 'UNAUTHORISED' ? 401 : code === 'FORBIDDEN' ? 403 : 500)
  }
})
