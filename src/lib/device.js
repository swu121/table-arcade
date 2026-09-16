import { route } from '../venue.js'

// The device token: proof that staff at this venue paired this tablet. Issued
// once, in exchange for a code off the staff screen, and kept per venue so a
// tablet moved between restaurants never presents the wrong one.
export const DEVICE_KEY = `tablearcade.device.${route.slug ?? 'none'}`

export function getDeviceToken() {
  try {
    return localStorage.getItem(DEVICE_KEY) || null
  } catch {
    return null
  }
}

export function setDeviceToken(token) {
  try {
    localStorage.setItem(DEVICE_KEY, token)
  } catch {
    // Private mode or a full quota: the tablet will have to pair again next boot.
  }
}

export function clearDeviceToken() {
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Nothing to clear.
  }
}

// Trades a six-digit code for a token. Resolves once the token is stored;
// rejects with a message fit for the screen.
export async function pairDevice(code, label) {
  let res
  try {
    res = await fetch(`/api/venue/${route.slug}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, label })
    })
  } catch {
    throw new Error('No connection to the server.')
  }
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || typeof payload.token !== 'string') throw new Error(payload.message ?? 'That code did not work.')
  setDeviceToken(payload.token)
  return payload
}
