import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true})
try {
  const page = await browser.newPage()
  const base=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/guidance-test`,async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/guidance-test','<html><body><div id="check"></div></body></html>')}))
  await page.goto(`${base}/guidance-test`)
  await page.evaluate(async () => {
    const {React,createRoot}=await import('/test/shop-setup-harness.ts')
    await import('/src/styles.css')
    const { AppIntroduction } = await import('/src/AppIntroduction.tsx')
    const { WorkspaceHelp } = await import('/src/WorkspaceHelp.tsx')
    document.body.innerHTML = '<main id="check"></main>'
    createRoot(document.getElementById('check')).render(React.createElement(React.Fragment, null,
      React.createElement(AppIntroduction, { onContinue: () => { document.body.dataset.finished = 'yes' } }),
      React.createElement(WorkspaceHelp, { title: 'Order guide' }, React.createElement('p', null, 'Choose items, then send the order.'))))
  })
  await page.getByRole('heading', { name: 'Keep trading offline after setup' }).waitFor()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('heading', { name: 'Choose a workspace for the way you sell' }).waitFor()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  const steps=page.getByRole('navigation',{name:'Introduction steps'}).getByRole('button')
  assert.equal(await steps.count(),7)
  for(let index=0;index<7;index++) {
    await steps.nth(index).click()
    assert.equal(await steps.nth(index).getAttribute('aria-current'),'step')
    assert.equal(await page.locator('.intro-illustration svg').count(),1)
    assert.equal(await page.locator('.intro-illustration svg').evaluate(svg=>svg.children.length>2),true)
  }
  await page.getByRole('button',{name:'Continue to sign in',exact:true}).click()
  assert.equal(await page.evaluate(()=>document.body.dataset.finished),'yes')
  await steps.first().click()
  await page.getByRole('button', { name: 'Skip introduction' }).click()
  assert.equal(await page.evaluate(() => document.body.dataset.finished), 'yes')
  await page.getByRole('button', { name: 'Help: Order guide' }).click()
  await page.getByRole('dialog', { name: 'Order guide' }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').isVisible(), false)
  assert.equal(await page.getByRole('button', { name: 'Help: Order guide' }).evaluate(el => el === document.activeElement), true)
  await page.getByRole('button', { name: 'Help: Order guide' }).click()
  await page.getByRole('button', { name: 'Close',exact:true }).click()
  assert.equal(await page.getByRole('dialog').isVisible(), false)
  console.log('PASS: introduction navigation, skip, responsive width, popup dismissal and focus return')
} finally {
  await browser.close()
  await server.close()
}
