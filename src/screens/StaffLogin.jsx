import { useEffect, useState } from 'react'
import { Mark } from '../components/Logo.jsx'
import { devDoorOpen, enterDevDoor, staffLogin } from '../lib/staffSession.js'

// The staff screen's front door: email and password, checked by the venue's
// login route. Nothing else is reachable from here — the socket is not
// connected until there is a session. Outside production, a venue with no
// staff users yet also offers the dev door, so `npm run dev` is one click.
export function StaffLogin({ venue, reason, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [devDoor, setDevDoor] = useState(false)

  useEffect(() => {
    let live = true
    devDoorOpen().then((open) => live && setDevDoor(open))
    return () => {
      live = false
    }
  }, [])

  const ready = email.trim() !== '' && password !== '' && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await staffLogin(email.trim(), password)
      onSignedIn()
    } catch (err) {
      setError(err.message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const continueDev = () => {
    enterDevDoor()
    onSignedIn()
  }

  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="anim-fade-up flex flex-col items-center gap-4">
        <Mark size={54} />
        <h1 className="display text-center text-[clamp(2.4rem,9vw,3.4rem)]">
          <span className="text-chalk">Table</span> <span className="gold-text">Arcade</span>
        </h1>
      </div>

      <form
        className="anim-fade-up panel w-full px-6 py-5"
        style={{ animationDelay: '80ms' }}
        onSubmit={submit}
        noValidate
      >
        <div className="overline text-center">Staff sign in{venue ? ` · ${venue}` : ''}</div>
        <p className="mt-1 text-center text-sm text-dim">
          {reason === 'revoked'
            ? 'Your access here was removed. Ask whoever runs the room.'
            : reason === 'expired'
              ? 'Your sign-in has expired. Sign in again.'
              : 'Only staff run this floor. Sign in with the account you were given.'}
        </p>

        <label className="mt-5 block">
          <span className="overline">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="chat-input mt-1.5 block w-full"
            value={email}
            disabled={busy}
            onChange={(event) => {
              setEmail(event.target.value)
              setError('')
            }}
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className="overline">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="chat-input mt-1.5 block w-full"
            value={password}
            disabled={busy}
            onChange={(event) => {
              setPassword(event.target.value)
              setError('')
            }}
          />
        </label>

        <div className="mt-3 h-5 text-center text-xs font-semibold tracking-wide text-neon" role="alert">
          {error}
        </div>

        <button type="submit" className="btn btn-primary mt-1 h-14 w-full text-base" disabled={!ready}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {devDoor && (
        <div className="anim-fade-up panel w-full px-6 py-4 text-center" style={{ animationDelay: '160ms' }}>
          <p className="text-sm text-dim">
            No staff accounts here yet, and this is not production. The staff screen is open until the first
            account is added.
          </p>
          <button type="button" className="btn btn-ghost mt-3 h-12 w-full text-sm" onClick={continueDev}>
            Continue (dev)
          </button>
        </div>
      )}

      <p className="text-center text-xs text-dim">
        Staff only. Accounts are added from the staff screen, or with <span className="font-mono">npm run staff:add</span>.
      </p>
    </div>
  )
}
