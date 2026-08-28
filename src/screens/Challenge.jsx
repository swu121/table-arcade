import { ItemIcon } from '../components/ItemIcon.jsx'
import { GameIcon } from '../components/GameIcon.jsx'
import { CountdownRing } from '../components/Bits.jsx'
import { money, pad } from '../lib/format.js'

function StakeStrip({ item, children }) {
  return (
    <div className="panel mt-7 flex items-center gap-5 px-6 py-5 text-left">
      <ItemIcon name={item.icon} size={56} />
      <div className="min-w-0 flex-1">
        <div className="overline">Playing for</div>
        <div className="display truncate text-[clamp(1.4rem,4vw,2rem)] text-chalk">{item.name}</div>
        <div className="mt-0.5 text-xs text-dim">Loser's tab covers it · {money(item.price)}</div>
      </div>
      {children}
    </div>
  )
}

export function IncomingChallenge({ challenge, onRespond }) {
  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/92 p-6 backdrop-blur-lg">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div className="overline anim-fade-up">Incoming challenge</div>
          <div className="display anim-slam mt-2 text-[clamp(3rem,13vw,6rem)] leading-none">
            <span className="text-dim">Table</span> <span className="gold-text">{pad(challenge.otherTable)}</span>
          </div>
          <p className="anim-fade-up mt-3 flex items-center justify-center gap-2 text-base text-dim" style={{ animationDelay: '140ms' }}>
            wants to play you at
            <GameIcon name={challenge.gameType} size={24} />
            <span className="font-bold text-chalk">{challenge.gameName}</span>
          </p>
        </div>

        <div className="anim-fade-up" style={{ animationDelay: '200ms' }}>
          <StakeStrip item={challenge.item}>
            <CountdownRing expiresAt={challenge.expiresAt} />
          </StakeStrip>
        </div>

        <div className="anim-fade-up mt-5 flex gap-3" style={{ animationDelay: '280ms' }}>
          <button type="button" className="btn btn-ghost h-16 flex-1" onClick={() => onRespond(false)}>
            Decline
          </button>
          <button type="button" className="btn btn-primary pulse-edge h-16 flex-[2] text-lg" onClick={() => onRespond(true)}>
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

export function WaitingForAnswer({ challenge, onCancel }) {
  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/88 p-6 backdrop-blur-md">
      <div className="w-full max-w-xl text-center">
        <div className="overline">Challenge sent</div>
        <div className="display mt-2 text-[clamp(2.4rem,10vw,4.5rem)] leading-none">
          <span className="text-dim">Waiting on Table</span> <span className="gold-text">{pad(challenge.otherTable)}</span>
        </div>

        <p className="mt-3 flex items-center justify-center gap-2 text-base text-dim">
          to answer at
          <GameIcon name={challenge.gameType} size={24} />
          <span className="font-bold text-chalk">{challenge.gameName}</span>
        </p>

        <StakeStrip item={challenge.item}>
          <CountdownRing expiresAt={challenge.expiresAt} />
        </StakeStrip>

        <button type="button" className="btn btn-ghost mt-5 h-14 w-full" onClick={onCancel}>
          Cancel challenge
        </button>
      </div>
    </div>
  )
}
