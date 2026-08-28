import { Wordmark } from '../components/Logo.jsx'
import { Inbox } from '../components/Inbox.jsx'
import { pad } from '../lib/format.js'

function SwordsIcon({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M6 6h7l22 22-7 7L6 13V6Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M42 6h-7L13 28l7 7L42 13V6Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M30 34l8 8M18 34l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function GiftIcon({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="18" width="36" height="24" rx="3" stroke="currentColor" strokeWidth="2.6" />
      <path d="M4 18h40v8H4z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 18v24" stroke="currentColor" strokeWidth="2.6" />
      <path
        d="M24 18s-2-12-8-12a5 5 0 0 0 0 10c3 0 8 2 8 2Zm0 0s2-12 8-12a5 5 0 0 1 0 10c-3 0-8 2-8 2Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChatIcon({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M40 28a4 4 0 0 1-4 4H16l-8 8V12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v16Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="20" r="2.2" fill="currentColor" />
      <circle cx="24" cy="20" r="2.2" fill="currentColor" />
      <circle cx="31" cy="20" r="2.2" fill="currentColor" />
    </svg>
  )
}

const ACTIONS = [
  {
    id: 'challenge',
    label: 'Challenge',
    blurb: 'Play a table for something off the menu',
    Icon: SwordsIcon,
    tone: 'home-tile--gold'
  },
  {
    id: 'gift',
    label: 'Gift',
    blurb: 'Send a table a round — it goes on your tab',
    Icon: GiftIcon,
    tone: 'home-tile--mint'
  },
  {
    id: 'message',
    label: 'Message',
    blurb: 'Say something to another table',
    Icon: ChatIcon,
    tone: 'home-tile--neon'
  }
]

export function Home({
  self,
  social,
  openCount,
  onGo,
  onReset,
  onOpenNotification,
  onReadNotifications,
  onClearNotifications
}) {
  const unreadMessages = Object.values(social.unread ?? {}).reduce((sum, n) => sum + n, 0)

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <Wordmark />
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onReset}
            className="panel flex items-center gap-3 px-4 py-2 text-left"
            title="Change table number"
          >
            <span className="overline leading-none">You are</span>
            <span className="display tnum text-2xl leading-none gold-text">{pad(self.number)}</span>
          </button>
          <Inbox
            notifications={social.notifications ?? []}
            onOpen={onOpenNotification}
            onRead={onReadNotifications}
            onClear={onClearNotifications}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 pb-6">
        <div className="shrink-0 text-center">
          <h2 className="display text-[clamp(2rem,6vw,3.4rem)] leading-none">
            What&apos;s it going to be?
          </h2>
          <p className="mt-2 text-sm text-dim">
            {openCount > 0
              ? `${openCount} ${openCount === 1 ? 'table is' : 'tables are'} open right now.`
              : 'Nobody else is on the floor yet.'}
          </p>
        </div>

        <div className="mt-7 grid shrink-0 grid-cols-1 gap-3.5 sm:grid-cols-3">
          {ACTIONS.map(({ id, label, blurb, Icon, tone }) => (
            <button key={id} type="button" onClick={() => onGo(id)} className={`home-tile ${tone}`}>
              <span className="home-tile-icon">
                <Icon />
              </span>
              <span className="display mt-3 text-[clamp(1.6rem,3.4vw,2.3rem)] leading-none text-chalk">
                {label}
              </span>
              <span className="mt-1.5 max-w-[22ch] text-center text-[0.78rem] leading-snug text-dim">{blurb}</span>
              {id === 'message' && unreadMessages > 0 && (
                <span className="home-tile-badge">{unreadMessages > 9 ? '9+' : unreadMessages}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
