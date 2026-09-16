import { route } from '../venue.js'
import { TABLE_KEY } from '../socket.js'
import { APP_VERSION } from '../version.js'

// A stuck tablet leaves no evidence unless it says so itself. Reports go over
// plain HTTP rather than the socket, because the socket may be the casualty.
const LIMIT = 5
const WINDOW = 60_000
const sent = []

export function reportError(kind, error, extra = {}) {
  const now = Date.now()
  while (sent.length && now - sent[0] > WINDOW) sent.shift()
  if (sent.length >= LIMIT || !route.slug) return
  sent.push(now)

  const message = error?.message ?? (typeof error === 'string' ? error : String(error ?? 'unknown'))
  const body = {
    venue: route.slug,
    table: Number(localStorage.getItem(TABLE_KEY)) || null,
    version: APP_VERSION,
    kind,
    message,
    stack: error?.stack ?? '',
    url: window.location.href,
    ...extra
  }
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {})
  } catch {
    // Reporting must never be the thing that throws.
  }
}

// Errors outside React's render tree — event handlers, timers, promises — are
// reported but not acted on. They usually leave the screen intact, and a reload
// mid-game for a harmless one would be worse than the bug.
export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    reportError('uncaught', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError('rejection', event.reason)
  })
}
