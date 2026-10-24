import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const directory = resolve('promo-assets/store-listing')
const output = resolve('promo-assets/google-play')
const screenshots = join(output, 'phone-screenshots')
await mkdir(screenshots, { recursive: true })
const largeScreenSets = {
  'tablet-7-inch': ['overview', 'hotel-operations', 'nightlife-events', 'church-collections'],
  'tablet-10-inch': ['overview', 'hotel-operations', 'nightlife-events', 'church-collections'],
  desktop: ['overview', 'hotel-operations', 'nightlife-events', 'church-collections'],
}
for (const [device, screens] of Object.entries(largeScreenSets)) {
  const destination = join(output, device)
  await mkdir(destination, { recursive: true })
  for (const screen of screens) {
    const file = `${device}-${screen}.png`
    await copyFile(join(directory, 'capture-source', file), join(destination, file))
  }
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
  const icon = await readFile(join(directory, 'app-icon-monogram-concept.svg'))
  await page.setContent(`<html><body style="margin:0;width:512px;height:512px"><img width="512" height="512" src="data:image/svg+xml;base64,${icon.toString('base64')}"></body></html>`)
  await page.locator('img').screenshot({ path: join(output, 'app-icon-512.png') })

  const assets = [
    { source: '../ad-mobile-product-search.png', output: 'phone-screenshot-01-sales-and-stock.png', heading: 'Sales & stock', subtitle: 'Find products, build a sale and keep stock moving.', replaceOldMark: true },
    { source: '../ad-mobile-payments.png', output: 'phone-screenshot-02-payments-and-receipts.png', heading: 'Payments & receipts', subtitle: 'Record service payments and give customers clear receipts.', replaceOldMark: true },
    { source: 'capture-source/hotel-operations.png', output: 'phone-screenshot-03-hotel-operations.png', heading: 'Hotel bookings', subtitle: 'Room availability, guest stays and hotel folios.' },
    { source: 'capture-source/nightlife-events.png', output: 'phone-screenshot-04-nightlife-events.png', heading: 'Nightlife events', subtitle: 'Plan events, admissions and guest check-in.' },
    { source: 'capture-source/church-collections.png', output: 'phone-screenshot-05-church-collections.png', heading: 'Church collections', subtitle: 'Manage funds, donors, pledges and contributions.' },
    { source: 'capture-source/overview-dark.png', output: 'phone-screenshot-06-overview-dark.png', heading: 'Overview', subtitle: 'See today’s business activity at a glance.', dark: true },
  ]
  const iconPng = await readFile(join(output, 'app-icon-512.png'))
  for (const asset of assets) {
    const bytes = await readFile(join(directory, asset.source))
    await page.setContent(`<html><body style="margin:0;background:${asset.dark ? '#071127' : '#f4f1e8'}"><canvas id="canvas" width="1080" height="1920"></canvas><img id="source" src="data:image/png;base64,${bytes.toString('base64')}" hidden><img id="icon" src="data:image/png;base64,${iconPng.toString('base64')}" hidden></body></html>`)
    await page.locator('#source').evaluate(img => img.decode())
    await page.locator('#icon').evaluate(img => img.decode())
    const png = await page.evaluate(({ heading, subtitle, replaceOldMark, dark }) => {
      const canvas = document.querySelector('#canvas')
      const ctx = canvas.getContext('2d')
      const image = document.querySelector('#source')
      const icon = document.querySelector('#icon')
      ctx.fillStyle = dark ? '#071127' : '#f4f1e8'
      ctx.fillRect(0, 0, 1080, 1920)
      ctx.fillStyle = dark ? '#d8ed63' : '#176d6b'
      ctx.font = '700 26px Arial, sans-serif'
      ctx.fillText('STOCKROOM BUSINESS', 72, 72)
      ctx.fillStyle = dark ? '#f5f2e8' : '#173f35'
      ctx.font = '700 56px Arial, sans-serif'
      ctx.fillText(heading, 72, 150)
      ctx.fillStyle = dark ? '#bdcce0' : '#47554f'
      ctx.font = '30px Arial, sans-serif'
      ctx.fillText(subtitle, 72, 202, 936)
      const scale = Math.min(936 / image.naturalWidth, 1630 / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      const x = (1080 - width) / 2
      const y = 250 + (1630 - height) / 2
      ctx.fillStyle = dark ? '#132441' : '#ffffff'
      ctx.shadowColor = dark ? 'rgba(0, 0, 0, .55)' : 'rgba(16, 44, 51, .18)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 10
      ctx.fillRect(x - 8, y - 8, width + 16, height + 16)
      ctx.shadowColor = 'transparent'
      ctx.drawImage(image, x, y, width, height)
      if (replaceOldMark) {
        const markScale = width / image.naturalWidth
        const markX = x + 28 * markScale
        const markY = y + 53 * markScale
        const markSize = 76 * markScale
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(markX, markY, markSize, markSize, 13 * markScale)
        ctx.clip()
        ctx.drawImage(icon, markX, markY, markSize, markSize)
        ctx.restore()
      }
      return canvas.toDataURL('image/png').split(',')[1]
    }, { heading: asset.heading, subtitle: asset.subtitle, replaceOldMark: asset.replaceOldMark || false, dark: asset.dark || false })
    await writeFile(join(screenshots, asset.output), Buffer.from(png, 'base64'))
  }

  const iconData = iconPng.toString('base64')
  const featureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#102c33"/><stop offset="1" stop-color="#17463b"/></linearGradient><radialGradient id="glow"><stop stop-color="#d8ed63" stop-opacity=".22"/><stop offset="1" stop-color="#d8ed63" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#bg)"/><circle cx="888" cy="78" r="300" fill="url(#glow)"/><path d="M0 434h1024" stroke="#b8ddc0" stroke-opacity=".15"/><rect x="72" y="116" width="220" height="220" rx="42" fill="#fff" fill-opacity=".08" stroke="#b8ddc0" stroke-opacity=".2"/><image href="data:image/png;base64,${iconData}" x="92" y="136" width="180" height="180"/><text x="344" y="103" fill="#d8ed63" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="3">STOCKROOM BUSINESS</text><text x="344" y="190" fill="#f5f2e8" font-family="Arial,sans-serif" font-size="52" font-weight="700">Run your business</text><text x="344" y="250" fill="#f5f2e8" font-family="Arial,sans-serif" font-size="52" font-weight="700">with clarity.</text><text x="346" y="307" fill="#c5d8cf" font-family="Arial,sans-serif" font-size="22">One place for the work that keeps business moving.</text><g font-family="Arial,sans-serif" font-size="17" font-weight="600"><rect x="344" y="352" width="126" height="42" rx="21" fill="#d8ed63"/><text x="407" y="379" text-anchor="middle" fill="#173f35">Sales &amp; stock</text><rect x="484" y="352" width="105" height="42" rx="21" fill="#f5f2e8" fill-opacity=".12" stroke="#b8ddc0" stroke-opacity=".45"/><text x="536" y="379" text-anchor="middle" fill="#f5f2e8">Services</text><rect x="603" y="352" width="103" height="42" rx="21" fill="#f5f2e8" fill-opacity=".12" stroke="#b8ddc0" stroke-opacity=".45"/><text x="654" y="379" text-anchor="middle" fill="#f5f2e8">Hotels</text><rect x="720" y="352" width="91" height="42" rx="21" fill="#f5f2e8" fill-opacity=".12" stroke="#b8ddc0" stroke-opacity=".45"/><text x="766" y="379" text-anchor="middle" fill="#f5f2e8">Events</text><rect x="825" y="352" width="161" height="42" rx="21" fill="#f5f2e8" fill-opacity=".12" stroke="#b8ddc0" stroke-opacity=".45"/><text x="905" y="379" text-anchor="middle" fill="#f5f2e8">Church collections</text></g></svg>`
  await writeFile(join(directory, 'feature-graphic.svg'), featureSvg)
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.setContent(featureSvg)
  await page.locator('svg').screenshot({ path: join(output, 'feature-graphic-1024x500.png') })
} finally {
  await browser.close()
}
