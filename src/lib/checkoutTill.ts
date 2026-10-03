// One browser installation shares this ID across its tabs and local database.
export function checkoutTillId(): string {
  const key = 'stockroom-checkout-till-id'
  let id = localStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
  return id
}
