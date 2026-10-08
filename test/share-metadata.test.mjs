import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('shared pages expose a crawlable PNG logo before JavaScript runs', () => {
  const png = readFileSync('public/icon-512.png')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)
  for (const page of ['index', 'welcome', 'features', 'workspaces', 'hardware', 'getting-started', 'downloads', 'referrals', 'support', 'visitor', 'developer']) {
    const source = readFileSync(`${page}.html`, 'utf8')
    assert.equal((source.match(/property="og:image"/g) || []).length, 1, page)
    assert.match(source, /property="og:image" content="https:\/\/stockroom.globalcreest.com\/icon-512.png"/)
    assert.match(source, /name="twitter:image"/)
    assert.match(source, /property="og:url" content="https:\/\//)
  }
})
