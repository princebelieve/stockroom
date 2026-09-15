import type { Product, Sale } from '../types'

type SyncOperation = {
  id?: number
  type: 'stock' | 'product' | 'sale' | 'settings'
  payload: Record<string, unknown>
  createdAt: string
}

const databaseName = 'stockroom-offline'
const databaseVersion = 2

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('products')) database.createObjectStore('products', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('operations')) database.createObjectStore('operations', { keyPath: 'id', autoIncrement: true })
      if (!database.objectStoreNames.contains('sales')) database.createObjectStore('sales', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(storeName, mode).objectStore(storeName)) as IDBRequest | undefined
    if (!request) return resolve(undefined)
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedProducts() {
  const values = await transaction<Product[]>('products', 'readonly', (store) => store.getAll())
  return values || []
}

export async function cacheProducts(products: Product[]) {
  const database = await openDatabase()
  const transaction = database.transaction('products', 'readwrite')
  const store = transaction.objectStore('products')
  store.clear()
  products.forEach((product) => store.put(product))
}

export async function upsertCachedProducts(products: Product[]) {
  const database = await openDatabase()
  const store = database.transaction('products', 'readwrite').objectStore('products')
  products.forEach((product) => store.put(product))
}

export async function queueOperation(operation: SyncOperation) {
  await transaction('operations', 'readwrite', (store) => store.add(operation))
}

export async function getQueuedOperations() {
  const values = await transaction<SyncOperation[]>('operations', 'readonly', (store) => store.getAll())
  return values || []
}

export async function removeQueuedOperation(id: number) {
  await transaction('operations', 'readwrite', (store) => store.delete(id))
}

/** Replace a temporary offline product ID in later queued changes and sales. */
export async function replaceQueuedProductId(localId: string, syncedId: string) {
  const database = await openDatabase()
  const tx = database.transaction('operations', 'readwrite')
  const store = tx.objectStore('operations')
  const operations = await new Promise<SyncOperation[]>((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as SyncOperation[])
    request.onerror = () => reject(request.error)
  })
  operations.forEach((operation) => {
    let changed = false
    const payload = { ...operation.payload }
    if (payload.productId === localId) { payload.productId = syncedId; changed = true }
    if (Array.isArray(payload.items)) {
      const items = payload.items.map((item) => {
        if (typeof item === 'object' && item && (item as Record<string, unknown>).productId === localId) {
          changed = true
          return { ...(item as Record<string, unknown>), productId: syncedId }
        }
        return item
      })
      payload.items = items
    }
    if (changed) store.put({ ...operation, payload })
  })
}

export async function saveSale(sale: Sale) {
  await transaction('sales', 'readwrite', (store) => store.put(sale))
}
