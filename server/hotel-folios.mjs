const text = (value, maximum, label) => {
  if (typeof value !== 'string' || value.trim().length > maximum) throw new Error(`Enter a valid ${label}.`)
  return value.trim()
}

export function defaultHotelFolio(stay) {
  return { id: 'guest', name: 'Guest', payerName: String(stay.guestName || ''), payerPhone: String(stay.guestPhone || '') }
}

export function defaultHotelGroupFolio(stay) {
  const groupId=String(stay?.groupId||'')
  if(!/^hotel-group:[0-9a-f-]{36}$/i.test(groupId))throw new Error('Choose a valid group booking before creating its master folio.')
  return { id:`hotel-folio:${groupId.slice('hotel-group:'.length)}`, name:'Group master', payerName:String(stay.groupName||''), payerPhone:String(stay.groupContactPhone||''), ...(stay.groupContactEmail?{payerEmail:String(stay.groupContactEmail)}:{}), groupMaster:true }
}

export function hotelFolios(stay) {
  return Array.isArray(stay?.folios) && stay.folios.length ? stay.folios : [defaultHotelFolio(stay || {})]
}

export function validateHotelFolios(stay, previous) {
  if (stay.folios !== undefined) {
    if (!Array.isArray(stay.folios) || stay.folios.length < 1 || stay.folios.length > 10 || new Set(stay.folios.map(folio => folio.id)).size !== stay.folios.length) throw new Error('A stay can have one to ten uniquely identified folios.')
    for (const folio of stay.folios) {
      if (!/^(?:guest|hotel-folio:[A-Za-z0-9_-]{20,80})$/.test(folio.id) || !text(folio.name, 80, 'folio name') || !text(folio.payerName, 200, 'folio payer') || typeof folio.payerPhone !== 'string' || folio.payerPhone.length > 80 || folio.payerEmail !== undefined && !/^\S+@\S+\.\S+$/.test(text(folio.payerEmail, 254, 'folio email')) || folio.customerId !== undefined && !text(folio.customerId, 150, 'folio customer account') || folio.groupMaster!==undefined&&folio.groupMaster!==true) throw new Error('Enter valid folio name and payer details.')
    }
  }
  if (previous) {
    const oldFolios = hotelFolios(previous), nextFolios = stay.folios === undefined ? oldFolios : stay.folios
    if (nextFolios.length < oldFolios.length || nextFolios.length > oldFolios.length + 1 || oldFolios.some((folio, index) => JSON.stringify(folio) !== JSON.stringify(nextFolios[index]))) throw new Error('Existing folios cannot be removed or changed; create a new folio for another payer.')
  }
  return stay
}
