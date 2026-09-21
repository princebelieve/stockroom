import nodemailer from 'nodemailer'

export function mailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN)
}
const configured = mailConfigured

export async function sendSubscriptionReminder({ to, expiresAt, url }) {
  if (!configured()) throw new Error('Email is not configured.')
  await transport().sendMail({ from: `Stockroom Business <${process.env.SMTP_USER}>`, to, subject: 'Your Stockroom subscription expires soon', text: `Your Stockroom subscription expires on ${expiresAt.toISOString().slice(0, 10)} (UTC).\n\nRenew manually at ${url}\n\nYou will not be charged automatically. Sign in as the business owner and choose Renew with Paystack.` })
}

export async function sendReferralBonusNotice({ to, amount, currency, kind }) {
  if (!configured()) throw new Error('Email is not configured.')
  const paymentType = kind === 'first' ? 'a new subscription' : 'a subscription renewal'
  const value = `${currency} ${(amount / 100).toFixed(2)}`
  await transport().sendMail({ from: `Stockroom Business <${process.env.SMTP_USER}>`, to, subject: 'Referral bonus available', text: `Your referral link was used for ${paymentType}. A referral bonus of ${value} is available. Please contact support to arrange your payout.`, html: `<p>Your referral link was used for ${paymentType}.</p><p>A referral bonus of <b>${value}</b> is available.</p><p>Please contact support to arrange your payout.</p>` })
}

function transport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { type: 'OAuth2', user: process.env.SMTP_USER, clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET, refreshToken: process.env.GMAIL_REFRESH_TOKEN },
  })
}

export async function sendPasswordReset({ to, token }) {
  if (!configured()) return false
  const expires = '30 minutes'
  await transport().sendMail({ from: `Stockroom Business <${process.env.SMTP_USER}>`, to, subject: 'Reset your Stockroom owner password', text: `Your Stockroom password-reset code is:\n\n${token}\n\nIt expires in ${expires}. If you did not request this, ignore this email.`, html: `<p>Your Stockroom password-reset code is:</p><h2>${token}</h2><p>It expires in ${expires}. If you did not request this, ignore this email.</p>` })
  return true
}

export async function sendStaffInvite({ to, name, businessId, password }) {
  if (!configured()) return false
  await transport().sendMail({ from: `Stockroom Business <${process.env.SMTP_USER}>`, to, subject: 'Your Stockroom staff account', text: `Hello ${name},\n\nYou have been added to Stockroom business ${businessId}.\nEmail: ${to}\nTemporary password: ${password}\n\nSign in online once before using the app offline, then change your password.`, html: `<p>Hello ${name},</p><p>You have been added to Stockroom business <b>${businessId}</b>.</p><p>Email: ${to}<br>Temporary password: ${password}</p><p>Sign in online once before using the app offline, then change your password.</p>` })
  return true
}
