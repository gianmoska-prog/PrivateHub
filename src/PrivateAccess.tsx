import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Check, Delete, Globe2, LockKeyhole, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from './supabase'
import { usePreferences } from './preferences'
import type { Language } from './preferences'
import './access.css'

export type UserProfile = { owner_id: string; display_name: string; language: Language; show_w212_goal: boolean }
type AccessStatus = { configured: boolean; unlocked: boolean; expires_at?: string; retry_at?: string; error?: string }
export async function pinAccess(action = 'status', pin: string | null = null, newPin: string | null = null): Promise<AccessStatus> {
  if (!supabase) throw Error('Unavailable')
  const { data, error } = await supabase.rpc('private_hub_access', { action, pin, new_pin: newPin })
  if (error) throw error
  return data as AccessStatus
}

export function LanguagePicker() {
  const { language, setLanguage, t } = usePreferences()
  return <label className="access-language"><Globe2 size={16}/><span className="sr-only">{t('settings.language')}</span><select value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="en">English</option><option value="it">Italiano</option><option value="es">Español</option></select></label>
}

function PinScreen({ profile, status, recovery, onUnlocked, onSignOut }: { profile: UserProfile; status: AccessStatus; recovery: boolean; onUnlocked: (status: AccessStatus) => void; onSignOut: () => void }) {
  const { t, locale } = usePreferences()
  const [digits, setDigits] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryAt, setRetryAt] = useState(status.retry_at || '')
  const [now, setNow] = useState(Date.now())
  const [sent, setSent] = useState(false)
  const inFlight = useRef(false)
  const setting = !status.configured || recovery
  const blocked = !!retryAt && new Date(retryAt).getTime() > now
  useEffect(()=> { const timer=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(timer) },[])
  const enter = useCallback((key: string) => {
    if (busy || blocked || inFlight.current) return
    setError('')
    if (key==='Backspace' || key==='Delete') setDigits(value=>value.slice(0,-1))
    else if (/^[0-9]$/.test(key)) setDigits(value=>value.length<4 ? value+key : value)
  },[busy,blocked])
  useEffect(()=> { const keydown=(e: KeyboardEvent)=> { if (/^[0-9]$/.test(e.key)||e.key==='Backspace'||e.key==='Delete') { e.preventDefault(); enter(e.key) } }; addEventListener('keydown',keydown); return()=>removeEventListener('keydown',keydown) },[enter])
  useEffect(()=> {
    if (digits.length!==4 || inFlight.current) return
    if (setting && !firstPin) { setFirstPin(digits); setDigits(''); return }
    if (setting && firstPin!==digits) { setError(t('pin.mismatch')); setFirstPin(''); setDigits(''); return }
    const timer=setTimeout(()=> {
      inFlight.current=true; setBusy(true)
      void pinAccess(setting ? recovery ? 'reset' : 'setup' : 'unlock', setting ? null : digits, setting ? digits : null).then(result=> {
        if (result.unlocked) { onUnlocked(result); return }
        setRetryAt(result.retry_at || '')
        setError(t(result.error==='EMAIL_VERIFICATION_REQUIRED' ? 'pin.recoveryRequired' : result.error==='PIN_COOLDOWN' ? 'pin.cooldown' : 'pin.wrong', {time: result.retry_at ? new Intl.DateTimeFormat(locale,{timeStyle:'short'}).format(new Date(result.retry_at)) : ''}))
        setDigits(''); if(setting) setFirstPin('')
      }).catch(()=>{ setError(t('pin.failed')); setDigits('') }).finally(()=>{inFlight.current=false;setBusy(false)})
    },180)
    return()=>clearTimeout(timer)
  },[digits,firstPin,setting,recovery,t,locale,onUnlocked])
  const reset = async()=> {
    if (!supabase) return
    setBusy(true);setError('')
    try {
      const {data:{user}}=await supabase.auth.getUser()
      if (!user?.email) throw Error('Unavailable')
      const redirect=new URL(import.meta.env.BASE_URL,location.origin);redirect.searchParams.set('pinReset','1')
      const {error:failed}=await supabase.auth.signInWithOtp({email:user.email,options:{shouldCreateUser:false,emailRedirectTo:redirect.href}})
      if(failed) throw failed
      setSent(true)
    } catch {setError(t('pin.failed'))} finally {setBusy(false)}
  }
  return <main className="pin-screen"><div className="pin-aura pin-aura-one"/><div className="pin-aura pin-aura-two"/><div className="pin-top"><span className="pin-wordmark">Private <em>Hub</em></span><LanguagePicker/></div>
    <section className="pin-card" aria-labelledby="pin-title"><div className="pin-emblem"><LockKeyhole size={25}/></div><span className="eyebrow">{t('pin.private')}</span><h1 id="pin-title">{t(setting ? firstPin ? 'pin.confirmTitle' : 'pin.setupTitle' : 'pin.title',{name:profile.display_name})}</h1><p>{t(setting ? firstPin ? 'pin.confirmText' : 'pin.setupText' : 'pin.subtitle')}</p>
      <div className={`pin-dots ${error ? 'pin-shake' : ''}`} role="status" aria-live="polite" aria-label={`${digits.length} / 4`}>
        {[0,1,2,3].map(i=><span className={digits.length>i?'filled':''} key={i}/>)}</div>
      <div className="pin-feedback" aria-live="polite">{busy ? <span>{t('pin.checking')}</span> : blocked ? <span role="alert">{t('pin.cooldown',{time:new Intl.DateTimeFormat(locale,{timeStyle:'short'}).format(new Date(retryAt))})}</span> : error ? <span role="alert">{error}</span> : sent ? <span>{t('pin.emailSent')}</span> : <span aria-hidden="true">&nbsp;</span>}</div>
      <div className="pin-keypad" role="group" aria-label="PIN">{['1','2','3','4','5','6','7','8','9'].map(key=><button disabled={busy||blocked} key={key} onClick={()=>enter(key)} aria-label={key}>{key}</button>)}<span/><button disabled={busy||blocked} onClick={()=>enter('0')}>0</button><button disabled={busy||blocked||!digits} onClick={()=>enter('Backspace')} aria-label={t('pin.erase')}><Delete size={24}/></button></div>
      <button className="pin-text-button" disabled={busy} onClick={()=>void reset()}>{t('pin.forgot')}</button><button className="pin-text-button pin-switch" disabled={busy} onClick={onSignOut}><LogOut size={14}/>{t('pin.switch')}</button>
      <small className="pin-protected"><ShieldCheck size={13}/>{t('auth.protected')}</small>
    </section></main>
}

