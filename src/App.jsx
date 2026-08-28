import { useCallback, useEffect, useRef, useState } from 'react'
import { socket, TABLE_KEY } from './socket.js'
import { useWakeLock } from './useWakeLock.js'
import { Backdrop, OfflineBanner, Toast } from './components/Bits.jsx'
import { Mark, Wordmark } from './components/Logo.jsx'
import { Setup } from './screens/Setup.jsx'
import { Lobby } from './screens/Lobby.jsx'
import { WagerSheet } from './screens/WagerSheet.jsx'
import { IncomingChallenge, WaitingForAnswer } from './screens/Challenge.jsx'
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

function Booting() {
  return (
    <div className="relative z-10 grid h-full place-items-center">
      <div className="anim-fade-in flex flex-col items-center gap-5">
        <Mark size={56} />
        <div className="overline">Connecting</div>
      </div>
    </div>
  )
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
  const [wagerTarget, setWagerTarget] = useState(null)
  const [toast, showToast] = useToast()

  // Only tables the server actually confirmed get re-claimed on reconnect.
  const claimed = useRef(null)

  useWakeLock()

  useEffect(() => {
    const stored = Number(localStorage.getItem(TABLE_KEY))
    if (Number.isInteger(stored) && stored > 0) claimed.current = stored

    const onConnect = () => {
      setConnected(true)
      if (claimed.current) socket.emit('table:claim', { tableNumber: claimed.current })
    }

    const onDisconnect = () => setConnected(false)

    const onError = ({ code, message }) => {
      if (code === 'TAKEN_OVER') {
        claimed.current = null
        localStorage.removeItem(TABLE_KEY)
      }
      showToast(message)
    }

    const onChallengeEnded = ({ reason, otherTable }) => {
      const line = ENDED_COPY[reason]
      if (line) showToast(line(otherTable))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('state:sync', setSync)
    socket.on('app:error', onError)
    socket.on('challenge:ended', onChallengeEnded)

    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('state:sync', setSync)
      socket.off('app:error', onError)
      socket.off('challenge:ended', onChallengeEnded)
    }
  }, [showToast])

  const self = sync?.self
  useEffect(() => {
    if (!self) return
    claimed.current = self.number
    localStorage.setItem(TABLE_KEY, String(self.number))
  }, [self])

  // A challenge landing means the sheet's target is stale either way.
  useEffect(() => {
    if (sync?.challenge || sync?.game) setWagerTarget(null)
  }, [sync?.challenge, sync?.game])

  const releaseTable = () => {
    claimed.current = null
    localStorage.removeItem(TABLE_KEY)
    setSync(null)
    socket.disconnect()
    socket.connect()
  }

  const sendChallenge = ({ gameType, item }) => {
    socket.emit('challenge:send', { toTable: wagerTarget.number, gameType, item })
    setWagerTarget(null)
  }

  if (!sync) {
    return (
      <Shell>
        <Booting />
      </Shell>
    )
  }

  let screen
  if (!sync.self) {
    screen = <Setup taken={sync.taken} onClaim={(number) => socket.emit('table:claim', { tableNumber: number })} />
  } else if (sync.lastResult) {
    screen = <Result result={sync.lastResult} onDone={() => socket.emit('result:dismiss')} />
  } else if (sync.game) {
    screen = (
      <Game
        game={sync.game}
        onAction={(payload) => socket.emit('game:action', { gameId: sync.game.id, ...payload })}
        onClaimWin={() => socket.emit('game:claimWin', { gameId: sync.game.id })}
      />
    )
  } else {
    screen = <Lobby sync={sync} onPick={setWagerTarget} onReset={releaseTable} />
  }

  const challenge = sync.challenge

  return (
    <Shell>
      {screen}

      {wagerTarget && (
        <WagerSheet
          target={wagerTarget}
          menu={sync.menu}
          games={sync.games}
          onCancel={() => setWagerTarget(null)}
          onSend={sendChallenge}
        />
      )}

      {challenge?.role === 'to' && (
        <IncomingChallenge
          challenge={challenge}
          onRespond={(accept) => socket.emit('challenge:respond', { challengeId: challenge.id, accept })}
        />
      )}

      {challenge?.role === 'from' && (
        <WaitingForAnswer challenge={challenge} onCancel={() => socket.emit('challenge:cancel')} />
      )}

      {!connected && <OfflineBanner />}
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
  const [view, setView] = useState('tickets')

  useEffect(() => {
    const join = () => socket.emit('staff:join')
    const onSync = (payload) => {
      setTickets(payload.tickets)
      setFloorplan(payload.floorplan)
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
            {floorplan && <FloorPlanEditor floorplan={floorplan} />}
          </div>
        </div>
      )}
    </Shell>
  )
}

export default function App() {
  const isStaff = window.location.pathname.replace(/\/+$/, '') === '/staff'
  return isStaff ? <StaffApp /> : <TabletApp />
}
