export function supportRequest(input, identity) {
  const text = (key, max) => { const value = String(input?.[key] || '').trim(); if (!value || value.length > max) throw new Error(`Enter ${key} (up to ${max} characters).`); return value }
  const id = text('id', 80)
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error('Invalid support reference.')
  const email = text('email', 254)
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Enter a valid contact email.')
  return { _id: `${identity.businessId}:${id}`, reference: id, businessId: identity.businessId, deviceId: identity.deviceId || '', appVersion: String(input.appVersion || '').slice(0,100), platform: String(input.platform || '').slice(0,200), email, name: text('name', 100), subject: text('subject', 150), message: text('message', 5000) }
}

export async function submitSupportRequest({ collection, input, identity, sendMail, now = new Date() }) {
  const ticket = supportRequest(input, identity)
  let saved = await collection.findOne({ _id: ticket._id })
  if (saved && ['email', 'name', 'subject', 'message'].some(key => saved[key] !== ticket[key])) throw new Error('This support reference already has different details.')
  if (!saved) {
    if (await collection.countDocuments({ businessId: ticket.businessId, createdAt: { $gte: new Date(now.getTime() - 3600000) } }) >= 5) throw new Error('Please wait before sending another support request, or contact support by WhatsApp.')
    try { await collection.insertOne({ ...ticket, createdAt: now, emailStatus: 'pending' }) }
    catch (error) { if (error.code !== 11000) throw error }
    saved = await collection.findOne({ _id: ticket._id })
    if (['email', 'name', 'subject', 'message'].some(key => saved[key] !== ticket[key])) throw new Error('This support reference already has different details.')
  }
  if (saved.emailStatus === 'sent') return { reference: ticket.reference, sent: true }
  const lease = await collection.findOneAndUpdate({ _id: ticket._id, emailStatus: { $ne: 'sent' }, $or: [{ sendingAt: { $exists: false } }, { sendingAt: { $lt: new Date(now.getTime() - 120000) } }] }, { $set: { sendingAt: now, emailStatus: 'sending' } }, { returnDocument: 'after' })
  if (!lease) throw new Error('This support request is being sent. Retry its saved reference shortly.')
  try {
    const result = await sendMail(ticket)
    await collection.updateOne({ _id: ticket._id }, { $set: { emailStatus: 'sent', sentAt: new Date(), ...result }, $unset: { sendingAt: '' } })
    return { reference: ticket.reference, sent: true }
  } catch {
    await collection.updateOne({ _id: ticket._id }, { $set: { emailStatus: 'pending' }, $unset: { sendingAt: '' } })
    throw new Error('Your request is saved, but its email could not be confirmed. Retry this reference or contact support by WhatsApp.')
  }
}
