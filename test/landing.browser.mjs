import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

const pages = ['welcome','features','workspaces','hardware','getting-started','downloads','referrals','support']
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  try {
    let path = new URL(req.url, 'http://local').pathname
    if (pages.includes(path.slice(1))) path += '.html'
    const file = join(process.cwd(), 'dist', path === '/' ? 'index.html' : path)
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/v1/public/landing', route => route.fulfill({ json: { firstReferralPercent: 10, recurringReferralPercent: 5 } }))
    await page.goto(`http://127.0.0.1:${server.address().port}/welcome.html?ref=${'a'.repeat(32)}`)
    await page.getByRole('heading', { name: /Keep selling/ }).waitFor()
    assert.equal(await page.locator('form').count(), 0, 'marketing page must not register or bill businesses')
    assert.equal(await page.locator('#register-app').getAttribute('href'), `https://stockroom.globalcreest.com/?screen=register&ref=${'a'.repeat(32)}`)
    assert.equal(await page.locator('#subscription-app').getAttribute('href'), `https://stockroom.globalcreest.com/?screen=register&ref=${'a'.repeat(32)}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(element=>element.getBoundingClientRect().right>innerWidth+1).map(element=>[element.tagName,element.className,element.getBoundingClientRect().right]))))
    if(width===390)await page.getByRole('button',{name:'Open navigation menu',exact:true}).click()
    await page.locator('header').getByText('Product',{exact:true}).click()
    await page.locator('header').getByRole('link',{name:'Features',exact:true}).click()
    await page.waitForURL(`**/features.html?ref=${'a'.repeat(32)}`)
    await page.getByRole('heading',{name:'Business tools that work together',exact:true}).waitFor()
    assert.equal(await page.locator('.public-page-tabs a[aria-current="page"]').count(),1)
    for(const slug of pages.slice(1)){
      await page.goto(`http://127.0.0.1:${server.address().port}/${slug}.html`)
      await page.locator('main h1').waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,slug+' overflows')
      assert.equal(await page.locator('header nav a[href*="#"]').count(),0)
      if(slug==='hardware')for(const model of ['DKT-M81','P1102','8120'])await page.getByRole('heading',{name:new RegExp(model)}).waitFor()
      if(slug==='referrals')await page.getByText('10%',{exact:true}).waitFor()
      if(slug==='downloads')assert.equal(await page.locator('#apk').getAttribute('aria-disabled'),'true')
    }
    if(width===390){const toggle=page.getByRole('button',{name:'Open navigation menu',exact:true});await toggle.click();await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(element=>element===document.activeElement),true)}
    assert.deepEqual(errors, [])
    await page.close()
  }
  const sw=await readFile('dist/sw.js','utf8')
  for(const slug of pages.slice(1))assert.ok(sw.includes(`"/${slug}"`)&&sw.includes(`"/${slug}.html"`),'offline shell includes '+slug)
  console.log('PASS: eight real public pages, mobile/desktop layout, expandable menus, referral preservation, tested hardware and offline shell inclusion.')
} finally { await browser.close(); server.close() }
