import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Banknote, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, Share2, FileText,
  FolderClosed, Home, LockKeyhole, LogOut, Menu, Moon, NotebookPen, Pencil, Plane, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Sparkles, Star, Sun, Target, TrendingUp, Trash2, Upload, WalletCards, WifiOff, X,
} from 'lucide-react'
import { prepareDocumentShare, createAccount, createMembership, deleteNote, downloadDocument, getDocumentPreviewUrl, getKeepSignedInPreference, isSupabaseConfigured, loadHubData, refreshBankConnection, removeDocumentFile, saveNote, selectBankAccount, setKeepSignedInPreference, startBankConnection, supabase, updateManualAccountBalance, uploadDocuments } from './supabase'
import type { Account, BankAccountCandidate, BankConnection, BankTransaction, DocumentFile, DocumentRecord, HubData, Membership, NoteRecord, SavingsSnapshot } from './types'
import { usePreferences } from './preferences'

type Page = 'overview' | 'accounts' | 'memberships' | 'travel' | 'documents' | 'notes' | 'settings'
type Selected = { kind: 'account'; item: Account } | { kind: 'membership'; item: Membership } | null
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const NAV: { id: Page; key: string; icon: typeof Home }[] = [
  { id: 'overview', key: 'nav.overview', icon: Home },
  { id: 'accounts', key: 'nav.accounts', icon: Banknote },
  { id: 'memberships', key: 'nav.memberships', icon: Star },
  { id: 'travel', key: 'nav.travel', icon: Plane },
  { id: 'documents', key: 'nav.documents', icon: FileText },
  { id: 'notes', key: 'nav.notes', icon: NotebookPen },
  { id: 'settings', key: 'nav.settings', icon: Settings },
]

const publicPreview: HubData = {
  accounts: [
    ['intesa', 'Intesa Sanpaolo', 'XME Silver', 'Italy', 'IBAN', 'active'],
    ['salvadanaio', 'Intesa Sanpaolo', 'Salvadanaio', 'Italy', null, 'active'],
    ['revolut', 'Revolut', 'Revolut Italia', 'Italy', 'IBAN', 'active'],
    ['paypal', 'PayPal', 'PayPal Account', null, 'Email', 'active'],
    ['nubank', 'Nubank', 'Nubank Brasil', 'Brazil', 'Chave PIX', 'active'],
    ['amex', 'American Express', null, null, null, 'pending'],
  ].map(([id, institution, product_name, country, identifier_type, status]) => ({ id, institution, product_name, country, identifier_type, status, identifier_value: null, nickname: null, notes: null, balance_mode: id === 'salvadanaio' ? 'manual' : 'none', manual_balance: null, manual_currency: 'EUR', created_at: '', updated_at: '' })) as Account[],
  memberships: ['Marriott Bonvoy', 'Hilton Honors', 'Miles & More'].map((program_name, index) => ({ id: String(index), provider: program_name.split(' ')[0], program_name, member_number: null, tier: null, balance: null, status: 'active', member_since: null, notes: null, created_at: '', updated_at: '' })),
  documents: [
    ['Passport', 'Italy', 'not_uploaded'], ['Carta d’identità', 'Italy', 'not_uploaded'], ['Tessera Sanitaria', 'Italy', 'not_uploaded'], ['Patente italiana', 'Italy', 'pending'],
    ['RG', 'Brazil', 'not_uploaded'], ['CPF', 'Brazil', 'not_uploaded'], ['CNH', 'Brazil', 'not_uploaded'],
    ['Payslips', 'General', 'not_uploaded'], ['Miscellaneous', 'General', 'not_uploaded'],
  ].map(([document_type, country, status], index) => ({ id: String(index), document_type, country, status, storage_path: null, filename: null, mime_type: null, uploaded_at: null, updated_at: '' })),
  documentFiles: [],
  notes: [],
  integrations: [
    { id: 'gmail', provider: 'Gmail', connection_status: 'not_connected', connected_at: null, updated_at: '' },
    { id: 'supabase', provider: 'Supabase', connection_status: 'not_connected', connected_at: null, updated_at: '' },
  ],
  bankConnections: [], bankAccountCandidates: [], bankTransactions: [], savingsHistory: [],
}

const accountArt: Record<string, string> = {
  'Intesa Sanpaolo': assetUrl('assets/intesa-card.png'), Revolut: assetUrl('assets/revolut-card.webp'), PayPal: assetUrl('assets/paypal.webp'), Nubank: assetUrl('assets/nubank-card-gianluca.webp'),
  'American Express': assetUrl('assets/amex-gold-g-moscatelli.png'),
}
const accountLogo: Record<string, string> = {
  'Intesa Sanpaolo': assetUrl('assets/logo-intesa.jpg'), Revolut: assetUrl('assets/logo-revolut.png'), PayPal: assetUrl('assets/paypal.webp'), Nubank: assetUrl('assets/logo-nubank.png'),
  'American Express': assetUrl('assets/american-express.png'),
}
const membershipArt: Record<string, string> = { 'Marriott Bonvoy': assetUrl('assets/marriott.png'), 'Hilton Honors': assetUrl('assets/hilton.png') }

function Brand() {
  return <div className="brand"><svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.7"><ellipse cx="17" cy="17" rx="8" ry="12" transform="rotate(-45 17 17)"/><ellipse cx="31" cy="17" rx="8" ry="12" transform="rotate(45 31 17)"/><ellipse cx="17" cy="31" rx="8" ry="12" transform="rotate(45 17 31)"/><ellipse cx="31" cy="31" rx="8" ry="12" transform="rotate(-45 31 31)"/></g></svg><span>Private <em>Hub</em></span></div>
}

function AuthGate() {
  const { t } = usePreferences()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [method, setMethod] = useState<'link' | 'password'>('link')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [keepLoggedIn, setKeepLoggedIn] = useState(getKeepSignedInPreference)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    setKeepSignedInPreference(keepLoggedIn)
    const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
    const { error: authError } = method === 'password'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } })
    setBusy(false)
    if (authError) setError(method === 'password' ? t('auth.invalidCredentials') : (authError.status === 429 ? t('auth.rateLimited') : t('auth.unableSend')))
    else if (method === 'link') setSent(true)
  }
  const [titleLine1, titleLine2] = t('auth.title').split('\n')
  return <main className="auth-shell">
    <section className="auth-card">
      <Brand />
      <div className="auth-scene"><img src={assetUrl('assets/lake-scene.svg')} alt="" /></div>
      <div className="auth-copy">
        <span className="eyebrow">{t('auth.privateAccess')}</span>
        <h1>{titleLine1}<br/>{titleLine2}</h1>
        <p>{t('auth.description')}</p>
        {sent ? <div className="success-message"><Check size={18}/><span><strong>{t('auth.checkInbox')}</strong><small>{t('auth.linkReady')}</small></span></div> :
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.placeholder')} />
            {method === 'password' && <><label htmlFor="password">{t('auth.password')}</label><input id="password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></>}
            <label className="remember-row" htmlFor="keep-logged-in">
              <input id="keep-logged-in" type="checkbox" checked={keepLoggedIn} onChange={(event) => { setKeepLoggedIn(event.target.checked); setKeepSignedInPreference(event.target.checked) }} />
              <span>{t('auth.keepLoggedIn')} <small>{t('auth.untilLogout')}</small></span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? t(method === 'password' ? 'auth.signingIn' : 'auth.sending') : t(method === 'password' ? 'auth.signIn' : 'auth.sendLink')}</button>
            <button type="button" className="auth-method-button" onClick={() => { setMethod(method === 'link' ? 'password' : 'link'); setError('') }}>{t(method === 'link' ? 'auth.usePassword' : 'auth.useLink')}</button>
          </form>}
        <span className="privacy-note"><ShieldCheck size={15}/> {t('auth.protected')}</span>
      </div>
    </section>
  </main>
}

