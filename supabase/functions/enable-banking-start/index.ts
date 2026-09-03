import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, CALLBACK_URL, cors, ebFetch, json, requireUser, safeError, sha256 } from '../_shared/enable-banking.ts'

const institutionAliases: Record<string, string[]> = {
  'Intesa Sanpaolo': ['intesa sanpaolo'],
  Revolut: ['revolut'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const user = await requireUser(req)
    const { accountId, language = 'en' } = await req.json()
    const db = admin()
    const { data: account } = await db.from('accounts').select('id,institution,country,status').eq('id', accountId).eq('owner_id', user.id).single()
    if (!account || account.status !== 'active' || !institutionAliases[account.institution]) return json({ error: 'ACCOUNT_NOT_CONNECTABLE' }, 400)

    const aspspsResponse = await ebFetch(`/aspsps?country=${account.country === 'Italy' ? 'IT' : account.country}`)
    const aspsps = Array.isArray(aspspsResponse) ? aspspsResponse : (aspspsResponse.aspsps || [])
    const aliases = institutionAliases[account.institution]
    const provider = aspsps.find((item: { name?: string }) => aliases.some((alias) => (item.name || '').toLowerCase().includes(alias)))
    if (!provider?.name) return json({ error: 'PROVIDER_UNAVAILABLE' }, 409)

    const state = crypto.randomUUID() + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    const validUntil = new Date(Date.now() + 89 * 24 * 60 * 60_000).toISOString()
    const { data: pending, error: pendingError } = await db.from('enable_banking_sessions').insert({
      owner_id: user.id, canonical_account_id: account.id, state_hash: await sha256(state), provider_name: provider.name,
      provider_country: 'IT', expires_at: expiresAt,
    }).select('id').single()
    if (pendingError) throw pendingError

    const authorization = await ebFetch('/auth', { method: 'POST', body: JSON.stringify({
      access: { balances: true, transactions: true, valid_until: validUntil }, aspsp: { name: provider.name, country: 'IT' },
      state, redirect_url: CALLBACK_URL, psu_type: 'personal', language: ['en','it'].includes(language) ? language : 'en',
    }) })
    await db.from('enable_banking_sessions').update({ authorization_id: authorization.authorization_id }).eq('id', pending.id)
    await db.from('bank_connections').upsert({ owner_id: user.id, canonical_account_id: account.id, institution: account.institution, status: 'connecting' }, { onConflict: 'owner_id,canonical_account_id' })
    return json({ url: authorization.url })
  } catch (error) {
    const code = safeError(error)
    return json({ error: code }, code === 'UNAUTHORISED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'ENABLE_BANKING_NOT_CONFIGURED' ? 503 : 500)
  }
})
