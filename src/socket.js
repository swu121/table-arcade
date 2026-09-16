import { io } from 'socket.io-client'
import { route } from './venue.js'
import { APP_VERSION } from './version.js'
import { getDeviceToken } from './lib/device.js'
import { getStaffSession } from './lib/staffSession.js'

// Each venue is its own socket.io namespace. Everything this tablet ever sends
// lands in that one namespace, so there's no message it could address to a
// table in another restaurant.
//
// The handshake carries the build version, so a tablet still running last
// week's bundle is told so the moment it reconnects to a newer server, and
// one credential: a tablet sends the device token staff issued when they
// paired it; the staff screen sends its session token from signing in. Both
// are read fresh on every attempt, so pairing or signing in just has to store
// the token and reconnect. A staff screen with no session does not connect
// at all until the login screen has one.
const auth = () =>
  route.staff
    ? { version: APP_VERSION, staff: getStaffSession()?.token ?? '' }
    : { version: APP_VERSION, token: getDeviceToken() ?? undefined }

export const socket = io(`/venue/${route.slug ?? '_'}`, {
  autoConnect: Boolean(route.slug) && (!route.staff || Boolean(getStaffSession())),
  reconnectionDelay: 400,
  reconnectionDelayMax: 2500,
  auth: (cb) => cb(auth())
})

// The remembered table number is per venue, so a tablet moved between
// restaurants never claims a table it was holding in the last one.
export const TABLE_KEY = `tablearcade.table.${route.slug ?? 'none'}`
