// The admin session: proof that the platform operator signed in on this
// browser. One session for the whole server — an operator belongs to no venue
// — so unlike the staff session it is not keyed by slug.
//
//   { token, email, expiresAt }
//
// Everything on the admin page is plain HTTP: the page never opens a socket,
// because it is not standing on anyone's floor.
export const ADMIN_KEY = 'tablearcade.admin'

export function getAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY)
    const session = raw ? JSON.parse(raw) : null
    if (!session || typeof session.token !== 'string' || !session.token) return null
    if (session.expiresAt && session.expiresAt < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function setAdminSession(session) {
  try {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(session))
  } catch {
    // Private mode or a full quota: they will sign in again next time.
  }
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(ADMIN_KEY)
  } catch {
    // Nothing to clear.
  }
}

// Every admin call goes through here: the session token on the way out, and a
// message fit for the screen on the way back. A 401 means the session is gone,
// which the page turns back into the login form.
export async function adminFetch(path, { method = 'GET', body } = {}) {
  const session = getAdminSession()
  let res
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session.token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new Error('No connection to the server.')
  }
  if (res.status === 204) return null
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(payload.message ?? 'That did not work.')
    error.code = payload.error
    error.status = res.status
    if (res.status === 401) clearAdminSession()
    throw error
  }
  return payload
}

// Whether there is an admin page here at all, and whether it is the open dev
// one. A 404 means the server has no operator configured and is in production.
export async function adminStatus() {
  try {
    const res = await fetch('/api/admin/status')
    if (!res.ok) return { enabled: false, dev: false }
    return await res.json()
  } catch {
    return { enabled: false, dev: false }
  }
}

export async function adminLogin(email, password) {
  const payload = await adminFetch('/login', { method: 'POST', body: { email, password } })
  setAdminSession({ token: payload.token, email: payload.email, expiresAt: payload.expiresAt })
  return payload
}

// Tells the server, then forgets the session either way.
export async function adminLogout() {
  const session = getAdminSession()
  clearAdminSession()
  if (!session) return
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: '{}'
  }).catch(() => {})
}
