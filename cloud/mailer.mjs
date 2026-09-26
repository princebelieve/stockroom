import { randomUUID } from 'node:crypto'

const credentialNames = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']

export function mailDiagnostics() {
  const credentials = Object.fromEntries(credentialNames.map(name => [name, process.env[name]?.trim() ? 'present' : 'missing']))
  const missing = credentialNames.filter(name => credentials[name] === 'missing')
  return {
    provider: 'Gmail API OAuth2 over HTTPS',
    credentials,
    missing,
    configured: missing.length === 0,
  }
}

export function mailConfigured() {
  return mailDiagnostics().configured
}
const configured = mailConfigured

export async function sendSubscriptionReminder({ to, expiresAt, url }) {
  if (!configured()) throw new Error('Email is not configured.')
  await sendMail({ to, subject: 'Your Stockroom subscription expires soon', text: `Your Stockroom subscription expires on ${expiresAt.toISOString().slice(0, 10)} (UTC).\n\nRenew manually at ${url}\n\nYou will not be charged automatically. Sign in as the business owner and choose Renew with Paystack.` })
}

export async function sendSubscriptionConfirmation({ to, amount, currency, expiresAt }) {
  if (!configured()) throw new Error('Email is not configured.')
  const value = `${currency} ${(amount / 100).toFixed(2)}`
  const renewal = expiresAt.toISOString().slice(0, 10)
  await sendMail({ to, subject: 'Your Stockroom subscription payment is confirmed', text: `We confirmed your Stockroom subscription payment of ${value}.\n\nYour current access renews or expires on ${renewal} (UTC).\n\nYou will not be charged automatically.`, html: `<p>We confirmed your Stockroom subscription payment of <b>${value}</b>.</p><p>Your current access renews or expires on <b>${renewal}</b> (UTC).</p><p>You will not be charged automatically.</p>` })
}

export async function sendSubscriptionGraceNotice({ to, expiresAt, graceEndsAt, url }) {
  if (!configured()) throw new Error('Email is not configured.')
  await sendMail({ to, subject: 'Your Stockroom subscription is now in grace period', text: `Your subscription expired on ${expiresAt.toISOString().slice(0, 10)} (UTC). POS access ends on ${graceEndsAt.toISOString().slice(0, 10)} (UTC) unless you renew.\n\nRenew at ${url}`, html: `<p>Your subscription is now in its grace period.</p><p>POS access ends on <b>${graceEndsAt.toISOString().slice(0, 10)} (UTC)</b> unless you renew.</p><p><a href="${url}">Renew your subscription</a></p>` })
}

export async function sendReferralBonusNotice({ to, amount, currency, kind }) {
  if (!configured()) throw new Error('Email is not configured.')
  const paymentType = kind === 'first' ? 'a new subscription' : 'a subscription renewal'
  const value = `${currency} ${(amount / 100).toFixed(2)}`
  await sendMail({ to, subject: 'Referral bonus available', text: `Your referral link was used for ${paymentType}. A referral bonus of ${value} is available. Please contact support to arrange your payout.`, html: `<p>Your referral link was used for ${paymentType}.</p><p>A referral bonus of <b>${value}</b> is available.</p><p>Please contact support to arrange your payout.</p>` })
}

let cachedAccessToken = ''
let accessTokenExpiresAt = 0

async function gmailAccessToken() {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) return cachedAccessToken
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.access_token) throw new Error(`Google OAuth token request failed (${response.status}): ${result.error_description || result.error || 'no access token returned'}`)
  cachedAccessToken = result.access_token
  accessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000
  return cachedAccessToken
}

function base64Lines(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd()
}

function rawMessage({ to, subject, text, html }) {
  const safeHeader = value => String(value).replace(/[\r\n]+/g, ' ').trim()
  const boundary = `stockroom-${randomUUID()}`
  const parts = [
    `From: Stockroom Business <${safeHeader(process.env.GMAIL_USER)}>`,
    `To: ${safeHeader(to)}`,
    `Subject: ${safeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
  ]
  if (html) parts.push(`--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', base64Lines(html))
  parts.push(`--${boundary}--`, '')
  return Buffer.from(parts.join('\r\n'), 'utf8').toString('base64url')
}

async function sendMail({ to, subject, text, html }) {
  if (!configured()) throw new Error('Email is not configured.')
  const token = await gmailAccessToken()
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: rawMessage({ to, subject, text, html }) }),
    signal: AbortSignal.timeout(12_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.id) throw new Error(`Gmail API send failed (${response.status}): ${result.error?.message || 'no message id returned'}`)
}

export async function sendPasswordReset({ to, token }) {
  if (!configured()) return false
  const expires = '30 minutes'
  await sendMail({ to, subject: 'Reset your Stockroom owner password', text: `Your Stockroom password-reset code is:\n\n${token}\n\nIt expires in ${expires}. If you did not request this, ignore this email.`, html: `<p>Your Stockroom password-reset code is:</p><h2>${token}</h2><p>It expires in ${expires}. If you did not request this, ignore this email.</p>` })
  return true
}

export async function sendStaffInvite({ to, name, businessId, password }) {
  if (!configured()) return false
  await sendMail({ to, subject: 'Your Stockroom staff account', text: `Hello ${name},\n\nYou have been added to Stockroom business ${businessId}.\nEmail: ${to}\nTemporary password: ${password}\n\nSign in online once before using the app offline, then change your password.`, html: `<p>Hello ${name},</p><p>You have been added to Stockroom business <b>${businessId}</b>.</p><p>Email: ${to}<br>Temporary password: ${password}</p><p>Sign in online once before using the app offline, then change your password.</p>` })
  return true
}
