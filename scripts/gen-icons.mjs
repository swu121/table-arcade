import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')

const DEFS = `
  <defs>
    <linearGradient id="slab" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2a3c"/>
      <stop offset="100%" stop-color="#101018"/>
    </linearGradient>
    <radialGradient id="gold" cx="34%" cy="28%">
      <stop offset="0%" stop-color="#ffe4a3"/>
      <stop offset="45%" stop-color="#ffb627"/>
      <stop offset="100%" stop-color="#b9700a"/>
    </radialGradient>
    <radialGradient id="neon" cx="34%" cy="28%">
      <stop offset="0%" stop-color="#ffa6bf"/>
      <stop offset="45%" stop-color="#ff2e63"/>
      <stop offset="100%" stop-color="#9e0a33"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="42%">
      <stop offset="0%" stop-color="#ffb627" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#ffb627" stop-opacity="0"/>
    </radialGradient>
  </defs>`

/** The bare mark, drawn inside a 48x48 box then scaled into place. */
function mark(scale, dx, dy) {
  return `
  <g transform="translate(${dx} ${dy}) scale(${scale})">
    <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="url(#slab)" stroke="#3a3a52" stroke-width="1.5"/>
    <circle cx="16.5" cy="16.5" r="6.6" fill="url(#gold)"/>
    <circle cx="31.5" cy="16.5" r="6.6" fill="#06060a"/>
    <circle cx="16.5" cy="31.5" r="6.6" fill="#06060a"/>
    <circle cx="31.5" cy="31.5" r="6.6" fill="url(#neon)"/>
  </g>`
}

function appIcon({ size = 512, inset = 0.66 }) {
  const box = size * inset
  const scale = box / 48
  const offset = (size - box) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${DEFS}
  <rect width="${size}" height="${size}" fill="#0b0b12"/>
  <rect width="${size}" height="${size}" fill="url(#halo)"/>
  ${mark(scale, offset, offset)}
</svg>`
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  ${DEFS}
  <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="url(#slab)" stroke="#3a3a52" stroke-width="1.5"/>
  <circle cx="16.5" cy="16.5" r="6.6" fill="url(#gold)"/>
  <circle cx="31.5" cy="16.5" r="6.6" fill="#06060a"/>
  <circle cx="16.5" cy="31.5" r="6.6" fill="#06060a"/>
  <circle cx="31.5" cy="31.5" r="6.6" fill="url(#neon)"/>
</svg>`

await mkdir(publicDir, { recursive: true })
await writeFile(path.join(publicDir, 'favicon.svg'), favicon)

const targets = [
  { file: 'icon-180.png', size: 180, inset: 0.68 },
  { file: 'icon-192.png', size: 192, inset: 0.68 },
  { file: 'icon-512.png', size: 512, inset: 0.68 },
  // Maskable icons get cropped to a safe circle, so the mark sits tighter.
  { file: 'icon-512-maskable.png', size: 512, inset: 0.52 }
]

for (const { file, size, inset } of targets) {
  await sharp(Buffer.from(appIcon({ size, inset })))
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, file))
  console.log(`  wrote public/${file}`)
}

console.log('  wrote public/favicon.svg')
