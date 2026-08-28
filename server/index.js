import express from 'express'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { init } from './handlers.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

init(io)

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, '..', 'dist')

app.get('/healthz', (_req, res) => res.type('text').send('ok'))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address)
}

const PORT = Number(process.env.PORT) || 3000
httpServer.listen(PORT, '0.0.0.0', () => {
  const dev = process.env.NODE_ENV !== 'production'
  const clientPort = dev ? 5173 : PORT
  console.log(`\n  TABLE ARCADE  ·  ${dev ? 'development' : 'production'}\n`)
  console.log(`  local    http://localhost:${clientPort}`)
  for (const address of lanAddresses()) {
    console.log(`  tablets  http://${address}:${clientPort}`)
  }
  console.log(`  staff    http://localhost:${clientPort}/staff\n`)
})
