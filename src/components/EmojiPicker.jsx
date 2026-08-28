import { useState } from 'react'

// Curated rather than exhaustive: a bar tablet wants the emoji people actually
// reach for across a room, not every code point. The text field still accepts
// anything the device keyboard can produce.
const GROUPS = [
  {
    id: 'smileys',
    label: 'Smileys',
    tab: '😀',
    emoji: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🥵', '🥶', '🥴',
      '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
      '😯', '😥', '😢', '😭', '😤', '😠', '😡', '🤬', '💀', '👻'
    ]
  },
  {
    id: 'gestures',
    label: 'Gestures',
    tab: '👍',
    emoji: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙',
      '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖',
      '👏', '🙌', '🤝', '🙏', '✊', '👊', '🤛', '🤜', '💪', '🫡',
      '🫶', '🤲', '🫰', '💅', '👀', '👁️', '🧠', '🫀', '🦾', '🦿'
    ]
  },
  {
    id: 'food',
    label: 'Food',
    tab: '🍻',
    emoji: [
      '🍻', '🍺', '🍷', '🥂', '🍾', '🥃', '🍸', '🍹', '🧉', '🍶',
      '🥤', '🧋', '☕', '🍵', '🧃', '🍼', '🍔', '🍟', '🍕', '🌭',
      '🥪', '🌮', '🌯', '🥙', '🧆', '🥗', '🍗', '🍖', '🥩', '🥓',
      '🍜', '🍝', '🍛', '🍚', '🍣', '🍱', '🥟', '🦪', '🍤', '🧀',
      '🥨', '🍿', '🧂', '🥜', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬'
    ]
  },
  {
    id: 'activity',
    label: 'Play',
    tab: '🎯',
    emoji: [
      '🎯', '🎱', '🏓', '🎳', '🎮', '🕹️', '🎲', '🃏', '🀄', '🎰',
      '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '⚽', '🏀', '🏈', '⚾',
      '🎾', '🏐', '🥊', '🥋', '⛳', '🎣', '🎿', '🛹', '🎪', '🎉',
      '🎊', '🎈', '🎁', '✨', '🔥', '💥', '💫', '⭐', '🌟', '💯'
    ]
  },
  {
    id: 'animals',
    label: 'Animals',
    tab: '🐶',
    emoji: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧',
      '🦅', '🦆', '🦉', '🦄', '🐝', '🦋', '🐌', '🐢', '🐙', '🦑',
      '🦐', '🦀', '🐬', '🐳', '🦈', '🐊', '🐍', '🦖', '🐉', '🦔'
    ]
  },
  {
    id: 'symbols',
    label: 'Symbols',
    tab: '❤️',
    emoji: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '☮️', '✝️',
      '🔞', '⚠️', '🚫', '✅', '❌', '❓', '❗', '💤', '💬', '👋',
      '🎵', '🎶', '💰', '💸', '🪙', '📣', '🔔', '🔕', '⏰', '🧨'
    ]
  }
]

export function EmojiPicker({ onPick, onClose }) {
  const [group, setGroup] = useState(GROUPS[0].id)
  const active = GROUPS.find((g) => g.id === group) ?? GROUPS[0]

  return (
    <div className="emoji-pop panel anim-fade-up">
      <div className="emoji-tabs">
        {GROUPS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            data-on={option.id === group || undefined}
            className="emoji-tab"
            onClick={() => setGroup(option.id)}
          >
            {option.tab}
          </button>
        ))}
        <button type="button" className="emoji-tab emoji-close" aria-label="Close emoji picker" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="emoji-grid">
        {active.emoji.map((glyph) => (
          <button key={glyph} type="button" className="emoji-cell" onClick={() => onPick(glyph)}>
            {glyph}
          </button>
        ))}
      </div>
    </div>
  )
}
