import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(15000)
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  await page.route(`${base}/workspace-subscription-test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/workspace-subscription-test', '<html><body><div id="root"></div></body></html>') }))
  await page.goto(`${base}/workspace-subscription-test`)
  await page.evaluate(async () => {
    const { React, createRoot } = await import('/test/shop-setup-harness.ts')
    const { ShopSetup } = await import('/src/ShopSetup.tsx')
    const { normalizeShopProfile } = await import('/server/shop-profile.mjs')
    await import('/src/styles.css')
    const initial = normalizeShopProfile({ workflows: 'payments', workspaceSelectionVersion: 1 })
    function Harness() {
      const [profile, setProfile] = React.useState(initial)
      return React.createElement(ShopSetup, {
        value: profile,
        save: async next => setProfile(next),
        subscriptionAccess: { blocked: false, status: 'active', testMode: false, entitledWorkspaces: 0, workspacePricing: { count: 0, names: [], addonPercent: 5 } },
        refreshSubscriptionAccess: async () => ({ blocked: false, status: 'active', testMode: false, entitledWorkspaces: 0, workspacePricing: { count: 0, names: [], addonPercent: 5 } }),
        onSubscriptionRequired: () => { window.subscriptionOpened = true },
        onReturnOverview: () => { window.returnedOverview = true },
      })
    }
    createRoot(document.getElementById('root')).render(React.createElement(Harness))
  })
  await page.getByRole('button', { name: 'Available workspaces', exact: true }).click()
  const hotel = page.getByRole('checkbox', { name: /Hotel operations/ })
  const nightlife = page.getByRole('checkbox', { name: /Nightlife operations/ })
  await hotel.check()
  const hotelCard = await hotel.locator('xpath=ancestor::label').boundingBox()
  const nightlifeCard = await nightlife.locator('xpath=ancestor::label').boundingBox()
  assert.ok(hotelCard && nightlifeCard && nightlifeCard.y > hotelCard.y, 'Hotel and Nightlife use separate workspace cards')
  await page.getByRole('button', { name: 'Save workspaces', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Workspace subscription limit' })
  await dialog.waitFor()
  const returnButton = dialog.getByRole('button', { name: 'Return to Overview', exact: true })
  const addButton = dialog.getByRole('button', { name: 'Add to subscription', exact: true })
  const left = await returnButton.boundingBox(), right = await addButton.boundingBox()
  assert.ok(left && right && left.x < right.x, 'Return to Overview is left of Add to subscription')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Save workspaces', exact: true }).click()
  await page.getByRole('dialog', { name: 'Workspace subscription limit' }).getByRole('button', { name: 'Add to subscription', exact: true }).click()
  assert.equal(await page.evaluate(() => window.subscriptionOpened), true)
  await page.getByRole('button', { name: 'Save workspaces', exact: true }).click()
  await page.getByRole('dialog', { name: 'Workspace subscription limit' }).getByRole('button', { name: 'Return to Overview', exact: true }).click()
  assert.equal(await page.evaluate(() => window.returnedOverview), true)
} finally {
  await browser.close()
  await server.close()
}
