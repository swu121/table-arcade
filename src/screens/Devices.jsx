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

// Every tablet staff have paired with this venue. Revoking one drops it on
// the spot; pairing a new one starts from the same button as the editor's.
export function Devices({ devices, onRevoke, nav }) {
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
      </div>
    </div>
  )
}
