import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChartPie, Pencil, RefreshCw, X } from 'lucide-react'
import type { BankConnection, BankTransaction } from './types'
import { usePreferences } from './preferences'
import { bankDate, calendarMonth, categoryColors, merchantPattern, resolvedCategory, spendingCategories, summarizeSpending } from './spending'
import type { CategoryRule, SpendingCategory } from './spending'
import { isSupabaseConfigured, loadCategoryRules, saveTransactionCategory } from './supabase'
import { newestTransactionsFirst } from './transactions'
import './spending.css'

type Group = ReturnType<typeof summarizeSpending>['groups'][number]
const point = (angle: number, radius: number) => `${160 + Math.cos(angle) * radius} ${160 + Math.sin(angle) * radius}`
function slicePath(start: number, end: number) {
  // Two half arcs also handle a single category covering the entire ring.
  const middle = (start + end) / 2
  return `M ${point(start, 130)} A 130 130 0 0 1 ${point(middle, 130)} A 130 130 0 0 1 ${point(end, 130)} L ${point(end, 99)} A 99 99 0 0 0 ${point(middle, 99)} A 99 99 0 0 0 ${point(start, 99)} Z`
}

type RuleProps = { rules: CategoryRule[]; onRulesChanged: (rules: CategoryRule[]) => void }

