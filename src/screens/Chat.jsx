import { useEffect, useRef, useState } from 'react'
import { EmojiPicker } from '../components/EmojiPicker.jsx'
import { pad } from '../lib/format.js'

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function stamp(at) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function Chat({ self, withTable, messages, muted, blocked, onBack, onSend, onMute, onBlock }) {
  const [draft, setDraft] = useState('')
  const [picker, setPicker] = useState(false)
  const list = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    const node = list.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  const send = () => {
    const body = draft.trim()
    if (!body) return
    onSend(body)
    setDraft('')
    setPicker(false)
    input.current?.focus()
  }

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-edge px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="panel flex h-11 w-11 shrink-0 items-center justify-center text-dim"
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <div className="min-w-0">
            <div className="overline leading-none">Talking to</div>
            <div className="display text-3xl leading-none">
              <span className="text-dim">Table</span> <span className="gold-text">{pad(withTable)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onMute}
            data-on={muted || undefined}
            className="chat-toggle"
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            onClick={onBlock}
            data-on={blocked || undefined}
            className="chat-toggle chat-toggle--block"
          >
            {blocked ? 'Unblock' : 'Block'}
          </button>
        </div>
      </header>

      {muted && !blocked && (
        <div className="chat-notice">Muted — their messages still arrive here, they just don&apos;t alert you.</div>
      )}
      {blocked && (
        <div className="chat-notice chat-notice--hot">
          Blocked — Table {pad(withTable)} can&apos;t message, gift or challenge you.
        </div>
      )}

      <div ref={list} className="chat-log">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="display text-2xl text-edge">Nothing said yet</div>
              <p className="mt-1 text-sm text-dim">Say hi. Or just send a 🍻.</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.from === self.number
            return (
              <div key={message.id} className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
                <span className="chat-text">{message.text}</span>
                <span className="chat-stamp">{stamp(message.at)}</span>
              </div>
            )
          })
        )}
      </div>

      <div className="relative shrink-0 border-t border-edge bg-black/25 px-5 py-4">
        {picker && <EmojiPicker onPick={(glyph) => setDraft((d) => d + glyph)} onClose={() => setPicker(false)} />}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPicker((open) => !open)}
            data-on={picker || undefined}
            className="emoji-toggle"
            aria-label="Emoji"
          >
            😀
          </button>
          <input
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send()
            }}
            placeholder={`Message Table ${pad(withTable)}`}
            className="chat-input"
          />
          <button type="button" className="btn btn-primary h-14 px-8" disabled={!draft.trim()} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
