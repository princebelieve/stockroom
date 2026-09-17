import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'

let displayState = { businessName: 'My Business', currency: 'USD', items: [], total: 0, completed: false, updatedAt: new Date().toISOString() }
const pairings = new Map()
const viewers = new Map()
const streams = new Map()

function writeEvent(response, state = displayState) { response.write(`event: display\ndata: ${JSON.stringify(state)}\n\n`) }
function publish() {
  for (const [token, responses] of streams) {
    const viewer = viewers.get(token)
    if (!viewer || viewer.expiresAt < Date.now()) { for (const response of responses) response.end(); streams.delete(token); continue }
    for (const response of responses) writeEvent(response)
  }
}

export function setCustomerDisplay(next) {
  displayState = { businessName: String(next.businessName || 'My Business'), currency: String(next.currency || 'USD'), items: Array.isArray(next.items) ? next.items.slice(0, 100) : [], total: Number(next.total) || 0, completed: Boolean(next.completed), updatedAt: new Date().toISOString() }
  publish()
  return displayState
}
export function getCustomerDisplay() { return displayState }

function localAddress() {
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) return address.address
  return '127.0.0.1'
}

// A pairing link expires after five minutes. Its read-only display session lasts twelve hours.
export function createDisplayPairing(port) {
  const code = randomBytes(9).toString('base64url')
  pairings.set(code, { expiresAt: Date.now() + 5 * 60_000 })
  return { code, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), url: `http://${localAddress()}:${port}/pair?code=${encodeURIComponent(code)}` }
}

function page() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173f35"><title>Customer order</title><style>body{margin:0;min-height:100vh;background:#173f35;color:#f4f1e8;font:18px system-ui;padding:clamp(24px,7vw,88px);box-sizing:border-box}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}h1{font-size:clamp(32px,6vw,64px);margin:14px 0 5px}.eyebrow,small,footer{color:#aac2b6}.connection{font-size:14px;background:#214b40;padding:8px 10px;border-radius:999px}main{background:#214b40;padding:clamp(22px,4vw,42px);border-radius:18px;margin:clamp(30px,7vw,70px) 0}.item,.total{display:flex;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid #396254}.item{font-size:clamp(17px,2.6vw,28px)}.item.new{animation:flash 1.1s ease}.total{font-size:clamp(28px,5vw,48px);color:#d5e95c;border:0;font-weight:700;margin-top:14px}.done{border:2px solid #d5e95c;text-align:center;padding:clamp(26px,5vw,52px);border-radius:16px}.done h2{font-size:clamp(28px,5vw,48px);margin:0 0 10px;color:#d5e95c}.empty{padding:50px 0;text-align:center;font-size:clamp(18px,3vw,26px)}footer{font-size:16px}@keyframes flash{0%{background:#396254}100%{background:transparent}}</style></head><body><header><div><small class="eyebrow">LIVE ORDER</small><h1 id="name">Customer display</h1><small id="status">Waiting for cashier</small></div><span id="connection" class="connection">Connecting…</span></header><main id="order"><p class="empty">Items will appear here as they are scanned.</p></main><footer>Review your order before payment. Please speak to the cashier if anything is incorrect.</footer><script>const token=new URLSearchParams(location.search).get('token'),order=document.querySelector('#order'),name=document.querySelector('#name'),status=document.querySelector('#status'),connection=document.querySelector('#connection');let previous='';const money=(n,c)=>new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(n);function item(d,i){const row=document.createElement('div');row.className='item'+(previous&&!previous.includes(d.name+'|'+d.quantity+'|'+d.price)?' new':'');const label=document.createElement('span');label.textContent=d.quantity+' × '+d.name;const amount=document.createElement('b');amount.textContent=money(d.quantity*d.price,i.currency);row.append(label,amount);return row}function render(d){name.textContent=d.businessName;connection.textContent='Live';connection.style.color='#d5e95c';order.replaceChildren();if(d.completed){const done=document.createElement('section');done.className='done';const title=document.createElement('h2');title.textContent='Sale completed';const note=document.createElement('p');note.textContent='Thank you for shopping with us.';const total=document.createElement('strong');total.textContent=money(d.total,d.currency);done.append(title,note,total);order.append(done);status.textContent='Payment recorded';previous='';return}status.textContent=d.items.length?'Review your order':'Waiting for cashier';if(!d.items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Items will appear here as they are scanned.';order.append(empty);return}d.items.forEach(x=>order.append(item(x,d)));const total=document.createElement('div');total.className='total';const label=document.createElement('span');label.textContent='Total';const value=document.createElement('span');value.textContent=money(d.total,d.currency);total.append(label,value);order.append(total);previous=d.items.map(x=>x.name+'|'+x.quantity+'|'+x.price).join(',')}const stream=new EventSource('/v1/display/events?token='+encodeURIComponent(token));stream.addEventListener('display',e=>render(JSON.parse(e.data)));stream.onerror=()=>{connection.textContent='Reconnecting…';connection.style.color='#aac2b6'};</script></body></html>`
}

function validViewer(token) { const viewer = viewers.get(token); return viewer && viewer.expiresAt >= Date.now() }

export function startCustomerDisplayGateway(port = Number(process.env.CUSTOMER_DISPLAY_PORT || 8788)) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/pair') {
      const code = url.searchParams.get('code'); const pairing = pairings.get(code)
      if (!pairing || pairing.expiresAt < Date.now()) { response.writeHead(403); return response.end('Pairing code is invalid or expired.') }
      pairings.delete(code)
      const token = randomBytes(32).toString('base64url')
      viewers.set(token, { expiresAt: Date.now() + 12 * 60 * 60_000 })
      response.writeHead(302, { Location: `/display?token=${encodeURIComponent(token)}` }); return response.end()
    }
    if (url.pathname === '/display') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end(page()) }
    const token = url.searchParams.get('token')
    if (url.pathname === '/v1/display/events') {
      if (!validViewer(token)) { response.writeHead(401); return response.end() }
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
      response.flushHeaders?.(); writeEvent(response)
      const responses = streams.get(token) || new Set(); responses.add(response); streams.set(token, responses)
      const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25_000)
      request.on('close', () => { clearInterval(heartbeat); responses.delete(response); if (!responses.size) streams.delete(token) })
      return
    }
    if (url.pathname === '/v1/display') {
      if (!validViewer(token)) { response.writeHead(401); return response.end() }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return response.end(JSON.stringify(displayState))
    }
    response.writeHead(404); response.end()
  })
  server.listen(port, '0.0.0.0', () => console.log(`Customer display gateway available on LAN port ${port}`))
  return { port }
}