function CategoryDialog({ group, month, currency, connections, onClose, rules, onRulesChanged }: { group: Group; month: string; currency: string; connections: BankConnection[]; onClose: () => void } & RuleProps) {
  const { t, locale } = usePreferences()
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [category, setCategory] = useState<SpendingCategory>('other')
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const save = async (transaction: BankTransaction) => {
    setSaving(true); setError(false)
    try {
      const saved = await saveTransactionCategory(transaction, category, remember)
      setEditing(null)
      onRulesChanged(saved)
    } catch { setError(true) } finally { setSaving(false) }
  }
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <dialog ref={dialog} className="spending-dialog" aria-labelledby="spending-dialog-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose()
  }}>
    <header><div><span className="eyebrow">{month}</span><h2 id="spending-dialog-title"><i style={{ background: categoryColors[group.category] }}/>{t(`analysis.${group.category}`)}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('common.close')} autoFocus><X size={21}/></button></header>
    <div className="spending-dialog-total"><strong>{money(group.cents / 100)}</strong><span>{t('analysis.transactions', { count: group.items.length })}</span></div>
    {error && <p className="form-error" role="alert">{t('analysis.categoryFailed')}</p>}
    <div className="spending-detail-list">{newestTransactionsFirst(group.items).map(item => {
      const date = bankDate(item)
      const pattern = merchantPattern(item)
      return <article key={item.id}><div><strong>{item.counterparty || item.description || t('bank.transaction')}</strong>{item.counterparty && item.description && <p>{item.description}</p>}<small>{date && new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`))} · {connections.find(connection => connection.id === item.bank_connection_id)?.institution || t('analysis.account')} · <span className={item.status === 'pending' ? 'spending-pending' : ''}>{t(item.status === 'pending' ? 'analysis.pending' : 'analysis.booked')}</span></small>
        {editing === item.id ? <form className="spending-category-editor" onSubmit={event => { event.preventDefault(); if (!saving) void save(item) }}>
          <label>{t('analysis.chooseCategory')}<select value={category} onChange={event => setCategory(event.target.value as SpendingCategory)} disabled={saving}>{spendingCategories.map(value => <option key={value} value={value}>{t(`analysis.${value}`)}</option>)}</select></label>
          <label className="spending-remember"><input type="checkbox" checked={remember && !!pattern} disabled={!pattern || saving} onChange={event => setRemember(event.target.checked)}/>{t('analysis.rememberCategory')}</label>
          <small>{pattern ? t('analysis.pattern', { pattern }) : t('analysis.noPattern')}</small>
          <div><button className="primary-button" disabled={saving}>{t(saving ? 'common.saving' : 'common.save')}</button><button type="button" className="expense-text-button" disabled={saving} onClick={() => setEditing(null)}>{t('common.close')}</button></div>
        </form> : <button className="spending-edit-category" disabled={saving || !isSupabaseConfigured} onClick={() => { setEditing(item.id); setCategory(resolvedCategory(item, rules)); setRemember(true); setError(false) }}><Pencil size={13}/>{t('analysis.changeCategory')}</button>}
      </div><b>{money(Math.abs(Number(item.amount)))}</b></article>
    })}</div>
  </dialog>
}

function MonthChart({ transactions, start, end, current, currency, includePending, amountsHidden, connections, rules, onRulesChanged }: { transactions: BankTransaction[]; start: string; end: string; current: boolean; currency: string; includePending: boolean; amountsHidden: boolean; connections: BankConnection[] } & RuleProps) {
  const { t, locale } = usePreferences()
  const [hovered, setHovered] = useState<SpendingCategory | null>(null)
  const [selected, setSelected] = useState<SpendingCategory | null>(null)
  const summary = useMemo(() => summarizeSpending(transactions, start, end, currency, includePending, rules), [transactions, start, end, currency, includePending, rules])
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${start}T12:00:00`))
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))
  const money = (cents: number) => amountsHidden ? '••••••' : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
  const active = summary.groups.find(group => group.category === hovered)
  const chosen = summary.groups.find(group => group.category === selected)
  let angle = -Math.PI / 2
  return <section className="panel spending-month">
    <header className="spending-month-heading"><div><span className="eyebrow">{t(current ? 'analysis.current' : 'analysis.historyMonth')}</span><h2>{month}</h2><p>{date(start)} — {date(end)}</p></div><span className={`spending-period-tag ${current ? 'is-current' : ''}`}><span/>{includePending ? t('analysis.provisional') : t('analysis.booked')}</span></header>
    <div className="spending-visual-layout">
      <div className="spending-chart-wrap">
        {amountsHidden ? <div className="spending-ring-placeholder"><ChartPie size={32}/><p>{t('analysis.hidden')}</p></div> : !summary.totalCents ? <div className="spending-ring-placeholder"><ChartPie size={32}/><strong>{t('analysis.empty')}</strong><p>{t('analysis.emptyHint')}</p></div> : <>
          <svg viewBox="0 0 320 320" className="spending-donut" role="group" aria-label={`${month} · ${t('analysis.total')}`}>
            {summary.groups.map(group => {
              const startAngle = angle
              angle += group.cents / summary.totalCents * Math.PI * 2
              return <path key={group.category} d={slicePath(startAngle, angle)} fill={categoryColors[group.category]} className={`spending-slice ${hovered === group.category ? 'is-hovered' : ''} ${hovered && hovered !== group.category ? 'is-muted' : ''}`} role="button" tabIndex={0} aria-label={`${t(`analysis.${group.category}`)}: ${money(group.cents)}, ${Math.round(group.cents / summary.totalCents * 100)}%`} onMouseEnter={() => setHovered(group.category)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(group.category)} onBlur={() => setHovered(null)} onClick={() => setSelected(group.category)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(group.category) } }}><title>{t(`analysis.${group.category}`)} · {money(group.cents)}</title></path>
            })}
          </svg>
          <div className="spending-donut-center" aria-live="polite"><span>{active ? t(`analysis.${active.category}`) : t('analysis.total')}</span><strong>{money(active?.cents ?? summary.totalCents)}</strong><small>{active ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(active.cents / summary.totalCents * 100)}%` : t('analysis.transactions', { count: summary.count })}</small></div>
        </>}
      </div>
      <div className="spending-breakdown"><div className="spending-breakdown-top"><span>{t('analysis.total')}</span><strong>{money(summary.totalCents)}</strong></div>
        {summary.groups.map(group => <button key={group.category} className={`spending-category ${hovered === group.category ? 'is-active' : ''}`} onMouseEnter={() => setHovered(group.category)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(group.category)} onBlur={() => setHovered(null)} onClick={() => setSelected(group.category)} disabled={amountsHidden}>
          <i style={{ background: categoryColors[group.category] }}/><span><strong>{t(`analysis.${group.category}`)}</strong><small>{t('analysis.transactions', { count: group.items.length })}</small></span><span className="spending-category-value"><b>{money(group.cents)}</b><small>{amountsHidden ? '•••' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(group.cents / summary.totalCents * 100)}%`}</small></span><ArrowUpRight size={15}/>
        </button>)}
        <p className="spending-chart-hint">{t('analysis.detailHint')}</p>
      </div>
    </div>
    <footer className="spending-month-footer"><span>{t('analysis.booked')} <b>{money(summary.bookedCents)}</b></span><span>{t('analysis.pending')} <b>{money(summary.pendingCents)}</b> <small>({summary.pendingCount})</small></span></footer>
    {chosen && !amountsHidden && <CategoryDialog group={chosen} month={month} currency={currency} connections={connections} rules={rules} onRulesChanged={onRulesChanged} onClose={() => setSelected(null)}/>}
  </section>
}

