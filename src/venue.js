// Which restaurant this tablet belongs to, read off the URL:
//   /v/<slug>          a guest tablet
//   /v/<slug>/staff    the staff screen
// The bare URL is the single-venue demo and gets sent to the first venue.
const ROUTE = /^\/v\/([a-z0-9-]+)(\/staff)?\/?$/i

export function parseRoute(pathname = window.location.pathname) {
  const match = pathname.match(ROUTE)
  if (match) return { slug: match[1].toLowerCase(), staff: Boolean(match[2]) }
  return { slug: null, staff: pathname.replace(/\/+$/, '') === '/staff' }
}

export const route = parseRoute()

export const venuePath = (slug, staff = false) => `/v/${slug}${staff ? '/staff' : ''}`

// Sends a bare URL to the default venue. Resolves once the browser is navigating
// away, so the caller can simply render nothing.
export async function redirectToDefault(staff) {
  const res = await fetch('/api/venue')
  if (!res.ok) throw new Error(`No venue (${res.status})`)
  const { slug } = await res.json()
  window.location.replace(venuePath(slug, staff))
}
