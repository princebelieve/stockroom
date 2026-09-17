import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  page.on('pageerror', error => console.error(error.message))
  page.setDefaultTimeout(10000)
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/__loading_test`, async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/__loading_test', `<div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const { createRoot } = ReactDOM;
    import { AsyncForm, SubmitButton } from '/src/AsyncControls.tsx';
    window.calls = 0;
    createRoot(document.getElementById('root')).render(React.createElement(AsyncForm, {
      busyLabel: 'Signing in...', onSubmit: async event => {
        window.calls++; window.sent = new FormData(event.currentTarget).get('email');
        await new Promise((resolve, reject) => { window.finish = resolve; window.fail = () => reject(new Error('Connection failed')); });
      }
    }, React.createElement('input', { name: 'email', required: true, defaultValue: 'owner@example.com' }),
    React.createElement(SubmitButton, null, 'Sign in')));
  </script>`) }))
  await page.goto(`${base}/__loading_test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Signing in...' }).waitFor()
  assert.equal(await page.getByRole('button').isDisabled(), true)
  assert.equal(await page.locator('input').isDisabled(), true)
  assert.equal(await page.evaluate(() => window.sent), 'owner@example.com')
  await page.evaluate(() => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(await page.evaluate(() => window.calls), 1)
  await page.evaluate(() => window.fail())
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button').isEnabled(), true)
  assert.equal(await page.locator('input').inputValue(), 'owner@example.com')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.evaluate(() => window.finish())
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.equal(await page.evaluate(() => window.calls), 2)
  console.log('PASS: loading feedback, disabled controls, duplicate protection, failure recovery, retry')
} finally { await browser.close(); await server.close() }
