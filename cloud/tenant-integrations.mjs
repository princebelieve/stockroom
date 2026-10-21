import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const keyFromEnv = (env, scope = 'business') => {
  const key = encryptionKeyValues(env, scope).map(value => Buffer.from(value, 'base64')).find(value => value.length === 32)
  if (!key) throw new Error('Business integration credential encryption is not configured. Ask Stockroom support to finish secure integration setup.')
  return key
}
function encryptionKeyValues(env, scope = 'business') {
  const values = scope === 'paystack' ? [env.PAYSTACK_CREDENTIALS_ENCRYPTION_KEY, env.BUSINESS_INTEGRATIONS_ENCRYPTION_KEY] : [env.BUSINESS_INTEGRATIONS_ENCRYPTION_KEY, env.PAYSTACK_CREDENTIALS_ENCRYPTION_KEY]
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
}

function encrypt(value, env, scope = 'business') {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFromEnv(env, scope), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { version: 1, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

function decrypt(value, env, scope = 'business') {
  let lastError
  for (const encodedKey of encryptionKeyValues(env, scope)) {
    try {
      const key = Buffer.from(encodedKey, 'base64')
      if (key.length !== 32) continue
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
      return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')
    } catch (error) { lastError = error }
  }
  throw lastError || new Error('Business integration credential encryption is not configured. Ask Stockroom support to finish secure integration setup.')
}

function validEmail(value) { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '')) && String(value).length <= 254 }

