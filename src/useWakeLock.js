import { useEffect } from 'react'

// Bar tablets are mounted and mains-powered; the screen must never sleep.
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    let sentinel = null
    let released = false

    const acquire = async () => {
      if (released || document.visibilityState !== 'visible') return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (often a non-secure origin). Auto-Lock: Never covers this.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release?.().catch(() => {})
    }
  }, [])
}
