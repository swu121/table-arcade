import { useCallback, useEffect, useRef, useState } from 'react'
import { socket, TABLE_KEY } from './socket.js'
import { route, redirectToDefault } from './venue.js'
import { useWakeLock } from './useWakeLock.js'
import { useReloadPolicy } from './lib/reload.js'
import { Backdrop, OfflineBanner, Toast } from './components/Bits.jsx'
import { Mark, Wordmark } from './components/Logo.jsx'
import { Setup } from './screens/Setup.jsx'
import { Launch } from './screens/Launch.jsx'
import { Home } from './screens/Home.jsx'
import { Lobby } from './screens/Lobby.jsx'
import { Chat } from './screens/Chat.jsx'
import { WagerSheet } from './screens/WagerSheet.jsx'
import { GiftSheet } from './screens/GiftSheet.jsx'
import { Game } from './screens/Game.jsx'
import { Result } from './screens/Result.jsx'
import { Staff } from './screens/Staff.jsx'
import { FloorPlanEditor } from './screens/FloorPlanEditor.jsx'

const ENDED_COPY = {
  declined: (table) => `Table ${table} passed on that one.`,
  expired: (table) => `Challenge with Table ${table} timed out.`,
  cancelled: (table) => `Challenge with Table ${table} was called off.`,
  disconnected: (table) => `Table ${table} dropped off.`
}

function Shell({ children }) {
  return (
    <div className="grain vignette relative h-full overflow-hidden">
      <Backdrop />
      {children}
    </div>
  )
}

function Booting({ label = 'Connecting' }) {
  return (
    <div className="relative z-10 grid h-full place-items-center">
      <div className="anim-fade-in flex flex-col items-center gap-5">
        <Mark size={56} />
        <div className="overline">{label}</div>
      </div>
    </div>
  )
}

function NoVenue({ slug }) {
  return (
    <div className="relative z-10 grid h-full place-items-center">
      <div className="anim-fade-in flex max-w-md flex-col items-center gap-4 text-center">
        <Mark size={56} />
        <div className="overline">No such venue</div>
        <p className="text-dim">
          Nothing is set up at <span className="font-mono text-chalk">/v/{slug}</span>. Check the address
          the tablet was given, or ask whoever runs the room.
        </p>
      </div>
    </div>
  )
}

// The server refuses the namespace outright when the slug isn't a venue, which
// surfaces as a connect error rather than a message — and it would retry forever.
function useVenueGate() {
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    const onError = (error) => {
      if (error?.message !== 'Invalid namespace') return
      socket.disconnect()
      setMissing(true)
    }
    socket.on('connect_error', onError)
    return () => socket.off('connect_error', onError)
  }, [])
  return missing
}

function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const show = useCallback((message, tone = 'bad') => {
    clearTimeout(timer.current)
    setToast({ message, tone, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 3400)
  }, [])

  return [toast, show]
}