function Status({ value }: { value: string }) {
  const { t } = usePreferences()
  const active = value === 'active' || value === 'connected'
  const key = `status.${value}`
  const translated = t(key)
  const label = translated === key ? value.replaceAll('_', ' ') : translated
  return <span className={`status ${active ? 'status-active' : 'status-muted'}`}><i/>{label}</span>
}

function AccountCard({ account, connection, onOpen, amountsHidden = false }: { account: Account; connection?: BankConnection; onOpen: () => void; amountsHidden?: boolean }) {
  const { t, identifierName, locale } = usePreferences()
  const art = accountArt[account.institution]
  const balance = account.balance_mode === 'manual' ? account.manual_balance : connection?.current_balance
  const currency = account.balance_mode === 'manual' ? account.manual_currency || 'EUR' : connection?.currency || 'EUR'
  return <button className={`account-card account-${account.id} ${account.status.includes('pending') ? 'is-pending' : ''}`} onClick={onOpen}>
    <div className="account-visual">{art ? <img src={art} alt="" /> : <span className="monogram">AE</span>}</div>
    <strong>{account.institution}</strong>
    <span>{account.product_name ?? t('account.applicationPending')}</span>
    {balance != null && <b className={amountsHidden ? "account-balance money-masked" : "account-balance"} aria-label={amountsHidden ? t("privacy.hidden") : undefined}>{amountsHidden ? "••••••" : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(balance)}</b>}
    <small>{account.balance_mode === 'manual' ? t('bank.manualBalance') : account.identifier_type ? t('account.identifierSecured', { type: identifierName(account.identifier_type) }) : t('account.noIdentifier')}</small>
    <Status value={connection?.status || account.status}/>
  </button>
}

function MembershipRow({ membership, onOpen }: { membership: Membership; onOpen: () => void }) {
  const { t } = usePreferences()
  const art = membershipArt[membership.program_name]
  return <button className="membership-row" onClick={onOpen}>
    <span className="membership-logo">{art ? <img src={art} alt=""/> : <b>M&amp;M</b>}</span>
    <span className="membership-title"><strong>{membership.program_name}</strong><small>{t('membership.numberState', { state: membership.member_number ? t('membership.secured') : t('membership.notAddedLower') })}</small></span>
    <Status value={membership.status}/><ChevronRight size={17}/>
  </button>
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Plane; title: string; text: string }) {
  return <div className="empty-state"><span><Icon size={27}/></span><h2>{title}</h2><p>{text}</p></div>
}

