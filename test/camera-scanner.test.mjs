import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/lib/cameraScanner.ts', import.meta.url), 'utf8')
const cameraScanner = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('barcode scanning requests the rear camera', async () => {
  const stream = { id: 'rear' }
  const constraints = []
  const result = await cameraScanner.requestBarcodeCamera({ getUserMedia: async value => { constraints.push(value); return stream } })
  assert.equal(result, stream)
  assert.deepEqual(constraints, [{ video: { facingMode: { exact: 'environment' } } }])
})

test('barcode scanning does not silently fall back to a front-facing camera', async () => {
  const constraints = []
  await assert.rejects(cameraScanner.requestBarcodeCamera({ getUserMedia: async value => { constraints.push(value); throw Object.assign(new Error('rear camera unavailable'), { name: 'OverconstrainedError' }) } }), { name: 'OverconstrainedError' })
  assert.deepEqual(constraints, [{ video: { facingMode: { exact: 'environment' } } }])
})

test('camera API absence identifies insecure origin separately from unsupported app context', () => {
  assert.match(cameraScanner.cameraAccessUnavailableMessage(false, true), /secure HTTPS/)
  assert.match(cameraScanner.cameraAccessUnavailableMessage(true, false), /does not expose the browser camera API/)
  assert.match(cameraScanner.cameraAccessUnavailableMessage(true, true), /does not expose camera access/)
})

test('camera failures report permission and rear-camera errors distinctly', () => {
  const permissionError = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  const rearCameraError = Object.assign(new Error('missing'), { name: 'OverconstrainedError' })
  assert.match(cameraScanner.cameraFailureMessage(permissionError), /permission was denied or blocked/)
  assert.match(cameraScanner.cameraFailureMessage(rearCameraError), /rear-facing camera/)
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
