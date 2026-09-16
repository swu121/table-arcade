import { route, venuePath } from '../venue.js'
import { APP_VERSION } from '../version.js'

// What turns a tab into an icon on a bar tablet's home screen.
//
// Two things have to line up. The page has to point at its own venue's
// manifest, so the installed app opens that restaurant rather than whichever
// one is first in the list. And a service worker has to be registered, because
// without one the browser offers a bookmark rather than an install, and a
// reload with no wifi shows the browser's error page instead of the room.

function pointManifestAtVenue() {
  if (!route.slug) return
  const link = document.querySelector('link[rel="manifest"]')
  if (link) link.href = `${venuePath(route.slug, route.staff)}/manifest.webmanifest`
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return

  // The dev server is served by Vite, which has its own ideas about reloading;
  // a worker caching anything on top of that only ever causes confusion. Clear
  // out one left behind by a production build served from this same origin.
  if (APP_VERSION === 'dev') {
    navigator.serviceWorker.getRegistrations().then(
      (all) => all.forEach((registration) => registration.unregister()),
      () => {}
    )
    return
  }

  // The build is in the URL, so a deploy is a different script to the browser
  // and gets installed rather than assumed unchanged.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(() => {
      // An unregistrable worker costs the tablet nothing that it has today.
    })
  })
}

export function installPwa() {
  pointManifestAtVenue()
  registerWorker()
}
