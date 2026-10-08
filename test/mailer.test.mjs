import test from 'node:test'
import assert from 'node:assert/strict'
import { mailConfigured, mailDiagnostics, sendSupportRequest, sendSubscriptionReminder } from '../cloud/mailer.mjs'

const names = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']

test('Gmail support messages target support and direct replies to the contact without exposing credentials', async () => {
  const envNames=[...names,'SUPPORT_EMAIL','SUPPORT_REPLY_TO'], previous=Object.fromEntries(envNames.map(name=>[name,process.env[name]])), originalFetch=globalThis.fetch
  const messages=[]
  try {
    Object.assign(process.env,{GMAIL_USER:'sender@example.test',GMAIL_CLIENT_ID:'test-client',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_REFRESH_TOKEN:'test-refresh'})
    delete process.env.SUPPORT_EMAIL;delete process.env.SUPPORT_REPLY_TO
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}))
      messages.push(Buffer.from(JSON.parse(options.body).raw,'base64url').toString('utf8'))
      return new Response(JSON.stringify({id:'sent-message',threadId:'support-thread'}))
    }
    const result=await sendSupportRequest({reference:'ticket-123',businessId:'shop',deviceId:'till',name:'Ada',email:'ada@example.test',subject:'Printer',message:'Printer stopped.'})
    assert.equal(result.threadId,'support-thread')
    assert.match(messages[0],/To: support@sbi\.globalcreest\.com/);assert.match(messages[0],/Reply-To: ada@example\.test/)
    await sendSubscriptionReminder({to:'owner@example.test',expiresAt:new Date('2026-10-07'),url:'https://example.test'})
    assert.match(messages[1],/Reply-To: support@sbi\.globalcreest\.com/)
  } finally {globalThis.fetch=originalFetch;for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}}
})

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

test('mail diagnostics report Gmail API transport and credential presence without exposing values', () => {
  withEnvironment({
    GMAIL_USER: 'owner@example.test',
    GMAIL_CLIENT_ID: 'client-id-secret',
    GMAIL_CLIENT_SECRET: 'client-secret-value',
    GMAIL_REFRESH_TOKEN: 'refresh-token-value',
  }, () => {
    const status = mailDiagnostics()
    assert.equal(mailConfigured(), true)
    assert.equal(status.provider, 'Gmail API OAuth2 over HTTPS')
    assert.deepEqual(status.missing, [])
    assert.ok(Object.values(status.credentials).every(value => value === 'present'))
    const log = JSON.stringify(status)
    for (const secret of ['owner@example.test', 'client-id-secret', 'client-secret-value', 'refresh-token-value']) assert.equal(log.includes(secret), false)
  })
})

test('mail diagnostics name missing credentials without exposing their values', () => {
  withEnvironment({ GMAIL_USER: 'owner@example.test' }, () => {
    const status = mailDiagnostics()
    assert.equal(mailConfigured(), false)
    assert.equal(status.provider, 'Gmail API OAuth2 over HTTPS')
    assert.deepEqual(status.missing, ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'])
    assert.equal(status.credentials.GMAIL_USER, 'present')
  })
})
