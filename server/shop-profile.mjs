import { normalizeFields, validateFields } from './shop-fields.mjs'
export const businessModes = {
  printing: { label: 'Printing and copy shop', unit: 'copy', note: 'Set up a catalogue of printed items, copying and finishing charges.' },
  general: { label: 'General purpose', unit: 'item', note: 'Use for mixed packaged goods and everyday retail.' },
  grocery: { label: 'Grocery and provisions', unit: 'pack', note: 'New products default to pack; change the unit per product when needed.' },
  supermarket: { label: 'Supermarket and convenience store', unit: 'piece', note: 'For mixed food, household, and everyday retail goods.' },
  wholesale: { label: 'Wholesale and distribution', unit: 'carton', note: 'For case, carton, and bulk distribution; choose the right unit per product.' },
  'food-service': { label: 'Restaurant, fast food, and catering', unit: 'portion', note: 'For ingredients, prepared food, and serving portions.' },
  'food-manufacturing': { label: 'Food processing and manufacturing', unit: 'kg', note: 'For ingredients and finished goods; choose the right unit per product.' },
  bakery: { label: 'Bakery and confectionery', unit: 'piece', note: 'For baked goods, ingredients, and confectionery.' },
  drinks: { label: 'Drinks and beverage business', unit: 'bottle', note: 'For bottled, canned, and packaged beverages.' },
  hotel: { label: 'Hotel and lodging', unit: 'piece', note: 'For food, amenities, and hotel supplies.' },
  pharmacy: { label: 'Pharmacy and medical supplies', unit: 'pack', note: 'For medicines and health products; follow the unit on each item.' },
  'health-beauty': { label: 'Beauty, cosmetics, and personal care', unit: 'piece', note: 'For cosmetics, toiletries, and personal care goods.' },
  clothing: { label: 'Clothing, footwear, and accessories', unit: 'piece', note: 'For garments, shoes, and accessories.' },
  electronics: { label: 'Electronics, phones, and appliances', unit: 'piece', note: 'For devices, components, and accessories.' },
  building: { label: 'Building and construction materials', unit: 'piece', note: 'For construction supplies; choose bag, length, piece, or another unit per product.' },
  cement: { label: 'Cement, aggregates, and building supplies', unit: 'bag', note: 'For cement and bagged materials; choose the right unit for each product.' },
  automotive: { label: 'Automotive, vehicle sales, and spare parts', unit: 'piece', note: 'For vehicles, spare parts, tyres, and accessories.' },
  agriculture: { label: 'Agriculture, farm, and animal care', unit: 'kg', note: 'For produce, farm inputs, feed, and animal care.' },
  furniture: { label: 'Furniture and home furnishings', unit: 'piece', note: 'For furniture, fittings, and home décor.' },
  office: { label: 'Office, school, and stationery supplies', unit: 'piece', note: 'For stationery, equipment, and learning supplies.' },
  books: { label: 'Books, media, and learning materials', unit: 'piece', note: 'For books, publications, and media.' },
  hardware: { label: 'Hardware, tools, and equipment', unit: 'piece', note: 'For tools, fittings, and equipment.' },
  hospitality: { label: 'Hospitality, events, and entertainment', unit: 'piece', note: 'For event stock, venue supplies, and hospitality goods.' },
  bulk: { label: 'Bulk or measured goods', unit: 'kg', note: 'New products default to kg. This is a unit label only; stock and sales remain whole quantities in this release.' },
  services: { label: 'Services and non-stock items', unit: 'service', note: 'For services or fees tracked as saleable items.' },
}

const suggestions = {
  general: { itemLabel: 'Product', inventoryLabel: 'Inventory', categories: ['General goods', 'Supplies', 'Other'] },
  printing: { itemLabel: 'Print item', inventoryLabel: 'Print catalogue', categories: ['Photocopying', 'Document printing', 'Business cards', 'Flyers', 'Banners', 'Binding and finishing', 'Paper and supplies'] },
  'food-service': { itemLabel: 'Menu item', inventoryLabel: 'Menu and stock', categories: ['Main meals', 'Sides', 'Snacks', 'Drinks', 'Desserts', 'Ingredients'] },
  bakery: { itemLabel: 'Bakery item', inventoryLabel: 'Bakery catalogue', categories: ['Bread', 'Cakes', 'Pastries', 'Ingredients', 'Packaging'] },
  clothing: { itemLabel: 'Clothing item', inventoryLabel: 'Clothing catalogue', categories: ['Clothing', 'Footwear', 'Accessories'] },
  services: { itemLabel: 'Item', inventoryLabel: 'Services and items', categories: ['Services', 'Materials', 'Other'] },
  grocery: { categories: ['Food', 'Drinks', 'Household goods', 'Fresh produce'] },
  supermarket: { categories: ['Groceries', 'Drinks', 'Household goods', 'Personal care'] },
  wholesale: { categories: ['Packaged goods', 'Beverages', 'Bulk supplies'] },
  pharmacy: { categories: ['Medicines', 'Health supplies', 'Personal care'] },
  electronics: { categories: ['Phones', 'Computers', 'Accessories', 'Appliances', 'Parts'] },
  drinks: { categories: ['Water', 'Soft drinks', 'Juices', 'Alcoholic beverages'] },
  building: { categories: ['Cement', 'Timber', 'Roofing', 'Plumbing', 'Electrical', 'Tools'] },
  agriculture: { categories: ['Produce', 'Seeds', 'Feed', 'Equipment', 'Farm supplies'] },
}

export function normalizeShopProfile(input) {
  if (typeof input === 'string') { try { input = JSON.parse(input) } catch { input = null } }
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {}
  const mode = ['general', 'suggested', 'custom'].includes(input.mode) ? input.mode : 'general'
  const industry = mode === 'general' || !Object.hasOwn(businessModes, input.industry) ? 'general' : input.industry
  const preset = { ...suggestions.general, categories: [businessModes[industry].label, 'Supplies', 'Other'], ...suggestions[industry], unit: businessModes[industry].unit }
  const value = { version: 1, mode, industry, ...preset }
  if (mode === 'custom') {
    for (const key of ['itemLabel', 'inventoryLabel', 'unit']) {
      const text = typeof input[key] === 'string' ? input[key].trim().replace(/\s+/g, ' ') : ''
      if (text) value[key] = text.slice(0, key === 'unit' ? 30 : 40)
    }
    if (Array.isArray(input.categories)) value.categories = [...new Set(input.categories.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 30)
  }
  value.fields = normalizeFields(input.fields, industry, value.itemLabel)
  value.version = 2
  return value
}

export function validateShopProfile(input) {
  validateFields(input?.fields)
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['general', 'suggested', 'custom'].includes(input.mode)
    || !Object.hasOwn(businessModes, input.industry)) throw new Error('Choose a valid shop setup.')
  if (input.mode === 'custom') {
    for (const key of ['itemLabel', 'inventoryLabel', 'unit']) {
      if (typeof input[key] !== 'string' || !input[key].trim() || input[key].trim().length > (key === 'unit' ? 30 : 40)) throw new Error('Enter short names for your items, catalogue and unit.')
    }
    if (!Array.isArray(input.categories) || input.categories.length > 30 || input.categories.some(item => typeof item !== 'string' || item.trim().length > 80)) throw new Error('Use up to 30 categories, with at most 80 characters each.')
  }
  return normalizeShopProfile(input)
}
