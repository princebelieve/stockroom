import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const directory = resolve('promo-assets/store-listing')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
  for (const [input, output] of [['app-icon-concept.svg', 'app-icon-concept.png'], ['app-icon-monogram-concept.svg', 'app-icon-monogram-concept.png']]) {
    const icon = await readFile(join(directory, input))
    await page.setContent(`<html><body style="margin:0;width:512px;height:512px"><img width="512" height="512" src="data:image/svg+xml;base64,${icon.toString('base64')}"></body></html>`)
    await page.locator('img').screenshot({ path: join(directory, output) })
  }

  const assets = [
    { source: '../ad-mobile-product-search.png', output: '01-product-sales-and-stock.png', heading: 'Sales & stock', subtitle: 'Find products, build a sale and keep stock moving.' },
    { source: '../ad-mobile-payments.png', output: '02-payments-and-receipts.png', heading: 'Payments & receipts', subtitle: 'Record service payments and give customers clear receipts.' },
    { source: '03-hotel-operations.png', output: '03-hotel-operations.png', heading: 'Hotel bookings', subtitle: 'Room availability, guest stays and hotel folios.' },
    { source: '04-nightlife-events.png', output: '04-nightlife-events.png', heading: 'Nightlife events', subtitle: 'Plan events, admissions and guest check-in.' },
    { source: '05-church-collections.png', output: '05-church-collections.png', heading: 'Church collections', subtitle: 'Manage funds, donors, pledges and contributions.' },
  ]
  for (const asset of assets) {
    const bytes = await readFile(join(directory, asset.source))
    await page.setContent(`<html><body style="margin:0;background:#f4f1e8"><canvas id="canvas" width="1080" height="1920"></canvas><img id="source" src="data:image/png;base64,${bytes.toString('base64')}" hidden></body></html>`)
    await page.locator('#source').evaluate(img => img.decode())
    const png = await page.evaluate(({ heading, subtitle }) => {
      const canvas = document.querySelector('#canvas')
      const ctx = canvas.getContext('2d')
      const image = document.querySelector('#source')
      ctx.fillStyle = '#f4f1e8'
      ctx.fillRect(0, 0, 1080, 1920)
      ctx.fillStyle = '#176d6b'
      ctx.font = '700 26px Arial, sans-serif'
      ctx.fillText('STOCKROOM BUSINESS', 72, 72)
      ctx.fillStyle = '#173f35'
      ctx.font = '700 56px Arial, sans-serif'
      ctx.fillText(heading, 72, 150)
      ctx.fillStyle = '#47554f'
      ctx.font = '30px Arial, sans-serif'
      ctx.fillText(subtitle, 72, 202, 936)
      const scale = Math.min(936 / image.naturalWidth, 1630 / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      const x = (1080 - width) / 2
      const y = 250 + (1630 - height) / 2
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(16, 44, 51, .18)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 10
      ctx.fillRect(x - 8, y - 8, width + 16, height + 16)
      ctx.shadowColor = 'transparent'
      ctx.drawImage(image, x, y, width, height)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { heading: asset.heading, subtitle: asset.subtitle })
    await writeFile(join(directory, asset.output), Buffer.from(png, 'base64'))
  }
} finally {
  await browser.close()
}