export function createTenantIntegrations({ database, env = process.env, fetcher = fetch }) {
  const collection = database.collection('business_integrations')
  const legacy = (() => { try { return JSON.parse(env.POS_PAYSTACK_CONFIG_JSON || '{}') } catch { return {} } })()

  async function paystackConfig(businessId) {
    const saved = await collection.findOne({ businessId, provider: 'paystack' })
    if (saved?.active && saved.secret) return { secretKey: decrypt(saved.secret, env, 'paystack'), terminalId: saved.terminalId || '', customerCode: saved.customerCode || '' }
    if (saved) return null
    // One-way compatibility during migration from the old Render JSON setting.
    const config = legacy[businessId]
    if (config && /^sk_(test|live)_/.test(config.secretKey || '')) return { secretKey: config.secretKey, terminalId: config.terminalId || '', customerCode: config.customerCode || '' }
    return null
  }

  async function publicPaystack(businessId) {
    const saved = await collection.findOne({ businessId, provider: 'paystack' })
    if (!saved) {
      const old = legacy[businessId]
      return { connected: Boolean(old && /^sk_(test|live)_/.test(old.secretKey || '')), testMode: Boolean(old?.secretKey?.startsWith('sk_test_')), terminalConnected: Boolean(old?.terminalId && old?.customerCode), migrated: false }
    }
    return { connected: saved.active === true, testMode: saved.testMode === true, terminalConnected: Boolean(saved.terminalId && saved.customerCode), updatedAt: saved.updatedAt || null, migrated: true }
  }

  async function connectPaystack(businessId, input) {
    const secretKey = String(input.secretKey || '').trim()
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) throw new Error('Enter the Paystack secret key from this business’s Paystack dashboard.')
    const terminalId = String(input.terminalId || '').trim()
    const customerCode = String(input.customerCode || '').trim()
    if ((terminalId && !/^[A-Za-z0-9_-]{2,100}$/.test(terminalId)) || (customerCode && !/^CUS_[A-Za-z0-9]+$/.test(customerCode))) throw new Error('Check the Paystack terminal ID and customer code.')
    if (Boolean(terminalId) !== Boolean(customerCode)) throw new Error('Enter both the terminal ID and customer code, or leave both blank for hosted payments only.')
    const response = await fetcher('https://api.paystack.co/balance', { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(12000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.status !== true) throw new Error('Paystack could not validate these credentials. Check the key and try again.')
    const now = new Date()
    await collection.updateOne({ businessId, provider: 'paystack' }, { $set: { businessId, provider: 'paystack', secret: encrypt(secretKey, env, 'paystack'), testMode: secretKey.startsWith('sk_test_'), terminalId, customerCode, active: true, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
    return { connected: true, testMode: secretKey.startsWith('sk_test_'), terminalConnected: Boolean(terminalId), updatedAt: now }
  }

  async function disconnectPaystack(businessId) {
    await collection.updateOne({ businessId, provider: 'paystack' }, { $set: { active: false, updatedAt: new Date() }, $unset: { secret: '', terminalId: '', customerCode: '' } }, { upsert: true })
    return { connected: false, testMode: false, terminalConnected: false }
  }

  function encryptionReady() { try { keyFromEnv(env); return true } catch { return false } }

  async function emailSettings(businessId) {
    const settings = await collection.findOne({ businessId, provider: 'hospitality-email' })
    return settings?.settings || { replyToEmail: '', replyToName: '', businessDisplayName: '', templates: {} }
  }

  async function saveEmailSettings(businessId, input) {
    const settings = {
      replyToEmail: String(input.replyToEmail || '').trim().toLowerCase(),
      replyToName: String(input.replyToName || '').trim().slice(0, 100),
      businessDisplayName: String(input.businessDisplayName || '').trim().slice(0, 100),
      templates: Object.fromEntries(['confirmation', 'reminder', 'cancelled', 'no-show', 'waitlist-offer'].map(type => [type, String(input.templates?.[type] || '').trim().slice(0, 1000)])),
    }
    if (settings.replyToEmail && !validEmail(settings.replyToEmail)) throw new Error('Enter a valid business reply-to email address.')
    await collection.updateOne({ businessId, provider: 'hospitality-email' }, { $set: { businessId, provider: 'hospitality-email', settings, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
    return settings
  }

  const channexAriLimiter = database.collection('channex_api_rate_limits')
  const channexApiBase = () => {
    const configured = String(env.CHANNEX_API_BASE_URL || 'https://app.channex.io/api/v1').replace(/\/$/, '')
    let parsed
    try { parsed = new URL(configured) } catch { throw new Error('CHANNEX_API_BASE_URL must be the Channex staging or production API URL.') }
    if (parsed.protocol !== 'https:' || !['app.channex.io', 'staging.channex.io'].includes(parsed.hostname) || parsed.pathname.replace(/\/$/, '') !== '/api/v1' || parsed.search || parsed.hash) throw new Error('CHANNEX_API_BASE_URL must be https://app.channex.io/api/v1 or https://staging.channex.io/api/v1.')
    return `${parsed.origin}/api/v1`
  }
  const channexWebBase = () => channexApiBase().replace(/\/api\/v1$/, '')
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function waitForChannexAriSlot(id, intervalMs) {
    for (;;) {
      const now = new Date(), leaseUntil = new Date(now.getTime() + intervalMs)
      const updated = await channexAriLimiter.updateOne({ _id: id, leaseUntil: { $lte: now } }, { $set: { leaseUntil } })
      if (updated.modifiedCount) return
      const existing = await channexAriLimiter.findOne({ _id: id })
      if (!existing) {
        try { await channexAriLimiter.insertOne({ _id: id, leaseUntil: now }); return }
        catch (error) { if (error?.code !== 11000) throw error }
      }
      await delay(Math.max(50, Math.min(intervalMs, Date.parse(existing?.leaseUntil || now) - Date.now())))
    }
  }
  async function channexRequest(apiKey, path, method = 'GET', body) {
    const isAri = method === 'POST' && ['availability', 'restrictions'].includes(path)
    const url = `${channexApiBase()}/${path}`
    const serializedBody = body ? JSON.stringify(body) : ''
    if (isAri && Buffer.byteLength(serializedBody) >= 9_500_000) throw new Error('This Channex ARI batch is too large for the provider payload limit. Reduce the mapped room types or split the operation before retrying.')
    for (let attempt = 0; attempt < (isAri ? 4 : 1); attempt++) {
      if (isAri) {
        const propertyId = String(body?.values?.[0]?.property_id || 'unknown')
        await waitForChannexAriSlot('shared-ari-write', 3100)
        await waitForChannexAriSlot(`${path}:${propertyId}`, 6100)
      }
      let response
      try {
        response = await fetcher(url, {
          method,
          headers: { 'user-api-key': apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: serializedBody } : {}),
          signal: AbortSignal.timeout(15000),
        })
      } catch (error) {
        if (isAri && attempt < 3) { await delay(Math.min(30_000, 1000 * (2 ** attempt))); continue }
        throw error
      }
      const result = await response.json().catch(() => ({}))
      if (isAri && response.status === 429) {
        const error = new Error(String(result.errors?.title || 'Channex rate limit reached; the queued update will retry after the cooldown.'))
        error.statusCode = 429
        throw error
      }
      if (isAri && response.status >= 500 && attempt < 3) {
        const retryAfter = Number(response.headers?.get?.('retry-after'))
        await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : Math.min(30_000, 1000 * (2 ** attempt)))
        continue
      }
      if (!response.ok || result.errors) throw new Error(response.status === 401 ? 'Channex rejected this API key. Check the key and its property access.' : String(result.errors?.title || result.meta?.message || 'Channex could not complete the request.'))
      if (Array.isArray(result.meta?.warnings) && result.meta.warnings.length) throw new Error(`Channex rejected ${result.meta.warnings.length} availability or rate update(s). Correct the property or rate mappings and retry.`)
      return result.data
    }
    throw new Error('Channex ARI update failed after retries.')
  }

  function managedChannexKey() { const key = String(env.CHANNEX_API_KEY || '').trim(); return key.length >= 20 && key.length <= 512 && !/[\r\n]/.test(key) ? key : '' }
  function channexKey(saved, property) {
    if (property?.connectionMode === 'stockroom-managed') {
      const key = managedChannexKey()
      if (key.length < 20 || key.length > 512) throw new Error('Stockroom-managed Channex access is not configured on this server.')
      return key
    }
    if (saved?.secret) return decrypt(saved.secret, env, 'business')
    throw new Error('Connect a Channex property first.')
  }

  async function channexProperty(businessId, branchId, input = {}) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true })
    const property = (saved?.properties || []).find(item => item.branchId === branchId)
    if (!property) throw new Error('Connect a Channex property to this Stockroom branch first.')
    const apiKey = channexKey(saved, property), propertyId = encodeURIComponent(property.propertyId)
    const [externalRooms, externalRates] = await Promise.all([
      channexRequest(apiKey, `room_types?filter[property_id]=${propertyId}&pagination[limit]=100`),
      channexRequest(apiKey, `rate_plans?filter[property_id]=${propertyId}&pagination[limit]=100`),
    ])
    if (input.mappings) {
      const roomIds = new Set((externalRooms || []).map(row => row.id)), ratePlansById = new Map((externalRates || []).map(row => [row.id, row.relationships?.room_type?.data?.id || '']))
      const mappings = input.mappings.flatMap(row => {
        const roomType = String(row.roomType || '').trim().slice(0, 100), providerRoomTypeId = String(row.providerRoomTypeId || '')
        const planRows = Array.isArray(row.providerRatePlans) ? row.providerRatePlans.map(plan => ({ id: String(plan.id || ''), adjustment: Number(plan.adjustmentPercent || 0) })) : (Array.isArray(row.providerRatePlanIds) ? row.providerRatePlanIds.map(id => ({ id: String(id), adjustment: 0 })) : [String(row.providerRatePlanId || '')].filter(Boolean).map(id => ({ id, adjustment: 0 })))
        return planRows.map(plan => ({ roomType, providerRoomTypeId, providerRatePlanId: plan.id, providerRatePlanAdjustment: plan.adjustment }))
      })
      if (mappings.length > 500 || mappings.some(row => !row.roomType || !roomIds.has(row.providerRoomTypeId) || !ratePlansById.has(row.providerRatePlanId) || ratePlansById.get(row.providerRatePlanId) && ratePlansById.get(row.providerRatePlanId) !== row.providerRoomTypeId || !Number.isFinite(row.providerRatePlanAdjustment) || row.providerRatePlanAdjustment < -99 || row.providerRatePlanAdjustment > 500)) throw new Error('Choose valid Channex room types and rate plans, with a rate adjustment from -99% to 500%.')
      const pairKeys = mappings.map(row => `${row.roomType.toLocaleLowerCase()}|${row.providerRatePlanId}`), typeRoomKeys = new Map()
      for (const row of mappings) {
        const key = row.roomType.toLocaleLowerCase(), prior = typeRoomKeys.get(key)
        if (prior && prior !== row.providerRoomTypeId) throw new Error(`Map ${row.roomType} to one Channex room type, then select its rate plans.`)
        typeRoomKeys.set(key, row.providerRoomTypeId)
      }
      if (new Set(pairKeys).size !== mappings.length || new Set(mappings.map(row => row.providerRatePlanId)).size !== mappings.length) throw new Error('Each Channex rate plan can be mapped only once.')
      await collection.updateOne({ businessId, provider: 'channex' }, { $set: { [`properties.$[property].mappings`]: mappings, [`properties.$[property].lastFullAriSyncAt`]: null, [`properties.$[property].ariRetryAt`]: null, updatedAt: new Date() } }, { arrayFilters: [{ 'property.branchId': branchId }] })
      property.mappings = mappings
    }
    return {
      property: { id: property.propertyId, title: property.title || '', branchId, mappings: property.mappings || [], connectedAt: property.connectedAt || null, onboardingStatus: property.onboardingStatus || 'ready' },
      roomTypes: (externalRooms || []).map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, maxGuests: Number(row.attributes?.max_persons || row.attributes?.max_count_of_persons || (Number(row.attributes?.occ_adults || 0) + Number(row.attributes?.occ_children || 0))) })),
      ratePlans: (externalRates || []).map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, roomTypeId: row.relationships?.room_type?.data?.id || '' })),
    }
  }

  async function connectChannexProperty(businessId, input) {
    const current = await collection.findOne({ businessId, provider: 'channex' })
    const suppliedKey = String(input.apiKey || '').trim(), managed = !suppliedKey && Boolean(managedChannexKey()), branchId = String(input.branchId || '').trim(), propertyId = String(input.propertyId || '').trim()
    const apiKey = managed ? managedChannexKey() : suppliedKey || (current?.secret ? decrypt(current.secret, env, 'business') : '')
    if (apiKey.length < 20 || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw new Error('Enter a valid Channex API key.')
    if (!branchId || !/^[0-9a-f-]{36}$/i.test(propertyId)) throw new Error('Choose a Stockroom branch and enter the Channex property ID.')
    const propertyData = await channexRequest(apiKey, `properties/${encodeURIComponent(propertyId)}`)
    const attributes = propertyData?.attributes || {}
    if (propertyData?.id !== propertyId || attributes.is_active === false) throw new Error('That Channex property is unavailable or inactive for this API key.')
    const [externalRooms, externalRates] = await Promise.all([
      channexRequest(apiKey, `room_types?filter[property_id]=${encodeURIComponent(propertyId)}&pagination[limit]=100`),
      channexRequest(apiKey, `rate_plans?filter[property_id]=${encodeURIComponent(propertyId)}&pagination[limit]=100`),
    ])
    const otherTenant = await collection.findOne({ provider: 'channex', active: true, businessId: { $ne: businessId }, 'properties.propertyId': propertyId })
    if (otherTenant) throw new Error('This Channex property is already connected to another Stockroom business.')
    const properties = (current?.properties || []).filter(item => item.branchId !== branchId)
    if (properties.some(item => item.propertyId === propertyId)) throw new Error('This Channex property is already connected to another branch in this Stockroom business.')
    const oldProperty = current?.properties?.find(item => item.branchId === branchId)
    properties.push({ branchId, propertyId, title: String(attributes.title || '').slice(0, 255), connectionMode: managed ? 'stockroom-managed' : 'business-owned', connectedAt: new Date(), mappings: oldProperty?.propertyId === propertyId ? oldProperty.mappings || [] : [] })
    const update = { $set: { businessId, provider: 'channex', active: true, properties, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }
    if (!managed) update.$set.secret = encrypt(apiKey, env, 'business')
    await collection.updateOne({ businessId, provider: 'channex' }, update, { upsert: true })
    return {
      property: { id: propertyId, title: String(attributes.title || '').slice(0, 255), branchId, mappings: properties.find(item => item.branchId === branchId)?.mappings || [], connectedAt: new Date() },
      roomTypes: (externalRooms || []).map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, maxGuests: Number(row.attributes?.max_persons || row.attributes?.max_count_of_persons || (Number(row.attributes?.occ_adults || 0) + Number(row.attributes?.occ_children || 0))) })),
      ratePlans: (externalRates || []).map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, roomTypeId: row.relationships?.room_type?.data?.id || '' })),
    }
  }

  async function onboardChannexProperty(businessId, input) {
    const apiKey = managedChannexKey()
    if (!apiKey) throw new Error('Stockroom-managed Channex onboarding is not configured on this server.')
    const branchId = String(input.branchId || '').trim()
    const details = input.property || {}
    const property = {
      title: String(details.title || '').trim().slice(0, 255),
      currency: String(details.currency || '').trim().toUpperCase(),
      email: String(details.email || '').trim().toLowerCase(),
      phone: String(details.phone || '').trim(),
      country: String(details.country || '').trim().toUpperCase(),
      state: String(details.state || '').trim(),
      city: String(details.city || '').trim(),
      address: String(details.address || '').trim(),
      zip_code: String(details.postalCode || '').trim(),
      timezone: String(details.timezone || '').trim(),
      property_type: 'hotel',
    }
    let timezoneValid = false
    try { new Intl.DateTimeFormat('en-US', { timeZone: property.timezone }); timezoneValid = true } catch {}
    if (!branchId || !property.title || !/^[A-Z]{3}$/.test(property.currency) || !validEmail(property.email) || property.phone.length < 5 || property.phone.length > 32 || !/^[A-Z]{2}$/.test(property.country) || !property.state || !property.city || !property.address || !property.zip_code || !timezoneValid) throw new Error('Enter the hotel name, valid business contact details, full address, postal code, and IANA time zone before connecting its channels.')
    const roomTypes = Array.isArray(input.roomTypes) ? input.roomTypes.map(row => ({
      title: String(row.title || '').trim().slice(0, 255),
      count: Number(row.count),
      occupancy: Number(row.occupancy),
    })) : []
    if (!roomTypes.length || roomTypes.length > 100 || roomTypes.some(row => !row.title || !Number.isInteger(row.count) || row.count < 1 || !Number.isInteger(row.occupancy) || row.occupancy < 1 || row.occupancy > 20) || new Set(roomTypes.map(row => row.title.toLocaleLowerCase())).size !== roomTypes.length) throw new Error('Add at least one active room type with a unique name and valid room count and guest capacity before connecting channels.')

    const current = await collection.findOne({ businessId, provider: 'channex' })
    let savedProperty = (current?.properties || []).find(item => item.branchId === branchId)
    if (savedProperty && savedProperty.onboardingStatus !== 'creating-inventory' && savedProperty.connectionMode !== 'stockroom-managed') throw new Error('This Stockroom branch already has a business-owned Channex property.')
    const occupied = async propertyId => Boolean(await collection.findOne({ provider: 'channex', active: true, businessId: { $ne: businessId }, 'properties.propertyId': propertyId }))
    const persist = async item => {
      await collection.updateOne({ businessId, provider: 'channex' }, { $set: { active: true, updatedAt: new Date() }, $setOnInsert: { businessId, provider: 'channex', properties: [], createdAt: new Date() } }, { upsert: true })
      const updated = await collection.updateOne({ businessId, provider: 'channex', 'properties.branchId': branchId }, { $set: { 'properties.$[target]': item, updatedAt: new Date() } }, { arrayFilters: [{ 'target.branchId': branchId }] })
      if (!updated.matchedCount) {
        const inserted = await collection.updateOne({ businessId, provider: 'channex', 'properties.branchId': { $ne: branchId } }, { $push: { properties: item }, $set: { active: true, updatedAt: new Date() } })
        if (!inserted.modifiedCount) throw new Error('Another channel setup for this Stockroom branch just changed. Refresh the page and retry.')
      }
      return item
    }
    const readInventory = async propertyId => {
      const [externalRooms, externalRates] = await Promise.all([
        channexRequest(apiKey, `room_types?filter[property_id]=${encodeURIComponent(propertyId)}&pagination[limit]=100`),
        channexRequest(apiKey, `rate_plans?filter[property_id]=${encodeURIComponent(propertyId)}&pagination[limit]=100`),
      ])
      return { externalRooms: externalRooms || [], externalRates: externalRates || [] }
    }

    // Recover a property if Channex created it but the previous response was lost.
    const candidates = await channexRequest(apiKey, 'properties/options')
    const titled = (candidates || []).filter(row => (row.attributes?.title || '') === property.title)
    const candidateDetails = await Promise.all(titled.map(row => channexRequest(apiKey, `properties/${encodeURIComponent(row.id)}`)))
    const matching = candidateDetails.filter(row => String(row.attributes?.email || '').toLowerCase() === property.email && String(row.attributes?.address || '').toLowerCase() === property.address.toLowerCase() && String(row.attributes?.city || '').toLowerCase() === property.city.toLowerCase())
    if (matching.length > 1) throw new Error('More than one Channex property matches these hotel details. Ask Stockroom support to resolve the duplicate before continuing.')
    let propertyRow = savedProperty ? await channexRequest(apiKey, `properties/${encodeURIComponent(savedProperty.propertyId)}`) : matching[0]
    if (savedProperty && (!propertyRow?.id || propertyRow.id !== savedProperty.propertyId || propertyRow.attributes?.is_active === false)) throw new Error('The partially created Channex property is no longer accessible. Restore its Stockroom access or disconnect it before retrying.')
    if (propertyRow && await occupied(propertyRow.id)) throw new Error('A Channex property with these details is already connected to another Stockroom business.')
    if (!propertyRow) {
      const created = await channexRequest(apiKey, 'properties', 'POST', { property })
      propertyRow = created
      if (!propertyRow?.id) throw new Error('Channex created no usable property record. Refresh the page and retry onboarding.')
    }
    savedProperty = await persist({ ...(savedProperty || {}), branchId, propertyId: propertyRow.id, title: String(propertyRow.attributes?.title || property.title).slice(0, 255), connectionMode: 'stockroom-managed', connectedAt: savedProperty?.connectedAt || new Date(), onboardingStatus: 'creating-inventory', mappings: savedProperty?.mappings || [] })
    const { externalRooms, externalRates } = await readInventory(propertyRow.id)
    const mappings = [...(savedProperty.mappings || [])]
    for (const local of roomTypes) {
      let room = externalRooms.find(row => String(row.attributes?.title || '').toLocaleLowerCase() === local.title.toLocaleLowerCase())
      if (!room) {
        room = await channexRequest(apiKey, 'room_types', 'POST', { room_type: { property_id: propertyRow.id, title: local.title, count_of_rooms: local.count, occ_adults: local.occupancy, occ_children: 0 } })
        if (!room?.id) throw new Error(`Channex did not return a room type for “${local.title}”. Retry onboarding to continue.`)
        externalRooms.push(room)
      } else if (Number(room.attributes?.count_of_rooms) !== local.count || Number(room.attributes?.occ_adults) !== local.occupancy) {
        const updated = await channexRequest(apiKey, `room_types/${encodeURIComponent(room.id)}`, 'PUT', { room_type: { title: local.title, count_of_rooms: local.count, occ_adults: local.occupancy, occ_children: 0, occ_infants: 0, default_occupancy: local.occupancy } })
        if (!updated?.id) throw new Error(`Channex did not confirm inventory changes for ${local.title}. Retry synchronization.`)
        externalRooms[externalRooms.findIndex(row => row.id === room.id)] = room = updated
      }
      const rateTitle = `Stockroom Standard Rate - ${local.title}`.slice(0, 255)
      let rate = externalRates.find(row => row.relationships?.room_type?.data?.id === room.id && String(row.attributes?.title || '').toLocaleLowerCase() === rateTitle.toLocaleLowerCase())
      if (!rate) {
        rate = await channexRequest(apiKey, 'rate_plans', 'POST', { rate_plan: { title: rateTitle, property_id: propertyRow.id, room_type_id: room.id, currency: property.currency, sell_mode: 'per_room', rate_mode: 'manual', options: [{ occupancy: local.occupancy, is_primary: true }] } })
        if (!rate?.id) throw new Error(`Channex did not return a rate plan for “${local.title}”. Retry onboarding to continue.`)
        externalRates.push(rate)
      }
      const existingTypeMappings = mappings.filter(row => row.roomType.toLocaleLowerCase() === local.title.toLocaleLowerCase())
      if (existingTypeMappings.length) {
        const retained = existingTypeMappings.filter(row => row.providerRoomTypeId === room.id)
        if (!retained.some(row => row.providerRatePlanId === rate.id)) retained.push({ roomType: local.title, providerRoomTypeId: room.id, providerRatePlanId: rate.id })
        for (let index = mappings.length - 1; index >= 0; index--) if (mappings[index].roomType.toLocaleLowerCase() === local.title.toLocaleLowerCase()) mappings.splice(index, 1)
        mappings.push(...retained)
      } else mappings.push({ roomType: local.title, providerRoomTypeId: room.id, providerRatePlanId: rate.id })
      savedProperty = await persist({ ...savedProperty, mappings, onboardingStatus: 'creating-inventory' })
    }
    savedProperty = await persist({ ...savedProperty, mappings, onboardingStatus: 'ready', lastFullAriSyncAt: null, ariRetryAt: null })
    return {
      property: { id: propertyRow.id, title: String(propertyRow.attributes?.title || property.title).slice(0, 255), branchId, mappings, connectedAt: savedProperty.connectedAt },
      roomTypes: externalRooms.map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, maxGuests: Number(row.attributes?.max_persons || row.attributes?.max_count_of_persons || row.attributes?.occ_adults || 0) })),
      ratePlans: externalRates.map(row => ({ id: row.id, title: row.attributes?.title || row.attributes?.name || row.id, roomTypeId: row.relationships?.room_type?.data?.id || '' })),
      onboardingStatus: 'ready',
    }
  }

  async function publicChannex(businessId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true })
    const managed = Boolean(managedChannexKey())
    return { connected: Boolean(saved?.secret || saved?.properties?.length), encryptionConfigured: encryptionReady(), connectionMode: managed ? 'stockroom-managed' : 'business-owned', channexEnvironment: new URL(channexApiBase()).hostname === 'staging.channex.io' ? 'staging' : 'production', managedAccountEmail: String(env.CHANNEX_ACCOUNT_EMAIL || '').trim(), properties: (saved?.properties || []).map(item => ({ branchId: item.branchId, propertyId: item.propertyId, title: item.title || '', connectionMode: item.connectionMode || 'business-owned', connectedAt: item.connectedAt || null, mappedRoomTypes: (item.mappings || []).length, lastSyncAt: item.lastSyncAt || null, syncError: item.syncError || '', lastAriSyncAt: item.lastAriSyncAt || null, lastFullAriSyncAt: item.lastFullAriSyncAt || null, lastAriTaskIds: item.lastAriTaskIds || [], ariSyncError: item.ariSyncError || '' })) }
  }

  async function reconcileChannexRoomTypes(businessId, branchId, roomTypes) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), existing = saved?.properties?.find(item => item.branchId === branchId)
    if (!existing || existing.connectionMode !== 'stockroom-managed') return { reconciled: false }
    const propertyRow = await channexRequest(channexKey(saved, existing), `properties/${encodeURIComponent(existing.propertyId)}`), a = propertyRow?.attributes || {}
    if (!propertyRow?.id || propertyRow.id !== existing.propertyId) throw new Error('The connected Channex property could not be loaded to reconcile its room types.')
    await onboardChannexProperty(businessId, { branchId, property: { title: a.title, currency: a.currency, email: a.email, phone: a.phone, country: a.country || a.country_code, state: a.state, city: a.city, address: a.address, postalCode: a.zip_code, timezone: a.timezone }, roomTypes })
    return { reconciled: true }
  }

  async function discoverChannexProperties(businessId, suppliedKey = '') {
    if (!String(suppliedKey || '').trim() && managedChannexKey()) throw new Error('Stockroom-managed setup creates the channel property for each hotel branch. The shared integration account property list is not available to business workspaces.')
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true })
    const apiKey = String(suppliedKey || '').trim() || (saved?.secret ? decrypt(saved.secret, env, 'business') : '')
    if (apiKey.length < 20 || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw new Error('Enter a valid Channex API key before loading properties.')
    const rows = await channexRequest(apiKey, 'properties?pagination[limit]=100')
    return { availableProperties: (rows || []).filter(row => row.attributes?.is_active !== false).map(row => ({ id: row.id, title: row.attributes?.title || row.id })) }
  }

  async function channexRevisionFeed(businessId, branchId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property) throw new Error('The Channex property connection is unavailable.')
    const apiKey = channexKey(saved, property), propertyId = encodeURIComponent(property.propertyId)
    const revisions = await channexRequest(apiKey, `booking_revisions/feed?filter[property_id]=${propertyId}&order[inserted_at]=asc&pagination[limit]=100`)
    return { propertyId: property.propertyId, revisions: Array.isArray(revisions) ? revisions : [] }
  }

  async function channexRevision(businessId, branchId, revisionId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property || !/^[0-9a-f-]{36}$/i.test(String(revisionId || ''))) throw new Error('The Channex booking revision is unavailable for this property.')
    return await channexRequest(channexKey(saved, property), `booking_revisions/${encodeURIComponent(revisionId)}`)
  }

  async function channexMapping(businessId, branchId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property) throw new Error('The Channex property connection is unavailable.')
    return { propertyId: property.propertyId, mappings: Array.isArray(property.mappings) ? property.mappings : [], lastAriSyncAt: property.lastAriSyncAt || null, lastFullAriSyncAt: property.lastFullAriSyncAt || null, fullSyncPending: property.fullSyncPending === true, ariSyncError: property.ariSyncError || '', ariRetryAt: property.ariRetryAt || null, ariRetryCount: Number(property.ariRetryCount || 0) }
  }

  async function channexChannelSetupUrl(businessId, branchId, username) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property) throw new Error('Connect and map this hotel property before setting up its booking channels.')
    const name = String(username || '').trim().slice(0, 100)
    if (!name) throw new Error('A signed-in Stockroom staff name is required to open channel setup.')
    const payload = { one_time_token: { property_id: property.propertyId, username: name } }
    const tokenResult = await channexRequest(channexKey(saved, property), 'auth/one_time_token', 'POST', payload)
    const token = String(tokenResult?.token || '')
    if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error('Channex did not return a valid one-time channel setup token.')
    const query = new URLSearchParams({ oauth_session_key: token, app_mode: 'headless', redirect_to: '/channels', property_id: property.propertyId })
    return { channelSetupUrl: `${channexWebBase()}/auth/exchange?${query.toString()}`, expiresInSeconds: 900 }
  }

  async function updateChannexAvailability(businessId, branchId, values) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property || !Array.isArray(values) || values.length > 50000 || values.some(row => row.property_id !== property.propertyId)) throw new Error('The channel availability update is invalid for this property.')
    return await channexRequest(channexKey(saved, property), 'availability', 'POST', { values })
  }

  async function updateChannexRates(businessId, branchId, values) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property || !Array.isArray(values) || values.length > 50000 || values.some(row => row.property_id !== property.propertyId)) throw new Error('The channel rate update is invalid for this property.')
    return await channexRequest(channexKey(saved, property), 'restrictions', 'POST', { values })
  }

  async function updateChannexAriStatus(businessId, branchId, ariSyncError = '', { fullSync = false, failed = false, retryAt = null, retryCount = 0, taskIds = [] } = {}) {
    const now = new Date(), path = 'properties.$[property]', set = { [`${path}.ariSyncError`]: String(ariSyncError || '').slice(0, 300), updatedAt: now }
    if (failed) {
      set[`${path}.ariRetryAt`] = retryAt
      set[`${path}.ariRetryCount`] = retryCount
      set[`${path}.lastAriTaskIds`] = taskIds.slice(0, 10)
      if (fullSync) set[`${path}.fullSyncPending`] = true
    } else {
      set[`${path}.lastAriSyncAt`] = now
      set[`${path}.ariRetryAt`] = null
      set[`${path}.ariRetryCount`] = 0
      set[`${path}.lastAriTaskIds`] = taskIds.slice(0, 10)
      if (fullSync) { set[`${path}.lastFullAriSyncAt`] = now; set[`${path}.fullSyncPending`] = false }
    }
    await collection.updateOne({ businessId, provider: 'channex', active: true, 'properties.branchId': branchId }, { $set: set }, { arrayFilters: [{ 'property.branchId': branchId }] })
  }

  async function acknowledgeChannexRevision(businessId, branchId, revisionId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true }), property = saved?.properties?.find(item => item.branchId === branchId)
    if (!property || !/^[0-9a-f-]{36}$/i.test(revisionId)) throw new Error('The Channex revision cannot be acknowledged for this property.')
    await channexRequest(channexKey(saved, property), `booking_revisions/${encodeURIComponent(revisionId)}/ack`, 'POST')
  }

  async function updateChannexSyncStatus(businessId, branchId, syncError = '') {
    await collection.updateOne({ businessId, provider: 'channex', active: true, 'properties.branchId': branchId }, { $set: { 'properties.$[property].lastSyncAt': new Date(), 'properties.$[property].syncError': String(syncError || '').slice(0, 300), updatedAt: new Date() } }, { arrayFilters: [{ 'property.branchId': branchId }] })
  }

  async function disconnectChannexProperty(businessId, branchId) {
    const saved = await collection.findOne({ businessId, provider: 'channex', active: true })
    if (!saved) return { removed: false }
    const properties = (saved.properties || []).filter(item => item.branchId !== branchId)
    if (!properties.length) await collection.updateOne({ businessId, provider: 'channex' }, { $set: { active: false, properties: [], updatedAt: new Date() }, $unset: { secret: '' } })
    else await collection.updateOne({ businessId, provider: 'channex' }, { $set: { properties, updatedAt: new Date() } })
    return { removed: true }
  }

  return { paystackConfig, publicPaystack, connectPaystack, disconnectPaystack, encryptionReady, emailSettings, saveEmailSettings, channexProperty, connectChannexProperty, onboardChannexProperty, reconcileChannexRoomTypes, publicChannex, discoverChannexProperties, channexRevisionFeed, channexRevision, channexMapping, channexChannelSetupUrl, updateChannexAvailability, updateChannexRates, updateChannexAriStatus, acknowledgeChannexRevision, updateChannexSyncStatus, disconnectChannexProperty }
}
