import { createHash } from 'node:crypto'
import { defaultHotelFolio } from '../server/hotel-folios.mjs'
import { hotelRoomOutOfOrder, hotelRoomBlockActive, hotelNightlyRates, validateHospitalityRecord } from '../server/hospitality-operations.mjs'
import { normalizeShopProfile } from '../server/shop-profile.mjs'
import { businessDate } from '../server/report-timezone.mjs'

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
const clean = (value, limit = 200) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
const cents = value => Math.round(Number(value) * 100) / 100
const normalized = value => String(value || '').trim().toLocaleLowerCase()

export function createChannexBookingSync({ database, entityHeads, operations, tenantIntegrations, serialize, calendarBlocks }) {
  const settings = database.collection('business_settings')
  const integrations = database.collection('business_integrations')
  const calendarSources = database.collection('hotel_calendar_sources')
  let running = false

  async function storeStay(businessId, stay, previous) {
    validateHospitalityRecord(stay, previous?.payload || previous, { trustedChannelUpdate: true })
    const now = new Date(), operationId = `channex:${stay.channelRevisionId}:${stay.id}`
    const head = { businessId, entityType: 'pos_record', entityId: stay.id, operationId, deviceId: 'channex', payload: stay, updatedAt: stay.updatedAt, receivedAt: now }
    const filter = { businessId, entityType: 'pos_record', entityId: stay.id }
    const result = previous
      ? await entityHeads.updateOne({ ...filter, operationId: previous.operationId }, { $set: { ...head } })
      : await entityHeads.updateOne(filter, { $setOnInsert: head }, { upsert: true })
    if (previous && !result.modifiedCount) throw new Error('The hotel reservation changed while the channel update was being saved. Retry the channel sync.')
    if (!previous && !result.upsertedCount) throw new Error('A hotel reservation with this channel reference already exists. Review it before importing.')
    await operations.updateOne({ businessId, operationId }, { $setOnInsert: { ...head, action: 'upsert', createdAt: now } }, { upsert: true })
  }

  async function processRevision(businessId, branchId, propertyId, revision, mappings) {
    const value = revision?.attributes || revision || {}, revisionId = String(revision?.id || value.id || ''), bookingId = String(value.booking_id || '')
    if (!/^[0-9a-f-]{36}$/i.test(revisionId) || !/^[0-9a-f-]{36}$/i.test(bookingId) || value.property_id && value.property_id !== propertyId) throw new Error('Channex returned a reservation with an invalid property or revision reference.')
    if (!['new', 'modified', 'cancelled'].includes(value.status)) throw new Error('Channex returned an unsupported reservation change.')
    const stays = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.source': 'channex', 'payload.channelPropertyId': propertyId, 'payload.channelBookingId': bookingId }).toArray()
    const byRoomKey = new Map(stays.map(row => [row.payload.channelBookingRoomId, row]))
    if (value.status === 'cancelled') {
      if (!stays.length) return
      for (const row of stays) {
        const prior = row.payload
        if (prior.status === 'cancelled') { if (prior.channelRevisionId === revisionId) await storeStay(businessId, prior, row); continue }
        if (prior.status !== 'booked') throw new Error('A channel cancellation affects a stay that is already checked in or checked out. Resolve it with the front desk before acknowledging the channel change.')
        const activeInvoice = await entityHeads.findOne({ businessId, entityType: 'pos_record', 'payload.kind': 'service-job', 'payload.hospitality.recordId': prior.id, 'payload.status': { $ne: 'cancelled' } })
        if (activeInvoice) throw new Error('Cancel or refund this stay’s active folio before acknowledging its channel cancellation.')
        const cancelledAt = new Date().toISOString(), next = { ...prior, status: 'cancelled', channelRevisionId: revisionId, channelUpdatedAt: cancelledAt, updatedAt: cancelledAt, expectedUpdatedAt: prior.updatedAt }
        validateHospitalityRecord(next, prior, { trustedChannelUpdate: true })
        await storeStay(businessId, next, row)
      }
      return
    }

    const bookingRooms = Array.isArray(value.rooms) ? value.rooms : []
    if (!bookingRooms.length || bookingRooms.length > 50) throw new Error('The channel reservation has no rooms or exceeds the 50-room group import limit.')
    const expectedRoomKeys = bookingRooms.map((room, index) => clean(room.ota_unique_id || room.booking_room_id || `${room.room_type_id}:${index}`, 160))
    if (stays.length && stays.every(row => row.payload.channelRevisionId === revisionId) && expectedRoomKeys.every(key => byRoomKey.has(key))) { for (const row of stays) await storeStay(businessId, row.payload, row); return }
    const checkIn = String(value.arrival_date || ''), checkOut = String(value.departure_date || '')
    if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) throw new Error('The channel reservation has invalid arrival or departure dates.')
    const stayNights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000
    if (stayNights > 366) throw new Error('The channel reservation exceeds Stockroom’s 366-night stay limit.')
    const mappingByProvider = new Map(mappings.map(mapping => [mapping.providerRoomTypeId, mapping]))
    const business = await settings.findOne({ businessId }, { projection: { 'settings.currency': 1, currency: 1 } })
    const currency = String(business?.settings?.currency || business?.currency || 'USD').toUpperCase()
    const otaCurrency = String(value.currency || currency).toUpperCase()
    if (otaCurrency !== currency) throw new Error(`This reservation is in ${otaCurrency}; Stockroom is configured for ${currency}. Resolve the currency difference before importing it.`)
    const branchRooms = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room', 'payload.branchId': branchId }).toArray()
    const branchStays = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.branchId': branchId, 'payload.status': { $in: ['booked', 'checked-in'] } }).toArray()
    const holds = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room-block', 'payload.branchId': branchId, 'payload.status': 'held' }).toArray()
    const latestClose = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-day-close', 'payload.branchId': branchId }).sort({ 'payload.businessDate': -1 }).limit(1).toArray()
    if (latestClose.length && checkIn <= latestClose[0].payload.businessDate) throw new Error('This channel reservation starts on or before the latest closed hotel business date.')
    const customer = value.customer || {}, guestName = clean([customer.name, customer.surname].filter(Boolean).join(' '), 200) || 'Channel guest'
    const guestPhone = clean(customer.phone, 80), suppliedEmail = clean(customer.mail, 254).toLowerCase(), guestEmail = /^\S+@\S+\.\S+$/.test(suppliedEmail) ? suppliedEmail : ''
    const occupiedInBatch = new Set(), proposed = []
    for (let index = 0; index < bookingRooms.length; index++) {
      const channelRoom = bookingRooms[index], mapping = mappingByProvider.get(String(channelRoom.room_type_id || ''))
      if (!mapping || channelRoom.rate_plan_id && channelRoom.rate_plan_id !== mapping.providerRatePlanId) throw new Error('Map every channel room type and rate plan to a Stockroom room type before importing reservations.')
      const roomKey = clean(channelRoom.ota_unique_id || channelRoom.booking_room_id || `${channelRoom.room_type_id}:${index}`, 160)
      const priorRow = byRoomKey.get(roomKey), prior = priorRow?.payload
      if (prior && prior.status !== 'booked') throw new Error('A channel update affects a stay that is already checked in, checked out, cancelled or marked no-show. Resolve it with the front desk before acknowledging the channel change.')
      if (prior) {
        const activeInvoice = await entityHeads.findOne({ businessId, entityType: 'pos_record', 'payload.kind': 'service-job', 'payload.hospitality.recordId': prior.id, 'payload.status': { $ne: 'cancelled' } })
        if (activeInvoice) throw new Error('A channel update affects a stay with an active folio. Resolve the folio before acknowledging the channel change.')
      }
      const checkIn = String(channelRoom.checkin_date || value.arrival_date || ''), checkOut = String(channelRoom.checkout_date || value.departure_date || '')
      if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) throw new Error('The channel reservation has invalid arrival or departure dates.')
      const occupancy = channelRoom.occupancy || value.occupancy || {}, guestCount = Number(occupancy.adults || 0) + Number(occupancy.children || 0) + Number(occupancy.infants || 0)
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) throw new Error('The channel reservation has an unsupported guest count.')
      const candidates = branchRooms.map(row => row.payload).filter(room => room.status === 'active' && normalized(room.roomType || 'Standard') === normalized(mapping.roomType) && Number(room.maxGuests || 2) >= guestCount && !hotelRoomOutOfOrder(room, checkIn, checkOut) && !branchStays.some(stay => stay.entityId !== prior?.id && stay.payload.roomId === room.id && checkIn < stay.payload.checkOut && checkOut > stay.payload.checkIn) && !holds.some(hold => hotelRoomBlockActive(hold.payload) && hold.payload.rooms.some(item => item.roomId === room.id) && checkIn < hold.payload.checkOut && checkOut > hold.payload.checkIn) && !occupiedInBatch.has(room.id))
      const usable = prior && candidates.find(room => room.id === prior.roomId) || candidates[0]
      if (!usable) throw new Error(`No active ${mapping.roomType} room with enough capacity is available for ${checkIn} to ${checkOut}. Resolve the room conflict before acknowledging this reservation.`)
      const externalBlocks = await calendarBlocks(businessId, usable.id)
      const otaName = normalized(value.ota_name), conflictingCalendar = externalBlocks.find(block => {
        const sourceName = normalized(block.sourceName), sameChannel = otaName && sourceName && (otaName === sourceName || otaName.includes(sourceName) || sourceName.includes(otaName))
        return sourceName && !sameChannel && checkIn < block.checkOut && checkOut > block.checkIn
      })
      if (conflictingCalendar) throw new Error(`Room ${usable.roomName} conflicts with another connected booking calendar. Review the overlap before importing.`)
      occupiedInBatch.add(usable.id)
      const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000
      const localRates = Array.from({ length: nights }, (_, offset) => {
        const date = new Date(Date.parse(`${checkIn}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10), period = (usable.ratePeriods || []).find(row => row.startDate <= date && date <= row.endDate)
        return { date, nightlyRate: cents(period?.nightlyRate ?? usable.nightlyRate) }
      })
      const hasDailyRates = channelRoom.days && typeof channelRoom.days === 'object' && localRates.every(night => Number.isFinite(Number(channelRoom.days[night.date])) && Number(channelRoom.days[night.date]) > 0)
      const roomTotalValue = channelRoom.amount ?? (bookingRooms.length === 1 ? value.amount : undefined)
      const roomTotal = roomTotalValue === undefined ? null : cents(roomTotalValue)
      let nightlyRates
      if (hasDailyRates) nightlyRates = localRates.map(night => ({ ...night, nightlyRate: cents(channelRoom.days[night.date]) }))
      else if (roomTotal && roomTotal > 0) {
        const baseRate = cents(roomTotal / nights), rates = Array.from({ length: nights }, () => baseRate)
        rates[rates.length - 1] = cents(roomTotal - rates.slice(0, -1).reduce((sum, rate) => sum + rate, 0))
        nightlyRates = localRates.map((night, offset) => ({ ...night, nightlyRate: rates[offset] }))
      } else if (roomTotal === null) nightlyRates = localRates
      else throw new Error('The channel reservation has an invalid room total or nightly rate schedule.')
      if (nightlyRates.some(night => !Number.isFinite(night.nightlyRate) || night.nightlyRate <= 0)) throw new Error('The channel reservation has an invalid nightly rate.')
      const rateCounts = new Map()
      for (const night of nightlyRates) rateCounts.set(night.nightlyRate, (rateCounts.get(night.nightlyRate) || 0) + 1)
      const rateBreakdown = [...rateCounts].map(([nightlyRate, count]) => ({ nightlyRate, nights: count }))
      const now = new Date().toISOString(), id = prior?.id || `hotel-stay:channex_${createHash('sha256').update(`${propertyId}:${bookingId}:${roomKey}`).digest('hex')}`
      const roomMoves = [...(prior?.roomMoves || [])]
      if (prior && (prior.roomId !== usable.id || prior.roomName !== usable.roomName)) roomMoves.push({ fromRoomId: prior.roomId, fromRoomName: prior.roomName, toRoomId: usable.id, toRoomName: usable.roomName, movedAt: now, staffId: 'channex' })
      const priorWithoutEmail = prior ? Object.fromEntries(Object.entries(prior).filter(([key]) => key !== 'guestEmail')) : {}
      const stay = {
        ...priorWithoutEmail, id, kind: 'hotel-stay', branchId, roomId: usable.id, roomName: usable.roomName, guestName, guestPhone,
        ...(guestEmail ? { guestEmail } : {}), guestCount, checkIn, checkOut, nightlyRate: nightlyRates[0].nightlyRate,
        rateBreakdown, nightlyRates, depositRequired: prior?.depositRequired || 0, status: prior?.status === 'checked-in' ? prior.status : 'booked',
        folios: prior?.folios || [defaultHotelFolio({ guestName, guestPhone })], source: 'channex', channelPropertyId: propertyId,
        channelBookingId: bookingId, channelBookingRoomId: roomKey, channelRevisionId: revisionId,
        channelOtaName: clean(value.ota_name, 80), channelReservationCode: clean(value.ota_reservation_code, 120),
        channelAmount: roomTotal ?? cents(nightlyRates.reduce((sum, night) => sum + night.nightlyRate, 0)),
        channelCurrency: otaCurrency, channelCommission: index === 0 ? cents(value.ota_commission || 0) : 0, channelPaymentCollect: ['ota', 'property'].includes(value.payment_collect) ? value.payment_collect : 'unknown',
        channelUpdatedAt: now, roomMoves, createdAt: prior?.createdAt || now, updatedAt: now,
        ...(prior ? { expectedUpdatedAt: prior.updatedAt } : {}),
      }
      validateHospitalityRecord(stay, prior, { trustedChannelUpdate: true })
      proposed.push({ stay, previous: priorRow })
    }
    const removed = stays.filter(row => !proposed.some(item => item.stay.channelBookingRoomId === row.payload.channelBookingRoomId) && row.payload.status === 'booked')
    for (const row of removed) {
      const activeInvoice = await entityHeads.findOne({ businessId, entityType: 'pos_record', 'payload.kind': 'service-job', 'payload.hospitality.recordId': row.entityId, 'payload.status': { $ne: 'cancelled' } })
      if (activeInvoice) throw new Error('A room was removed from a modified channel booking but has an active folio. Resolve the folio before acknowledging the change.')
    }
    for (const item of proposed) await storeStay(businessId, item.stay, item.previous)
    for (const row of removed) {
      const now = new Date().toISOString(), prior = row.payload, cancelled = { ...prior, status: 'cancelled', channelRevisionId: revisionId, channelUpdatedAt: now, updatedAt: now, expectedUpdatedAt: prior.updatedAt }
      validateHospitalityRecord(cancelled, prior, { trustedChannelUpdate: true })
      await storeStay(businessId, cancelled, row)
    }
  }

  async function syncProperty(businessId, branchId, propertyId) {
    const business = await settings.findOne({ businessId }, { projection: { 'settings.shopProfile': 1 } })
    if (!normalizeShopProfile(business?.settings?.shopProfile).features?.hotelOperations) throw new Error('Hotel operations must be enabled before channel reservations can sync.')
    if (branchId !== 'main') {
      const branch = await entityHeads.findOne({ businessId, entityType: 'branch', entityId: branchId })
      if (!branch || branch.payload?.isActive === false) throw new Error('The Stockroom branch connected to this channel property is unavailable or inactive.')
    }
    const mapping = await tenantIntegrations.channexMapping(businessId, branchId)
    if (mapping.propertyId !== propertyId || !mapping.mappings.length) throw new Error('Map the connected property room types and rates before importing reservations.')
    const feed = await tenantIntegrations.channexRevisionFeed(businessId, branchId)
    for (const revision of feed.revisions) {
      const revisionId = String(revision?.id || revision?.attributes?.id || '')
      await serialize(businessId, async () => processRevision(businessId, branchId, propertyId, revision, mapping.mappings))
      await tenantIntegrations.acknowledgeChannexRevision(businessId, branchId, revisionId)
    }
    await tenantIntegrations.updateChannexSyncStatus(businessId, branchId, '')
    if (!mapping.lastAriSyncAt || Date.now() - Date.parse(mapping.lastAriSyncAt) >= 60_000) {
      try { await syncPropertyAri(businessId, branchId, propertyId, mapping.mappings, business?.settings?.shopProfile) }
      catch (error) { await tenantIntegrations.updateChannexAriStatus(businessId, branchId, clean(error?.message || 'Could not sync channel availability and rates.', 300)) }
    }
  }

  async function syncPropertyAri(businessId, branchId, propertyId, mappings, profile) {
    const timezone = normalizeShopProfile(profile).reportingTimeZone || 'UTC', start = businessDate(new Date(), timezone), rooms = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room', 'payload.branchId': branchId }).toArray(), stays = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.branchId': branchId, 'payload.status': { $in: ['booked', 'checked-in'] } }).toArray(), holds = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room-block', 'payload.branchId': branchId, 'payload.status': 'held' }).toArray()
    const dateList = Array.from({ length: 365 }, (_, offset) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)), availability = [], rates = [], rateErrors = [], restrictionErrors = []
    const staysByRoom = new Map(), holdsByRoom = new Map()
    for (const stay of stays) if (stay.payload.roomId) staysByRoom.set(stay.payload.roomId, [...(staysByRoom.get(stay.payload.roomId) || []), stay.payload])
    for (const block of holds) if (hotelRoomBlockActive(block.payload)) for (const room of block.payload.rooms || []) holdsByRoom.set(room.roomId, [...(holdsByRoom.get(room.roomId) || []), block.payload])
    for (const mapping of mappings) {
      const typeRooms = rooms.map(row => row.payload).filter(room => normalized(room.roomType || 'Standard') === normalized(mapping.roomType)), activeRooms = typeRooms.filter(room => room.status === 'active')
      const sources = activeRooms.length ? await calendarSources.find({ businessId, roomId: { $in: activeRooms.map(room => room.id) } }).toArray() : [], blocksByRoom = new Map()
      for (const source of sources) blocksByRoom.set(source.roomId, [...(blocksByRoom.get(source.roomId) || []), ...(Array.isArray(source.blocks) ? source.blocks : [])])
      for (const date of dateList) {
        const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
        const available = activeRooms.filter(room => {
          const occupied = (staysByRoom.get(room.id) || []).some(stay => date < stay.checkOut && nextDate > stay.checkIn)
          const held = (holdsByRoom.get(room.id) || []).some(block => date < block.checkOut && nextDate > block.checkIn)
          const outOfOrder = hotelRoomOutOfOrder(room, date, nextDate), blocked = (blocksByRoom.get(room.id) || []).some(block => date < block.checkOut && nextDate > block.checkIn)
          return !occupied && !held && !outOfOrder && !blocked
        }).length
        let safeAvailability = available
        if (activeRooms.length) {
          const prices = activeRooms.map(room => hotelNightlyRates(room, date, nextDate)[0]?.nightlyRate)
          const restrictions = activeRooms.map(room => ({ min_stay_arrival: Number(room.minStayArrival || 1), min_stay_through: Number(room.minStayThrough || 1), max_stay: Number(room.maxStay || 0), closed_to_arrival: Boolean(room.closedToArrival), closed_to_departure: Boolean(room.closedToDeparture), stop_sell: Boolean(room.stopSell) }))
          const restrictionConflict = restrictions.some(value => JSON.stringify(value) !== JSON.stringify(restrictions[0]))
          if (restrictionConflict) {
            safeAvailability = 0
            if (restrictionErrors.length < 10) restrictionErrors.push(`${mapping.roomType} has inconsistent stay restrictions on ${date}`)
          } else if (prices.some(price => !Number.isFinite(price) || price <= 0) || prices.some(price => cents(price) !== cents(prices[0]))) {
            safeAvailability = 0
            if (rateErrors.length < 10) rateErrors.push(`${mapping.roomType} has inconsistent nightly rates on ${date}`)
          } else rates.push({ property_id: propertyId, rate_plan_id: mapping.providerRatePlanId, date, rate: cents(prices[0]).toFixed(2), ...restrictions[0] })
          if (!restrictionConflict && restrictions[0].stop_sell) safeAvailability = 0
        }
        availability.push({ property_id: propertyId, room_type_id: mapping.providerRoomTypeId, date, availability: safeAvailability })
      }
    }
    if (!availability.length) throw new Error('Map at least one Stockroom room type before synchronizing channel availability.')
    await tenantIntegrations.updateChannexAvailability(businessId, branchId, availability)
    if (rates.length) await tenantIntegrations.updateChannexRates(businessId, branchId, rates)
    const warnings = [rateErrors.length ? `Channel availability was closed for room types with inconsistent rates: ${rateErrors.join('; ')}.` : '', restrictionErrors.length ? `Channel availability was closed for room types with inconsistent stay restrictions: ${restrictionErrors.join('; ')}.` : ''].filter(Boolean)
    const warning = warnings.join(' ')
    await tenantIntegrations.updateChannexAriStatus(businessId, branchId, warning)
  }

  async function run() {
    if (running) return
    running = true
    try {
      const connected = await integrations.find({ provider: 'channex', active: true }).toArray()
      for (const connection of connected) for (const property of connection.properties || []) {
        try { await syncProperty(connection.businessId, property.branchId, property.propertyId) }
        catch (error) {
          const message = clean(error?.message || 'Channel reservation sync failed.', 300)
          await tenantIntegrations.updateChannexSyncStatus(connection.businessId, property.branchId, message).catch(() => {})
        }
      }
    } finally { running = false }
  }

  return { run }
}
