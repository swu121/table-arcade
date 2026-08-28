import { io } from 'socket.io-client'

export const socket = io({
  autoConnect: true,
  reconnectionDelay: 400,
  reconnectionDelayMax: 2500
})

export const TABLE_KEY = 'tablearcade.table'
