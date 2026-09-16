// A planned stop — SIGTERM from a deploy, Ctrl-C at a terminal — that the room
// barely notices. Every step is bounded, because Fly will kill the process at
// `kill_timeout` regardless and a snapshot that never lands is simply not
// restored: the next boot comes up empty, which is exactly what happens today.
//
//   1. stop taking new HTTP connections and new sockets
//   2. write every room down (handlers' suspend), tell every tablet `app:restarting`
//   3. close the socket.io server — every tablet's reconnect loop starts
//   4. close the store, exit
//
// `exit` is a parameter so a test can run the whole routine in-process.
export async function gracefulShutdown({
  httpServer,
  io,
  app,
  repos,
  signal = 'SIGTERM',
  timeout = 8000,
  retryIn = 3000,
  log = console.log,
  exit = (code) => process.exit(code)
}) {
  log(`\n  ${signal}: suspending every room, then restarting`)
  let code = 0
  const deadline = new Promise((resolve) =>
    setTimeout(() => {
      log(`  shutdown ran past ${timeout}ms — leaving without waiting`)
      code = 1
      resolve()
    }, timeout).unref()
  )

  const work = (async () => {
    httpServer.close()
    await app.suspend({ retryIn })
    // Every socket sees "transport close", which socket.io-client retries;
    // the held ones (see the namespace middleware) go the same way.
    await io.close()
    await repos.close()
  })().catch((error) => {
    log(`  shutdown failed — ${error.message}`)
    code = 1
  })

  await Promise.race([work, deadline])
  exit(code)
}
