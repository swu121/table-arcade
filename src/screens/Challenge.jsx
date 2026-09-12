import { ItemIcon } from '../components/ItemIcon.jsx'
import { GameIcon } from '../components/GameIcon.jsx'
import { CountdownRing } from '../components/Bits.jsx'
import { money, pad } from '../lib/format.js'

// A challenge in flight, pinned to the bottom of the thread between the two
// tables. Both ends see the same card: the challenger gets a cancel, the
// challenged table gets the answer buttons, and the ring counts down for both.
export function LiveChallenge({ challenge, onRespond, onCancel }) {
  const incoming = challenge.role === 'to'
  const { item } = challenge

  return (
    <div className={`live-challenge anim-sheet ${incoming ? 'live-challenge--incoming pulse-edge' : ''}`}>
      <div className="live-challenge-glow" aria-hidden="true" />
      <div className="flex items-center gap-4">
        <span className="live-challenge-icon">
          <GameIcon name={challenge.gameType} size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="overline">{incoming ? 'Incoming challenge' : 'Challenge sent'}</div>
          <div className="display mt-0.5 text-[clamp(1.4rem,3.4vw,2rem)] leading-none text-chalk">
            {incoming ? (
              <>
                <span className="gold-text">Table {pad(challenge.otherTable)}</span> wants to play you at{' '}
                {challenge.gameName}
              </>
            ) : (
              <>
                Waiting on <span className="gold-text">Table {pad(challenge.otherTable)}</span> to answer at{' '}
                {challenge.gameName}
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-dim">
            <ItemIcon name={item.icon} size={26} />
            <span>
              Playing for <span className="font-bold text-chalk">{item.name}</span> · loser&apos;s tab covers it ·{' '}
              {money(item.price)}
            </span>
          </div>
        </div>
        <CountdownRing expiresAt={challenge.expiresAt} size={64} />
      </div>

      <div className="mt-4 flex gap-3">
        {incoming ? (
          <>
            <button type="button" className="btn btn-ghost h-14 flex-1" onClick={() => onRespond(false)}>
              Decline
            </button>
            <button type="button" className="btn btn-primary h-14 flex-[2] text-lg" onClick={() => onRespond(true)}>
              Accept
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost h-12 w-full" onClick={onCancel}>
            Cancel challenge
          </button>
        )}
      </div>
    </div>
  )
}
