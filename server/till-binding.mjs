export async function registerCheckoutTill(config, tillId, fetcher = fetch) {
  if (!tillId) return
  const url = config.url || config.syncApiUrl
  const token = config.token || config.deviceToken
  if (!url || !token) throw new Error('Enroll this device before registering its checkout.')
  const response = await fetcher(`${url}/v1/till-recovery/bind`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tillId }), signal: AbortSignal.timeout(10000) })
  // Ordinary synchronization remains compatible while the server is upgraded.
  if (response.status === 404) return
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Checkout registration failed.')
  return data
}
