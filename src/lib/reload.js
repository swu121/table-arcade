import { useEffect, useReducer } from 'react'
import { socket } from '../socket.js'

// Reloading is how a tablet gets new code and how it gets out of a bad state,
// and both of those can loop: a build that crashes on boot would reload
// forever, and so would a server that keeps asking. The tab remembers its
// recent reloads and refuses a fourth inside a minute.
const KEY = 'tablearcade.reloads'
const WINDOW = 60_000
const LIMIT = 3

function recent() {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    const now = Date.now()
    return Array.isArray(list) ? list.filter((at) => now - at < WINDOW) : []
  } catch {
    return []
  }
}

export function reloadNow() {
  const list = recent()
  if (list.length >= LIMIT) return false
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...list, Date.now()]))
  } catch {
    // Private mode or a full quota: reload anyway, the loop guard just won't hold.
  }
  window.location.reload()
  return true
}

export function forgetReloads() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}

// The server can ask for a reload — a new build, or staff pressing the button —
// but only the tablet knows whether someone is mid-game. `busy` says so; a
// non-urgent request waits for the next idle moment, an urgent one goes now.
//
// The request often lands in the same breath as the first sync, before any
// component has mounted, so it is caught here at module level and kept until
// something is listening.
let request = null
const watchers = new Set()

socket.on('app:reload', (payload = {}) => {
  request = { urgent: Boolean(payload.urgent), reason: payload.reason ?? 'unknown' }
  for (const notify of watchers) notify()
})

export function useReloadPolicy(busy) {
  const [tick, bump] = useReducer((n) => n + 1, 0)

  useEffect(() => {
    watchers.add(bump)
    return () => watchers.delete(bump)
  }, [])

  useEffect(() => {
    if (!request) return
    if (request.urgent || !busy) {
      request = null
      reloadNow()
    }
  }, [busy, tick])

  return Boolean(request)
}
