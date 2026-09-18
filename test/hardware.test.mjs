import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { hardwareCommand, sendHardwareCommand } from '../desktop/hardware.mjs'

const settings = { host: '127.0.0.1', port: 9100, pin: 0, cut: 'partial' }
test('ESC/POS commands select the drawer pin and feed before cutting', () => {
  assert.deepEqual([...hardwareCommand({ ...settings, action: 'drawer' })], [27, 112, 0, 25, 250])
  assert.deepEqual([...hardwareCommand({ ...settings, pin: 1, action: 'drawer' })], [27, 112, 1, 25, 250])
  assert.deepEqual([...hardwareCommand({ ...settings, action: 'cut' })], [10, 29, 86, 66, 0])
  assert.deepEqual([...hardwareCommand({ ...settings, cut: 'full', action: 'cut' })], [10, 29, 86, 65, 0])
  for (const bad of [{ port: 0 }, { port: 65536 }, { host: 'http://printer' }, { action: 'arbitrary' }, { pin: 3 }]) {
    assert.throws(() => hardwareCommand({ ...settings, action: 'drawer', ...bad }))
  }
})
test('network transport delivers one command and reports a refused connection', async () => {
  let connections = 0
  let received
  const data = new Promise(resolve => { received = resolve })
  const server = createServer(socket => {
    connections++
    const chunks = []
    socket.on('data', chunk => chunks.push(chunk))
    socket.on('end', () => received(Buffer.concat(chunks)))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    await sendHardwareCommand({ ...settings, port, action: 'drawer' })
    assert.deepEqual([...(await data)], [27, 112, 0, 25, 250])
    assert.equal(connections, 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
  await assert.rejects(sendHardwareCommand({ ...settings, port, action: 'drawer' }), /ECONNREFUSED/)
})
