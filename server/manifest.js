// One installed app per venue.
//
// The static manifest in public/ starts at "/", which is the right answer for
// the single-venue demo and the wrong one for a second restaurant: every
// tablet would install an icon that opens whichever venue happens to be first
// in the list. So each venue serves its own manifest, carrying its own name and
// starting at its own address. `id` is what the browser uses to tell two
// installed apps apart, so two venues on one deployment never collide.

const ICONS = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

// What fits under a home screen icon before Android truncates it.
const SHORT_NAME = 12

// The label under the icon. A guest tablet wears the venue's name; a staff
// screen has to stay tellable apart from it at a glance, which the full name
// cut to twelve characters would not be — both would read "Soju House".
function shortName(venue, staff) {
  if (!staff) return venue.name.slice(0, SHORT_NAME).trim()
  const label = `${venue.name.split(/\s+/)[0]} Staff`
  return label.length <= SHORT_NAME ? label : 'Staff'
}

export function venueManifest(venue, { staff = false } = {}) {
  const path = `/v/${venue.slug}${staff ? '/staff' : ''}`
  const name = staff ? `${venue.name} Staff` : venue.name
  return {
    id: path,
    name,
    short_name: shortName(venue, staff),
    description: staff
      ? `Tickets and the floor at ${venue.name}.`
      : 'Challenge any table in the bar. Play for drinks.',
    start_url: path,
    // Deliberately the whole origin rather than the venue: a tablet never
    // navigates outside its own venue anyway, and a scope that is a plain
    // string prefix would also swallow a venue whose slug starts the same way.
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#07070b',
    theme_color: '#07070b',
    icons: ICONS
  }
}

export function manifestHandler({ venues, staff = false } = {}) {
  return (req, res) => {
    const venue = venues.get(req.params.slug)
    if (!venue) return res.status(404).json({ error: 'NO_VENUE' })
    res.type('application/manifest+json')
    // A venue can be renamed from the admin page, so this is never stale for
    // longer than one revalidation.
    res.set('Cache-Control', 'no-cache')
    res.json(venueManifest(venue, { staff }))
  }
}
