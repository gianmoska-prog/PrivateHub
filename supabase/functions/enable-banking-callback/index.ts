import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, ebFetch, sha256, SITE_URL } from '../_shared/enable-banking.ts'

const redirect = (params: Record<string, string>) => {
  const url = new URL(SITE_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return Response.redirect(url, 302)
}
const clean = (value: string) => value.replace(/\s/g, '').toUpperCase()

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const state = url.searchParams.get('state') || ''
  const code = url.searchParams.get('code') || ''
  if (!state || url.searchParams.has('error')) return redirect({ banking: 'error' })
  try {
    const db = admin()
    const hash = await sha256(state)
    const { data: pending } = await db.from('enable_banking_sessions').select('*').eq('state_hash', hash).gt('expires_at', new Date().toISOString()).eq('status', 'connecting').single()
    if (!pending || !code) return redirect({ banking: 'invalid' })
    const session = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) })
    const accounts = Array.isArray(session.accounts) ? session.accounts : []
    const { data: canonical } = await db.from('accounts').select('identifier_value,institution').eq('id', pending.canonical_account_id).eq('owner_id', pending.owner_id).single()
    const wanted = clean(canonical?.identifier_value || '')
    const exact = accounts.filter((item: Record<string, unknown>) => {
      const accountId = (item.account_id || {}) as Record<string, unknown>
      return wanted && Object.values(accountId).some((value) => typeof value === 'string' && clean(value) === wanted)
    })
    const chosen = exact.length === 1 ? exact[0] : null
    await db.from('enable_banking_sessions').update({ session_id: session.session_id, status: chosen ? 'connected' : 'selection_required', expires_at: session.access?.valid_until || pending.expires_at }).eq('id', pending.id)

    if (chosen) {
      await db.from('bank_connections').upsert({ owner_id: pending.owner_id, canonical_account_id: pending.canonical_account_id, institution: canonical.institution,
        provider_account_uid: chosen.uid, provider_identification_hash: chosen.identification_hash, currency: chosen.currency,
        status: 'connected', consent_expires_at: session.access?.valid_until || null,
      }, { onConflict: 'owner_id,canonical_account_id' })
      await db.from('bank_account_candidates').delete().eq('owner_id', pending.owner_id).eq('canonical_account_id', pending.canonical_account_id)
    } else {
      await db.from('bank_connections').upsert({ owner_id: pending.owner_id, canonical_account_id: pending.canonical_account_id, institution: canonical.institution, status: 'selection_required' }, { onConflict: 'owner_id,canonical_account_id' })
      const candidates = accounts.filter((item: Record<string, unknown>) => item.uid).map((item: Record<string, unknown>) => {
        const accountId = (item.account_id || {}) as Record<string, unknown>
        const other = (accountId.other || {}) as Record<string, unknown>
        const raw = String(accountId.iban || other.identification || '')
        return { owner_id: pending.owner_id, canonical_account_id: pending.canonical_account_id, provider_account_uid: item.uid,
          institution: canonical.institution, display_name: item.name || item.product || null, masked_identifier: raw ? `•••• ${raw.slice(-4)}` : null,
          currency: item.currency || null, identification_hash: item.identification_hash || null }
      })
      if (candidates.length) await db.from('bank_account_candidates').upsert(candidates, { onConflict: 'owner_id,canonical_account_id,provider_account_uid' })
    }
    return redirect({ banking: chosen ? 'connected' : 'select', account: pending.canonical_account_id })
  } catch {
    return redirect({ banking: 'error' })
  }
})
