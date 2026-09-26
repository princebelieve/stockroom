import test from 'node:test'
import assert from 'node:assert/strict'
import { mailConfigured, mailDiagnostics } from '../cloud/mailer.mjs'

const names = ['SMTP_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']

function withEnvironment(values, run) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
  for (const name of names) delete process.env[name]
  Object.assign(process.env, values)
  try { return run() }
  finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
}

test('mail diagnostics report effective SMTP settings and credential presence without exposing values', () => {
  withEnvironment({
    SMTP_USER: 'owner@example.test',
    GMAIL_CLIENT_ID: 'client-id-secret',
    GMAIL_CLIENT_SECRET: 'client-secret-value',
    GMAIL_REFRESH_TOKEN: 'refresh-token-value',
  }, () => {
    const status = mailDiagnostics()
    assert.equal(mailConfigured(), true)
    assert.equal(status.host, 'smtp.gmail.com')
    assert.equal(status.port, 465)
    assert.equal(status.tls, 'implicit TLS (Nodemailer Gmail preset)')
    assert.deepEqual(status.missing, [])
    assert.ok(Object.values(status.credentials).every(value => value === 'present'))
    const log = JSON.stringify(status)
    for (const secret of ['owner@example.test', 'client-id-secret', 'client-secret-value', 'refresh-token-value']) assert.equal(log.includes(secret), false)
  })
})

test('mail diagnostics name missing credentials without exposing their values', () => {
  withEnvironment({ SMTP_USER: 'owner@example.test' }, () => {
    const status = mailDiagnostics()
    assert.equal(mailConfigured(), false)
    assert.equal(status.port, 465)
    assert.deepEqual(status.missing, ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'])
    assert.equal(status.credentials.SMTP_USER, 'present')
  })
})