export function SpendingAnalysis({ transactions, connections, today, amountsHidden, refresh }: { transactions: BankTransaction[]; connections: BankConnection[]; today: string; amountsHidden: boolean; refresh: () => Promise<void> }) {
  const { t, locale } = usePreferences()
  const [account, setAccount] = useState('all')
  const [selectedCurrency, setCurrency] = useState('EUR')
  const [pending, setPending] = useState(false)
  const [historyOffset, setHistoryOffset] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [rules, setRules] = useState<CategoryRule[]>([])
  const rulesChanged = (saved: CategoryRule[]) => setRules(existing => [...existing.filter(rule => !saved.some(value => rule.match_type === value.match_type && rule.match_key === value.match_key)), ...saved])
  const reload = async () => { setBusy(true); setError(false); try { const [, loaded] = await Promise.all([refresh(), loadCategoryRules()]); setRules(loaded) } catch { setError(true) } finally { setBusy(false) } }
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    let active = true
    const update = () => {
      if (document.visibilityState !== 'visible') return
      Promise.all([refreshRef.current(), loadCategoryRules()]).then(([, loaded]) => { if (active) { setRules(loaded); setError(false) } }).catch(() => { if (active) setError(true) })
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { active = false; window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const filtered = transactions.filter(item => account === 'all' || item.bank_connection_id === account)
  const currencies = [...new Set(filtered.map(item => item.currency).filter(Boolean))].sort()
  if (!currencies.length) currencies.push('EUR')
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0]
  const current = calendarMonth(today)
  const previous = calendarMonth(today, historyOffset)
  const undated = summarizeSpending(filtered, current.start, current.end, currency, pending).undatedCount
  const sources = connections.filter(connection => account === 'all' || account === connection.id)
  return <div className="spending-analysis">
    <div className="page-header spending-page-header"><div><span className="eyebrow">Private Hub · Movimenti</span><h1>{t('nav.analysis')}</h1><p className="spending-subtitle">{t('analysis.subtitle')}</p></div><button className="soft-button" onClick={reload} disabled={busy}><RefreshCw size={16} className={busy ? 'spending-spin' : ''}/>{t(busy ? 'analysis.refreshing' : 'analysis.refresh')}</button></div>
    <section className="spending-controls" aria-label={t('nav.analysis')}><label>{t('analysis.account')}<select value={account} onChange={event => setAccount(event.target.value)}><option value="all">{t('analysis.allBanks')}</option>{connections.map(connection => <option key={connection.id} value={connection.id}>{connection.institution}</option>)}</select></label><label>{t('analysis.currency')}<select value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label><label className="spending-pending-toggle"><input type="checkbox" checked={pending} onChange={event => setPending(event.target.checked)}/>{t('analysis.includePending')}</label></section>
    {error && <p className="form-error" role="alert">{t('app.connectFailed')}</p>}
    <div className="spending-sync">{sources.map(source => <span key={source.id}>{source.institution} · {source.last_successful_sync ? `${t('analysis.updated')}: ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.last_successful_sync))}` : t('analysis.noSync')}</span>)}</div>
    <MonthChart transactions={filtered} connections={connections} start={current.start} end={today} current currency={currency} includePending={pending} amountsHidden={amountsHidden} rules={rules} onRulesChanged={rulesChanged}/>
    <section className="spending-history">
      <div className="spending-controls"><label>{t('analysis.historyMonth')}<select value={historyOffset} onChange={event => setHistoryOffset(Number(event.target.value))}>{[-1, -2].map(offset => <option key={offset} value={offset}>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${calendarMonth(today, offset).start}T12:00:00`))}</option>)}</select></label></div>
      <MonthChart key={previous.start} transactions={filtered} connections={connections} start={previous.start} end={previous.end} current={false} currency={currency} includePending={pending} amountsHidden={amountsHidden} rules={rules} onRulesChanged={rulesChanged}/>
    </section>
    <aside className="spending-method"><p><strong>Salvadanaio</strong> · {t('analysis.savings')}</p><p>{t('analysis.source')}</p><p>{t('analysis.transferNote')}</p><p>{t('analysis.pendingNote')} {t('analysis.coverage')}</p>{undated > 0 && <p>{t('analysis.undated', { count: undated })}</p>}</aside>
  </div>
}
