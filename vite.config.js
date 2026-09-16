import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One version per build, stamped into the bundle and written next to it so the
// server hands out the same value. Anything unique per build will do: the git
// commit when there is one, otherwise the moment the build ran.
function buildVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    const git = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const sha = git('git rev-parse --short HEAD')
    return git('git status --porcelain') ? `${sha}-${Date.now().toString(36)}` : sha
  } catch {
    return Date.now().toString(36)
  }
}

function versionFile(version) {
  return {
    name: 'table-arcade-version',
    writeBundle(options) {
      fs.writeFileSync(path.join(options.dir, 'version.json'), JSON.stringify({ version }))
    }
  }
}

export default defineConfig(({ command }) => {
  const version = command === 'build' ? buildVersion() : 'dev'
  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), tailwindcss(), versionFile(version)],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/socket.io': { target: 'http://localhost:3000', ws: true },
        '/api': { target: 'http://localhost:3000' },
        // Per-venue manifests come from the server; everything else under /v/
        // is the client's own routing and must stay with Vite.
        '^/v/[^/]+/(staff/)?manifest\\.webmanifest$': { target: 'http://localhost:3000' }
      }
    },
    build: {
      outDir: 'dist',
      assetsInlineLimit: 0
    }
  }
})
