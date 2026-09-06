import { createClient } from '@supabase/supabase-js'
import type { HubData, NoteRecord } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const keepSignedInKey = 'private-hub-keep-signed-in'

export function getKeepSignedInPreference() {
  return window.localStorage.getItem(keepSignedInKey) !== 'false'
}

export function setKeepSignedInPreference(value: boolean) {
  window.localStorage.setItem(keepSignedInKey, String(value))
}

const authStorage = {
  getItem(storageKey: string) {
    return (getKeepSignedInPreference() ? window.localStorage : window.sessionStorage).getItem(storageKey)
  },
  setItem(storageKey: string, value: string) {
    const persistent = getKeepSignedInPreference()
    const selected = persistent ? window.localStorage : window.sessionStorage
    const other = persistent ? window.sessionStorage : window.localStorage
    selected.setItem(storageKey, value)
    other.removeItem(storageKey)
  },
  removeItem(storageKey: string) {
    window.localStorage.removeItem(storageKey)
    window.sessionStorage.removeItem(storageKey)
  },
}

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
}) : null

const blank: HubData = { accounts: [], memberships: [], documents: [], documentFiles: [], notes: [], integrations: [], bankConnections: [], bankAccountCandidates: [], bankTransactions: [], savingsHistory: [] }

export async function loadHubData(): Promise<HubData> {
  if (!supabase) return blank
  const tables = ['accounts', 'memberships', 'documents', 'document_files', 'notes', 'integrations', 'bank_connections', 'bank_account_candidates', 'bank_transactions', 'savings_history'] as const
  const results = await Promise.all(tables.map((table) => supabase.from(table).select('*').order('created_at', { ascending: true })))
  const failure = results.find((result) => result.error)
  if (failure?.error) throw failure.error
  return {
    accounts: results[0].data ?? [], memberships: results[1].data ?? [], documents: results[2].data ?? [], documentFiles: results[3].data ?? [],
    notes: results[4].data ?? [], integrations: results[5].data ?? [],
    bankConnections: results[6].data ?? [], bankAccountCandidates: results[7].data ?? [], bankTransactions: results[8].data ?? [], savingsHistory: results[9].data ?? [],
  } as HubData
}

async function invokeBanking(name: string, body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function startBankConnection(accountId: string, language: string) {
  const data = await invokeBanking('enable-banking-start', { accountId, language })
  if (!data?.url || !String(data.url).startsWith('https://')) throw new Error('Invalid authorisation URL')
  window.location.assign(data.url)
}

export async function refreshBankConnection(accountId: string) {
  return invokeBanking('enable-banking-refresh', { accountId })
}

export async function selectBankAccount(accountId: string, candidateId: string) {
  return invokeBanking('enable-banking-select', { accountId, candidateId })
}

export async function updateManualAccountBalance(accountId: string, balance: number, currency: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Invalid balance')
  const { error } = await supabase.from('accounts').update({ manual_balance: balance, manual_currency: currency }).eq('id', accountId).eq('balance_mode', 'manual')
  if (error) throw error
}

export async function saveNote(note: Partial<NoteRecord> & Pick<NoteRecord, 'title' | 'content'>) {
  if (!supabase) throw new Error('Supabase is not configured')
  const payload = { title: note.title.trim(), content: note.content.trim(), ...(note.id ? { id: note.id } : {}) }
  const { error } = await supabase.from('notes').upsert(payload)
  if (error) throw error
}

export async function createAccount(input: { institution: string; product_name?: string; country?: string; identifier_type?: string; identifier_value?: string }) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Unauthorised')
  const { error } = await supabase.from('accounts').insert({ owner_id: data.user.id, institution: input.institution.trim(), product_name: input.product_name?.trim() || null, country: input.country?.trim() || null, identifier_type: input.identifier_type?.trim() || null, identifier_value: input.identifier_value?.trim() || null, status: 'active' })
  if (error) throw error
}

export async function createMembership(input: { provider: string; program_name: string; member_number?: string }) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Unauthorised')
  const { error } = await supabase.from('memberships').insert({ owner_id: data.user.id, provider: input.provider.trim(), program_name: input.program_name.trim(), member_number: input.member_number?.trim() || null, status: 'active' })
  if (error) throw error
}

export async function deleteNote(id: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

export async function uploadDocuments(recordId: string, country: string, type: string, files: File[]) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!files.length) return
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) throw new Error('Unauthorised')
  const folder = `${user.id}/${country.toLowerCase()}/${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const uploaded: { storage_path: string; filename: string; mime_type: string; owner_id: string; document_id: string }[] = []
  try {
    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${folder}/${Date.now()}-${index}-${crypto.randomUUID()}-${safeName}`
      const { error } = await supabase.storage.from('private-hub-documents').upload(path, file, { upsert: false })
      if (error) throw error
      uploaded.push({ storage_path: path, filename: file.name, mime_type: file.type, owner_id: user.id, document_id: recordId })
    }
    const { error: insertError } = await supabase.from('document_files').insert(uploaded)
    if (insertError) throw insertError
    const { error: updateError } = await supabase.from('documents').update({ status: 'uploaded', uploaded_at: new Date().toISOString() }).eq('id', recordId)
    if (updateError) {
      await supabase.from('document_files').delete().in('storage_path', uploaded.map(file => file.storage_path))
      throw updateError
    }
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('private-hub-documents').remove(uploaded.map(file => file.storage_path))
    throw error
  }
}

export async function getDocumentPreviewUrl(path: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage.from('private-hub-documents').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function prepareDocumentShare(path: string, filename: string, mimeType: string | null) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage.from('private-hub-documents').download(path)
  if (error) throw error
  return new File([data], filename, { type: mimeType || data.type || 'application/octet-stream' })
}

export async function downloadDocument(path: string, filename: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage.from('private-hub-documents').createSignedUrl(path, 300, { download: filename })
  if (error) throw error
  const anchor = document.createElement('a')
  anchor.href = data.signedUrl
  anchor.download = filename
  anchor.click()
}

export async function removeDocumentFile(recordId: string, fileId: string, path: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage.from('private-hub-documents').remove([path])
  if (error) throw error
  const { error: deleteError } = await supabase.from('document_files').delete().eq('id', fileId).eq('document_id', recordId)
  if (deleteError) throw deleteError
  const { count, error: countError } = await supabase.from('document_files').select('id', { count: 'exact', head: true }).eq('document_id', recordId)
  if (countError) throw countError
  const payload = count ? { status: 'uploaded' } : { status: 'not_uploaded', storage_path: null, filename: null, mime_type: null, uploaded_at: null }
  const { error: updateError } = await supabase.from('documents').update(payload).eq('id', recordId)
  if (updateError) throw updateError
}
