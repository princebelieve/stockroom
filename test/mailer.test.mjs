import test from 'node:test'
import assert from 'node:assert/strict'
import { mailConfigured, mailDiagnostics, sendSupportRequest, sendSubscriptionReminder } from '../cloud/mailer.mjs'

const names = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']

test('mail startup check distinguishes rejected OAuth and missing send scope without exposing credentials',async()=>{
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch
  try {
    Object.assign(process.env,Object.fromEntries(names.map(name=>[name,'private-value'])))
    globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:'private-value'})})
    const rejected=await import('../cloud/mailer.mjs?authorization-rejected-test')
    const failure=await rejected.checkMailAuthorization()
    assert.deepEqual(failure,{authorized:false,stage:'authorization',code:'invalid_grant',status:400})
    assert.equal(JSON.stringify(failure).includes('private-value'),false)
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({access_token:'private-value',scope:'openid email'})})
    const scope=await import('../cloud/mailer.mjs?authorization-scope-test')
    assert.deepEqual(await scope.checkMailAuthorization(),{authorized:false,stage:'authorization',code:'gmail_scope_missing',status:403})
  } finally {globalThis.fetch=originalFetch;for(const name of names)previous[name]===undefined?delete process.env[name]:process.env[name]=previous[name]}
})

test('registration mail trims credentials and refreshes an explicitly rejected token once',async()=>{
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch
  let sends=0,tokens=0
  try {
    Object.assign(process.env,{GMAIL_USER:' sender@example.test ',GMAIL_CLIENT_ID:' client ',GMAIL_CLIENT_SECRET:' secret ',GMAIL_REFRESH_TOKEN:' refresh '})
    globalThis.fetch=async(url,init)=>{
      if(String(url).includes('oauth2.googleapis.com')){
        tokens++
        assert.equal(init.body.get('client_id'),'client');assert.equal(init.body.get('refresh_token'),'refresh')
        return {ok:true,status:200,json:async()=>({access_token:'mock-token-'+tokens,expires_in:3600})}
      }
      sends++
      return sends===1?{ok:false,status:401,json:async()=>({error:{message:'Expired'}})}:{ok:true,status:200,json:async()=>({id:'accepted'})}
    }
    const {sendBusinessRegistrationKey}=await import('../cloud/mailer.mjs?registration-retry-test')
    await sendBusinessRegistrationKey({to:'owner@example.test',businessName:'Test',key:'mock-key',expiresAt:new Date()})
    assert.equal(sends,2);assert.equal(tokens,2)
  } finally {globalThis.fetch=originalFetch;for(const name of names)previous[name]===undefined?delete process.env[name]:process.env[name]=previous[name]}
})

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
