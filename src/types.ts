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
  balance_mode: 'none' | 'manual'
  manual_balance: number | null
  manual_currency: string
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

export type BankConnectionStatus = 'connecting' | 'selection_required' | 'connected' | 'action_required' | 'reconnect_required' | 'temporarily_unavailable' | 'disconnected'

export interface BankConnection {
  id: string
  canonical_account_id: string
  institution: string
  currency: string | null
  current_balance: number | null
  available_balance: number | null
  status: BankConnectionStatus
  last_successful_sync: string | null
  last_attempted_sync: string | null
  consent_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentFile {
  id: string
  document_id: string
  storage_path: string
  filename: string
  mime_type: string | null
  uploaded_at: string
  created_at: string
}

export interface BankAccountCandidate {
  id: string
  canonical_account_id: string
  display_name: string | null
  masked_identifier: string | null
  currency: string | null
  created_at: string
}

export interface BankTransaction {
  id: string
  bank_connection_id: string
  external_transaction_id: string
  transaction_date: string | null
  booking_date: string | null
  description: string
  counterparty: string | null
  amount: number
  currency: string
  status: 'pending' | 'booked'
  created_at: string
  updated_at: string
}

export interface SavingsSnapshot {
  id: string
  account_id: string
  amount: number
  currency: string
  recorded_at: string
  created_at: string
}

export interface HubData {
  accounts: Account[]
  memberships: Membership[]
  documents: DocumentRecord[]
  documentFiles: DocumentFile[]
  notes: NoteRecord[]
  integrations: IntegrationRecord[]
  bankConnections: BankConnection[]
  bankAccountCandidates: BankAccountCandidate[]
  bankTransactions: BankTransaction[]
  savingsHistory: SavingsSnapshot[]
}
