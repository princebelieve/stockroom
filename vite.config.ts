import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

export default defineConfig({
  build: { target: 'es2022' },
  plugins: [react(), {
    name: 'offline-shell',
    writeBundle(options, bundle) {
      const assets = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', ...Object.keys(bundle).filter(name => name !== 'index.html').map(name => `/${name}`)]
      const hash = createHash('sha256').update(JSON.stringify(assets)).update(readFileSync(resolve(options.dir || 'dist', 'index.html'))).digest('hex').slice(0, 16)
      const source = readFileSync('public/sw.js', 'utf8').replace("'stockroom-shell-dev'", JSON.stringify(`stockroom-shell-${hash}`)).replace(/const APP_SHELL = .*\n/, `const APP_SHELL = ${JSON.stringify(assets)}\n`)
      writeFileSync(resolve(options.dir || 'dist', 'sw.js'), source)
    },
  }],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
