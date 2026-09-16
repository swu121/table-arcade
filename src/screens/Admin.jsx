import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mark, Wordmark } from '../components/Logo.jsx'
import { ICON_NAMES, ItemIcon } from '../components/ItemIcon.jsx'
import { venuePath } from '../venue.js'
import {
  adminFetch,
  adminLogin,
  adminLogout,
  adminStatus,
  clearAdminSession,
  getAdminSession
} from '../lib/adminSession.js'

// The platform operator's page. Onboarding a restaurant is this screen: name
// it, give it an address, add the account whoever runs it will sign in with,
// and hand a pairing code to the first tablet. Everything lands on the running
// server — there is no deploy in the loop, and no socket on this page either,
// because an operator is not standing on anybody's floor.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
const CODE_TTL = 5 * 60_000

// "The Anchor & Crown" -> "the-anchor-crown". A suggestion only: the field
// stays editable, and the server has the last word on what is legal.
const suggestSlug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [expiresAt])
  return Math.max(0, (expiresAt ?? 0) - now)
}

/* ---------------------------------------------------------------- bits --- */

function Field({ label, hint, children }) {
  return (
    <label className="block min-w-[9rem] flex-1">
      <span className="overline">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  )
}

function Toggle({ label, on, onChange, hint }) {
  return (
    <button
      type="button"
      className="panel flex w-full items-center gap-4 px-5 py-4 text-left"
      onClick={() => onChange(!on)}
      aria-pressed={on}
    >
      <span className={`chip shrink-0 ${on ? 'chip-open' : 'chip-wait'}`}>
        <span className={`dot ${on ? 'dot-live' : ''}`} />
        {on ? 'On' : 'Off'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="display block text-xl text-chalk">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-dim">{hint}</span>}
      </span>
    </button>
  )
}

/* --------------------------------------------------------------- login --- */

function AdminLogin({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = email.trim() !== '' && password !== '' && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await adminLogin(email.trim(), password)
      onSignedIn()
    } catch (err) {
      setError(err.message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="anim-fade-up flex flex-col items-center gap-4">
        <Mark size={54} />
        <h1 className="display text-center text-[clamp(2.4rem,9vw,3.4rem)]">
          <span className="text-chalk">Table</span> <span className="gold-text">Arcade</span>
        </h1>
      </div>

      <form className="anim-fade-up panel w-full px-6 py-5" style={{ animationDelay: '80ms' }} onSubmit={submit} noValidate>
        <div className="overline text-center">Admin sign in</div>
        <p className="mt-1 text-center text-sm text-dim">
          The operator account for this server — the one that onboards restaurants, not a venue&apos;s staff.
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

      <p className="text-center text-xs text-dim">
        Set with <span className="font-mono">ADMIN_EMAIL</span> and{' '}
        <span className="font-mono">ADMIN_PASSWORD_HASH</span> — <span className="font-mono">npm run admin:hash</span>{' '}
        prints one.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ new venue --- */

function NewVenue({ onCreate, taken }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const [pairing, setPairing] = useState(true)
  const [bots, setBots] = useState('12, 17, 20')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const suggested = touched ? slug : suggestSlug(name)
  const clash = Boolean(suggested) && taken.includes(suggested)
  const ready = name.trim() !== '' && SLUG.test(suggested) && !clash && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await onCreate({
        slug: suggested,
        name: name.trim(),
        requirePairing: pairing,
        botTables: bots
          .split(/[,\s]+/)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0 && n < 100)
      })
      setName('')
      setSlug('')
      setTouched(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel anim-fade-up mt-2.5 px-5 py-4" onSubmit={submit} noValidate>
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Venue name">
          <input
            className="chat-input mt-1.5 block h-12 w-full"
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
          />
        </Field>
        <Field label="Address" hint={suggested ? `/v/${suggested}` : 'Made from the name'}>
          <input
            className="chat-input mt-1.5 block h-12 w-full font-mono"
            value={suggested}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              setTouched(true)
              setSlug(event.target.value.toLowerCase())
              setError('')
            }}
          />
        </Field>
        <Field label="Bot tables" hint="Empty for a floor with no bots">
          <input
            className="chat-input mt-1.5 block h-12 w-full tnum"
            value={bots}
            autoComplete="off"
            onChange={(event) => setBots(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`btn h-11 px-5 text-xs ${pairing ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={pairing}
          onClick={() => setPairing(!pairing)}
        >
          {pairing ? 'Tablets must be paired' : 'Any tablet can join'}
        </button>
        <span className="flex-1 text-xs text-neon" role="alert">
          {clash ? 'A venue already has that address.' : error}
        </span>
        <button type="submit" className="btn btn-primary h-12 px-6 text-xs" disabled={!ready}>
          {busy ? 'Creating…' : 'Create venue'}
        </button>
      </div>
    </form>
  )
}

/* ----------------------------------------------------------- menu edit --- */

function IconPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ICON_NAMES.map((icon) => (
        <button
          key={icon}
          type="button"
          aria-label={icon}
          aria-pressed={icon === value}
          className={`grid h-9 w-9 place-items-center rounded-lg border ${
            icon === value ? 'border-gold bg-white/10' : 'border-transparent'
          }`}
          onClick={() => onChange(icon)}
        >
          <ItemIcon name={icon} size={24} />
        </button>
      ))}
    </div>
  )
}

function MenuEditor({ venue, onSave }) {
  const [rows, setRows] = useState(venue.menu)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setRows(venue.menu)
    setSaved(false)
    setError('')
  }, [venue.slug, venue.menu])

  const set = (index, patch) => {
    setSaved(false)
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const add = () => {
    setSaved(false)
    setRows([...rows, { id: `item-${rows.length + 1}-${Date.now().toString(36)}`, name: '', price: 10, icon: 'beer' }])
  }

  const remove = (index) => {
    setSaved(false)
    setRows(rows.filter((_row, i) => i !== index))
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(
        rows
          .filter((row) => row.name.trim())
          .map((row) => ({ ...row, name: row.name.trim(), price: Number(row.price) || 0 }))
      )
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ul className="mt-2.5 flex flex-col gap-2" aria-label="Menu items">
        {rows.map((row, index) => (
          <li key={row.id} className="panel flex flex-wrap items-center gap-3 px-4 py-3">
            <input
              aria-label={`Item ${index + 1} name`}
              className="chat-input h-11 min-w-[9rem] flex-[2]"
              value={row.name}
              onChange={(event) => set(index, { name: event.target.value })}
            />
            <input
              aria-label={`Item ${index + 1} price`}
              type="number"
              min="0"
              step="1"
              className="chat-input tnum h-11 w-24"
              value={row.price}
              onChange={(event) => set(index, { price: event.target.value })}
            />
            <IconPicker value={row.icon} onChange={(icon) => set(index, { icon })} />
            <button
              type="button"
              aria-label={`Remove item ${index + 1}`}
              className="btn btn-ghost h-11 px-4 text-xs"
              onClick={() => remove(index)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost h-11 px-5 text-xs" onClick={add}>
          Add item
        </button>
        <span className="flex-1 text-xs" role="alert">
          <span className="text-neon">{error}</span>
          {!error && saved && <span className="text-dim">Saved — every tablet in the room has it.</span>}
        </span>
        <button type="button" className="btn btn-primary h-11 px-5 text-xs" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save menu'}
        </button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- pair code --- */

// A copy of the staff screen's pairing sheet, small enough not to be worth
// sharing: that one reads its code off the socket, and this page holds none.
function PairCode({ slug }) {
  const [issued, setIssued] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remaining = useCountdown(issued?.expiresAt)
  const expired = Boolean(issued) && remaining <= 0
  const frac = issued ? remaining / CODE_TTL : 0

  useEffect(() => {
    setIssued(null)
    setError('')
  }, [slug])

  const issue = async () => {
    setBusy(true)
    setError('')
    try {
      setIssued(await adminFetch(`/venues/${slug}/pair-code`, { method: 'POST', body: {} }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="display text-xl text-chalk">First tablet</div>
          <p className="mt-0.5 text-sm text-dim">
            Open <span className="font-mono">/v/{slug}</span> on the tablet and type this in. It works once and lasts
            five minutes.
          </p>
        </div>
        <button type="button" className="btn btn-primary h-11 px-5 text-xs" onClick={issue} disabled={busy}>
          {busy ? 'Asking…' : issued ? 'New code' : 'Issue pairing code'}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs text-neon" role="alert">
          {error}
        </div>
      )}

      {issued && (
        <div className="mt-4 text-center">
          <div
            className={`display tnum flex justify-center gap-1.5 ${expired ? 'text-edge' : 'gold-text'}`}
            data-pair-code={issued.code}
          >
            {issued.code.split('').map((digit, i) => (
              <span key={i} className={`text-[clamp(2.4rem,7vw,3.4rem)] leading-none ${i === 3 ? 'ml-4' : ''}`}>
                {digit}
              </span>
            ))}
          </div>
          <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${frac < 0.25 ? 'bg-neon' : 'bg-gold'}`}
              style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, transition: 'width 250ms linear' }}
            />
          </div>
          <div className="tnum mt-2 text-xs font-semibold tracking-wide text-dim">
            {expired
              ? 'This code has expired'
              : `Expires in ${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}`}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------- first staff --- */

function FirstStaff({ venue, onAdd }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState('')

  useEffect(() => {
    setName('')
    setEmail('')
    setPassword('')
    setError('')
    setAdded('')
  }, [venue.slug])

  const ready = name.trim() && email.trim() && password.length >= 8 && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const { user } = await onAdd({ name: name.trim(), email: email.trim(), password })
      setAdded(user.email)
      setName('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel px-5 py-4" onSubmit={submit} noValidate>
      <div className="display text-xl text-chalk">
        {venue.staff ? 'Another staff account' : 'The first staff account'}
      </div>
      <p className="mt-0.5 text-sm text-dim">
        {venue.staff
          ? `${venue.staff} ${venue.staff === 1 ? 'account' : 'accounts'} can sign in at /v/${venue.slug}/staff. The rest are added from there.`
          : 'Nobody can open this venue’s staff screen yet. This is the account they sign in with.'}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Staff name">
          <input
            className="chat-input mt-1.5 block h-12 w-full"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Staff email">
          <input
            type="email"
            className="chat-input mt-1.5 block h-12 w-full"
            value={email}
            autoComplete="off"
            autoCapitalize="none"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password (8+)">
          <input
            type="password"
            className="chat-input mt-1.5 block h-12 w-full"
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <button type="submit" className="btn btn-primary h-12 px-6 text-xs" disabled={!ready}>
          Add account
        </button>
      </div>

      <div className="mt-2 text-xs" role="alert">
        <span className="text-neon">{error}</span>
        {!error && added && <span className="text-dim">{added} can sign in now.</span>}
      </div>
    </form>
  )
}

/* -------------------------------------------------------------- detail --- */

function VenueDetail({ venue, onPatch, onAddStaff }) {
  const [name, setName] = useState(venue.name)
  const [bots, setBots] = useState(venue.botTables.join(', '))
  const [error, setError] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    setName(venue.name)
    setBots(venue.botTables.join(', '))
    setError('')
    setConfirmArchive(false)
  }, [venue.slug, venue.name, venue.botTables])

  const patch = async (body) => {
    setError('')
    try {
      await onPatch(body)
    } catch (err) {
      setError(err.message)
    }
  }

  const dirty = name.trim() !== venue.name || bots !== venue.botTables.join(', ')

  return (
    <div className="flex flex-col gap-5 pb-10">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="display text-[clamp(2rem,5vw,2.8rem)]">{venue.name}</h2>
          {venue.archived && <span className="chip chip-wait">Archived</span>}
          {venue.live && (
            <span className="chip chip-open">
              <span className="dot dot-live" />
              {venue.sockets} {venue.sockets === 1 ? 'screen' : 'screens'} connected
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
          <a className="font-mono text-gold" href={venuePath(venue.slug)} target="_blank" rel="noreferrer">
            {venuePath(venue.slug)}
          </a>
          <span className="text-edge">·</span>
          <a className="font-mono text-gold" href={venuePath(venue.slug, true)} target="_blank" rel="noreferrer">
            {venuePath(venue.slug, true)}
          </a>
          <span className="text-edge">·</span>
          <span>
            {venue.devices} paired {venue.devices === 1 ? 'tablet' : 'tablets'}
          </span>
          <span className="text-edge">·</span>
          <span>
            {venue.staff} staff {venue.staff === 1 ? 'account' : 'accounts'}
          </span>
        </div>
      </header>

      {error && (
        <div className="text-xs text-neon" role="alert">
          {error}
        </div>
      )}

      <section className="panel px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input
              className="chat-input mt-1.5 block h-12 w-full"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Bot tables" hint="Numbers that always look busy">
            <input
              className="chat-input tnum mt-1.5 block h-12 w-full"
              value={bots}
              onChange={(event) => setBots(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn-primary h-12 px-6 text-xs"
            disabled={!dirty}
            onClick={() =>
              patch({
                name: name.trim(),
                botTables: bots
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((n) => Number.isInteger(n) && n > 0 && n < 100)
              })
            }
          >
            Save
          </button>
        </div>
      </section>

      <Toggle
        label="Tablets must be paired"
        on={venue.requirePairing}
        hint="Off, and anyone who knows the address can claim a table."
        onChange={(on) => patch({ requirePairing: on })}
      />

      <section>
        <div className="overline">Menu</div>
        <p className="mt-1 text-sm text-dim">What tables can play for. A game already running keeps its own item.</p>
        <MenuEditor venue={venue} onSave={(menu) => onPatch({ menu })} />
      </section>

      <FirstStaff venue={venue} onAdd={onAddStaff} />

      <PairCode slug={venue.slug} />

      <section className="panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="display text-xl text-chalk">{venue.archived ? 'Archived' : 'Archive this venue'}</div>
            <p className="mt-0.5 text-sm text-dim">
              {venue.archived
                ? 'Its address is refused like one nobody set up. Its plans, tickets, tablets and accounts are all still here.'
                : 'Nothing is deleted — the address stops working and the bare URL skips it. Reversible.'}
            </p>
          </div>
          {venue.archived ? (
            <button type="button" className="btn btn-primary h-12 px-5 text-xs" onClick={() => patch({ archived: false })}>
              Open it again
            </button>
          ) : confirmArchive ? (
            <>
              <span className="text-xs text-dim">Every tablet in the room drops.</span>
              <button type="button" className="btn btn-ghost h-12 px-4 text-xs" onClick={() => setConfirmArchive(false)}>
                Keep it
              </button>
              <button type="button" className="btn btn-danger h-12 px-5 text-xs" onClick={() => patch({ archived: true })}>
                Archive
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost h-12 px-5 text-xs" onClick={() => setConfirmArchive(true)}>
              Archive
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- page --- */

export function Admin() {
  const [status, setStatus] = useState(null)
  const [session, setSession] = useState(() => getAdminSession())
  const [venues, setVenues] = useState([])
  const [selected, setSelected] = useState(null)
  const [loadError, setLoadError] = useState('')
  const live = useRef(true)

  useEffect(() => {
    adminStatus().then((next) => live.current && setStatus(next))
    return () => {
      live.current = false
    }
  }, [])

  const signedIn = Boolean(session) || status?.dev === true

  const refresh = useCallback(async () => {
    try {
      const { venues: list } = await adminFetch('/venues')
      if (!live.current) return
      setVenues(list)
      setLoadError('')
    } catch (err) {
      if (!live.current) return
      if (err.status === 401) setSession(null)
      else setLoadError(err.message)
    }
  }, [])

  // The socket counts are live numbers, so the list keeps asking for them
  // while the page is open. Everything else on the page is request/response.
  useEffect(() => {
    if (!signedIn) return
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [signedIn, refresh])

  const venue = useMemo(() => venues.find((v) => v.slug === selected) ?? null, [venues, selected])

  const create = async (body) => {
    const { venue: made } = await adminFetch('/venues', { method: 'POST', body })
    setSelected(made.slug)
    await refresh()
    return made
  }

  const patch = async (body) => {
    await adminFetch(`/venues/${selected}`, { method: 'PATCH', body })
    await refresh()
  }

  const addStaff = async (body) => {
    const made = await adminFetch(`/venues/${selected}/staff`, { method: 'POST', body })
    await refresh()
    return made
  }

  const signOut = async () => {
    await adminLogout()
    clearAdminSession()
    setSession(null)
    setVenues([])
    setSelected(null)
  }

  if (!status) {
    return (
      <div className="relative z-10 grid h-full place-items-center">
        <div className="anim-fade-in flex flex-col items-center gap-5">
          <Mark size={56} />
          <div className="overline">Loading</div>
        </div>
      </div>
    )
  }

  if (!status.enabled) {
    return (
      <div className="relative z-10 grid h-full place-items-center px-6">
        <div className="anim-fade-in flex max-w-md flex-col items-center gap-4 text-center">
          <Mark size={56} />
          <div className="overline">Admin is off</div>
          <p className="text-dim">
            This server has no operator configured. Set <span className="font-mono text-chalk">ADMIN_EMAIL</span> and{' '}
            <span className="font-mono text-chalk">ADMIN_PASSWORD_HASH</span> and restart it.
          </p>
        </div>
      </div>
    )
  }

  if (!signedIn) return <AdminLogin onSignedIn={() => setSession(getAdminSession())} />

  return (
    <div className="relative z-10 flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="chip chip-busy">
            <span className="dot dot-live" />
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-dim">
          {status.dev ? (
            <span className="chip chip-wait">Dev mode — no ADMIN_EMAIL set, so this page is open</span>
          ) : (
            <>
              <span>
                Signed in as <span className="font-bold text-chalk">{session?.email}</span>
              </span>
              <span className="text-edge">·</span>
              <button type="button" className="font-bold text-gold" onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 px-5 pb-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <div className="min-h-0 overflow-y-auto pr-1">
          <h2 className="display text-[clamp(1.8rem,4.5vw,2.4rem)]">Venues</h2>
          <p className="mt-1 text-sm text-dim">
            {venues.length} on this server
            {loadError && <span className="text-neon"> · {loadError}</span>}
          </p>

          <ul className="mt-4 flex flex-col gap-2.5" aria-label="Venues">
            {venues.map((row, i) => (
              <li key={row.slug}>
                <button
                  type="button"
                  className={`panel anim-fade-up flex w-full items-center gap-4 px-5 py-4 text-left ${
                    row.slug === selected ? 'ring-1 ring-gold' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  aria-pressed={row.slug === selected}
                  onClick={() => setSelected(row.slug)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="display block truncate text-2xl text-chalk">{row.name}</span>
                    <span className="mt-1 block truncate font-mono text-sm text-dim">/v/{row.slug}</span>
                  </span>
                  {row.archived ? (
                    <span className="chip chip-wait shrink-0">Archived</span>
                  ) : (
                    <span className={`chip shrink-0 ${row.sockets ? 'chip-open' : 'chip-wait'}`}>
                      <span className={`dot ${row.sockets ? 'dot-live' : ''}`} />
                      {row.sockets}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="overline mt-7">New venue</div>
          <NewVenue onCreate={create} taken={venues.map((v) => v.slug)} />
        </div>

        <div className="min-h-0 overflow-y-auto">
          {venue ? (
            <VenueDetail venue={venue} onPatch={patch} onAddStaff={addStaff} />
          ) : (
            <div className="panel grid h-full min-h-[16rem] place-items-center px-6 py-16 text-center">
              <div>
                <div className="display text-3xl text-edge">Pick a venue</div>
                <p className="mt-2 max-w-sm text-sm text-dim">
                  Or fill in the form to add one. It is live the moment it is made — no deploy, no restart.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
