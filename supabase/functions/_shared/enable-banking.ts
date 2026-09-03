import { createClient, type User } from 'npm:@supabase/supabase-js@2.114.0'

export const API_BASE = 'https://api.enablebanking.com'
export const SITE_URL = 'https://gianmoska-prog.github.io/PrivateHub/'
export const CALLBACK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enable-banking-callback`
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

export async function requireUser(req: Request): Promise<User> {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new Error('UNAUTHORISED')
  const { data, error } = await admin().auth.getUser(authorization.slice(7))
  if (error || !data.user) throw new Error('UNAUTHORISED')
  const { data: owner } = await admin().from('accounts').select('id').eq('owner_id', data.user.id).limit(1).maybeSingle()
  if (!owner) throw new Error('FORBIDDEN')
  return data.user
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function textToBase64Url(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function pemBytes(pem: string) {
  const normalized = pem.replaceAll('\\n', '\n')
  const base64 = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  if (!base64) throw new Error('ENABLE_BANKING_PRIVATE_KEY_INVALID')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

export async function applicationJwt() {
  const appId = Deno.env.get('ENABLE_BANKING_APP_ID')
  const pem = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')
  if (!appId || !pem) throw new Error('ENABLE_BANKING_NOT_CONFIGURED')
  const now = Math.floor(Date.now() / 1000)
  const header = textToBase64Url({ typ: 'JWT', alg: 'RS256', kid: appId })
  const payload = textToBase64Url({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 900 })
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))
  return `${header}.${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function ebFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${await applicationJwt()}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`ENABLE_BANKING_${response.status}`)
    ;(error as Error & { detail?: unknown }).detail = body
    throw error
  }
  return body
}

export async function sha256(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

export function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
  return ['UNAUTHORISED','FORBIDDEN','ENABLE_BANKING_NOT_CONFIGURED'].includes(message) ? message : 'INTEGRATION_ERROR'
}
