import { useEffect, useState } from 'react'
import { Confetti } from './Bits.jsx'
import { ItemIcon } from './ItemIcon.jsx'
import { pad } from '../lib/format.js'

// A round is the most generous thing one table can do for another, and it used
// to arrive as a toast. It gets the room instead: the box lands, shivers, and
// breaks open on what they were sent.
//
// The beats are CSS (see .gift-* in index.css); this only says when the lid
// comes off, because the confetti and the copy have to mount on that frame.
const OPEN_AT = 900
const SENT_FOR = 2200

export function GiftReveal({ mode, fromTable, toTable, item, onClose }) {
  const incoming = mode === 'incoming'
  const [open, setOpen] = useState(!incoming)

  useEffect(() => {
    if (!incoming) {
      const done = setTimeout(onClose, SENT_FOR)
      return () => clearTimeout(done)
    }
    const lid = setTimeout(() => setOpen(true), OPEN_AT)
    return () => clearTimeout(lid)
  }, [incoming, onClose])

  return (
    <div
      className="gift-reveal"
      role="dialog"
      aria-live="polite"
      aria-label={incoming ? `Table ${fromTable} sent you a ${item.name}` : `A ${item.name} is on its way`}
    >
      <div className={`gift-stage ${incoming ? '' : 'gift-stage--sent'}`}>
        <div className="gift-glow" data-lit={open || undefined} />

        <div className="gift-box">
          <div className="gift-item" data-out={open || undefined}>
            <ItemIcon name={item.icon} size={132} />
          </div>
          <div className="gift-base">
            <span className="gift-band" />
          </div>
          <div className="gift-lid" data-off={open || undefined}>
            <span className="gift-band" />
            <span className="gift-bow" />
          </div>
        </div>

        {open && incoming && <Confetti count={64} />}
      </div>

      <div className="gift-copy" data-shown={open || undefined}>
        <div className="overline">{incoming ? 'From the floor' : 'On its way'}</div>
        <div className="display mt-1 text-4xl leading-none">
          <span className="text-dim">Table</span>{' '}
          <span className="gold-text">{pad(incoming ? fromTable : toTable)}</span>
        </div>
        <p className="mt-3 text-lg font-semibold text-chalk">
          {incoming ? `sent you a ${item.name}.` : `is getting a ${item.name}.`}
        </p>
        <p className="mt-1 text-sm text-dim">
          {incoming ? "It's on them — the bar already has it." : 'Straight to the bar, and onto your tab.'}
        </p>

        {incoming && (
          <button type="button" className="btn btn-primary mt-7 h-14 px-10" onClick={onClose}>
            Nice — say thanks
          </button>
        )}
      </div>
    </div>
  )
}
