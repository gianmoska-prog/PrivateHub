import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Check, ChevronRight, Pencil, Plus, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import { changePredictedExpense, savePredictedExpense } from './supabase'
import { expenseTiming, formatExpenseAmount, formatExpenseTotal, localDateKey, predictedExpenseReview, summarizeExpenses, validateExpense } from './expenses'
import { usePreferences } from './preferences'
import type { PredictedExpense, PredictedExpenseInput } from './types'

export function useLocalToday() {
  const [today, setToday] = useState(localDateKey)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      setToday(localDateKey())
      clearTimeout(timer)
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 50)
      timer = setTimeout(update, midnight.getTime() - Date.now())
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  return today
}

type SharedProps = { expenses: PredictedExpense[]; today: string; amountsHidden: boolean }

export function FutureExpenseReview({ expenses, today, amountsHidden, onOpen }: SharedProps & { onOpen?: () => void }) {
  const { t, locale } = usePreferences()
  const lines = predictedExpenseReview(expenses, today, locale, t)
  if (!lines.length) return null
  return <div className="future-review"><strong><CalendarDays size={15}/>{t('expenses.reviewHeading')}</strong>
    <p>{amountsHidden ? t('privacy.reviewHidden') : lines.join(' ')}</p>
    {onOpen && <button className="expense-text-button" onClick={onOpen}>{t('expenses.open')}<ChevronRight size={14}/></button>}
  </div>
}

export function FutureExpensesOverview({ expenses, today, amountsHidden, onOpen }: SharedProps & { onOpen: () => void }) {
  const { t, locale } = usePreferences()
  const { total } = summarizeExpenses(expenses, today)
  return <section className="panel future-overview"><div className="panel-heading"><h2>{t('expenses.title')}</h2><button onClick={onOpen}>{t('common.viewAll')}<ChevronRight size={15}/></button></div>
    <div className="future-overview-body"><span className="future-icon"><CalendarDays size={23}/></span><div><span>{t('expenses.total')}</span><strong className={amountsHidden ? 'money-masked' : ''}>{amountsHidden ? '••••••' : formatExpenseTotal(total, locale, t)}</strong><small>{total.count} {t('expenses.outstanding').toLowerCase()}</small></div><button className="soft-button" onClick={onOpen}><Plus size={16}/>{t('expenses.add')}</button></div>
  </section>
}

function ExpenseEditor({ expense, onClose, onChanged, toast }: { expense: PredictedExpense | null; onClose: () => void; onChanged: (expense: PredictedExpense) => void; toast: (text: string) => void }) {
  const { t } = usePreferences()
  const [title, setTitle] = useState(expense?.title || '')
  const [amount, setAmount] = useState(expense?.amount == null ? '' : String(expense.amount))
  const [amountStatus, setAmountStatus] = useState<PredictedExpense['amount_status']>(expense?.amount_status || 'estimated')
  const [date, setDate] = useState(expense?.expected_date || '')
  const [category, setCategory] = useState(expense?.category || '')
  const [notes, setNotes] = useState(expense?.notes || '')
  const [status, setStatus] = useState<PredictedExpense['status']>(expense?.status || 'upcoming')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const value = amount.trim().replace(',', '.')
    const input: PredictedExpenseInput = { title, amount: value ? Number(value) : null, amount_status: amountStatus, expected_date: date || null, category: category || null, notes: notes || null, status }
    if ((value && !/^\d+(\.\d{1,2})?$/.test(value)) || !validateExpense(input)) { setError(t('expenses.invalid')); return }
    setBusy(true); setError('')
    try {
      const saved = await savePredictedExpense(input, expense || undefined)
      onChanged(saved); toast(t('expenses.saved')); onClose()
    } catch { setError(t('expenses.saveFailed')) } finally { setBusy(false) }
  }
  return <div className="sheet-layer" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <form className="create-sheet expense-editor" ref={formRef} role="dialog" aria-modal="true" aria-labelledby="expense-editor-title" aria-busy={busy} onSubmit={submit} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <button type="button" className="icon-button sheet-close" disabled={busy} onClick={onClose} aria-label={t('common.close')}><X size={20}/></button>
      <span className="eyebrow">{t('expenses.eyebrow')}</span><h2 id="expense-editor-title">{t(expense ? 'expenses.edit' : 'expenses.add')}</h2>
      <fieldset disabled={busy} className="form-grid expense-form">
        <label className="wide">{t('expenses.name')}<input name="title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)}/></label>
        <label>{t('expenses.amount')}<input name="amount" inputMode="decimal" required={amountStatus === 'confirmed'} autoComplete="off" maxLength={13} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/></label>
        <label>{t('expenses.amountStatus')}<select name="amount_status" value={amountStatus} onChange={event => setAmountStatus(event.target.value as PredictedExpense['amount_status'])}><option value="estimated">{t('expenses.estimated')}</option><option value="confirmed">{t('expenses.confirmed')}</option></select></label>
        <label>{t('expenses.date')}<input name="expected_date" type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={event => setDate(event.target.value)}/></label>
        <label>{t('expenses.status')}<select name="status" value={status} onChange={event => setStatus(event.target.value as PredictedExpense['status'])}><option value="upcoming">{t('expenses.upcoming')}</option><option value="completed">{t('expenses.completed')}</option></select></label>
        <label className="wide">{t('expenses.category')}<input name="category" maxLength={80} value={category} onChange={event => setCategory(event.target.value)}/></label>
        <label className="wide">{t('expenses.notes')}<textarea name="notes" rows={4} maxLength={3000} value={notes} onChange={event => setNotes(event.target.value)}/></label>
      </fieldset>
      <p className="form-hint"><ShieldCheck size={15}/>{t('expenses.formHint')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="expense-editor-actions"><button type="button" className="soft-button" disabled={busy} onClick={onClose}>{t('expenses.cancel')}</button><button className="primary-button" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button></div>
    </form>
  </div>
}