function TabletApp() {
  const [sync, setSync] = useState(null)
  const [connected, setConnected] = useState(socket.connected)
  // The server said it was going down on purpose. Nothing to do but wait for
  // the reconnect loop — the table number is kept, the room comes back with
  // the game still in it, and the banner says so instead of "reconnecting".
  const [restarting, setRestarting] = useState(false)
  const [view, setView] = useState('home')
  const [wagerTarget, setWagerTarget] = useState(null)
  const [giftTarget, setGiftTarget] = useState(null)
  const [chatWith, setChatWith] = useState(null)
  const [setup, setSetup] = useState(false)
  const [threads, setThreads] = useState({})
  const [toast, showToast] = useToast()

  // Read inside socket listeners that are registered once, so it has to be a ref.
  const openChat = useRef(null)
  openChat.current = chatWith

  // Only tables the server actually confirmed get re-claimed on reconnect.
  const claimed = useRef(null)

  useWakeLock()

  // A reload restores the table number but not the screen, so it only happens
  // while there is nothing on screen worth keeping.
  useReloadPolicy(
    Boolean(sync?.game || sync?.challenge || sync?.lastResult || chatWith !== null || wagerTarget || giftTarget)
  )

  useEffect(() => {
    const stored = Number(localStorage.getItem(TABLE_KEY))
    if (Number.isInteger(stored) && stored > 0) claimed.current = stored

    const onConnect = () => {
      setConnected(true)
      setRestarting(false)
      if (claimed.current) socket.emit('table:claim', { tableNumber: claimed.current })
      else socket.emit('state:hello')
    }

    const onDisconnect = () => setConnected(false)
    const onRestarting = () => setRestarting(true)

    const onError = ({ code, message }) => {
      if (code === 'TAKEN_OVER') {
        claimed.current = null
        localStorage.removeItem(TABLE_KEY)
      }
      showToast(message)
    }

    const onChallengeEnded = ({ reason, otherTable }) => {
      // The thread already says so, in its own words, when it's on screen.
      if (openChat.current === otherTable) return
      const line = ENDED_COPY[reason]
      if (line) showToast(line(otherTable))
    }

    const onThread = ({ withTable, messages, readAt }) => {
      setThreads((current) => ({ ...current, [withTable]: { messages, readAt } }))
    }

    const onChatPing = ({ fromTable, preview }) => {
      if (openChat.current === fromTable) return
      showToast(`Table ${fromTable}: ${preview}`, 'good')
    }

    const onGiftIncoming = ({ fromTable, item }) => {
      showToast(`Table ${fromTable} sent you a ${item.name} — it's on them.`, 'good')
    }

    const onGiftSent = ({ toTable, item }) => {
      showToast(`${item.name} on its way to Table ${toTable}.`, 'good')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('app:restarting', onRestarting)
    socket.on('state:sync', setSync)
    socket.on('app:error', onError)
    socket.on('challenge:ended', onChallengeEnded)
    socket.on('chat:thread', onThread)
    socket.on('chat:ping', onChatPing)
    socket.on('gift:incoming', onGiftIncoming)
    socket.on('gift:sent', onGiftSent)

    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('app:restarting', onRestarting)
      socket.off('state:sync', setSync)
      socket.off('app:error', onError)
      socket.off('challenge:ended', onChallengeEnded)
      socket.off('chat:thread', onThread)
      socket.off('chat:ping', onChatPing)
      socket.off('gift:incoming', onGiftIncoming)
      socket.off('gift:sent', onGiftSent)
    }
  }, [showToast])

  const self = sync?.self
  useEffect(() => {
    if (!self) return
    claimed.current = self.number
    localStorage.setItem(TABLE_KEY, String(self.number))
  }, [self])

  // While a thread is on screen, arriving messages count as read — the server
  // needs to know the moment it stops being on screen.
  useEffect(() => {
    if (chatWith === null) return
    return () => socket.emit('chat:close')
  }, [chatWith])

  // A challenge landing means the sheet's target is stale either way.
  useEffect(() => {
    if (sync?.challenge || sync?.game) {
      setWagerTarget(null)
      setGiftTarget(null)
    }
  }, [sync?.challenge, sync?.game])

  // Signed out mid-flow, which is what a staff clear looks like from here. The
  // next party must not find the last one's chat still open behind the button.
  const signedIn = sync?.self?.signedIn
  useEffect(() => {
    if (signedIn === false) {
      setView('home')
      setChatWith(null)
      setThreads({})
      setWagerTarget(null)
      setGiftTarget(null)
    }
  }, [signedIn])

  // A challenge lives in the thread between the two tables, so whichever side
  // isn't looking at that thread gets taken there. Both then see the same card.
  const challengeWith = sync?.challenge?.otherTable ?? null
  useEffect(() => {
    if (challengeWith === null) return
    setChatWith((current) => {
      if (current !== challengeWith) socket.emit('chat:open', { withTable: challengeWith })
      return challengeWith
    })
  }, [challengeWith])

  // Whatever the table was browsing, a game takes over. The thread it started
  // from stays underneath, so the result screen hands back to it — the outcome
  // is written there.
  useEffect(() => {
    if (sync?.game) setView('home')
  }, [sync?.game])

  const assignTable = (number) => {
    socket.emit('table:claim', { tableNumber: number })
    setSetup(false)
    setView('home')
    setChatWith(null)
    setThreads({})
  }

  const openChatWith = (number) => {
    setChatWith(number)
    socket.emit('chat:open', { withTable: number })
  }

  const sendChallenge = ({ gameType, item }) => {
    const toTable = wagerTarget.number
    socket.emit('challenge:send', { toTable, gameType, item })
    setWagerTarget(null)
    // The challenge is what opens the thread, so land in it: the waiting sheet
    // sits on top until the other table answers, and the game takes over from
    // there. Sent from inside the thread already, this is a no-op.
    if (chatWith !== toTable) openChatWith(toTable)
  }

  const sendGift = ({ item }) => {
    socket.emit('gift:send', { toTable: giftTarget.number, item })
    setGiftTarget(null)
    setView('home')
  }

  // The floor plan hands back the drawn table, which knows nothing about the
  // room; the lobby entry is where `known` lives.
  const isKnown = (number) => Boolean((sync?.lobby ?? []).find((t) => t.number === number)?.known)

  const pickTable = (table) => {
    if (view === 'gift') setGiftTarget(table)
    else if (isKnown(table.number)) openChatWith(table.number)
    else setWagerTarget(table)
  }

  const openNotification = (entry) => {
    if (entry.kind === 'message') {
      openChatWith(entry.fromTable)
    } else if (entry.kind === 'gift') {
      setGiftTarget({ number: entry.fromTable })
    } else if (entry.kind === 'challenge') {
      setWagerTarget({ number: entry.fromTable })
    }
  }

  if (!sync) {
    return (
      <Shell>
        <Booting />
      </Shell>
    )
  }

  const social = sync.social ?? { notifications: [], muted: [], blocked: [], unread: {} }

  let screen
  if (setup) {
    screen = (
      <Setup taken={sync.taken} onClaim={assignTable} onCancel={sync.self ? () => setSetup(false) : null} />
    )
  } else if (!sync.self || !sync.self.signedIn) {
    screen = (
      <Launch self={sync.self} onSignIn={() => socket.emit('table:signIn')} onSetup={() => setSetup(true)} />
    )
  } else if (sync.lastResult) {
    screen = (
      <Result
        result={sync.lastResult}
        onDone={() => socket.emit('result:dismiss')}
        onRematch={() => {
          socket.emit('result:dismiss')
          setWagerTarget({
            number: sync.lastResult.opponent,
            preset: { gameType: sync.lastResult.gameType, itemId: sync.lastResult.item.id }
          })
        }}
      />
    )
  } else if (sync.game) {
    screen = (
      <Game
        game={sync.game}
        onAction={(payload) => socket.emit('game:action', { gameId: sync.game.id, ...payload })}
        onClaimWin={() => socket.emit('game:claimWin', { gameId: sync.game.id })}
        onForfeit={() => socket.emit('game:forfeit', { gameId: sync.game.id })}
      />
    )
  } else if (chatWith !== null) {
    screen = (
      <Chat
        self={sync.self}
        withTable={chatWith}
        messages={threads[chatWith]?.messages ?? []}
        readAt={threads[chatWith]?.readAt ?? 0}
        other={(sync.lobby ?? []).find((t) => t.number === chatWith) ?? null}
        muted={social.muted.includes(chatWith)}
        blocked={social.blocked.includes(chatWith)}
        challenge={sync.challenge}
        onBack={() => setChatWith(null)}
        onChallenge={() => setWagerTarget({ number: chatWith })}
        onRespond={(accept) => socket.emit('challenge:respond', { challengeId: sync.challenge.id, accept })}
        onCancelChallenge={() => socket.emit('challenge:cancel')}
        onSend={(text) => socket.emit('chat:send', { toTable: chatWith, text })}
        onMute={() => socket.emit('chat:mute', { table: chatWith, muted: !social.muted.includes(chatWith) })}
        onBlock={() => socket.emit('chat:block', { table: chatWith, blocked: !social.blocked.includes(chatWith) })}
      />
    )
  } else if (view !== 'home') {
    screen = (
      <Lobby
        sync={sync}
        mode={view}
        onPick={pickTable}
        onReset={() => setSetup(true)}
        onBack={() => setView('home')}
      />
    )
  } else {
    screen = (
      <Home
        self={sync.self}
        social={social}
        openCount={(sync.lobby ?? []).filter((t) => t.status === 'idle').length}
        onGo={setView}
        onReset={() => setSetup(true)}
        onOpenNotification={openNotification}
        onReadNotifications={() => socket.emit('notif:read')}
        onClearNotifications={() => socket.emit('notif:clear')}
      />
    )
  }

  return (
    <Shell>
      {screen}

      {wagerTarget && (
        <WagerSheet
          target={wagerTarget}
          preset={wagerTarget.preset}
          menu={sync.menu}
          games={sync.games}
          onCancel={() => setWagerTarget(null)}
          onSend={sendChallenge}
        />
      )}

      {giftTarget && (
        <GiftSheet
          target={giftTarget}
          menu={sync.menu}
          onCancel={() => setGiftTarget(null)}
          onSend={sendGift}
        />
      )}

      {(!connected || restarting) && <OfflineBanner label={restarting ? 'Restarting' : 'Reconnecting'} />}
      {toast && <Toast key={toast.id} toast={toast} />}
    </Shell>
  )
}

