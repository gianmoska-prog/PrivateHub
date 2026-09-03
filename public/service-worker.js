const CACHE = 'private-hub-shell-v4'
const APP_ROOT = new URL('./', self.location.href).pathname
const atRoot = (path = '') => `${APP_ROOT}${path}`
const SHELL = [atRoot(), atRoot('manifest.webmanifest'), atRoot('assets/app-icon-192.png'), atRoot('assets/app-icon-512.png'), atRoot('assets/favicon.svg'), atRoot('assets/lake-scene.svg')]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/') || url.pathname.includes('/auth/') || url.pathname.includes('/storage/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(APP_ROOT)))
    return
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ['style', 'script', 'image', 'font'].includes(request.destination)) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    })))
  }
})
