import { ItemIcon } from '../components/ItemIcon.jsx'
import { GameIcon } from '../components/GameIcon.jsx'
import { Confetti } from '../components/Bits.jsx'
import { money, pad } from '../lib/format.js'

const COPY = {
  won: {
    overline: 'Winner',
    headline: 'You won',
    accent: 'gold-text',
    cta: 'Back to the lobby'
  },
  lost: {
    overline: 'Good game',
    headline: 'You lost',
    accent: 'text-chalk',
    cta: 'Back to the lobby'
  },
  draw: {
    overline: 'Dead even',
    headline: 'Draw',
    accent: 'text-mint',
    cta: 'Back to the lobby'
  }
}

const DRAW_LINE = {
  connect4: 'Board filled up with nobody in four.',
  flappy: 'Both bottles went down at the same gate.',
  stacker: 'Both towers stalled on the same row.'
}

function Line({ result }) {
  const { outcome, item, opponent, reason } = result

  if (outcome === 'draw') {
    return (
      <>
        {DRAW_LINE[result.gameType] ?? 'Dead level.'} <span className="text-chalk">Nothing changes hands.</span>
      </>
    )
  }

  if (outcome === 'won') {
    return (
      <>
        {reason === 'forfeit' && (
          <>
            Table <span className="text-chalk">{pad(opponent)}</span> never came back.{' '}
          </>
        )}
        {reason === 'quit' && (
          <>
            Table <span className="text-chalk">{pad(opponent)}</span> walked away from it.{' '}
          </>
        )}
        Table <span className="text-chalk">{pad(opponent)}</span>&apos;s tab covers your{' '}
        <span className="text-chalk">{item.name}</span> — a server is bringing it over.
      </>
    )
  }

  return (
    <>
      {reason === 'quit' && <>You called it early. </>}
      Your tab covers <span className="text-chalk">{item.name}</span> for Table{' '}
      <span className="text-chalk">{pad(opponent)}</span>. It&apos;s on its way to them.
    </>
  )
}

export function Result({ result, onDone }) {
  const copy = COPY[result.outcome] ?? COPY.draw
  const won = result.outcome === 'won'

  return (
    <div className="anim-fade-in relative z-10 grid h-full place-items-center p-6">
      {won && <Confetti />}

      <div className="relative w-full max-w-xl text-center">
        <div className="overline anim-fade-up">{copy.overline}</div>
        <div className={`display anim-slam mt-2 text-[clamp(3.2rem,15vw,7rem)] leading-none ${copy.accent}`}>
          {copy.headline}
        </div>

        <div className="anim-fade-up mt-3 flex items-center justify-center gap-2 text-sm text-dim" style={{ animationDelay: '120ms' }}>
          <GameIcon name={result.gameType} size={22} />
          <span className="font-bold text-chalk">{result.gameName}</span>
          <span className="text-edge">·</span>
          <span>Table {pad(result.opponent)}</span>
        </div>

        <div className="anim-fade-up panel mt-7 flex items-center gap-5 px-6 py-5 text-left" style={{ animationDelay: '160ms' }}>
          <ItemIcon name={result.item.icon} size={56} />
          <div className="min-w-0 flex-1">
            <div className="overline">{result.outcome === 'draw' ? 'Was playing for' : 'The stake'}</div>
            <div className="display truncate text-[clamp(1.4rem,4vw,2rem)] text-chalk">{result.item.name}</div>
          </div>
          <div className="display text-xl text-dim">{money(result.item.price)}</div>
        </div>

        <p className="anim-fade-up mt-5 text-base leading-relaxed text-dim" style={{ animationDelay: '220ms' }}>
          <Line result={result} />
        </p>

        <button
          type="button"
          className="btn btn-primary anim-fade-up mt-7 h-16 w-full text-lg"
          style={{ animationDelay: '300ms' }}
          onClick={onDone}
        >
          {copy.cta}
        </button>
      </div>
    </div>
  )
}
