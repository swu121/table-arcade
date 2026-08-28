import { useEffect, useRef, useState } from 'react'
import { ItemIcon } from './ItemIcon.jsx'
import { money, pad, timeAgo } from '../lib/format.js'

function BellIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

const LINE = {
  gift: (n) => `Table ${pad(n.fromTable)} sent you something`,
  challenge: (n) => `Table ${pad(n.fromTable)} challenged you`,
  message: (n) => `Table ${pad(n.fromTable)} messaged you`
}

function Row({ entry, onOpen }) {
  const line = LINE[entry.kind]?.(entry) ?? `Table ${pad(entry.fromTable)}`

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={`inbox-row ${entry.read ? '' : 'inbox-row--new'}`}
    >
      <span className="inbox-icon">
        {entry.item ? <ItemIcon name={entry.item.icon} size={34} /> : <span className="inbox-glyph">💬</span>}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-chalk">{line}</span>
        <span className="mt-0.5 block truncate text-xs text-dim">
          {entry.kind === 'message'
            ? entry.preview
            : entry.kind === 'gift'
              ? `${entry.item.name} · ${money(entry.item.price)} · on their tab`
              : `${entry.gameName} for ${entry.item.name}`}
        </span>
      </span>

      <span className="shrink-0 text-[0.68rem] text-dim">{timeAgo(entry.at)}</span>
    </button>
  )
}

export function Inbox({ notifications, onOpen, onRead, onClear }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  const unread = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) onRead()
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Inbox, ${unread} new` : 'Inbox'}
        className="panel relative flex h-12 w-12 items-center justify-center text-dim"
      >
        <BellIcon />
        {unread > 0 && <span className="inbox-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="inbox-pop panel anim-fade-up">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="overline">Inbox</span>
            {notifications.length > 0 && (
              <button type="button" className="text-xs font-bold text-dim" onClick={onClear}>
                Clear
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 pt-2 pb-6 text-center">
              <div className="display text-xl text-edge">Nothing yet</div>
              <p className="mt-1 text-xs text-dim">Gifts, challenges and messages land here.</p>
            </div>
          ) : (
            <div className="inbox-list">
              {notifications.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  onOpen={(n) => {
                    setOpen(false)
                    onOpen(n)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