function StaffNav({ view, onChange }) {
  return (
    <div className="panel flex gap-1 p-1">
      {[
        ['tickets', 'Tickets'],
        ['floorplan', 'Floor plan']
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            view === id ? 'bg-gold text-[#2a1a00]' : 'text-dim'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function StaffApp() {
  const [tickets, setTickets] = useState([])
  const [floorplan, setFloorplan] = useState(null)
  const [floor, setFloor] = useState([])
  const [view, setView] = useState('tickets')

  useReloadPolicy(false)

  useEffect(() => {
    const join = () => socket.emit('staff:join')
    const onSync = (payload) => {
      setTickets(payload.tickets)
      setFloorplan(payload.floorplan)
      setFloor(payload.floor ?? [])
    }

    socket.on('connect', join)
    socket.on('staff:sync', onSync)
    if (socket.connected) join()

    return () => {
      socket.off('connect', join)
      socket.off('staff:sync', onSync)
    }
  }, [])

  const nav = <StaffNav view={view} onChange={setView} />

  return (
    <Shell>
      {view === 'tickets' ? (
        <Staff tickets={tickets} nav={nav} onDeliver={(ticketId) => socket.emit('staff:deliver', { ticketId })} />
      ) : (
        <div className="relative z-10 flex h-full flex-col">
          <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-4">
              <Wordmark />
              <span className="chip chip-busy">
                <span className="dot dot-live" />
                Staff
              </span>
            </div>
            {nav}
          </header>
          <div className="min-h-0 flex-1">
            {floorplan && <FloorPlanEditor floorplan={floorplan} floor={floor} tickets={tickets} />}
          </div>
        </div>
      )}
    </Shell>
  )
}

export default function App() {
  const missing = useVenueGate()

  useEffect(() => {
    if (!route.slug) redirectToDefault(route.staff).catch(console.error)
  }, [])

  if (!route.slug) {
    return (
      <Shell>
        <Booting label="Finding the room" />
      </Shell>
    )
  }
  if (missing) {
    return (
      <Shell>
        <NoVenue slug={route.slug} />
      </Shell>
    )
  }
  return route.staff ? <StaffApp /> : <TabletApp />
}
