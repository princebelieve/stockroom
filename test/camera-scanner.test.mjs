import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/lib/cameraScanner.ts', import.meta.url), 'utf8')
const cameraScanner = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('camera scanner prefers the rear camera when the browser accepts it', async () => {
  const stream = { id: 'rear' }
  const constraints = []
  const result = await cameraScanner.requestBarcodeCamera({ getUserMedia: async value => { constraints.push(value); return stream } })
  assert.equal(result, stream)
  assert.deepEqual(constraints, [{ video: { facingMode: 'environment' } }])
})

test('camera scanner retries iOS compatible constraints when strict rear-camera selection is rejected', async () => {
  const stream = { id: 'default' }
  const constraints = []
  const result = await cameraScanner.requestBarcodeCamera({ getUserMedia: async value => {
    constraints.push(value)
    if (constraints.length === 1) throw new Error('facingMode unsupported')
    if (constraints.length === 2) throw new Error('ideal facingMode unsupported')
    return stream
  } })
  assert.equal(result, stream)
  assert.deepEqual(constraints, [{ video: { facingMode: 'environment' } }, { video: { facingMode: { ideal: 'environment' } } }, { video: true }])
})

test('camera scanner waits for the preview element to mount before attaching the stream', async () => {
  let frames = 0
  const preview = { id: 'video' }
  const result = await cameraScanner.waitForCameraPreview(() => frames >= 2 ? preview : null, () => true, callback => { frames += 1; callback(0); return frames })
  assert.equal(result, preview)
  assert.equal(frames, 2)
})

test('camera scanner stops waiting when its scan session is cancelled', async () => {
  let frames = 0
  const result = await cameraScanner.waitForCameraPreview(() => null, () => false, callback => { frames += 1; callback(0); return frames })
  assert.equal(result, null)
  assert.equal(frames, 0)
})
