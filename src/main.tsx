import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { PreferencesProvider } from './preferences'

createRoot(document.getElementById('root')!).render(
  <StrictMode><PreferencesProvider><App /></PreferencesProvider></StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base }).catch(() => undefined)
  })
}
