import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'

let displayState = { businessName: 'My Business', currency: 'USD', items: [], total: 0, completed: false, updatedAt: new Date().toISOString() }
const pairings = new Map()
const viewers = new Map()

export function setCustomerDisplay(next) {
  displayState = { businessName: String(next.businessName || 'My Business'), currency: String(next.currency || 'USD'), items: Array.isArray(next.items) ? next.items.slice(0, 100) : [], total: Number(next.total) || 0, completed: Boolean(next.completed), updatedAt: new Date().toISOString() }
  return displayState
}
export function getCustomerDisplay() { return displayState }

function localAddress() {
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) return address.address
  return '127.0.0.1'
}

export function createDisplayPairing(port) {
  const code = randomBytes(9).toString('base64url')
  pairings.set(code, { expiresAt: Date.now() + 5 * 60_000 })
  return { code, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), url: `http://${localAddress()}:${port}/pair?code=${encodeURIComponent(code)}` }
}

function page() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer Display</title><style>body{margin:0;background:#173f35;color:#f4f1e8;font:20px system-ui;padding:7vw}h1{font-size:clamp(32px,6vw,64px)}main{background:#214b40;padding:28px;border-radius:18px}.item,.total{display:flex;justify-content:space-between;padding:18px 0;border-bottom:1px solid #396254}.total{font-size:clamp(28px,5vw,48px);color:#d5e95c;border:0;font-weight:700}small{color:#aac2b6}</style></head><body><h1 id="name">Customer display</h1><main id="order"><small>Waiting for cashier…</small></main><script>const token=new URLSearchParams(location.search).get('token');async function refresh(){const r=await fetch('/v1/display?token='+encodeURIComponent(token));if(!r.ok){document.body.innerHTML='<h1>Display disconnected</h1><p>Please pair this tablet again.</p>';return}const d=await r.json(),m=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:d.currency}).format(n);document.querySelector('#name').textContent=d.businessName;document.querySelector('#order').innerHTML=d.items.length?d.items.map(i=>'<div class="item"><span>'+i.quantity+' × '+i.name+'</span><b>'+m(i.quantity*i.price)+'</b></div>').join('')+'<div class="total"><span>Total</span><span>'+m(d.total)+'</span></div>':'<small>Items will appear as they are scanned.</small>'}refresh();setInterval(refresh,750)</script></body></html>`
}

export function startCustomerDisplayGateway(port = Number(process.env.CUSTOMER_DISPLAY_PORT || 8788)) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/pair') {
      const pairing = pairings.get(url.searchParams.get('code'))
      if (!pairing || pairing.expiresAt < Date.now()) { response.writeHead(403); return response.end('Pairing code is invalid or expired.') }
      pairings.delete(url.searchParams.get('code'))
      const token = randomBytes(32).toString('base64url')
      viewers.set(token, { expiresAt: Date.now() + 12 * 60 * 60_000 })
      response.writeHead(302, { Location: `/display?token=${encodeURIComponent(token)}` }); return response.end()
    }
    if (url.pathname === '/display') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end(page()) }
    if (url.pathname === '/v1/display') {
      const viewer = viewers.get(url.searchParams.get('token'))
      if (!viewer || viewer.expiresAt < Date.now()) { response.writeHead(401); return response.end() }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'null' }); return response.end(JSON.stringify(displayState))
    }
    response.writeHead(404); response.end()
  })
  server.listen(port, '0.0.0.0', () => console.log(`Customer display gateway available on LAN port ${port}`))
  return { port }
}
