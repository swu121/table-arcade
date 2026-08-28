import { Mark } from '../components/Logo.jsx'
import { pad } from '../lib/format.js'
import { useHold } from '../lib/hold.js'

// What a table looks at between parties. One target, the size of the screen, so
// nobody has to work out what this tablet is for. The number is the other half
// of the job: a guest should be able to read it out to a server across the room.
export function Launch({ self, onSignIn, onSetup }) {
  const hold = useHold(onSetup)

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-7 px-6 py-8">
      <div className="anim-fade-up flex flex-col items-center gap-3">
        <Mark size={44} />
        <h1 className="display text-center text-[clamp(1.6rem,5vw,2.2rem)] leading-none">
          <span className="text-chalk">Table</span> <span className="gold-text">Arcade</span>
        </h1>
      </div>

      <div className="anim-fade-up flex flex-col items-center" style={{ animationDelay: '80ms' }} {...hold}>
        <span className="overline">{self ? 'You are at table' : 'This tablet has no table'}</span>
        <span
          className={`display tnum mt-1 text-[clamp(7rem,26vw,13rem)] leading-[0.85] ${
            self ? 'gold-text' : 'text-edge'
          }`}
        >
          {self ? pad(self.number) : '00'}
        </span>
      </div>

      {self ? (
        <button
          type="button"
          onClick={onSignIn}
          className="btn btn-primary anim-fade-up w-full max-w-2xl flex-col gap-2 px-8 py-8 text-center"
          style={{ animationDelay: '160ms' }}
        >
          <span className="display text-[clamp(1.6rem,4.6vw,2.4rem)] leading-none">Tap to play</span>
          <span className="text-sm font-semibold opacity-80">games, chat, and send gifts</span>
        </button>
      ) : (
        <p className="anim-fade-up max-w-md text-center text-sm text-dim" style={{ animationDelay: '160ms' }}>
          Ask a server to set this tablet up.
        </p>
      )}

      <p className="text-center text-[0.7rem] text-dim/70">
        {self
          ? "Until you tap, the rest of the floor can't see or reach this table."
          : 'Staff: press and hold the number to assign one.'}
      </p>
    </div>
  )
}
