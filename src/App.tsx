import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Banknote, CalendarDays, Check, ChevronRight, CircleUserRound, Copy, Download, FileText,
  FolderClosed, Home, LogOut, Menu, NotebookPen, Pencil, Plane, Plus, Search, Settings,
  ShieldCheck, Star, Trash2, Upload, WifiOff, X,
} from 'lucide-react'
import { createAccount, createMembership, deleteNote, downloadDocument, isSupabaseConfigured, loadHubData, removeDocument, saveNote, supabase, uploadDocument } from './supabase'
import type { Account, DocumentRecord, HubData, Membership, NoteRecord } from './types'

type Page = 'overview' | 'accounts' | 'memberships' | 'travel' | 'documents' | 'notes' | 'settings'
type Selected = { kind: 'account'; item: Account } | { kind: 'membership'; item: Membership } | null
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const NAV: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'accounts', label: 'Accounts', icon: Banknote },
  { id: 'memberships', label: 'Memberships', icon: Star },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const publicPreview: HubData = {
  accounts: [
    ['intesa', 'Intesa Sanpaolo', 'XME Silver', 'Italy', 'IBAN', 'active'],
    ['revolut', 'Revolut', 'Revolut Italia', 'Italy', 'IBAN', 'active'],
    ['paypal', 'PayPal', 'PayPal Account', null, 'Email', 'active'],
    ['nubank', 'Nubank', 'Nubank Brasil', 'Brazil', 'Chave PIX', 'active'],
    ['amex', 'American Express', null, null, null, 'pending'],
  ].map(([id, institution, product_name, country, identifier_type, status]) => ({ id, institution, product_name, country, identifier_type, status, identifier_value: null, nickname: null, notes: null, created_at: '', updated_at: '' })) as Account[],
  memberships: ['Marriott Bonvoy', 'Hilton Honors', 'Miles & More'].map((program_name, index) => ({ id: String(index), provider: program_name.split(' ')[0], program_name, member_number: null, tier: null, balance: null, status: 'active', member_since: null, notes: null, created_at: '', updated_at: '' })),
  documents: [
    ['Passport', 'Italy', 'not_uploaded'], ['Carta d’identità', 'Italy', 'not_uploaded'], ['Tessera Sanitaria', 'Italy', 'not_uploaded'], ['Patente italiana', 'Italy', 'pending'],
    ['RG', 'Brazil', 'not_uploaded'], ['CPF', 'Brazil', 'not_uploaded'], ['CNH', 'Brazil', 'not_uploaded'],
  ].map(([document_type, country, status], index) => ({ id: String(index), document_type, country, status, storage_path: null, filename: null, mime_type: null, uploaded_at: null, updated_at: '' })),
  notes: [],
  integrations: [
    { id: 'gmail', provider: 'Gmail', connection_status: 'not_connected', connected_at: null, updated_at: '' },
    { id: 'supabase', provider: 'Supabase', connection_status: 'not_connected', connected_at: null, updated_at: '' },
  ],
}

const accountArt: Record<string, string> = {
  'Intesa Sanpaolo': assetUrl('assets/intesa-card.png'), Revolut: assetUrl('assets/revolut-card.webp'), PayPal: assetUrl('assets/paypal.webp'), Nubank: assetUrl('assets/nubank-card-gianluca.webp'),
}
const membershipArt: Record<string, string> = { 'Marriott Bonvoy': assetUrl('assets/marriott.png'), 'Hilton Honors': assetUrl('assets/hilton.png') }

function Brand() {
  return <div className="brand"><svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.7"><ellipse cx="17" cy="17" rx="8" ry="12" transform="rotate(-45 17 17)"/><ellipse cx="31" cy="17" rx="8" ry="12" transform="rotate(45 31 17)"/><ellipse cx="17" cy="31" rx="8" ry="12" transform="rotate(45 17 31)"/><ellipse cx="31" cy="31" rx="8" ry="12" transform="rotate(-45 31 31)"/></g></svg><span>Private <em>Hub</em></span></div>
}

function AuthGate() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
    const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } })
    setBusy(false)
    if (authError) setError('Unable to send the sign-in link. Try again.')
    else setSent(true)
  }
  return <main className="auth-shell">
    <section className="auth-card">
      <Brand />
      <div className="auth-scene"><img src={assetUrl('assets/lake-scene.svg')} alt="" /></div>
      <div className="auth-copy">
        <span className="eyebrow">Private access</span>
        <h1>Your personal world,<br/>quietly organised.</h1>
        <p>Sign in with your authorised email. We’ll send you a secure link—no password to remember.</p>
        {sent ? <div className="success-message"><Check size={18}/><span><strong>Check your inbox</strong><small>The sign-in link is ready.</small></span></div> :
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? 'Sending…' : 'Send secure link'}</button>
          </form>}
        <span className="privacy-note"><ShieldCheck size={15}/> Protected by authentication and row-level security</span>
      </div>
    </section>
  </main>
}