function SavingsProgressPanel({ account, history, transactions, amountsHidden }: { account?: Account; history: SavingsSnapshot[]; transactions: BankTransaction[]; amountsHidden: boolean }) {
  const { t, locale } = usePreferences()
  const currency = account?.manual_currency || 'EUR'
  const money = (value: number) => amountsHidden ? '••••••' : new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  const accountHistory = history
    .filter((item) => item.account_id === account?.id)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
  const weekly = Array.from(accountHistory.reduce((weeks, item) => {
    const date = new Date(item.recorded_at)
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    const day = monday.getUTCDay() || 7
    monday.setUTCDate(monday.getUTCDate() - day + 1)
    weeks.set(monday.toISOString().slice(0, 10), item)
    return weeks
  }, new Map<string, SavingsSnapshot>()).entries()).map(([week, item]) => ({ week, amount: Number(item.amount) }))
  const current = account?.manual_balance == null ? null : Number(account.manual_balance)
  const previous = weekly.length > 1 ? weekly[weekly.length - 2].amount : null
  const weeklyChange = current != null && previous != null ? current - previous : null
  const chartMax = Math.max(12000, ...weekly.map((item) => item.amount * 1.08))
  const chartPoints = weekly.map((item, index) => ({
    ...item,
    x: weekly.length === 1 ? 320 : 28 + (index / (weekly.length - 1)) * 584,
    y: 178 - (item.amount / chartMax) * 150,
  }))
  const latestTransactionDate = transactions.reduce<Date | null>((latest, item) => {
    const value = item.booking_date || item.transaction_date
    if (!value) return latest
    const date = new Date(`${value}T12:00:00Z`)
    return !latest || date > latest ? date : latest
  }, null)
  const cutoff = latestTransactionDate ? new Date(latestTransactionDate.getTime() - 29 * 86400000) : null
  const recent = cutoff ? transactions.filter((item) => {
    const value = item.booking_date || item.transaction_date
    return value && new Date(`${value}T12:00:00Z`) >= cutoff
  }) : []
  const isSavingsTransfer = (item: BankTransaction) => `${item.counterparty || ''} ${item.description}`.toLowerCase().includes('salvadanaio')
  const savingsTransfers = recent.filter((item) => Number(item.amount) < 0 && isSavingsTransfer(item))
  const spendingMovements = recent.filter((item) => !isSavingsTransfer(item))
  const outgoings = spendingMovements.filter((item) => Number(item.amount) < 0)
  const incoming = spendingMovements.filter((item) => Number(item.amount) > 0)
  const spent = outgoings.reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0)
  const received = incoming.reduce((sum, item) => sum + Number(item.amount), 0)
  const transferredToSavings = savingsTransfers.reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0)
  const largest = outgoings.reduce<BankTransaction | null>((winner, item) => !winner || Number(item.amount) < Number(winner.amount) ? item : winner, null)
  const repeated = Array.from(outgoings.reduce((counts, item) => {
    const label = (item.counterparty || item.description).trim().replace(/\s+/g, ' ')
    if (label) counts.set(label, (counts.get(label) || 0) + 1)
    return counts
  }, new Map<string, number>()).entries()).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1])[0]
  const progressMin = Math.min(100, Math.max(0, ((current || 0) / 8000) * 100))
  const progressMax = Math.min(100, Math.max(0, ((current || 0) / 12000) * 100))
  const review = recent.length
    ? `${t('savings.reviewMovements', { count: spendingMovements.length, spent: money(spent), received: money(received) })} ${savingsTransfers.length ? t('savings.reviewTransfers', { count: savingsTransfers.length, amount: money(transferredToSavings) }) : ''} ${largest ? t('savings.reviewLargest', { amount: money(Math.abs(Number(largest.amount))), name: largest.counterparty || largest.description }) : ''} ${repeated ? t('savings.reviewRecurring', { name: repeated[0], count: repeated[1] }) : t('savings.reviewNoRecurring')}`
    : t('savings.reviewEmpty')
  const momentum = current == null
    ? t('savings.momentumStart')
    : weeklyChange == null
      ? t('savings.momentumFirst', { amount: money(current) })
      : weeklyChange >= 0
        ? t('savings.momentumUp', { amount: money(weeklyChange) })
        : t('savings.momentumDown', { amount: money(Math.abs(weeklyChange)) })

  return <section className="panel savings-panel">
    <div className="savings-heading"><div><span className="eyebrow">{t('savings.eyebrow')}</span><h2>{t('savings.title')}</h2></div><span className="savings-badge"><Target size={16}/>{amountsHidden ? '••••••' : t('savings.goal')}</span></div>
    <div className={`savings-layout ${amountsHidden ? "amounts-hidden" : ""}`}>
      <div className="savings-chart-card">
        <div className="savings-metrics"><div><span>{t('savings.current')}</span><strong>{current == null ? '—' : money(current)}</strong></div><div><span>{t('savings.weeklyChange')}</span><b className={weeklyChange != null && weeklyChange < 0 ? 'negative' : ''}>{weeklyChange == null ? '—' : `${weeklyChange >= 0 ? '+' : '−'}${money(Math.abs(weeklyChange))}`}</b></div></div>
        <div className="chart-wrap">
          {amountsHidden ? <div className="chart-empty money-masked" aria-label={t("privacy.hidden")}>••••••</div> : chartPoints.length ? <svg viewBox="0 0 640 205" role="img" aria-label={t('savings.chartLabel')}>
            <defs><linearGradient id="savingsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38a882" stopOpacity=".28"/><stop offset="1" stopColor="#38a882" stopOpacity="0"/></linearGradient></defs>
            <rect x="28" y={178 - (12000 / chartMax) * 150} width="584" height={(4000 / chartMax) * 150} rx="9" className="goal-band"/>
            <line x1="28" y1="178" x2="612" y2="178" className="chart-axis"/>
            {chartPoints.length > 1 && <><path d={`M ${chartPoints.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${chartPoints[chartPoints.length - 1].x} 178 L ${chartPoints[0].x} 178 Z`} fill="url(#savingsArea)"/><polyline points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} className="savings-line"/></>}
            {chartPoints.map((point) => <g key={point.week}><circle cx={point.x} cy={point.y} r="5" className="savings-dot"/><title>{`${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${point.week}T12:00:00Z`))}: ${money(point.amount)}`}</title></g>)}
          </svg> : <div className="chart-empty"><TrendingUp size={28}/><strong>{t('savings.emptyTitle')}</strong><span>{t('savings.emptyText')}</span></div>}
        </div>
        <div className="goal-progress"><div><span>{amountsHidden ? t('privacy.hidden') : t('savings.toMinimum')}</span><b>{amountsHidden ? '•••' : `${Math.round(progressMin)}%`}</b></div><i><span style={{ width: `${amountsHidden ? 0 : progressMin}%` }}/></i><div className="goal-range"><small>{amountsHidden ? '•••' : '€8K'}</small><small>{amountsHidden ? '•••' : `€12K · ${Math.round(progressMax)}%`}</small></div></div>
      </div>
      <aside className="financial-review"><span className="review-icon"><Sparkles size={19}/></span><div><span className="eyebrow">{t('savings.reviewEyebrow')}</span><h3>{t('savings.reviewTitle')}</h3></div><p>{amountsHidden ? t('privacy.reviewHidden') : review}</p><p className="momentum-note"><WalletCards size={17}/><span>{amountsHidden ? '••••••' : momentum}</span></p><small>{t('savings.reviewNote')}</small></aside>
    </div>
  </section>
}

function DetailSheet({ selected, bankAccount, connection, candidates, transactions, onClose, toast, refresh }: { selected: NonNullable<Selected>; bankAccount?: Account; connection?: BankConnection; candidates: BankAccountCandidate[]; transactions: BankTransaction[]; onClose: () => void; toast: (message: string) => void; refresh: () => Promise<void> }) {
  const { t, countryName, identifierName, language, locale } = usePreferences()
  const account = selected.kind === 'account' ? selected.item : null
  const membership = selected.kind === 'membership' ? selected.item : null
  const [tab, setTab] = useState<'overview' | 'transactions' | 'details'>('overview')
  const [busy, setBusy] = useState(false)
  const [manualBalance, setManualBalance] = useState(account?.manual_balance?.toString() ?? '')
  const [savedManualBalance, setSavedManualBalance] = useState(account?.manual_balance ?? null)
  const logo = account ? accountLogo[account.institution] : null
  const manual = account?.balance_mode === 'manual'
  const bankingAccount = manual ? bankAccount : account
  const hasBanking = Boolean(bankingAccount && bankingAccount.balance_mode !== 'manual')
  const connectable = Boolean(bankingAccount?.status === 'active' && ['Intesa Sanpaolo', 'Revolut'].includes(bankingAccount.institution))
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast(t('common.copied')) }
  const connect = async () => {
    if (!bankingAccount) return
    setBusy(true)
    try { await startBankConnection(bankingAccount.id, language) } catch (error) { toast(error instanceof Error && error.message === 'ENABLE_BANKING_NOT_CONFIGURED' ? t('bank.notConfigured') : t('bank.connectFailed')); setBusy(false) }
  }
  const sync = async () => {
    if (!bankingAccount) return
    setBusy(true)
    try { await refreshBankConnection(bankingAccount.id); await refresh(); toast(t('bank.refreshed')) } catch (error) { toast(error instanceof Error && error.message === 'REFRESH_COOLDOWN' ? t('bank.cooldown') : t('bank.refreshFailed')) } finally { setBusy(false) }
  }
  const choose = async (candidateId: string) => {
    if (!bankingAccount) return
    setBusy(true)
    try { await selectBankAccount(bankingAccount.id, candidateId); await refresh(); toast(t('bank.accountSelected')) } catch { toast(t('bank.selectionFailed')) } finally { setBusy(false) }
  }
  const saveManualBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account) return
    const value = Number(manualBalance.replace(',', '.'))
    if (!Number.isFinite(value) || value < 0) { toast(t('bank.manualInvalid')); return }
    setBusy(true)
    try { await updateManualAccountBalance(account.id, value, account.manual_currency || 'EUR'); setSavedManualBalance(value); await refresh(); toast(t('bank.manualSaved')) } catch { toast(t('records.saveFailed')) } finally { setBusy(false) }
  }
  const dialogLabel = account ? `${account.institution} — ${t('account.details')}` : `${membership?.program_name} — ${t('membership.details')}`
  return <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
    <section className="detail-sheet" role="dialog" aria-modal="true" aria-label={dialogLabel} onMouseDown={(e) => e.stopPropagation()}>
      <button className="icon-button sheet-close" onClick={onClose} aria-label={t('common.close')}><X size={20}/></button>
      {account ? <>
        <div className="detail-brand"><span className={`detail-mark ${logo ? 'has-logo' : ''}`}>{logo ? <img src={logo} alt=""/> : account.institution.slice(0,2).toUpperCase()}</span><div><span className="eyebrow">{t('account.account')}</span><h2>{account.institution}</h2><p>{account.product_name ?? t('account.applicationPending')}</p></div></div>
        <Status value={connection?.status || account.status}/>
        {account.status.includes('pending') ? <div className="calm-message"><h3>{t('account.applicationPending')}</h3><p>{t('account.pendingText')}</p></div> : <>
          <div className="detail-tabs" role="tablist"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>{t('bank.overview')}</button>{hasBanking && <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>{t('bank.transactions')}</button>}<button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>{t('account.details')}</button></div>
          {tab === 'overview' && <div className="bank-overview">
            {manual ? <><div className="balance-block"><span>{t('bank.savingsBalance')}</span><strong>{savedManualBalance == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: account.manual_currency || 'EUR' }).format(savedManualBalance)}</strong><small>{t('bank.manualHint')}</small></div><form className="manual-balance-form" onSubmit={saveManualBalance}><label>{t('bank.manualAmount')}<span><input type="number" inputMode="decimal" step="0.01" required value={manualBalance} onChange={(event) => setManualBalance(event.target.value)} placeholder="0,00"/><b>{account.manual_currency || 'EUR'}</b></span></label><button className="primary-button" disabled={busy}>{busy ? t('common.saving') : t('bank.manualSave')}</button></form>{connection?.current_balance != null && <div className="linked-balance-block"><div><span>{t('bank.currentAccount')}</span><small>{t('bank.openBankingReadOnly')}</small></div><strong>{new Intl.NumberFormat(locale, { style: 'currency', currency: connection.currency || 'EUR' }).format(connection.current_balance)}</strong></div>}</> : connection?.current_balance != null ? <div className="balance-block"><span>{t('bank.currentBalance')}</span><strong>{new Intl.NumberFormat(locale, { style: 'currency', currency: connection.currency || 'EUR' }).format(connection.current_balance)}</strong>{connection.available_balance != null && <small>{t('bank.available')}: {new Intl.NumberFormat(locale, { style: 'currency', currency: connection.currency || 'EUR' }).format(connection.available_balance)}</small>}</div> : <p className="bank-empty">{connectable ? t('bank.connectDescription') : t('bank.notAvailable')}</p>}
            {connection?.last_successful_sync && <p className="last-sync">{t('bank.lastSynced')} {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.last_successful_sync))}</p>}
            {connectable && (!connection || ['disconnected','reconnect_required'].includes(connection.status)) && <button className="primary-button" disabled={busy} onClick={connect}>{connection?.status === 'reconnect_required' ? t('bank.reconnect') : t('bank.connect')}</button>}
            {connection && ['connected','temporarily_unavailable'].includes(connection.status) && <button className="soft-button" disabled={busy} onClick={sync}><RefreshCw size={16}/>{busy ? t('bank.refreshing') : t('bank.refresh')}</button>}
            {connection?.status === 'temporarily_unavailable' && <p className="form-error">{t('bank.unableRefresh')}</p>}
            {connection?.status === 'selection_required' && <div className="candidate-list"><h3>{t('bank.chooseAccount')}</h3><p>{t('bank.chooseAccountText')}</p>{candidates.map(candidate => <button key={candidate.id} disabled={busy} onClick={() => choose(candidate.id)}><span><strong>{candidate.display_name || account.product_name}</strong><small>{[candidate.masked_identifier, candidate.currency].filter(Boolean).join(' · ')}</small></span><ChevronRight size={17}/></button>)}</div>}
          </div>}
          {hasBanking && tab === 'transactions' && <div className="transaction-list">{transactions.length ? transactions.map(transaction => <article key={transaction.id}><div><strong>{transaction.counterparty || transaction.description || t('bank.transaction')}</strong><small>{transaction.booking_date ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${transaction.booking_date}T12:00:00`)) : ''}{transaction.status === 'pending' ? ` · ${t('bank.pending')}` : ''}</small></div><b className={transaction.amount < 0 ? 'debit' : 'credit'}>{new Intl.NumberFormat(locale, { style: 'currency', currency: transaction.currency }).format(transaction.amount)}</b></article>) : <p className="bank-empty">{connection ? t('bank.noTransactions') : t('bank.connectForTransactions')}</p>}</div>}
          {tab === 'details' && <div className="detail-list"><h3>{t('account.details')}</h3>{account.country && <div><span>{t('account.country')}</span><strong>{countryName(account.country)}</strong></div>}{account.identifier_type && <div><span>{identifierName(account.identifier_type)}</span><strong className="private-value">{account.identifier_value ?? t('account.notAdded')}</strong>{account.identifier_value && <button onClick={() => copy(account.identifier_value!)}><Copy size={15}/> {t('account.copyIdentifier', { type: identifierName(account.identifier_type) })}</button>}</div>}<div><span>{t('account.notes')}</span><strong>{account.notes || t('account.notAdded')}</strong></div></div>}
        </>}
      </> : membership && <>
        <div className="detail-brand"><span className="detail-mark"><Star size={22}/></span><div><span className="eyebrow">{t('membership.membership')}</span><h2>{membership.program_name}</h2><p>{membership.provider}</p></div></div>
        <Status value={membership.status}/>
        <div className="detail-list">
          <h3>{t('membership.details')}</h3>
          <div><span>{t('membership.number')}</span><strong className="private-value">{membership.member_number || t('account.notAdded')}</strong>{membership.member_number && <button onClick={() => copy(membership.member_number!)}><Copy size={15}/> {t('membership.copyNumber')}</button>}</div>
          <div><span>{t('membership.tier')}</span><strong>{membership.tier || t('account.notAdded')}</strong></div>
          <div><span>{t('membership.points')}</span><strong>{membership.balance || t('membership.notConnected')}</strong></div>
          <div><span>{t('membership.memberSince')}</span><strong>{membership.member_since || t('account.notAdded')}</strong></div>
          <div><span>{t('account.notes')}</span><strong>{membership.notes || t('account.notAdded')}</strong></div>
        </div>
      </>}
    </section>
  </div>
}

