import { useEffect, useState } from 'react'
import { Wordmark } from '../components/Logo.jsx'
import { PairCodeButton } from '../components/PairCode.jsx'
import { timeAgo } from '../lib/format.js'

function DeviceRow({ device, onRevoke, index }) {
  const [confirm, setConfirm] = useState(false)

  return (
    <li
      className="panel anim-fade-up flex items-center gap-5 px-5 py-4"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <span className={`chip shrink-0 ${device.online ? 'chip-open' : 'chip-wait'}`}>
        <span className={`dot ${device.online ? 'dot-live' : ''}`} />
        {device.online ? 'Online' : 'Offline'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="display truncate text-2xl text-chalk">{device.label}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
          <span>Paired {timeAgo(device.createdAt)}</span>
          <span className="text-edge">·</span>
          <span>{device.lastSeenAt ? `Last seen ${timeAgo(device.lastSeenAt)}` : 'Never connected'}</span>
        </div>
      </div>

      {confirm ? (
        <>
          <span className="text-xs text-dim">It goes back to the pairing screen.</span>
          <button type="button" className="btn btn-ghost h-12 shrink-0 px-4 text-xs" onClick={() => setConfirm(false)}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger h-12 shrink-0 px-5 text-xs" onClick={() => onRevoke(device.id)}>
            Revoke
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost h-12 shrink-0 px-5 text-xs" onClick={() => setConfirm(true)}>
          Revoke
        </button>
      )}
    </li>
  )
}

function UserRow({ user, isMe, onlyOne, onRevoke, index }) {
  const [confirm, setConfirm] = useState(false)

  return (
    <li
      className="panel anim-fade-up flex items-center gap-5 px-5 py-4"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      data-staff-user={user.email}
    >
      <div className="min-w-0 flex-1">
        <div className="display truncate text-2xl text-chalk">
          {user.name}
          {isMe && <span className="ml-3 align-middle text-xs font-bold tracking-wide text-gold">YOU</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
          <span className="font-mono">{user.email}</span>
          <span className="text-edge">·</span>
          <span>{user.lastLoginAt ? `Signed in ${timeAgo(user.lastLoginAt)}` : 'Never signed in'}</span>
        </div>
      </div>

      {onlyOne ? (
        <span className="text-xs text-dim">The only account here</span>
      ) : confirm ? (
        <>
          <span className="text-xs text-dim">{isMe ? 'You will be signed out.' : 'They are signed out at once.'}</span>
          <button type="button" className="btn btn-ghost h-12 shrink-0 px-4 text-xs" onClick={() => setConfirm(false)}>
            Keep
          </button>
          <button type="button" className="btn btn-danger h-12 shrink-0 px-5 text-xs" onClick={() => onRevoke(user.id)}>
            Revoke
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost h-12 shrink-0 px-5 text-xs" onClick={() => setConfirm(true)}>
          Revoke
        </button>
      )}
    </li>
  )
}

// A new account. The server validates and answers with app:error (shown as
// a toast) or a fresh staff:users list, which is when the form clears.
function AddStaff({ onAdd, count }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sentAt, setSentAt] = useState(0)

  // A grown list after a submit means it landed.
  useEffect(() => {
    if (!sentAt) return
    setName('')
    setEmail('')
    setPassword('')
    setSentAt(0)
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = name.trim() && email.trim() && password.length >= 8

  const submit = (event) => {
    event.preventDefault()
    if (!ready) return
    setSentAt(Date.now())
    onAdd({ name: name.trim(), email: email.trim(), password })
  }

  return (
    <form className="panel anim-fade-up mt-2.5 flex flex-wrap items-end gap-3 px-5 py-4" onSubmit={submit} noValidate>
      <label className="min-w-[10rem] flex-1">
        <span className="overline">Name</span>
        <input
          className="chat-input mt-1.5 block h-12 w-full"
          value={name}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="min-w-[14rem] flex-[1.4]">
        <span className="overline">Email</span>
        <input
          type="email"
          className="chat-input mt-1.5 block h-12 w-full"
          value={email}
          autoComplete="off"
          autoCapitalize="none"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="min-w-[12rem] flex-1">
        <span className="overline">Password (8+)</span>
        <input
          type="password"
          className="chat-input mt-1.5 block h-12 w-full"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary h-12 px-6 text-xs" disabled={!ready}>
        Add staff
      </button>
    </form>
  )
}

// Every tablet staff have paired with this venue, and every account that can
// sign in to run it. Revoking either drops it on the spot.
export function Devices({ devices, users = [], me = null, onRevoke, onAddUser, onRevokeUser, nav }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const online = devices.filter((d) => d.online).length

  return (
    <div className="relative z-10 flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="chip chip-busy">
            <span className="dot dot-live" />
            Staff
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <PairCodeButton className="btn btn-primary h-11 px-5 text-xs" />
          {nav}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <h2 className="display text-[clamp(2rem,5.5vw,3rem)]">Paired tablets</h2>
        <p className="mt-1.5 text-sm text-dim">
          {devices.length === 0
            ? 'Only a tablet staff have paired can join this room.'
            : `${devices.length} paired · ${online} online now.`}
        </p>

        {devices.length === 0 ? (
          <div className="panel anim-fade-up mt-5 grid place-items-center px-6 py-16 text-center">
            <div className="display text-3xl text-edge">No tablets yet</div>
            <p className="mt-2 max-w-sm text-sm text-dim">
              Press <span className="font-bold text-chalk">Pair a tablet</span>, then type the code into the tablet.
            </p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-2.5">
            {devices.map((device, i) => (
              <DeviceRow key={device.id} device={device} onRevoke={onRevoke} index={i} />
            ))}
          </ul>
        )}

        <h2 className="display mt-10 text-[clamp(2rem,5.5vw,3rem)]">Staff</h2>
        <p className="mt-1.5 text-sm text-dim">
          {users.length === 0
            ? 'Nobody can sign in here yet. Add the first account and the staff screen closes to everyone else.'
            : `${users.length} ${users.length === 1 ? 'account' : 'accounts'} can sign in to run this floor.`}
        </p>

        {users.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2.5" aria-label="Staff accounts">
            {users.map((user, i) => (
              <UserRow
                key={user.id}
                user={user}
                isMe={me?.id === user.id}
                onlyOne={users.length === 1}
                onRevoke={onRevokeUser}
                index={i}
              />
            ))}
          </ul>
        )}

        <div className="overline mt-6">Add staff</div>
        <AddStaff onAdd={onAddUser} count={users.length} />
      </div>
    </div>
  )
}
