import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

// Run with Vite listening on 5173; isolate the presentation from business data.
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/')
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js')
    const React = reactModule.default || reactModule
    const client = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = client.createRoot || client.default.createRoot
    const { AppIntroduction } = await import('/src/AppIntroduction.tsx')
    const { WorkspaceHelp } = await import('/src/WorkspaceHelp.tsx')
    document.body.innerHTML = '<main id="check"></main>'
    createRoot(document.getElementById('check')).render(React.createElement(React.Fragment, null,
      React.createElement(AppIntroduction, { onContinue: () => { document.body.dataset.finished = 'yes' } }),
      React.createElement(WorkspaceHelp, { title: 'Order guide' }, React.createElement('p', null, 'Choose items, then send the order.'))))
  })
  await page.getByRole('heading', { name: 'Keep daily sales moving' }).waitFor()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('heading', { name: 'Know what is in stock' }).waitFor()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Skip introduction' }).click()
  assert.equal(await page.evaluate(() => document.body.dataset.finished), 'yes')
  await page.getByRole('button', { name: 'Quick guide' }).click()
  await page.getByRole('dialog', { name: 'Order guide' }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Quick guide' }).evaluate(el => el === document.activeElement), true)
  await page.getByRole('button', { name: 'Quick guide' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  console.log('PASS: introduction navigation, skip, responsive width, popup dismissal and focus return')
} finally {
  await browser.close()
}