function DocumentPreview({ files, initialIndex, onClose, toast }: { files: DocumentFile[]; initialIndex: number; onClose: () => void; toast: (message: string) => void }) {
  const { t } = usePreferences()
  const [index, setIndex] = useState(initialIndex)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const file = files[index]
  useEffect(() => {
    let active = true
    setLoading(true); setUrl('')
    getDocumentPreviewUrl(file.storage_path).then((signedUrl) => { if (active) setUrl(signedUrl) }).catch(() => { if (active) toast(t('documents.previewFailed')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [file.id])
  const move = (direction: number) => setIndex((index + direction + files.length) % files.length)
  const image = file.mime_type?.startsWith('image/')
  const pdf = file.mime_type === 'application/pdf'
  return <div className="sheet-layer document-preview-layer" role="presentation" onMouseDown={onClose}>
    <section className="document-preview" role="dialog" aria-modal="true" aria-label={t('documents.previewTitle')} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">{t('documents.previewTitle')}</span><h2>{file.filename}</h2><p>{t('documents.filePosition', { current: index + 1, total: files.length })}</p></div><button className="icon-button" onClick={onClose} aria-label={t('common.close')}><X size={20}/></button></header>
      <div className="preview-stage">{loading ? <span className="preview-loading">{t('documents.loadingPreview')}</span> : url && image ? <img src={url} alt={file.filename}/> : url && pdf ? <iframe src={url} title={file.filename}/> : <div className="preview-fallback"><FileText size={42}/><p>{t('documents.previewUnavailable')}</p><button className="soft-button" onClick={() => downloadDocument(file.storage_path, file.filename)}><Download size={16}/>{t('common.download')}</button></div>}</div>
      {files.length > 1 && <><button className="preview-arrow previous" onClick={() => move(-1)} aria-label={t('documents.previousFile')}><ChevronLeft size={22}/></button><button className="preview-arrow next" onClick={() => move(1)} aria-label={t('documents.nextFile')}><ChevronRight size={22}/></button><nav className="preview-file-picker" aria-label={t('documents.files')} >{files.map((candidate, candidateIndex) => <button key={candidate.id} className={candidateIndex === index ? 'active' : ''} onClick={() => setIndex(candidateIndex)}>{candidateIndex + 1}<span>{candidate.filename}</span></button>)}</nav></>}
    </section>
  </div>
}

function DocumentShare({ file, toast }: { file: DocumentFile; toast: (message: string) => void }) {
  const { t } = usePreferences()
  const [open, setOpen] = useState(false)
  const [prepared, setPrepared] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    setPrepared(null); setBusy(true); setFailed(false)
    prepareDocumentShare(file.storage_path, file.filename, file.mime_type)
      .then(value => { if (active) setPrepared(value) })
      .catch(() => { if (active) setFailed(true) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [open, file.id])
  const canShare = prepared && !!navigator.share && !!navigator.canShare?.({ files: [prepared] })
  const share = async () => {
    if (!prepared) return
    setBusy(true)
    try { await navigator.share({ files: [prepared] }); setOpen(false) }
    catch (error) { if (error instanceof Error && error.name === 'AbortError') setOpen(false); else setFailed(true) }
    finally { setBusy(false) }
  }
  const download = async () => {
    try {
      if (!prepared) { await downloadDocument(file.storage_path, file.filename); return }
      const url = URL.createObjectURL(prepared)
      const link = document.createElement('a')
      link.href = url; link.download = file.filename; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch { toast(t('documents.shareFailed')) }
  }
  return <><button onClick={() => setOpen(true)} aria-label={t('documents.shareFile', { name: file.filename })}><Share2 size={15}/></button>
    {open && <div className="sheet-layer document-preview-layer" onMouseDown={() => setOpen(false)}><section className="share-dialog" role="dialog" aria-modal="true" aria-label={t('documents.share')} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
      <button autoFocus className="icon-button" onClick={() => setOpen(false)} aria-label={t('common.close')}><X size={20}/></button>
      <h2>{t('documents.share')}</h2><p>{file.filename}</p>
      <p role="status">{busy ? t('documents.preparingShare') : failed ? t('documents.shareFailed') : canShare ? t('documents.shareReady') : t('documents.shareFallback')}</p>
      {canShare && !failed && <button className="primary-button" disabled={busy} onClick={share}><Share2 size={17}/>{t('documents.chooseApp')}</button>}
      {!busy && <button className="soft-button" onClick={download}><Download size={17}/>{t('common.download')}</button>}
    </section></div>}
  </>
}

function DocumentCard({ item, files, refresh, toast }: { item: DocumentRecord; files: DocumentFile[]; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const { t, documentName } = usePreferences()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const enabled = item.document_type !== 'Patente italiana'
  const choose = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return; setBusy(true)
    try { await uploadDocuments(item.id, item.country, item.document_type, selectedFiles); await refresh(); toast(t('documents.uploaded')) }
    catch { toast(t('documents.uploadFailed')) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const remove = async (file: DocumentFile) => {
    if (!confirm(t('documents.deleteConfirm', { name: file.filename }))) return
    setBusy(true); try { await removeDocumentFile(item.id, file.id, file.storage_path); await refresh(); toast(t('documents.deleted')) } catch { toast(t('documents.deleteFailed')) } finally { setBusy(false) }
  }
  return <article className={`document-card ${!enabled ? 'document-pending' : ''}`}>
    <div className="document-head"><span><FileText size={20}/></span><Status value={item.status}/></div>
    <h3>{documentName(item.document_type)}</h3><p>{files.length ? t('documents.fileCount', { count: files.length }) : (enabled ? t('documents.readyUpload') : t('documents.licencePending'))}</p>
    {enabled && <div className="document-actions">
      <input ref={input} type="file" multiple hidden onChange={(event) => choose(Array.from(event.target.files ?? []))} accept="application/pdf,image/jpeg,image/png,image/webp"/>
      <button className="soft-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/>{busy ? t('documents.uploading') : files.length ? t('documents.addFiles') : t('documents.upload')}</button>
    </div>}
    {files.length > 0 && <div className="document-file-list">{files.map((file, index) => <div key={file.id}><button className="document-file-name" disabled={busy} onClick={() => setPreviewIndex(index)}><Eye size={15}/><span>{file.filename}</span></button><button disabled={busy} onClick={() => downloadDocument(file.storage_path, file.filename)} aria-label={t('documents.downloadFile', { name: file.filename })}><Download size={15}/></button><DocumentShare file={file} toast={toast}/><button className="danger" disabled={busy} onClick={() => remove(file)} aria-label={t('documents.deleteFile', { name: file.filename })}><Trash2 size={15}/></button></div>)}</div>}
    {previewIndex != null && <DocumentPreview files={files} initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} toast={toast}/>}
  </article>
}

function NotesView({ notes, preview, refresh, toast }: { notes: NoteRecord[]; preview: boolean; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const { t, locale } = usePreferences()
  const [editing, setEditing] = useState<Partial<NoteRecord> | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return
    if (preview) return toast(t('notes.connect'))
    try { await saveNote({ id: editing.id, title: editing.title || '', content: editing.content || '' }); setEditing(null); await refresh(); toast(t('notes.saved')) } catch { toast(t('notes.saveFailed')) }
  }
  return <>
    <PageHeader eyebrow={t('notes.privateWriting')} title={t('nav.notes')} action={<button className="primary-button compact" onClick={() => setEditing({ title: '', content: '' })}><Plus size={17}/> {t('notes.new')}</button>}/>
    {notes.length ? <div className="notes-grid">{notes.map((note) => <article className="note-card" key={note.id}><button onClick={() => setEditing(note)}><span>{new Date(note.updated_at).toLocaleDateString(locale,{month:'short',day:'numeric'})}</span><h3>{note.title}</h3><p>{note.content}</p></button><button className="note-delete" aria-label={t('notes.deleteLabel', { title: note.title })} onClick={async () => { if (confirm(t('notes.deleteConfirm', { title: note.title }))) { await deleteNote(note.id); await refresh(); toast(t('notes.deleted')) }}}><Trash2 size={15}/></button></article>)}</div> : <EmptyState icon={NotebookPen} title={t('notes.emptyTitle')} text={t('notes.emptyText')}/>} 
    {editing && <div className="sheet-layer" onMouseDown={() => setEditing(null)}><form className="note-editor" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><button type="button" className="icon-button sheet-close" onClick={() => setEditing(null)} aria-label={t('common.close')}><X size={20}/></button><span className="eyebrow">{t('notes.privateNote')}</span><input aria-label={t('notes.title')} required placeholder={t('notes.title')} value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/><textarea aria-label={t('notes.startWriting')} placeholder={t('notes.startWriting')} value={editing.content || ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })}/><button className="primary-button">{t('notes.save')}</button></form></div>}
  </>
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</header>
}

function CreateRecordSheet({ kind, preview, onClose, refresh, toast }: { kind: 'account' | 'membership'; preview: boolean; onClose: () => void; refresh: () => Promise<void>; toast: (message: string) => void }) {
  const { t } = usePreferences()
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (preview) { toast(t('records.connect')); onClose(); return }
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      if (kind === 'account') await createAccount({ institution: String(form.get('institution')), product_name: String(form.get('product') || ''), country: String(form.get('country') || ''), identifier_type: String(form.get('identifierType') || ''), identifier_value: String(form.get('identifierValue') || '') })
      else await createMembership({ provider: String(form.get('provider')), program_name: String(form.get('program')), member_number: String(form.get('memberNumber') || '') })
      await refresh(); onClose(); toast(kind === 'account' ? t('records.accountAdded') : t('records.membershipAdded'))
    } catch { toast(t('records.saveFailed')) } finally { setBusy(false) }
  }
  return <div className="sheet-layer" onMouseDown={onClose}><form className="create-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
    <button type="button" className="icon-button sheet-close" onClick={onClose} aria-label={t('common.close')}><X size={20}/></button>
    <span className="eyebrow">{t('records.privateRecord')}</span><h2>{kind === 'account' ? t('records.addAccount') : t('records.addMembership')}</h2>
    {kind === 'account' ? <div className="form-grid"><label>{t('records.institution')}<input name="institution" required/></label><label>{t('records.product')}<input name="product"/></label><label>{t('records.country')}<input name="country"/></label><label>{t('records.identifierType')}<input name="identifierType" placeholder={t('records.identifierHint')}/></label><label className="wide">{t('records.identifierValue')}<input name="identifierValue" autoComplete="off"/></label></div> : <div className="form-grid"><label>{t('records.provider')}<input name="provider" required/></label><label>{t('records.programme')}<input name="program" required/></label><label className="wide">{t('records.membershipNumber')}<input name="memberNumber" autoComplete="off"/></label></div>}
    <p className="form-hint"><ShieldCheck size={15}/> {t('records.storageHint')}</p>
    <button className="primary-button" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
  </form></div>
}

function PasswordSettings({ preview }: { preview: boolean }) {
  const { t } = usePreferences()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (preview || !supabase) return
    if (password !== confirm) { setMessage(t('settings.passwordMismatch')); return }
    setBusy(true); setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMessage(t('settings.passwordFailed'))
    else { setPassword(''); setConfirm(''); setMessage(t('settings.passwordSaved')) }
  }
  return <section className="settings-section">
    <h2>{t('settings.security')}</h2>
    <article className="password-card">
      <div className="preference-copy"><span className="preference-icon"><LockKeyhole size={20}/></span><div><h3>{t('settings.password')}</h3><p>{t('settings.passwordText')}</p></div></div>
      <form className="password-form" onSubmit={submit}>
        <label>{t('settings.newPassword')}<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
        <label>{t('settings.confirmPassword')}<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label>
        {message && <p className="password-message" role="status">{message}</p>}
        <button className="primary-button compact" disabled={busy || preview}>{busy ? t('common.saving') : t('settings.setPassword')}</button>
      </form>
    </article>
  </section>
}

function SettingsView({ preview, integrationStatus, bankConnections }: { preview: boolean; integrationStatus: (provider: string) => string; bankConnections: BankConnection[] }) {
  const { t, theme, setTheme, language, setLanguage } = usePreferences()
  return <>
    <PageHeader eyebrow="Private Hub" title={t('nav.settings')}/>
    <section className="settings-section">
      <h2>{t('settings.personalisation')}</h2>
      <div className="preferences-grid">
        <article className="preference-card">
          <div className="preference-copy"><span className="preference-icon"><Sun size={20}/></span><div><h3>{t('settings.appearance')}</h3><p>{t('settings.appearanceText')}</p></div></div>
          <div className="theme-toggle" role="group" aria-label={t('settings.appearance')}>
            <button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')} aria-pressed={theme === 'light'}><Sun size={16}/>{t('settings.light')}</button>
            <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}><Moon size={16}/>{t('settings.dark')}</button>
          </div>
        </article>
        <article className="preference-card">
          <div className="preference-copy"><span className="preference-icon language-icon">Aa</span><div><h3>{t('settings.language')}</h3><p>{t('settings.languageText')}</p></div></div>
          <label className="language-select"><span className="sr-only">{t('settings.language')}</span><select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'it' | 'es')}><option value="en">{t('settings.english')}</option><option value="it">{t('settings.italian')}</option><option value="es">{t('settings.spanish')}</option></select><ChevronRight size={16}/></label>
        </article>
      </div>
    </section>
    <PasswordSettings preview={preview}/>
    <section className="settings-section"><h2>{t('settings.integrations')}</h2><div className="integration-grid"><article><span className="integration-icon gmail">M</span><div><h3>Gmail</h3><p>{t('settings.gmailText')}</p></div><Status value={integrationStatus('Gmail')}/></article><article><span className="integration-icon supabase">S</span><div><h3>Supabase</h3><p>{t('settings.supabaseText')}</p></div><Status value={preview ? 'not_connected' : integrationStatus('Supabase')}/></article><article className="banking-integration"><span className="integration-icon banking">EB</span><div><h3>Enable Banking</h3><p>{t('settings.bankingText')}</p><div className="bank-provider-status"><span>Intesa <Status value={bankConnections.find(item => item.institution === 'Intesa Sanpaolo')?.status || 'not_connected'}/></span><span>Revolut <Status value={bankConnections.find(item => item.institution === 'Revolut')?.status || 'not_connected'}/></span><span>PayPal <Status value="not_connected"/></span></div></div><Status value={bankConnections.some(item => item.status === 'connected') ? 'connected' : integrationStatus('Enable Banking')}/></article></div></section>
    <section className="settings-section"><h2>{t('settings.privacy')}</h2><div className="privacy-card"><ShieldCheck size={24}/><div><h3>{t('settings.privateByDesign')}</h3><p>{t('settings.privacyText')}</p></div></div></section>
  </>
}

