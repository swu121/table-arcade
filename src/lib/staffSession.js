import { route } from '../venue.js'

// The staff session: proof that someone signed in to this venue's staff
// screen on this browser. Issued by the login route, sent in the socket
// handshake, and kept per venue so one browser can hold a session for each.
//
//   { token, name, expiresAt }
//
// The token 'dev' is the dev door: outside production, a venue with no staff
// users yet lets the staff screen in on it (see server/staff.js).
export const STAFF_KEY = `tablearcade.staff.${route.slug ?? 'none'}`
export const DEV_TOKEN = 'dev'

export function getStaffSession() {
  try {
    const raw = localStorage.getItem(STAFF_KEY)
    const session = raw ? JSON.parse(raw) : null
    if (!session || typeof session.token !== 'string' || !session.token) return null
    if (session.expiresAt && session.expiresAt < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function setStaffSession(session) {
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(session))
  } catch {
    // Private mode or a full quota: they will have to sign in again next boot.
  }
}

export function clearStaffSession() {
  try {
    localStorage.removeItem(STAFF_KEY)
  } catch {
    // Nothing to clear.
  }
}

async function post(path, body, headers = {}) {
  let res
  try {
    res = await fetch(`/api/venue/${route.slug}/staff/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error('No connection to the server.')
  }
  return res
}

// Signs in and stores the session. Rejects with a message fit for the form.
export async function staffLogin(email, password) {
  const res = await post('login', { email, password })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || typeof payload.token !== 'string') throw new Error(payload.message ?? 'That did not work.')
  setStaffSession({ token: payload.token, name: payload.name, expiresAt: payload.expiresAt })
  return payload
}

// Tells the server, then forgets the session either way.
export async function staffLogout() {
  const session = getStaffSession()
  clearStaffSession()
  if (!session || session.token === DEV_TOKEN) return
  await post('logout', {}, { authorization: `Bearer ${session.token}` }).catch(() => {})
}

// Whether this venue's dev door is open (see server/staff.js).
export async function devDoorOpen() {
  try {
    const res = await fetch(`/api/venue/${route.slug}/staff/status`)
    if (!res.ok) return false
    return Boolean((await res.json()).dev)
  } catch {
    return false
  }
}

export function enterDevDoor() {
  setStaffSession({ token: DEV_TOKEN, name: 'Developer', expiresAt: null })
}