export function PredictedExpensesView({ expenses, today, amountsHidden, query, preview, onChanged, toast }: SharedProps & { query: string; preview: boolean; onChanged: (expense: PredictedExpense) => void; toast: (text: string) => void }) {
  const { t, locale } = usePreferences()
  const [editor, setEditor] = useState<PredictedExpense | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const summary = summarizeExpenses(expenses, today)
  const matches = (item: PredictedExpense) => [item.title, item.category, item.notes].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  const upcoming = summary.upcoming.filter(matches)
  const completed = summary.completed.filter(matches)
  const dateText = (date: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
  const change = async (item: PredictedExpense, action: 'complete' | 'reopen' | 'delete') => {
    if (busy) return
    if (action === 'delete' && !window.confirm(t('expenses.deleteConfirm', { title: item.title }))) return
    setBusy(item.id)
    try { onChanged(await changePredictedExpense(item, action)); toast(t(action === 'complete' ? 'expenses.paid' : action === 'reopen' ? 'expenses.reopened' : 'expenses.deleted')) }
    catch { toast(t('expenses.actionFailed')) } finally { setBusy(null) }
  }
  const row = (item: PredictedExpense) => <article key={item.id} className={`expense-row ${item.status === 'completed' ? 'expense-completed' : ''}`} aria-busy={busy === item.id}>
    <div className="expense-row-copy"><div className="expense-row-title"><h3>{item.title}</h3><span className={`expense-timing ${item.status === 'completed' ? 'completed' : expenseTiming(item.expected_date, today)}`}>{t(item.status === 'completed' ? 'expenses.completed' : `expenses.${expenseTiming(item.expected_date, today)}`)}</span></div>
      <div className="expense-row-meta"><strong className={amountsHidden ? 'money-masked' : ''}>{amountsHidden ? '••••••' : formatExpenseAmount(item, locale, t)}</strong><span>{t(item.amount_status === 'estimated' ? 'expenses.estimateLabel' : 'expenses.confirmedLabel')}</span>{item.category && <span className="expense-category">{item.category}</span>}</div>
      <p><CalendarDays size={14}/>{item.expected_date ? t('expenses.expected', { date: dateText(item.expected_date) }) : t('expenses.dateUnknown')}</p>
      {item.status === 'completed' && item.completed_at && <small>{t('expenses.completedOn', { date: dateText(localDateKey(new Date(item.completed_at))) })}</small>}
      {item.notes && <details className="expense-notes"><summary>{t('expenses.notes')}</summary><p>{item.notes}</p></details>}
    </div>
    <div className="expense-row-actions"><button className="soft-button" disabled={!!busy} aria-label={t(item.status === 'completed' ? 'expenses.reopenLabel' : 'expenses.completeLabel', { title: item.title })} onClick={() => change(item, item.status === 'completed' ? 'reopen' : 'complete')}>{item.status === 'completed' ? <RotateCcw size={15}/> : <Check size={15}/>}{t(item.status === 'completed' ? 'expenses.reopen' : 'expenses.complete')}</button><button className="icon-button" disabled={!!busy} aria-label={t('expenses.editLabel', { title: item.title })} onClick={() => setEditor(item)}><Pencil size={16}/></button><button className="icon-button danger" disabled={!!busy} aria-label={t('expenses.deleteLabel', { title: item.title })} onClick={() => change(item, 'delete')}><Trash2 size={16}/></button></div>
  </article>
  return <>
    <header className="page-header expense-page-header"><div><span className="eyebrow">{t('expenses.eyebrow')}</span><h1>{t('expenses.title')}</h1><p>{t('expenses.subtitle')}</p></div><button className="primary-button compact" onClick={() => preview ? toast(t('expenses.preview')) : setEditor('new')}><Plus size={17}/>{t('expenses.add')}</button></header>
    <section className="expense-summary" aria-label={t('expenses.title')}><div className="panel"><span>{t('expenses.total')}</span><strong className={amountsHidden ? 'money-masked' : ''}>{amountsHidden ? '••••••' : formatExpenseTotal(summary.total, locale, t)}</strong></div><div className="panel"><span>{t('expenses.dueSoon')}</span><strong className={amountsHidden ? 'money-masked' : ''}>{amountsHidden ? '••••••' : formatExpenseTotal(summary.dueSoon, locale, t)}</strong></div><div className="panel"><span>{t('expenses.outstanding')}</span><strong>{summary.total.count}</strong></div></section>
    <p className="expense-summary-hint">{t('expenses.summaryHint')}</p>
    <section className="panel expense-list" aria-label={t('expenses.upcoming')}>
      {upcoming.length ? upcoming.map(row) : <div className="expense-empty"><CalendarDays size={28}/><h2>{t(expenses.length ? 'expenses.noUpcoming' : 'expenses.emptyTitle')}</h2><p>{t(query.trim() ? 'expenses.noResults' : expenses.length ? 'expenses.noUpcoming' : 'expenses.emptyText')}</p></div>}
    </section>
    {completed.length > 0 && <details className="expense-history" open={!!query.trim()}><summary>{t('expenses.history')}<span>{completed.length}</span></summary><section className="panel expense-list">{completed.map(row)}</section></details>}
    {editor && <ExpenseEditor expense={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onChanged={onChanged} toast={toast}/>}
  </>
}
