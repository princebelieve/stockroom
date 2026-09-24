import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../src/lib/refreshDeadline.ts', import.meta.url), 'utf8'))
const { refreshDeadline } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('a stalled refresh times out even if its adapter ignores cancellation', async () => {
  const deadline = refreshDeadline(20)
  let finish
  let applied = false
  let refreshing = true
  try {
    await assert.rejects((async () => {
      try {
        await deadline.wait(new Promise(resolve => { finish = resolve }))
        applied = true
      } finally { refreshing = false }
    })(), /Refresh timed out.*try again/)
    assert.equal(refreshing, false)
    assert.equal(deadline.signal.aborted, true)
    finish('late response')
    await Promise.resolve()
    assert.equal(applied, false)
  } finally { deadline.dispose() }
})

test('successful and failed refreshes finish normally and dispose their timer', async () => {
  const deadline = refreshDeadline(20)
  assert.equal(await deadline.wait(Promise.resolve('loaded')), 'loaded')
  await assert.rejects(deadline.wait(Promise.reject(new Error('Offline'))), /Offline/)
  deadline.dispose()
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(deadline.signal.aborted, false)
})
