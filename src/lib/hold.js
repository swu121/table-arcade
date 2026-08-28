import { useEffect, useRef } from 'react'

// Table numbers belong to staff, so the way to them is a deliberate hold rather
// than anything a guest can hit by accident.
export function useHold(onHold, ms = 1200) {
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const stop = () => clearTimeout(timer.current)

  return {
    onPointerDown: () => {
      stop()
      timer.current = setTimeout(onHold, ms)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (event) => event.preventDefault()
  }
}
