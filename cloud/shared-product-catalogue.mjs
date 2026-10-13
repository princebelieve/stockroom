import { createHash } from 'node:crypto'

export function canonicalProductBarcode(value) {
  const digits = String(value || '').trim()
  if (!/^\d+$/.test(digits)) return ''
  if (![8, 12, 13, 14].includes(digits.length)) return ''
  const numbers = [...digits].map(Number)
  const check = numbers.pop()
  if ((10 - numbers.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 !== check) return ''
  return digits.padStart(14, '0')
}

export function equivalentProductBarcodes(value) {
  const raw = String(value || '').trim()
  const canonical = canonicalProductBarcode(raw)
  if (!canonical) return raw ? [raw] : []
  return [14, 13, 12, 8].map(length => canonical.slice(-length)).filter(candidate => canonicalProductBarcode(candidate) === canonical)
}

export async function saveSharedProductContribution(collection, businessId, product, profile) {
  const barcode = canonicalProductBarcode(product?.barcode)
  const name = String(product?.name || '').trim().replace(/\s+/g, ' ').slice(0, 180)
  if (!barcode || !name || !businessId) return
  const attributeNames = { brand: 'brand', brands: 'brand', brand_owner: 'brand', manufacturer: 'manufacturer', model: 'model', quantity: 'packageSize', packagesize: 'packageSize', packaging: 'packageSize', description: 'description', generic_name: 'description' }
  const attributes = {}
  const values = product?.customValues && typeof product.customValues === 'object' && !Array.isArray(product.customValues) ? product.customValues : {}
  for (const field of Array.isArray(profile?.fields) ? profile.fields : []) {
    const target = attributeNames[String(field.lookupKey || '').toLocaleLowerCase()]
    const value = String(values[field.id] || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
    if (target && value && !attributes[target]) attributes[target] = value
  }
  const now = new Date()
  // Share only general fields explicitly recognized as external catalogue
  // metadata. SKU, category, unit, pricing, cost, stock and other custom
  // fields remain private.
  await collection.updateOne(
    { _id: `${barcode}:${createHash('sha256').update(String(businessId)).digest('hex')}` },
    { $set: { barcode, name, attributes, searchName: name.toLocaleLowerCase(), lastContributedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
}

export async function removeSharedProductContribution(collection, businessId, barcode) {
  const canonical = canonicalProductBarcode(barcode)
  if (!canonical || !businessId) return
  const contributor = createHash('sha256').update(String(businessId)).digest('hex')
  await collection.deleteOne({ _id: `${canonical}:${contributor}` })
}

export async function findSharedProduct(collection, value) {
  const barcode = canonicalProductBarcode(value)
  if (!barcode) return null
  const contributions = await collection.find({ barcode }).sort({ lastContributedAt: -1 }).limit(50).toArray()
  if (!contributions.length) return null
  const votes = new Map()
  for (const contribution of contributions) {
    const key = String(contribution.searchName || contribution.name || '').trim().toLocaleLowerCase()
    if (!key) continue
    const vote = votes.get(key) || { count: 0, row: contribution }
    vote.count += 1
    if (Date.parse(contribution.lastContributedAt) > Date.parse(vote.row.lastContributedAt)) vote.row = contribution
    votes.set(key, vote)
  }
  const winner = [...votes.values()].sort((left, right) => right.count - left.count || Date.parse(right.row.lastContributedAt) - Date.parse(left.row.lastContributedAt))[0]
  if (!winner) return null
  return { status: 200, body: { status: 1, product: { code: barcode, product_name: winner.row.name, source: 'Stockroom Global Catalogue', attributes: winner.row.attributes || {} } } }
}

