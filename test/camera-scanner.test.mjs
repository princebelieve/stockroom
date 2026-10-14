import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(new URL('../src/lib/cameraScanner.ts', import.meta.url), 'utf8')
const cameraScanner = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('phones request the rear camera and desktops use their available webcam', async () => {
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5), true)
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5), true)
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), false)
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Win32', 5), false)
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (Linux; Android 15)', 'Linux x86_64', 5), false)
  assert.equal(cameraScanner.requiresRearCamera('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5), true)
  const stream = { id: 'rear' }
  const mobileConstraints = []
  const desktopConstraints = []
  assert.equal(await cameraScanner.requestBarcodeCamera({ getUserMedia: async value => { mobileConstraints.push(value); return stream } }, true), stream)
  assert.equal(await cameraScanner.requestBarcodeCamera({ getUserMedia: async value => { desktopConstraints.push(value); return stream } }, false), stream)
  assert.deepEqual(mobileConstraints, [{ video: { facingMode: { exact: 'environment' } } }])
  assert.deepEqual(desktopConstraints, [{ video: { facingMode: { ideal: 'user' } } }])
})

test('camera API absence identifies insecure origin separately from unsupported app context', () => {
  assert.match(cameraScanner.cameraAccessUnavailableMessage(false, true, false), /secure HTTPS/)
  assert.match(cameraScanner.cameraAccessUnavailableMessage(true, false, true), /mobile app window/)
  assert.match(cameraScanner.cameraAccessUnavailableMessage(true, false, false), /browser window/)
})

test('camera failures report permission and rear-camera errors distinctly', () => {
  const permissionError = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  const rearCameraError = Object.assign(new Error('missing'), { name: 'OverconstrainedError' })
  assert.match(cameraScanner.cameraFailureMessage(permissionError, false), /browser or operating system settings/)
  assert.doesNotMatch(cameraScanner.cameraFailureMessage(permissionError, false), /iPhone|Safari/)
  assert.match(cameraScanner.cameraFailureMessage(rearCameraError, true), /rear-facing camera/)
  assert.match(cameraScanner.cameraFailureMessage(rearCameraError, false), /available camera/)
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
