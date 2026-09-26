import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

for (const [platform, file, declaration, cutMarker] of [
  ['Android', 'src/lib/mobileApi.ts', 'async function handle(path: string', '  // Logout must also clear stale sessions'],
  ['browser PWA', 'src/lib/browserApi.ts', 'export async function handleBrowserApi(path: string', "  if (path === '/api/users'"],
]) {
  test(`${platform} forwards both password-reset actions directly to cloud before local session checks`, async () => {
    const source = await readFile(file, 'utf8')
    const start = source.indexOf(declaration)
    const end = source.indexOf(cutMarker, start)
    assert.ok(start >= 0 && end > start)
    const fnStart = source.indexOf('async function ', start)
    const segment = `${source.slice(fnStart, end).trim()}\n}`
    const requests = []
    const handler = vm.runInNewContext(stripTypeScriptTypes(`(${segment})`), {
      cloudUrl: 'https://cloud.example',
      originalFetch: async (url, init) => { requests.push({ url, init }); return new Response('{"ok":true,"delivered":true}') },
    })

    for (const [action, body] of [
      ['request', JSON.stringify({ email: 'owner@example.test' })],
      ['confirm', JSON.stringify({ token: 'reset-code', password: 'new-password-long' })],
    ]) {
      const response = await handler(`/api/auth/password-reset/${action}`, { method: 'POST', body })
      assert.equal(response.status, 200)
      assert.equal(JSON.stringify(requests.at(-1)), JSON.stringify({
        url: `https://cloud.example/v1/auth/password-reset/${action}`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      }))
    }
  })
}

test('Windows cloud-auth bridge forwards reset requests to the configured cloud service', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stockroom-password-reset-'))
  const configPath = join(directory, 'sync-config.json')
  const oldPath = process.env.SYNC_CONFIG_PATH
  const oldFetch = globalThis.fetch
  const requests = []
  try {
    await writeFile(configPath, JSON.stringify({ syncApiUrl: 'https://cloud.example', businessId: 'shop', deviceId: 'windows', deviceToken: 'device-token' }))
    process.env.SYNC_CONFIG_PATH = configPath
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init })
      return Response.json({ ok: true, delivered: true })
    }
    const cloudAuth = await import(`../server/cloud-auth.mjs?password-reset-test=${Date.now()}`)
    await cloudAuth.cloudPasswordResetRequest('owner@example.test')
    await cloudAuth.cloudPasswordResetConfirm('reset-code', 'new-password-long')
    assert.deepEqual(requests.map(({ url, init }) => ({ url, body: JSON.parse(init.body) })), [
      { url: 'https://cloud.example/v1/auth/password-reset/request', body: { email: 'owner@example.test' } },
      { url: 'https://cloud.example/v1/auth/password-reset/confirm', body: { token: 'reset-code', password: 'new-password-long' } },
    ])
  } finally {
    globalThis.fetch = oldFetch
    if (oldPath === undefined) delete process.env.SYNC_CONFIG_PATH
    else process.env.SYNC_CONFIG_PATH = oldPath
    await rm(directory, { recursive: true, force: true })
  }
})
