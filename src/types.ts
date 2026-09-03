export type Status = 'active' | 'pending' | 'not_uploaded' | 'connected' | 'not_connected'

export interface Account {
  id: string
  institution: string
  product_name: string | null
  country: string | null
  identifier_type: string | null
  identifier_value: string | null
  status: string
  nickname: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Membership {
  id: string
  provider: string
  program_name: string
  member_number: string | null
  tier: string | null
  balance: string | null
  status: string
  member_since: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DocumentRecord {
  id: string
  document_type: string
  country: string
  status: string
  storage_path: string | null
  filename: string | null
  mime_type: string | null
  uploaded_at: string | null
  updated_at: string
}

export interface NoteRecord {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface IntegrationRecord {
  id: string
  provider: string
  connection_status: string
  connected_at: string | null
  updated_at: string
}

export interface HubData {
  accounts: Account[]
  memberships: Membership[]
  documents: DocumentRecord[]
  notes: NoteRecord[]
  integrations: IntegrationRecord[]
}
