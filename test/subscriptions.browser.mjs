import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const html = await readFile(new URL('../cloud/subscriptions.html', import.meta.url), 'utf8')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let testMode = true
  let assigned = false
  let plan = { amount: 500000, currency: 'NGN', days: 30, reminderDays: 7, firstReferralPercent: 10, recurringReferralPercent: 5 }
  const code = 'a'.repeat(32)
  const developerEmail = 'owner@example.com'
  await page.route('https://subscription.test/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/subscriptions') return route.fulfill({ contentType: 'text/html', body: html })
    const input = request.postDataJSON()
    let data = {}
    if (path === '/v1/auth/login') data = { account: { role: 'owner' }, accessToken: 'owner-token' }
    if (path === '/v1/subscriptions/setup') {
      assert.equal(request.headers()['x-admin-key'], 'developer-key')
      if (request.method() === 'PUT') plan = input
      data = { plan, testMode, paystackConfigured: true, emailConfigured: true, publicUrlConfigured: true, developerEmail: 'developer@example.com' }
    }
    if (path === '/v1/subscriptions/test-mode') {
      assert.equal(request.headers()['x-admin-key'], 'developer-key')
      testMode = input.testMode
      data = { testMode }
    }
    if (path === '/v1/subscriptions') data = { plan, subscription: { expiresAt: '2000-01-01', ...(assigned ? { referrerId: 'referrer' } : {}) }, access: { reason: testMode ? 'Developer test mode is on.' : 'Grace period has ended.' }, developerEmail }
    if (path === '/v1/subscriptions/referrals') {
      assert.equal(request.headers().authorization, 'Bearer owner-token')
      if (request.method() === 'POST') { assert.equal(input.code, code); assigned = true; data = { ok: true } }
      else data = { link: 'https://subscription.test/subscriptions?ref=' + code, commissions: [{ amount: 50000, currency: 'NGN', percent: 10, kind: 'first', createdAt: '2026-09-01' }] }
    }
    await route.fulfill({ json: data })
  })
  await page.goto('https://subscription.test/subscriptions?ref=' + code)
  assert.equal(await page.locator('#mode').count(), 0)
  assert.equal(await page.locator('#developer').isVisible(), false)
  await page.locator('[name=email]').fill('owner@example.com')
  await page.locator('[name=password]').fill('owner-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('#referral-link').waitFor()
  assert.equal(await page.locator('#mode').count(), 0)
  assert.equal(await page.locator('#developer').isVisible(), false)
  await page.locator('#logout').click()
  await page.locator('[name=email]').fill('owner@example.com')
  await page.locator('[name=password]').fill('owner-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('#referral-link').waitFor()
  assert.equal(await page.locator('#developer').isVisible(), false)
  await page.locator('#logout').click()
  await page.locator('[name=email]').fill('developer@example.com')
  await page.locator('[name=password]').fill('developer-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('#key').waitFor()
  assert.equal(await page.locator('#mode').count(), 0)
  assert.equal(await page.locator('#developer').isVisible(), true)
  await page.locator('#logout').click()
  await page.locator('[name=email]').fill('owner@example.com')
  await page.locator('[name=password]').fill('owner-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Load setup' }).click()
  await page.getByRole('button', { name: 'Disable test mode and enforce subscriptions' }).click()
  await page.getByRole('button', { name: 'Enable test mode and lift all blocks' }).waitFor()
  assert.equal(testMode, false)
  await page.getByRole('button', { name: 'Enable test mode and lift all blocks' }).click()
  await page.getByRole('button', { name: 'Disable test mode and enforce subscriptions' }).waitFor()
  assert.equal(testMode, true)
  await page.locator('[name=firstReferralPercent]').fill('15.5')
  await page.locator('[name=recurringReferralPercent]').fill('2.25')
  await page.getByRole('button', { name: 'Save subscription setup' }).click()
  await page.getByText('Subscription setup saved.', { exact: true }).waitFor()
  assert.equal(plan.firstReferralPercent, '15.5')
  assert.equal(plan.recurringReferralPercent, '2.25')
  await page.locator('#mode').selectOption('owner')
  await page.locator('[name=email]').fill('owner@example.com')
  await page.locator('[name=password]').fill('owner-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('#referral-link').waitFor()
  assert.equal(await page.locator('#claim-referral [name=code]').inputValue(), code)
  await page.getByRole('button', { name: 'Apply referral' }).click()
  await page.getByText('Referral applied.', { exact: true }).waitFor()
  assert.equal(assigned, true)
  assert.match(await page.locator('#commissions').innerText(), /500\.00.*first payment at 10%/)
  assert.deepEqual(errors, [])
  console.log('Subscription browser checks passed: developer toggle, commission settings, referral link attribution, owner credits.')
} finally { await browser.close() }
