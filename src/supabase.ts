import { createClient } from '@supabase/supabase-js'
import type { HubData, NoteRecord } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

const blank: HubData = { accounts: [], memberships: [], documents: [], notes: [], integrations: [] }

export async function loadHubData(): Promise<HubData> {
  if (!supabase) return blank
  const tables = ['accounts', 'memberships', 'documents', 'notes', 'integrations'] as const
  const results = await Promise.all(tables.map((table) => supabase.from(table).select('*').order('created_at', { ascending: true })))
  const failure = results.find((result) => result.error)
  if (failure?.error) throw failure.error
  return {
    accounts: results[0].data ?? [], memberships: results[1].data ?? [], documents: results[2].data ?? [],
    notes: results[3].data ?? [], integrations: results[4].data ?? [],
  } as HubData
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

export async function uploadDocument(recordId: string, country: string, type: string, file: File, existingPath?: string | null) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) throw new Error('Unauthorised')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${user.id}/${country.toLowerCase()}/${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('private-hub-documents').upload(path, file, { upsert: false })
  if (uploadError) throw uploadError
  const { error: updateError } = await supabase.from('documents').update({ status: 'uploaded', storage_path: path, filename: file.name, mime_type: file.type, uploaded_at: new Date().toISOString() }).eq('id', recordId)
  if (updateError) {
    await supabase.storage.from('private-hub-documents').remove([path])
    throw updateError
  }
  if (existingPath) await supabase.storage.from('private-hub-documents').remove([existingPath])
}

export async function downloadDocument(path: string, filename: string, open = false) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage.from('private-hub-documents').download(path)
  if (error) throw error
  const href = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = open ? '' : filename
  if (open) anchor.target = '_blank'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
}

export async function removeDocument(recordId: string, path: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage.from('private-hub-documents').remove([path])
  if (error) throw error
  const { error: updateError } = await supabase.from('documents').update({ status: 'not_uploaded', storage_path: null, filename: null, mime_type: null, uploaded_at: null }).eq('id', recordId)
  if (updateError) throw updateError
}
