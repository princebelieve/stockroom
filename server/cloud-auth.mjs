import { getCloudConfiguration } from './sync.mjs'

async function request(path, payload) {
  const { url } = await getCloudConfiguration()
  if (!url) throw new Error('Cloud authentication has not been configured for this installation.')
  const response = await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Cloud authentication request failed.')
  return body
}

export async function cloudLogin(email, password) { return request('/v1/auth/login', { email, password }) }
export async function cloudLoginAt(syncApiUrl, email, password) {
  const url = String(syncApiUrl || '').trim().replace(/\/$/, '')
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Enter a valid HTTPS Render URL.')
  const response = await fetch(`${url}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not confirm the cloud owner account.')
  return body
}
export async function cloudRegisterAt(syncApiUrl, input) {
  const url = String(syncApiUrl || '').trim().replace(/\/$/, '')
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Enter a valid HTTPS Render URL.')
  const response = await fetch(`${url}/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not create the cloud owner account.')
  return body
}
export async function cloudRegister(input) {
  const { businessId } = await getCloudConfiguration()
  if (!businessId) throw new Error('This installation needs a business ID before its cloud owner can be created.')
  return request('/v1/auth/register', { businessId, ownerName: input.ownerName, email: input.email, password: input.password })
}
export async function cloudCreateStaff(accessToken, input) {
  const { url } = await getCloudConfiguration()
  if (!url) throw new Error('Cloud authentication has not been configured for this installation.')
  const response = await fetch(`${url}/v1/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not create cloud staff account.')
  return body
}
export async function cloudEnrollDevice(syncApiUrl, accessToken, input) {
  const url = String(syncApiUrl || '').trim().replace(/\/$/, '')
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Enter a valid HTTPS Render URL.')
  if (!accessToken) throw new Error('Sign in online again before enrolling this device.')
  const response = await fetch(`${url}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not enroll this device with cloud sync.')
  return body
}
export async function cloudEnrollDeviceAsInstaller(syncApiUrl, adminApiKey, input) {
  const url = String(syncApiUrl || '').trim().replace(/\/$/, '')
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Enter a valid HTTPS Render URL.')
  if (!adminApiKey) throw new Error('Your Installer Admin API key is required.')
  const response = await fetch(`${url}/v1/admin/devices`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminApiKey }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not activate this installation.')
  return body
}
export async function cloudPasswordResetRequest(email) { return request('/v1/auth/password-reset/request', { email }) }
export async function cloudPasswordResetConfirm(token, password) { return request('/v1/auth/password-reset/confirm', { token, password }) }