function Status({ value }: { value: string }) {
  const pending = value.includes('pending') || value === 'not_uploaded' || value === 'not_connected'
  const label = value === 'not_uploaded' ? 'Not uploaded' : value === 'not_connected' ? 'Not connected' : value.replaceAll('_', ' ')
  return <span className={`status ${pending ? 'status-muted' : 'status-active'}`}><i/>{label}</span>
}

function AccountCard({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const art = accountArt[account.institution]
  return <button className={`account-card ${account.status.includes('pending') ? 'is-pending' : ''}`} onClick={onOpen}>
    <div className="account-visual">
      {art ? <img src={art} alt="" /> : <span className="monogram">AE</span>}
    </div>
    <strong>{account.institution}</strong>
    <span>{account.product_name ?? 'Application pending'}</span>
    <small>{account.identifier_type ? `${account.identifier_type} secured` : 'No identifier added'}</small>
    <Status value={account.status}/>
  </button>
}

function MembershipRow({ membership, onOpen }: { membership: Membership; onOpen: () => void }) {
  const art = membershipArt[membership.program_name]
  return <button className="membership-row" onClick={onOpen}>
    <span className="membership-logo">{art ? <img src={art} alt=""/> : <b>M&amp;M</b>}</span>
    <span className="membership-title"><strong>{membership.program_name}</strong><small>Membership number {membership.member_number ? 'secured' : 'not added'}</small></span>
    <Status value={membership.status}/><ChevronRight size={17}/>
  </button>
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Plane; title: string; text: string }) {
  return <div className="empty-state"><span><Icon size={27}/></span><h2>{title}</h2><p>{text}</p></div>
}

function DetailSheet({ selected, onClose, toast }: { selected: NonNullable<Selected>; onClose: () => void; toast: (message: string) => void }) {
  const account = selected.kind === 'account' ? selected.item : null
  const membership = selected.kind === 'membership' ? selected.item : null
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast('Copied') }
  return <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
    <section className="detail-sheet" role="dialog" aria-modal="true" aria-label={`${account?.institution ?? membership?.program_name} details`} onMouseDown={(e) => e.stopPropagation()}>
      <button className="icon-button sheet-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      {account ? <>
        <div className="detail-brand"><span className="detail-mark">{account.institution.slice(0,2).toUpperCase()}</span><div><span className="eyebrow">Account</span><h2>{account.institution}</h2><p>{account.product_name ?? 'Application pending'}</p></div></div>
        <Status value={account.status}/>
        {account.status.includes('pending') ? <div className="calm-message"><h3>Application pending</h3><p>Details can be added once the account is active.</p></div> : <div className="detail-list">
          <h3>Account details</h3>
          {account.country && <div><span>Country</span><strong>{account.country}</strong></div>}
          {account.identifier_type && <div><span>{account.identifier_type}</span><strong className="private-value">{account.identifier_value ?? 'Not added'}</strong>{account.identifier_value && <button onClick={() => copy(account.identifier_value!)}><Copy size={15}/> Copy {account.identifier_type}</button>}</div>}
          <div><span>Notes</span><strong>{account.notes || 'Not added'}</strong></div>
        </div>}
      </> : membership && <>
        <div className="detail-brand"><span className="detail-mark"><Star size={22}/></span><div><span className="eyebrow">Membership</span><h2>{membership.program_name}</h2><p>{membership.provider}</p></div></div>
        <Status value={membership.status}/>
        <div className="detail-list">
          <h3>Membership details</h3>
          <div><span>Membership number</span><strong className="private-value">{membership.member_number || 'Not added'}</strong>{membership.member_number && <button onClick={() => copy(membership.member_number!)}><Copy size={15}/> Copy number</button>}</div>
          <div><span>Tier</span><strong>{membership.tier || 'Not added'}</strong></div>
          <div><span>Points / miles</span><strong>{membership.balance || 'Not connected'}</strong></div>
          <div><span>Member since</span><strong>{membership.member_since || 'Not added'}</strong></div>
          <div><span>Notes</span><strong>{membership.notes || 'Not added'}</strong></div>
        </div>
      </>}
    </section>
  </div>
}

