const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
export function menuCopyCandidates(source, destination) {
  return source.items.map(item => ({ item, exists: destination.some(current => current.copiedFrom?.menuId === source.id && current.copiedFrom?.itemId === item.id || nameKey(current.name) === nameKey(item.name)) }))
}
export function copyMenuItems(source, destination, selected, restaurant, id = () => crypto.randomUUID()) {
  if (!['counter-menu','restaurant-menu'].includes(source.id) || !Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) throw new Error('Choose menu items to copy.')
  const candidates = menuCopyCandidates(source, destination)
  const copies = selected.map(key => {
    const row = candidates.find(row => row.item.id === key)
    if (!row || row.exists) throw new Error('This item is already in the destination menu or no longer available. Review the selection.')
    const item = structuredClone(row.item)
    item.id = id(); item.options = item.options.map(option => ({ ...option, id: id() }))
    item.copiedFrom = { menuId: source.id, itemId: row.item.id }
    if (restaurant) item.station = item.station || (item.type === 'stock' ? 'bar' : 'kitchen')
    else delete item.station
    return item
  })
  if (destination.length + copies.length > 200) throw new Error('A menu supports up to 200 items. Select fewer items.')
  const names = new Set(destination.map(item => nameKey(item.name)))
  for (const item of copies) { if(names.has(nameKey(item.name)))throw new Error('Selected items have duplicate names. Copy one at a time and rename as needed.');names.add(nameKey(item.name)) }
  return [...destination, ...copies]
}