function App() {
  const { t, locale, countryName, documentName, language } = usePreferences()
  const preview = !isSupabaseConfigured || new URLSearchParams(window.location.search).has('preview')
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [data, setData] = useState<HubData>(publicPreview)
  const [page, setPage] = useState<Page>('overview')
  const [amountsHidden, setAmountsHidden] = useState(true)
  useEffect(() => { setAmountsHidden(true) }, [session?.user.id])
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
  useEffect(() => { if (session) refresh().catch(() => toast(t('app.connectFailed'))) }, [session])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const banking = params.get('banking')
    if (!banking) return
    if (banking === 'connected') toast(t('bank.refreshed'))
    else if (banking === 'select') toast(t('bank.chooseAccount'))
    else toast(t('bank.connectFailed'))
    params.delete('banking'); params.delete('account')
    const queryString = params.toString()
    history.replaceState(null, '', `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`)
  }, [])
  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener('online', update); addEventListener('offline', update); return () => { removeEventListener('online', update); removeEventListener('offline', update) } }, [])
  useEffect(() => { if (!selected) return; const close = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null); addEventListener('keydown', close); return () => removeEventListener('keydown', close) }, [selected])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.search-field input')?.focus() }
    }
    addEventListener('keydown', shortcut)
    return () => removeEventListener('keydown', shortcut)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return data
    return {
      ...data,
      accounts: data.accounts.filter((x) => [x.institution, x.product_name, x.country, countryName(x.country), x.identifier_type].join(' ').toLowerCase().includes(q)),
      memberships: data.memberships.filter((x) => [x.provider, x.program_name, x.tier].join(' ').toLowerCase().includes(q)),
      documents: data.documents.filter((x) => [x.document_type, documentName(x.document_type), x.country, countryName(x.country), x.status].join(' ').toLowerCase().includes(q)),
      notes: data.notes.filter((x) => [x.title, x.content].join(' ').toLowerCase().includes(q)),
    }
  }, [data, query, language])

  if (!authReady) return <div className="loading-screen"><Brand/><span className="loading-line"/></div>
  if (!preview && !session) return <AuthGate/>

  const showPage = (next: Page) => { setPage(next); setDrawer(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const signOut = async () => { await supabase?.auth.signOut() }
  const integrationStatus = (provider: string) => data.integrations.find((item) => item.provider.toLowerCase() === provider.toLowerCase())?.connection_status ?? 'not_connected'
  const savingsAccount = filtered.accounts.find((account) => account.institution === 'Intesa Sanpaolo' && account.balance_mode === 'manual')
  const currentAccount = filtered.accounts.find((account) => account.institution === 'Intesa Sanpaolo' && account.balance_mode !== 'manual')
  const visibleAccounts = savingsAccount && currentAccount
    ? filtered.accounts.map((account) => account.id === currentAccount.id ? savingsAccount : account).filter((account, index, accounts) => accounts.findIndex(candidate => candidate.id === account.id) === index)
    : filtered.accounts
  const bankAccountFor = (account: Account) => account.balance_mode === 'manual' && account.institution === 'Intesa Sanpaolo'
    ? data.accounts.find(candidate => candidate.institution === 'Intesa Sanpaolo' && candidate.balance_mode !== 'manual')
    : account
  const selectedBankAccount = selected?.kind === 'account' ? bankAccountFor(selected.item) : undefined
  const selectedConnection = selectedBankAccount ? data.bankConnections.find(connection => connection.canonical_account_id === selectedBankAccount.id) : undefined
  const intesaBankAccount = data.accounts.find(account => account.institution === 'Intesa Sanpaolo' && account.balance_mode !== 'manual')
  const intesaConnection = intesaBankAccount ? data.bankConnections.find(connection => connection.canonical_account_id === intesaBankAccount.id) : undefined
  const intesaTransactions = intesaConnection ? data.bankTransactions.filter(transaction => transaction.bank_connection_id === intesaConnection.id) : []

  return <div className={`hub-shell ${drawer ? 'nav-open' : ''}`}>
    <aside className="sidebar">
      <Brand/>
      <nav aria-label={t('app.primaryNavigation')}>{NAV.map(({id,key,icon:Icon}) => <button key={id} className={page === id ? 'active' : ''} onClick={() => showPage(id)}><Icon size={21}/><span>{t(key)}</span></button>)}</nav>
      <div className="sidebar-scene"><img src={assetUrl('assets/lake-scene.svg')} alt=""/></div>
      <div className="sidebar-foot"><span className="weather-dot"/><span><strong>{t('app.privateSpace')}</strong><small>{preview ? t('app.securePreview') : t('app.encryptedAccess')}</small></span></div>
    </aside>
    <button className="nav-scrim" onClick={() => setDrawer(false)} aria-label={t('app.closeNavigation')}/>
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setDrawer(true)} aria-label={t('app.openNavigation')}><Menu size={22}/></button>
        <label className="search-field"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('app.search')}/><kbd>⌘K</kbd></label>
        <div className="topbar-fill"/>
        {page === "overview" && <button className="icon-button" aria-label={t(amountsHidden ? "privacy.show" : "privacy.hide")} title={t(amountsHidden ? "privacy.show" : "privacy.hide")} aria-pressed={!amountsHidden} onClick={() => setAmountsHidden(value => !value)}>{amountsHidden ? <EyeOff size={18}/> : <Eye size={18}/>}</button>}
        <span className="date"><CalendarDays size={17}/>{new Intl.DateTimeFormat(locale,{weekday:'long',month:'short',day:'numeric'}).format(new Date())}</span>
        <button className="profile" onClick={preview ? () => toast(t('app.previewMode')) : signOut}><span>GM</span><b>Gianluca<small>{preview ? t('app.preview') : t('app.personal')}</small></b>{preview ? <ShieldCheck size={16}/> : <LogOut size={16}/>}</button>
      </header>
      {!online && <div className="offline"><WifiOff size={16}/> {t('app.offline')}</div>}
      <div className="page-content">
        {page === 'overview' && <>
          <section className="hero"><div><span className="eyebrow">{t('overview.eyebrow')}</span><h1>{t('overview.welcome')}</h1><p>{t('overview.subtitle')}</p><i/></div><img src={assetUrl('assets/lake-scene.svg')} alt=""/></section>
          <div className="dashboard-grid">
            <section className="panel accounts-panel"><div className="panel-heading"><h2>{t('overview.accounts')}</h2><button onClick={() => showPage('accounts')}>{t('common.viewAll')} <ChevronRight size={15}/></button></div><div className="account-grid">{visibleAccounts.slice(0,5).map((item) => { const bankAccount = bankAccountFor(item); return <AccountCard amountsHidden={amountsHidden} key={item.id} account={item} connection={bankAccount ? data.bankConnections.find(connection => connection.canonical_account_id === bankAccount.id) : undefined} onOpen={() => setSelected({kind:'account',item})}/> })}</div></section>
            <section className="panel quick-panel"><div className="panel-heading"><h2>{t('overview.quickAccess')}</h2></div><div className="quick-grid"><button onClick={() => setCreateKind('account')}><span><Plus size={21}/></span>{t('records.addAccount')}</button><button onClick={() => setCreateKind('membership')}><span><Star size={21}/></span>{t('records.addMembership')}</button><button onClick={() => showPage('documents')}><span><Upload size={21}/></span>{t('overview.uploadDocument')}</button><button onClick={() => showPage('notes')}><span><Pencil size={21}/></span>{t('overview.openNotes')}</button></div></section>
            <section className="panel memberships-panel"><div className="panel-heading"><h2>{t('overview.memberships')}</h2><button onClick={() => showPage('memberships')}>{t('common.viewAll')} <ChevronRight size={15}/></button></div><div className="membership-list">{filtered.memberships.map((item) => <MembershipRow key={item.id} membership={item} onOpen={() => setSelected({kind:'membership',item})}/>)}</div></section>
            <SavingsProgressPanel amountsHidden={amountsHidden} account={data.accounts.find(account => account.institution === 'Intesa Sanpaolo' && account.balance_mode === 'manual')} history={data.savingsHistory} transactions={intesaTransactions}/>
          </div>
        </>}
        {page === 'accounts' && <><PageHeader eyebrow={t('pages.financialServices')} title={t('nav.accounts')} action={<button className="primary-button compact" onClick={() => setCreateKind('account')}><Plus size={17}/> {t('records.addAccount')}</button>}/><div className="full-account-grid">{visibleAccounts.map((item) => { const bankAccount = bankAccountFor(item); return <AccountCard key={item.id} account={item} connection={bankAccount ? data.bankConnections.find(connection => connection.canonical_account_id === bankAccount.id) : undefined} onOpen={() => setSelected({kind:'account',item})}/> })}</div></>}
        {page === 'memberships' && <><PageHeader eyebrow={t('pages.loyalty')} title={t('nav.memberships')} action={<button className="primary-button compact" onClick={() => setCreateKind('membership')}><Plus size={17}/> {t('records.addMembership')}</button>}/><section className="panel standalone-list">{filtered.memberships.map((item) => <MembershipRow key={item.id} membership={item} onOpen={() => setSelected({kind:'membership',item})}/>)}</section></>}
        {page === 'travel' && <><PageHeader eyebrow={t('pages.journeys')} title={t('nav.travel')}/><section className="panel empty-panel"><EmptyState icon={Plane} title={t('pages.travelEmptyTitle')} text={t('pages.travelEmptyText')}/></section></>}
        {page === 'documents' && <><PageHeader eyebrow={t('documents.privateStorage')} title={t('nav.documents')}/><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>{countryName('Italy')}</h2><p>{t('documents.identityHealth')}</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'Italy').map((item) => <DocumentCard key={item.id} item={item} files={data.documentFiles.filter(file => file.document_id === item.id)} refresh={refresh} toast={toast}/>)}</div></div><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>{countryName('Brazil')}</h2><p>{t('documents.personalRecords')}</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'Brazil').map((item) => <DocumentCard key={item.id} item={item} files={data.documentFiles.filter(file => file.document_id === item.id)} refresh={refresh} toast={toast}/>)}</div></div><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>{t('documents.payslipsSection')}</h2><p>{t('documents.payslipsText')}</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'General' && x.document_type === 'Payslips').map((item) => <DocumentCard key={item.id} item={item} files={data.documentFiles.filter(file => file.document_id === item.id)} refresh={refresh} toast={toast}/>)}</div></div><div className="country-section"><div className="country-heading"><FolderClosed size={21}/><div><h2>{t('documents.miscellaneousSection')}</h2><p>{t('documents.miscellaneousText')}</p></div></div><div className="document-grid">{filtered.documents.filter(x => x.country === 'General' && x.document_type === 'Miscellaneous').map((item) => <DocumentCard key={item.id} item={item} files={data.documentFiles.filter(file => file.document_id === item.id)} refresh={refresh} toast={toast}/>)}</div></div></>}
        {page === 'notes' && <NotesView notes={filtered.notes} preview={preview} refresh={refresh} toast={toast}/>} 
        {page === 'settings' && <SettingsView preview={preview} integrationStatus={integrationStatus} bankConnections={data.bankConnections}/>}
      </div>
    </main>
    {selected && <DetailSheet selected={selected} bankAccount={selectedBankAccount} connection={selectedConnection} candidates={selectedBankAccount ? data.bankAccountCandidates.filter(candidate => candidate.canonical_account_id === selectedBankAccount.id) : []} transactions={selectedConnection ? data.bankTransactions.filter(transaction => transaction.bank_connection_id === selectedConnection.id) : []} onClose={() => setSelected(null)} toast={toast} refresh={refresh}/>}
    {createKind && <CreateRecordSheet kind={createKind} preview={preview} onClose={() => setCreateKind(null)} refresh={refresh} toast={toast}/>} 
    <div className={`toast ${toastText ? 'show' : ''}`} role="status"><Check size={16}/>{toastText}</div>
  </div>
}

export default App