function DocumentCard({ item, refresh, toast }: { item: DocumentRecord; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const enabled = item.document_type !== 'Patente italiana'
  const choose = async (file?: File) => {
    if (!file) return; setBusy(true)
    try { await uploadDocument(item.id, item.country, item.document_type, file, item.storage_path); await refresh(); toast('Document uploaded securely') }
    catch { toast('Upload failed') } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const remove = async () => {
    if (!item.storage_path || !confirm(`Delete ${item.filename ?? 'this document'}? This cannot be undone.`)) return
    setBusy(true); try { await removeDocument(item.id, item.storage_path); await refresh(); toast('Document deleted') } catch { toast('Unable to delete document') } finally { setBusy(false) }
  }
  return <article className="document-card">
    <div className="document-head"><span><FileText size={20}/></span><Status value={item.status}/></div>
    <h3>{item.document_type}</h3><p>{item.filename || (enabled ? 'Ready for a secure upload' : 'Driving licence conversion pending')}</p>
    {enabled && <div className="document-actions">
      <input ref={input} type="file" hidden onChange={(e) => choose(e.target.files?.[0])} accept="application/pdf,image/jpeg,image/png,image/webp"/>
      {item.storage_path ? <>
        <button disabled={busy} onClick={() => downloadDocument(item.storage_path!, item.filename || 'document', true)}><CircleUserRound size={16}/> View</button>
        <button disabled={busy} onClick={() => downloadDocument(item.storage_path!, item.filename || 'document')}><Download size={16}/> Download</button>
        <button disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/> Replace</button>
        <button className="danger" disabled={busy} onClick={remove}><Trash2 size={16}/> Delete</button>
      </> : <button className="soft-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/>{busy ? 'Uploading…' : 'Upload'}</button>}
    </div>}
  </article>
}

function NotesView({ notes, preview, refresh, toast }: { notes: NoteRecord[]; preview: boolean; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const [editing, setEditing] = useState<Partial<NoteRecord> | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return
    if (preview) return toast('Connect Supabase to save notes')
    try { await saveNote({ id: editing.id, title: editing.title || '', content: editing.content || '' }); setEditing(null); await refresh(); toast('Note saved') } catch { toast('Unable to save note') }
  }
  return <>
    <PageHeader eyebrow="Private writing" title="Notes" action={<button className="primary-button compact" onClick={() => setEditing({ title: '', content: '' })}><Plus size={17}/> New note</button>}/>
    {notes.length ? <div className="notes-grid">{notes.map((note) => <article className="note-card" key={note.id}><button onClick={() => setEditing(note)}><span>{new Date(note.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><h3>{note.title}</h3><p>{note.content}</p></button><button className="note-delete" aria-label={`Delete ${note.title}`} onClick={async () => { if (confirm(`Delete “${note.title}”?`)) { await deleteNote(note.id); await refresh(); toast('Note deleted') }}}><Trash2 size={15}/></button></article>)}</div> : <EmptyState icon={NotebookPen} title="No notes yet" text="Create a private note when you have something worth keeping."/>}
    {editing && <div className="sheet-layer" onMouseDown={() => setEditing(null)}><form className="note-editor" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><button type="button" className="icon-button sheet-close" onClick={() => setEditing(null)}><X size={20}/></button><span className="eyebrow">Private note</span><input aria-label="Note title" required placeholder="Note title" value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/><textarea aria-label="Note content" placeholder="Start writing…" value={editing.content || ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })}/><button className="primary-button">Save note</button></form></div>}
  </>
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</header>
}

function CreateRecordSheet({ kind, preview, onClose, refresh, toast }: { kind: 'account' | 'membership'; preview: boolean; onClose: () => void; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (preview) { toast('Connect Supabase to add private records'); onClose(); return }
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      if (kind === 'account') await createAccount({ institution: String(form.get('institution')), product_name: String(form.get('product') || ''), country: String(form.get('country') || ''), identifier_type: String(form.get('identifierType') || ''), identifier_value: String(form.get('identifierValue') || '') })
      else await createMembership({ provider: String(form.get('provider')), program_name: String(form.get('program')), member_number: String(form.get('memberNumber') || '') })
      await refresh(); onClose(); toast(kind === 'account' ? 'Account added' : 'Membership added')
    } catch { toast('Unable to save this record') } finally { setBusy(false) }
  }
  return <div className="sheet-layer" onMouseDown={onClose}><form className="create-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
    <button type="button" className="icon-button sheet-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
    <span className="eyebrow">Private record</span><h2>{kind === 'account' ? 'Add account' : 'Add membership'}</h2>
    {kind === 'account' ? <div className="form-grid"><label>Institution<input name="institution" required/></label><label>Product<input name="product"/></label><label>Country<input name="country"/></label><label>Identifier type<input name="identifierType" placeholder="IBAN, email, customer ID…"/></label><label className="wide">Identifier value<input name="identifierValue" autoComplete="off"/></label></div> : <div className="form-grid"><label>Provider<input name="provider" required/></label><label>Programme<input name="program" required/></label><label className="wide">Membership number<input name="memberNumber" autoComplete="off"/></label></div>}
    <p className="form-hint"><ShieldCheck size={15}/> This record is stored in the private database and scoped to your account.</p>
    <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
  </form></div>
}

function App() {
  const preview = !isSupabaseConfigured || new URLSearchParams(window.location.search).has('preview')
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [data, setData] = useState<HubData>(publicPreview)
  const [page, setPage] = useState<Page>('overview')
  const [drawer, setDrawer] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)
  const [query, setQuery] = useState('')
  const [toastText, setToastText] = useState('')
  const [createKind, setCreateKind] = useState<'account' | 'membership' | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  const toast = (message: string) => { setToastText(message); window.setTimeout(() => setToastText(''), 2200) }
  const refresh = async () => { if (!preview) setData(await loadHubData()) }
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: auth }) => { setSession(auth.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session) refresh().catch(() => toast('Unable to connect')) }, [session])
  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener('online', update); addEventListener('offline', update); return () => { removeEventListener('online', update); removeEventListener('offline', update) } }, [])
  useEffect(() => { if (!selected) return; const close = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null); addEventListener('keydown', close); return () => removeEventListener('keydown', close) }, [selected])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search-field input')?.focus()
      }
    }
    addEventListener('keydown', shortcut)
    return () => removeEventListener('keydown', shortcut)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return data
    return {
      ...data,
      accounts: data.accounts.filter((x) => [x.institution, x.product_name, x.country, x.identifier_type].join(' ').toLowerCase().includes(q)),
      memberships: data.memberships.filter((x) => [x.provider, x.program_name, x.tier].join(' ').toLowerCase().includes(q)),
      documents: data.documents.filter((x) => [x.document_type, x.country, x.status].join(' ').toLowerCase().includes(q)),
      notes: data.notes.filter((x) => [x.title, x.content].join(' ').toLowerCase().includes(q)),
    }
  }, [data, query])

  if (!authReady) return <div className="loading-screen"><Brand/><span className="loading-line"/></div>
  if (!preview && !session) return <AuthGate/>

  const showPage = (next: Page) => { setPage(next); setDrawer(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const signOut = async () => { await supabase?.auth.signOut() }
  const integrationStatus = (provider: string) => data.integrations.find((item) => item.provider.toLowerCase() === provider.toLowerCase())?.connection_status ?? 'not_connected'

  return <div className={`hub-shell ${drawer ? 'nav-open' : ''}`}>
    <aside className="sidebar">
      <Brand/>
      <nav aria-label="Primary navigation">{NAV.map(({id,label,icon:Icon}) => <button key={id} className={page === id ? 'active' : ''} onClick={() => showPage(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-scene"><img src={assetUrl('assets/lake-scene.svg')} alt=""/></div>
      <div className="sidebar-foot"><span className="weather-dot"/><span><strong>Your private space</strong><small>{preview ? 'Secure preview' : 'Encrypted access'}</small></span></div>
    </aside>
    <button className="nav-scrim" onClick={() => setDrawer(false)} aria-label="Close navigation"/>
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={22}/></button>
        <label className="search-field"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your hub…"/><kbd>⌘K</kbd></label>
        <div className="topbar-fill"/>
        <span className="date"><CalendarDays size={17}/>{new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(new Date())}</span>
        <button className="profile" onClick={preview ? () => toast('Secure preview mode') : signOut}><span>GM</span><b>Gianluca<small>{preview ? 'Preview' : 'Personal'}</small></b>{preview ? <ShieldCheck size={16}/> : <LogOut size={16}/>}</button>
      </header>
      {!online && <div className="offline"><WifiOff size={16}/> You’re offline. Private data is not cached.</div>}
      <div className="page-content">
        {page === 'overview' && <>
          <section className="hero"><div><span className="eyebrow">Personal overview</span><h1>Welcome back, Gianluca.</h1><p>Everything important, calmly in reach.</p><i/></div><img src={assetUrl('assets/lake-scene.svg')} alt=""/></section>
          <div className="dashboard-grid">
            <section className="panel accounts-panel"><div className="panel-heading"><h2>Accounts</h2><button onClick={() => showPage('accounts')}>View all <ChevronRight size={15}/></button></div><div className="account-grid">{filtered.accounts.slice(0,5).map((item) => <AccountCard key={item.id} account={item} onOpen={() => setSelected({kind:'account',item})}/>)}</div></section>
            <section className="panel quick-panel"><div className="panel-heading"><h2>Quick access</h2></div><div className="quick-grid"><button onClick={() => setCreateKind('account')}><span><Plus size={21}/></span>Add account</button><button onClick={() => setCreateKind('membership')}><span><Star size={21}/></span>Add membership</button><button onClick={() => showPage('documents')}><span><Upload size={21}/></span>Upload document</button><button onClick={() => showPage('notes')}><span><Pencil size={21}/></span>Open notes</button></div></section>
            <section className="panel memberships-panel"><div className="panel-heading"><h2>Memberships</h2><button onClick={() => showPage('memberships')}>View all <ChevronRight size={15}/></button></div><div className="membership-list">{filtered.memberships.map((item) => <MembershipRow key={item.id} membership={item} onOpen={() => setSelected({kind:'membership',item})}/>)}</div></section>
            <section className="panel document-summary"><div className="panel-heading"><h2>Documents</h2><button onClick={() => showPage('documents')}>Open <ChevronRight size={15}/></button></div><div className="summary-list"><p><span>Italian documents awaiting upload</span><strong>{data.documents.filter(x => x.country === 'Italy' && x.status === 'not_uploaded').length}</strong></p><p><span>Brazilian documents awaiting upload</span><strong>{data.documents.filter(x => x.country === 'Brazil' && x.status === 'not_uploaded').length}</strong></p><p><span>Driving licence conversion</span><Status value="pending"/></p></div></section>
          </div>
        </>}
        {page === 'accounts' && <><PageHeader eyebrow="Financial services" title="Accounts" action={<button className="primary-button compact" onClick={() => setCreateKind('account')}><Plus size={17}/> Add account</button>}/><div className="full-account-grid">{filtered.accounts.map((item) => <AccountCard key={item.id} account={item} onOpen={() => setSelected({kind:'account',item})}/>)}</div></>}
        {page === 'memberships' && <><PageHeader eyebrow="Loyalty programmes" title="Memberships" action={<button className="primary-button compact" onClick={() => setCreateKind('membership')}><Plus size={17}/> Add membership</button>}/><section className="panel standalone-list">{filtered.memberships.map((item) => <MembershipRow key={item.id} membership={item} onOpen={() => setSelected({kind:'membership',item})}/>)}</section></>}
        {page === 'travel' && <><PageHeader eyebrow="Journeys" title="Travel"/><section className="panel empty-panel"><EmptyState icon={Plane} title="No trips added yet" text="Travel plans will appear here when you’re ready to add them."/></section></>}
        {page === 'documents' && <><PageHeader eyebrow="Private storage" title="Documents"/><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>Italy</h2><p>Identity and health documents</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'Italy').map((item) => <DocumentCard key={item.id} item={item} refresh={refresh} toast={toast}/>)}</div></div><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>Brazil</h2><p>Personal records</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'Brazil').map((item) => <DocumentCard key={item.id} item={item} refresh={refresh} toast={toast}/>)}</div></div></>}
        {page === 'notes' && <NotesView notes={filtered.notes} preview={preview} refresh={refresh} toast={toast}/>}
        {page === 'settings' && <><PageHeader eyebrow="Private Hub" title="Settings"/><section className="settings-section"><h2>Integrations</h2><div className="integration-grid"><article><span className="integration-icon gmail">M</span><div><h3>Gmail</h3><p>Connector status only. Inbox access is disabled.</p></div><Status value={integrationStatus('Gmail')}/></article><article><span className="integration-icon supabase">S</span><div><h3>Supabase</h3><p>Authentication, private data and document storage.</p></div><Status value={preview ? 'not_connected' : integrationStatus('Supabase')}/></article></div></section><section className="settings-section"><h2>Privacy</h2><div className="privacy-card"><ShieldCheck size={24}/><div><h3>Private by design</h3><p>Identifiers appear only after authentication. Sensitive API responses are never cached by the service worker.</p></div></div></section></>}
      </div>
    </main>
    {selected && <DetailSheet selected={selected} onClose={() => setSelected(null)} toast={toast}/>}
    {createKind && <CreateRecordSheet kind={createKind} preview={preview} onClose={() => setCreateKind(null)} refresh={refresh} toast={toast}/>}
    <div className={`toast ${toastText ? 'show' : ''}`} role="status"><Check size={16}/>{toastText}</div>
  </div>
}

export default App
