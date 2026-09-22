// Android's on-screen keyboard overlays the page rather than shrinking it, so a
// shell sized to 100% keeps its composer underneath the keys. Pin the shell to
// the visual viewport instead: the app always ends where the keyboard begins.
export function installViewport() {
  const root = document.documentElement
  const vv = window.visualViewport
  if (!vv) return

  const apply = () => {
    root.style.setProperty('--app-height', `${Math.round(vv.height)}px`)
    // Chrome may scroll the layout viewport to reveal the focused input. The
    // shell already fits above the keyboard, so undo it and keep the header on.
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0)
  }

  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  apply()
}
