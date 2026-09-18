import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ocrFiles: Record<string, string> = Object.fromEntries([
  ['worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
  ['eng.traineddata.gz', 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'],
  ...['tesseract-core', 'tesseract-core-simd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm'].flatMap(name => ['wasm.js', 'wasm'].map(ext => [`${name}.${ext}`, `node_modules/tesseract.js-core/${name}.${ext}`])),
])

export default defineConfig({
  build: { target: 'es2022' },
  plugins: [react(), {
    name: 'local-receipt-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = ocrFiles[(req.url || '').replace(/^\/ocr\//, '')]
        if (!req.url?.startsWith('/ocr/') || !path) return next()
        res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream')
        res.end(readFileSync(path))
      })
    },
    generateBundle() { for (const [name, path] of Object.entries(ocrFiles)) this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(path) }) },
  }, {
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
