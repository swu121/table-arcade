import { io } from 'socket.io-client'
import { route } from './venue.js'
import { APP_VERSION } from './version.js'
import { getDeviceToken } from './lib/device.js'

// Each venue is its own socket.io namespace. Everything this tablet ever sends
// lands in that one namespace, so there's no message it could address to a
// table in another restaurant.
//
// The handshake carries the build version, so a tablet still running last
// week's bundle is told so the moment it reconnects to a newer server, and the
// device token staff issued when they paired this tablet. It is read fresh on
// every attempt, so pairing just has to store the token and reconnect.
//
// TEMPORARY: the staff screen announces itself with `staff: true` and is let
// in without a token until staff login exists.
export const socket = io(`/venue/${route.slug ?? '_'}`, {
  autoConnect: Boolean(route.slug),
  reconnectionDelay: 400,
  reconnectionDelayMax: 2500,
  auth: (cb) => cb({ version: APP_VERSION, token: getDeviceToken() ?? undefined, staff: route.staff || undefined })
})

// The remembered table number is per venue, so a tablet moved between
// restaurants never claims a table it was holding in the last one.
export const TABLE_KEY = `tablearcade.table.${route.slug ?? 'none'}`