function Welcome({name,onClose}:{name:string;onClose:()=>void}) {
  const {t}=usePreferences()
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
  return <dialog ref={dialog} className="welcome-card" onCancel={onClose} aria-labelledby="welcome-title"><div className="welcome-spark"><Sparkles size={28}/></div><span className="eyebrow">Private Hub</span><h1 id="welcome-title">{t('welcome.title',{name})}</h1><p>{t('welcome.text')}</p><button autoFocus className="primary-button" onClick={onClose}><Check size={17}/>{t('welcome.open')}<ArrowRight size={17}/></button></dialog>
}

export function PrivateSession({session,children}:{session:Session;children:(profile:UserProfile,onLock:()=>void)=>ReactNode}) {
  const {t,language,setLanguage}=usePreferences()
  const [profile,setProfile]=useState<UserProfile|null>(null)
  const [status,setStatus]=useState<AccessStatus|null>(null)
  const [failure,setFailure]=useState(false)
  const [welcome,setWelcome]=useState(false)
  const [loading,setLoading]=useState(true)
  const ready=useRef(false)
  const [recovery,setRecovery]=useState(()=>new URLSearchParams(location.search).get('pinReset')==='1')
  const signOut=()=>{void supabase?.auth.signOut({scope:'local'})}
  const initialize=useCallback(async()=> {
    ready.current=false;setLoading(true);setFailure(false)
    try {
      await pinAccess('lock')
      const {data,error}=await supabase!.from('user_profiles').select('*').single()
      if(error||!data) throw Error('No profile')
      const p=data as UserProfile;setProfile(p);setLanguage(p.language)
      setStatus(await pinAccess('status')); ready.current=true
    } catch {setFailure(true)} finally {setLoading(false)}
  },[setLanguage])
  useEffect(()=>{void initialize()},[initialize])
  useEffect(()=>{
    if (!ready.current||!profile||language===profile.language) return
    let active=true
    void supabase!.from('user_profiles').update({language}).eq('owner_id',session.user.id).then(({error})=>{if(!error&&active)setProfile(p=>p?{...p,language}:p)})
    return()=>{active=false}
  },[language,profile,session.user.id])
  const lock=useCallback(()=>{
    setStatus(s=>s?{...s,unlocked:false}:s);setWelcome(false)
    void pinAccess('lock').catch(()=>undefined)
  },[])
  useEffect(()=>{
    if(!status?.unlocked)return
    const timer=setInterval(()=>{if(status.expires_at && Date.now()>=new Date(status.expires_at).getTime())lock()},1000)
    return()=>clearInterval(timer)
  },[status,lock])
  const unlocked=useCallback((next:AccessStatus)=>{
    if(recovery){const url=new URL(location.href);url.searchParams.delete('pinReset');history.replaceState(null,'',url.pathname+url.search+url.hash);setRecovery(false)}
    setStatus(next);setWelcome(true)
  },[recovery])
  if(loading)return <main className="access-loading"><LockKeyhole size={26}/><span className="loading-line"/></main>
  if(failure||!profile||!status)return <main className="access-loading"><LockKeyhole size={26}/><p>{t('pin.failed')}</p><button className="primary-button" onClick={()=>void initialize()}>{t('pin.retry')}</button><button className="pin-text-button" onClick={signOut}>{t('pin.switch')}</button></main>
  if(!status.unlocked)return <PinScreen profile={profile} status={status} recovery={recovery} onUnlocked={unlocked} onSignOut={signOut}/>
  return <>{children(profile,lock)}{welcome&&<Welcome name={profile.display_name} onClose={()=>setWelcome(false)}/>}</>
}
