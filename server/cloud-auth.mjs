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
export async function cloudPasswordResetRequest(email) { return request('/v1/auth/password-reset/request', { email }) }
export async function cloudPasswordResetConfirm(token, password) { return request('/v1/auth/password-reset/confirm', { token, password }) }
