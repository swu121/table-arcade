import { io } from 'socket.io-client'
import { route } from './venue.js'

// Each venue is its own socket.io namespace. Everything this tablet ever sends
// lands in that one namespace, so there's no message it could address to a
// table in another restaurant.
export const socket = io(`/venue/${route.slug ?? '_'}`, {
  autoConnect: Boolean(route.slug),
  reconnectionDelay: 400,
  reconnectionDelayMax: 2500
})

// The remembered table number is per venue, so a tablet moved between
// restaurants never claims a table it was holding in the last one.
export const TABLE_KEY = `tablearcade.table.${route.slug ?? 'none'}`
