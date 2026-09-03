import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, cors, json, requireUser, safeError } from '../_shared/enable-banking.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const user = await requireUser(req)
    const { accountId, candidateId } = await req.json()
    const db = admin()
    const { data: candidate } = await db.from('bank_account_candidates').select('*').eq('id', candidateId).eq('canonical_account_id', accountId).eq('owner_id', user.id).single()
    const { data: account } = await db.from('accounts').select('institution').eq('id', accountId).eq('owner_id', user.id).single()
    if (!candidate || !account) return json({ error: 'CANDIDATE_NOT_FOUND' }, 404)
    await db.from('bank_connections').upsert({ owner_id: user.id, canonical_account_id: accountId, institution: account.institution,
      provider_account_uid: candidate.provider_account_uid, provider_identification_hash: candidate.identification_hash,
      currency: candidate.currency, status: 'connected' }, { onConflict: 'owner_id,canonical_account_id' })
    await db.from('bank_account_candidates').delete().eq('owner_id', user.id).eq('canonical_account_id', accountId)
    return json({ ok: true })
  } catch (error) {
    const code = safeError(error); return json({ error: code }, code === 'UNAUTHORISED' ? 401 : code === 'FORBIDDEN' ? 403 : 500)
  }
})

