import { MongoClient, ObjectId } from 'mongodb'
import { scryptSync, timingSafeEqual } from 'node:crypto'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is required for the MongoDB adapter.')

const client = new MongoClient(uri)
await client.connect()
const database = client.db(process.env.MONGODB_DATABASE || 'stockroom')
const organizationId = process.env.ORGANIZATION_ID || 'stockroom-organization'
const organizations = database.collection('organizations')
const settings = database.collection('app_settings')
const products = database.collection('products')
const movements = database.collection('inventory_movements')
const users = database.collection('users')

await organizations.updateOne({ _id: organizationId }, { $setOnInsert: { name: 'My Business', createdAt: new Date() } }, { upsert: true })
await settings.updateOne({ organizationId }, { $setOnInsert: { appName: 'My Business', currency: 'USD', posProvider: '', posTerminalId: '', posConnection: 'manual', updatedAt: new Date() } }, { upsert: true })
await products.createIndex({ organizationId: 1, sku: 1 }, { unique: true })

function productView(product) {
  return { id: product._id.toString(), name: product.name, sku: product.sku, category: product.category, stock: product.stock, reorder: product.reorder, price: product.price, unit: product.unit, updated: product.updatedAt.toISOString() }
}

export async function getSettings() {
  const value = await settings.findOne({ organizationId })
  return { appName: value.appName, currency: value.currency || 'USD', posProvider: value.posProvider || '', posTerminalId: value.posTerminalId || '', posConnection: value.posConnection || 'manual', updatedAt: value.updatedAt.toISOString() }
}

export async function authenticateUser(email, password) {
  const user = await users.findOne({ email: email.toLowerCase(), organizationId })
  if (!user) return null
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = scryptSync(password, 'stockroom-demo-salt', 64)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return { id: user._id, name: user.name, email: user.email, role: user.role, organizationId }
}

export async function getOwnerMetrics() {
  const [sales] = await salesCollection().aggregate([{ $match: { organizationId } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]).toArray()
  const productsSummary = await products.aggregate([{ $match: { organizationId } }, { $group: { _id: null, value: { $sum: { $multiply: ['$stock', '$price'] } }, products: { $sum: 1 }, lowStock: { $sum: { $cond: [{ $lte: ['$stock', '$reorder'] }, 1, 0] } } } }]).next()
  return { salesToday: sales?.total || 0, saleCount: sales?.count || 0, inventoryValue: productsSummary?.value || 0, productCount: productsSummary?.products || 0, lowStock: productsSummary?.lowStock || 0 }
}

function salesCollection() {
  return database.collection('sales')
}

export async function updateSettings(appName, currency = 'USD', posProvider = '', posTerminalId = '', posConnection = 'manual') {
  const updatedAt = new Date()
  await settings.updateOne({ organizationId }, { $set: { appName, currency, posProvider, posTerminalId, posConnection, updatedAt } }, { upsert: true })
  return { appName, currency, posProvider, posTerminalId, posConnection, updatedAt: updatedAt.toISOString() }
}

export async function listProducts() {
  const values = await products.find({ organizationId }).sort({ name: 1 }).toArray()
  return values.map(productView)
}

export async function createProduct(input) {
  const product = { organizationId, ...input, updatedAt: new Date() }
  const result = await products.insertOne(product)
  return productView({ ...product, _id: result.insertedId })
}

export async function adjustStock(productId, amount) {
  const filter = { _id: new ObjectId(productId), organizationId, stock: { $gte: -amount } }
  const updatedAt = new Date()
  const result = await products.findOneAndUpdate(filter, { $inc: { stock: amount }, $set: { updatedAt } }, { returnDocument: 'after' })
  if (!result) return null
  await movements.insertOne({ organizationId, productId: result._id, quantity: amount, reason: 'manual-adjustment', createdAt: updatedAt })
  return productView(result)
}

export async function createSale(sale) {
  const existing = await database.collection('sales').findOne({ _id: sale.id, organizationId })
  if (existing) return { ...sale, syncStatus: 'synced' }
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      await database.collection('sales').insertOne({ _id: sale.id, organizationId, total: sale.total, paymentMethod: sale.paymentMethod || 'external-pos', paymentReference: sale.paymentReference || '', terminalProvider: sale.terminalProvider || '', createdAt: new Date(sale.createdAt) }, { session })
      for (const item of sale.items) {
        const updatedAt = new Date()
        const result = await products.updateOne({ _id: new ObjectId(item.productId), organizationId, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity }, $set: { updatedAt } }, { session })
        if (!result.modifiedCount) throw new Error('Insufficient stock for sale.')
        await movements.insertOne({ organizationId, productId: new ObjectId(item.productId), quantity: -item.quantity, reason: 'sale', createdAt: updatedAt }, { session })
      }
    })
    return { ...sale, syncStatus: 'synced' }
  } finally {
    await session.endSession()
  }
}
