import { normalizeFields, templateFields, validateFields } from './shop-fields.mjs'
import { reportTimeZone } from './report-timezone.mjs'
export const businessModes = {
  printing: { label: 'Printing and copy shop', unit: 'copy', note: 'Set up a catalogue of printed items, copying and finishing charges.' },
  general: { label: 'General purpose', unit: 'item', note: 'Use for mixed packaged goods and everyday retail.' },
  grocery: { label: 'Grocery and provisions', unit: 'pack', note: 'New products default to pack; change the unit per product when needed.' },
  supermarket: { label: 'Supermarket and convenience store', unit: 'piece', note: 'For mixed food, household, and everyday retail goods.' },
  wholesale: { label: 'Wholesale and distribution', unit: 'carton', note: 'For case, carton, and bulk distribution; choose the right unit per product.' },
  liquids: { label: 'Wholesale and retail oil shop', unit: 'litre', note: 'For palm oil, groundnut oil, and other edible oils sold by measured quantity or container.' },
  'food-service': { label: 'Restaurant, fast food, and catering', unit: 'portion', note: 'For ingredients, prepared food, and serving portions.' },
  'food-manufacturing': { label: 'Food ingredients and finished goods', unit: 'kg', note: 'For ingredient and finished-goods stock. Optional single-output food batches track material use, yield and cost; production scheduling is not provided.' },
  bakery: { label: 'Bakery and confectionery', unit: 'piece', note: 'For baked goods and ingredients. Enable Order counter for optional single-output food batches with recorded yield and cost.' },
  drinks: { label: 'Drinks and beverage business', unit: 'bottle', note: 'For bottled, canned, and packaged beverages.' },
  hotel: { label: 'Hotel supplies and amenities', unit: 'piece', note: 'For food, amenities and hotel supplies. Room bookings, occupancy and accommodation billing are not provided.' },
  pharmacy: { label: 'Pharmacy stock and medical supplies', unit: 'pack', note: 'For medicine and health-product stock; follow the unit on each item. Prescription and dispensing workflows are not provided.' },
  'health-beauty': { label: 'Beauty, cosmetics, and personal care', unit: 'piece', note: 'For cosmetics, toiletries, and personal care goods.' },
  clothing: { label: 'Clothing, footwear, and accessories', unit: 'piece', note: 'For garments, shoes and accessories. Configure size/colour variants explicitly; selecting this template does not create them.' },
  electronics: { label: 'Electronics, phones, and appliances', unit: 'piece', note: 'For device, component and accessory stock. Serial-number histories, warranties and repairs require separate workflows.' },
  building: { label: 'Building and construction materials', unit: 'piece', note: 'For construction supplies; choose bag, length, piece, or another unit per product.' },
  cement: { label: 'Cement, aggregates, and building supplies', unit: 'bag', note: 'For cement and bagged materials; choose the right unit for each product.' },
  automotive: { label: 'Automotive goods and spare parts', unit: 'piece', note: 'For spare parts, tyres and accessories. Vehicle ownership, serial-number histories and warranties are not managed.' },
  agriculture: { label: 'Agriculture, farm, and animal care', unit: 'kg', note: 'For produce, farm inputs and feed stock. Crop cycles, livestock records and agricultural processing are not managed.' },
  furniture: { label: 'Furniture and home furnishings', unit: 'piece', note: 'For furniture, fittings, and home décor.' },
  office: { label: 'Office, school, and stationery supplies', unit: 'piece', note: 'For stationery, equipment, and learning supplies.' },
  books: { label: 'Books, media, and learning materials', unit: 'piece', note: 'For books, publications, and media.' },
  hardware: { label: 'Hardware, tools, and equipment', unit: 'piece', note: 'For tools, fittings, and equipment.' },
  hospitality: { label: 'Hospitality and event supplies', unit: 'piece', note: 'For event stock and venue supplies. Event bookings, admission and equipment rentals are not managed.' },
  bulk: { label: 'Bulk or measured goods', unit: 'kg', note: 'New products default to kg. Stock and sales support quantities with up to three decimal places.' },
  services: { label: 'Services and non-stock items', unit: 'service', note: 'For services or fees tracked as saleable items.' },
}

export const catalogueWorkspaces = {
  'product-sales': 'Product sales',
  'oil-sales': 'Oil sales',
  'order-counter': 'Order counter',
  'tables-tabs': 'Tables & tabs',
}

const suggestions = {
  general: { itemLabel: 'Product', inventoryLabel: 'Inventory' },
  printing: { itemLabel: 'Print item', inventoryLabel: 'Print catalogue' },
  'food-service': { itemLabel: 'Menu item', inventoryLabel: 'Menu and stock' },
  bakery: { itemLabel: 'Bakery item', inventoryLabel: 'Bakery catalogue' },
  clothing: { itemLabel: 'Clothing item', inventoryLabel: 'Clothing catalogue' },
  services: { itemLabel: 'Item', inventoryLabel: 'Services and items' },
  liquids: { itemLabel: 'Oil product', inventoryLabel: 'Oil inventory' },
}

const categoriesByIndustry = {
  general: ['General goods', 'Food and groceries', 'Drinks', 'Household goods', 'Personal care', 'Clothing and footwear', 'Electronics', 'Office supplies', 'Building materials', 'Tools and hardware', 'Automotive', 'Agriculture', 'Furniture and home', 'Books and media', 'Packaging', 'Services and fees'],
  printing: ['Black and white copies', 'Colour copies', 'Document printing', 'Large format printing', 'Business cards', 'Flyers and brochures', 'Posters and banners', 'Books and booklets', 'Binding', 'Lamination', 'Finishing', 'Design services', 'Paper', 'Ink and toner', 'Print materials', 'Packaging'],
  grocery: ['Fresh produce', 'Fruit', 'Vegetables', 'Grains and cereals', 'Rice and pasta', 'Beans and pulses', 'Flour and baking', 'Cooking oils', 'Spices and seasonings', 'Canned food', 'Dairy and eggs', 'Meat and seafood', 'Bread and bakery', 'Snacks and confectionery', 'Water', 'Soft drinks and juice', 'Tea and coffee', 'Frozen food', 'Household cleaning', 'Personal care', 'Baby products', 'Pet supplies'],
  supermarket: ['Fresh produce', 'Fruit and vegetables', 'Meat and seafood', 'Dairy and eggs', 'Bakery', 'Grains and cereals', 'Canned and packaged food', 'Cooking ingredients', 'Frozen food', 'Snacks and confectionery', 'Water and beverages', 'Alcoholic beverages', 'Household cleaning', 'Laundry', 'Paper goods', 'Personal care', 'Baby care', 'Health supplies', 'Pet supplies', 'Kitchen and home', 'Stationery'],
  wholesale: ['Food and groceries', 'Beverages', 'Household goods', 'Cleaning supplies', 'Personal care', 'Paper and packaging', 'Office supplies', 'Clothing and textiles', 'Electronics', 'Building materials', 'Tools and hardware', 'Automotive supplies', 'Agricultural supplies', 'Bulk ingredients', 'Cartons and cases', 'Food service supplies'],
  liquids: ['Palm oil', 'Groundnut oil', 'Vegetable oil', 'Coconut oil', 'Soybean oil', 'Sunflower oil', 'Other edible oils', 'Cooking fats', 'Bulk oil', 'Bottled oil', 'Oil containers', 'Container deposits', 'Measuring and dispensing supplies'],
  'food-service': ['Rice meals', 'Other main meals', 'Breakfast', 'Soups and stews', 'Sides and accompaniments', 'Grilled food', 'Snacks and starters', 'Sandwiches and wraps', 'Pizza and pasta', 'Salads', 'Desserts', 'Hot drinks', 'Cold drinks', 'Bottled drinks', 'Ingredients', 'Prepared ingredients', 'Meal deals', 'Packaging and disposables'],
  'food-manufacturing': ['Grains and flour', 'Sugar and sweeteners', 'Oils and fats', 'Dairy ingredients', 'Meat and seafood', 'Fruit and vegetables', 'Spices and seasonings', 'Additives and preservatives', 'Dry ingredients', 'Liquid ingredients', 'Packaging materials', 'Work in progress', 'Finished food', 'Baked goods', 'Beverages', 'By-products'],
  bakery: ['Bread', 'Rolls and buns', 'Cakes', 'Cupcakes', 'Pastries', 'Pies and savouries', 'Biscuits and cookies', 'Confectionery', 'Desserts', 'Flour and grains', 'Sugar and sweeteners', 'Yeast and raising agents', 'Dairy and eggs', 'Fillings and toppings', 'Oils and fats', 'Packaging'],
  drinks: ['Bottled water', 'Soft drinks', 'Juice and smoothies', 'Energy drinks', 'Sports drinks', 'Tea and coffee', 'Milk and dairy drinks', 'Beer', 'Wine', 'Spirits', 'Mixers', 'Non-alcoholic drinks', 'Drink concentrates', 'Ice', 'Snacks', 'Bar supplies'],
  hotel: ['Guest room amenities', 'Cleaning supplies', 'Laundry and linen', 'Towels and bedding', 'Food and ingredients', 'Beverages', 'Kitchen supplies', 'Bathroom supplies', 'Furniture and fittings', 'Maintenance supplies', 'Office supplies', 'Guest stationery', 'Safety supplies', 'Event supplies', 'Packaging and disposables'],
  pharmacy: ['Prescription medicines', 'Over-the-counter medicines', 'Pain relief', 'Cold and allergy', 'Vitamins and supplements', 'First aid', 'Wound care', 'Medical devices', 'Diagnostic supplies', 'Personal care', 'Baby and maternity', 'Oral care', 'Skin care', 'Hygiene and sanitation', 'Medical consumables', 'Protective equipment'],
  'health-beauty': ['Skin care', 'Face care', 'Hair care', 'Body care', 'Makeup', 'Fragrance', 'Oral care', 'Bath and shower', 'Deodorants', 'Shaving and grooming', 'Nail care', 'Sun care', 'Baby care', 'Health and wellness', 'Beauty tools', 'Accessories'],
  clothing: ['Women clothing', 'Men clothing', 'Children clothing', 'Baby clothing', 'Uniforms', 'Traditional wear', 'Sportswear', 'Underwear and sleepwear', 'Shoes and footwear', 'Bags and purses', 'Jewellery', 'Belts and accessories', 'Fabric and textiles', 'Sewing supplies', 'Seasonal wear'],
  electronics: ['Mobile phones', 'Phone accessories', 'Computers and laptops', 'Computer accessories', 'Tablets', 'Audio and headphones', 'Televisions and video', 'Cameras', 'Home appliances', 'Kitchen appliances', 'Power and charging', 'Cables and adapters', 'Networking', 'Storage media', 'Components and parts', 'Gaming', 'Smart home', 'Batteries'],
  building: ['Cement and binders', 'Aggregates and sand', 'Bricks and blocks', 'Timber and boards', 'Roofing', 'Steel and reinforcement', 'Plumbing', 'Electrical', 'Paint and coatings', 'Doors and windows', 'Tiles and flooring', 'Ceiling and insulation', 'Fasteners', 'Hand tools', 'Power tools', 'Safety equipment', 'Adhesives and sealants', 'Hardware and fittings'],
  cement: ['Cement', 'Concrete products', 'Sand', 'Gravel and aggregate', 'Blocks and bricks', 'Steel and reinforcement', 'Timber', 'Roofing materials', 'Plumbing supplies', 'Electrical supplies', 'Paint and coatings', 'Bagged materials', 'Bulk materials', 'Tools and equipment', 'Delivery and handling'],
  automotive: ['Engine and transmission parts', 'Filters', 'Brakes', 'Suspension and steering', 'Electrical and ignition', 'Batteries', 'Tyres and tubes', 'Wheels and rims', 'Engine oils', 'Fluids and lubricants', 'Body and lighting', 'Interior accessories', 'Tools and workshop supplies', 'Safety and cleaning', 'Motorcycle parts', 'Vehicle accessories', 'Belts and hoses', 'Fasteners'],
  agriculture: ['Seeds and seedlings', 'Fertilizers', 'Crop protection', 'Animal feed', 'Livestock supplies', 'Veterinary supplies', 'Farm tools', 'Irrigation', 'Pots and growing media', 'Harvested produce', 'Grains and pulses', 'Fencing', 'Protective equipment', 'Storage and packaging', 'Machinery parts', 'Water and supplements'],
  furniture: ['Living room furniture', 'Bedroom furniture', 'Dining furniture', 'Office furniture', 'Outdoor furniture', 'Mattresses and bedding', 'Seating', 'Tables and desks', 'Storage and cabinets', 'Shelving', 'Lighting', 'Home décor', 'Kitchen fittings', 'Bathroom fittings', 'Furniture hardware'],
  office: ['Writing supplies', 'Paper and notebooks', 'Filing and organization', 'Office machines', 'Printer supplies', 'Computer accessories', 'School supplies', 'Art supplies', 'Presentation supplies', 'Mailing and packaging', 'Desk accessories', 'Cleaning supplies', 'Furniture', 'Books and learning materials'],
  books: ['Fiction', 'Non-fiction', 'Children books', 'Textbooks', 'Workbooks', 'Reference books', 'Religious books', 'Local language books', 'Magazines and journals', 'Newspapers', 'Stationery', 'Learning materials', 'Digital media', 'Maps and charts'],
  hardware: ['Hand tools', 'Power tools', 'Fasteners', 'Locks and security', 'Plumbing', 'Electrical', 'Paint and decorating', 'Adhesives and sealants', 'Building materials', 'Garden tools', 'Safety equipment', 'Storage and organization', 'Fittings and fixtures', 'Machinery parts', 'Workshop supplies', 'Ladders and access'],
  hospitality: ['Tableware', 'Glassware', 'Kitchen equipment', 'Food service disposables', 'Cleaning supplies', 'Linen and textiles', 'Guest amenities', 'Bar supplies', 'Catering equipment', 'Event décor', 'Serving equipment', 'Safety supplies', 'Packaging', 'Furniture and fittings'],
  bulk: ['Grains and cereals', 'Rice', 'Beans and pulses', 'Flour', 'Sugar and salt', 'Spices', 'Nuts and seeds', 'Dried produce', 'Fresh produce', 'Animal feed', 'Fertilizer', 'Construction aggregates', 'Cooking oils', 'Bulk liquids', 'Packaging and sacks'],
  services: ['Consulting', 'Labour and repairs', 'Installation', 'Delivery and transport', 'Professional fees', 'Administrative fees', 'Training and lessons', 'Rent and hire', 'Maintenance', 'Cleaning', 'Design and creative', 'Digital services', 'Materials', 'Travel and call-out', 'Other services'],
}

const unitSuggestionsByIndustry = {
  general: ['piece', 'item', 'pack', 'packet', 'box', 'carton', 'case', 'bottle', 'can', 'jar', 'bag', 'pair', 'set', 'dozen', 'kilogram', 'gram', 'litre', 'millilitre', 'metre', 'roll'],
  printing: ['copy', 'page', 'sheet', 'ream', 'booklet', 'poster', 'banner', 'card', 'set', 'job', 'service', 'piece', 'pack', 'roll', 'square metre'],
  grocery: ['piece', 'pack', 'packet', 'box', 'carton', 'bottle', 'can', 'jar', 'bag', 'sack', 'tray', 'crate', 'kilogram', 'gram', 'litre', 'millilitre', 'dozen'],
  supermarket: ['piece', 'pack', 'packet', 'box', 'carton', 'case', 'bottle', 'can', 'jar', 'sachet', 'bag', 'tray', 'crate', 'kilogram', 'gram', 'litre', 'millilitre', 'pair'],
  wholesale: ['piece', 'pack', 'box', 'carton', 'case', 'crate', 'pallet', 'bag', 'sack', 'bundle', 'dozen', 'kilogram', 'tonne', 'litre', 'bottle', 'can'],
  liquids: ['litre', 'millilitre', 'gallon', 'bottle', 'can', 'jar', 'tin', 'drum', 'container', 'kilogram', 'gram', 'piece'],
  'food-service': ['portion', 'serving', 'meal', 'plate', 'bowl', 'piece', 'pack', 'box', 'tray', 'kilogram', 'gram', 'litre', 'millilitre', 'bottle', 'can', 'order'],
  'food-manufacturing': ['kilogram', 'gram', 'tonne', 'litre', 'millilitre', 'piece', 'batch', 'pack', 'box', 'carton', 'sack', 'bag', 'bottle', 'can', 'tray'],
  bakery: ['piece', 'loaf', 'roll', 'slice', 'cake', 'box', 'pack', 'tray', 'kilogram', 'gram', 'litre', 'millilitre', 'bag', 'batch', 'dozen'],
  drinks: ['bottle', 'can', 'crate', 'case', 'carton', 'pack', 'cup', 'glass', 'keg', 'litre', 'millilitre', 'gallon', 'piece', 'dozen'],
  hotel: ['piece', 'set', 'pair', 'pack', 'box', 'carton', 'bottle', 'case', 'kilogram', 'litre', 'service', 'room set'],
  pharmacy: ['pack', 'tablet', 'capsule', 'bottle', 'vial', 'ampoule', 'tube', 'sachet', 'box', 'carton', 'piece', 'pair', 'millilitre', 'gram', 'dose'],
  'health-beauty': ['piece', 'bottle', 'jar', 'tube', 'tub', 'bar', 'pack', 'set', 'box', 'sachet', 'millilitre', 'gram', 'pair'],
  clothing: ['piece', 'pair', 'set', 'pack', 'dozen', 'size run', 'metre', 'yard', 'roll', 'bundle', 'box', 'carton'],
  electronics: ['piece', 'unit', 'set', 'pair', 'pack', 'box', 'carton', 'kit', 'metre', 'roll', 'battery', 'service'],
  building: ['piece', 'bag', 'sack', 'pack', 'box', 'carton', 'bundle', 'length', 'board', 'sheet', 'roll', 'metre', 'square metre', 'kilogram', 'tonne', 'litre'],
  cement: ['bag', 'kilogram', 'tonne', 'cubic metre', 'piece', 'block', 'brick', 'length', 'bundle', 'sheet', 'load', 'delivery'],
  automotive: ['piece', 'pair', 'set', 'kit', 'pack', 'box', 'carton', 'litre', 'millilitre', 'kilogram', 'tyre', 'battery'],
  agriculture: ['kilogram', 'gram', 'tonne', 'bag', 'sack', 'pack', 'packet', 'seedling', 'tray', 'crate', 'litre', 'millilitre', 'piece', 'bale', 'bundle'],
  furniture: ['piece', 'set', 'pair', 'unit', 'box', 'carton', 'pack', 'metre', 'square metre', 'kit'],
  office: ['piece', 'pack', 'box', 'ream', 'sheet', 'set', 'carton', 'roll', 'pair', 'bottle', 'cartridge', 'service'],
  books: ['piece', 'copy', 'volume', 'set', 'pack', 'box', 'carton', 'subscription'],
  hardware: ['piece', 'pair', 'set', 'pack', 'box', 'carton', 'bag', 'length', 'metre', 'roll', 'litre', 'kilogram', 'kit'],
  hospitality: ['piece', 'set', 'pair', 'pack', 'box', 'carton', 'case', 'roll', 'dozen', 'service', 'hire'],
  bulk: ['kilogram', 'gram', 'tonne', 'bag', 'sack', 'crate', 'cubic metre', 'litre', 'millilitre', 'bundle', 'piece', 'load'],
  services: ['service', 'job', 'hour', 'day', 'visit', 'session', 'consultation', 'delivery', 'trip', 'project', 'item'],
}

export function productCatalogueOptions(industry = 'general') {
  return {
    categories: [...(categoriesByIndustry[industry] || categoriesByIndustry.general)],
    units: [...(unitSuggestionsByIndustry[industry] || unitSuggestionsByIndustry.general)],
  }
}

export function workspaceCatalogueOptions(profile, workspace = 'product-sales') {
  const settings = workspaceCatalogueSettings(profile, workspace)
  return {
    categories: settings.categories.filter(item => !settings.disabledCategories.includes(item)),
    units: settings.units.filter(item => !settings.disabledUnits.includes(item)),
  }
}

export function workspaceCatalogueSettings(profile, workspace = 'product-sales') {
  const value = normalizeShopProfile(profile)
  const saved = value.workspaceCatalogues?.[workspace]
  const defaults = productCatalogueOptions(value.industry)
  return {
    categories: [...(saved ? saved.categories : defaults.categories)],
    units: [...(saved ? saved.units : defaults.units)],
    disabledCategories: [...(saved?.disabledCategories || [])],
    disabledUnits: [...(saved?.disabledUnits || [])],
  }
}

export function normalizeShopProfile(input) {
  if (typeof input === 'string') { try { input = JSON.parse(input) } catch { input = null } }
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {}
  const mode = ['general', 'suggested', 'custom'].includes(input.mode) ? input.mode : 'general'
  const industry = mode === 'general' || !Object.hasOwn(businessModes, input.industry) ? 'general' : input.industry
  const preset = { ...suggestions.general, ...suggestions[industry], categories: categoriesByIndustry[industry] || categoriesByIndustry.general, unit: businessModes[industry].unit }
  const value = { version: 1, mode, industry, ...preset }
  if (mode === 'custom') {
    for (const key of ['itemLabel', 'inventoryLabel', 'unit']) {
      const text = typeof input[key] === 'string' ? input[key].trim().replace(/\s+/g, ' ') : ''
      if (text) value[key] = text.slice(0, key === 'unit' ? 30 : 40)
    }
    if (Array.isArray(input.categories)) value.categories = [...new Set(input.categories.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 30)
  }
  value.workspaceCatalogues = {}
  if (input.workspaceCatalogues && typeof input.workspaceCatalogues === 'object') {
    for (const key of Object.keys(catalogueWorkspaces)) {
      const list = input.workspaceCatalogues[key]
      if (!list || typeof list !== 'object') continue
      const clean = field => Array.isArray(list[field]) ? [...new Set(list[field].filter(item => typeof item === 'string').map(item => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 30) : []
      const categories = clean('categories')
      const units = clean('units')
      const disabledCategories = clean('disabledCategories').filter(item => categories.includes(item))
      const disabledUnits = clean('disabledUnits').filter(item => units.includes(item))
      value.workspaceCatalogues[key] = { categories, units, disabledCategories, disabledUnits }
    }
  }
  if (input.workspaceCatalogues === undefined && input.categories?.length) {
    const legacyWorkspace = industry === 'liquids' ? 'oil-sales' : 'product-sales'
    value.workspaceCatalogues[legacyWorkspace] = { categories: [...value.categories], units: productCatalogueOptions(industry).units, disabledCategories: [], disabledUnits: [] }
  }
  value.fields = normalizeFields(input.fields, industry, value.itemLabel, Number(input.version || 0) < 3 && input.industry === industry)
  value.features = {
    services: typeof input.features?.services === 'boolean' ? input.features.services : industry !== 'supermarket',
    productSales: typeof input.features?.productSales === 'boolean' ? input.features.productSales : industry !== 'liquids',
  }
  value.workflows = ['stock', 'payments', 'both', 'fast-food', 'restaurant'].includes(input.workflows) ? input.workflows : (value.features.services ? 'both' : 'stock')
  value.fastFood = input.fastFood === true || value.workflows === 'fast-food'
  value.restaurant = input.restaurant === true || value.workflows === 'restaurant'
  value.brandColor = /^#[a-f0-9]{6}$/i.test(input.brandColor || '') ? input.brandColor.toLowerCase() : ''
  try { value.reportingTimeZone = reportTimeZone(input.reportingTimeZone ?? 'UTC') } catch { value.reportingTimeZone = 'UTC' }
  value.version = 3
  return value
}

export function businessWorkspace(profile) {
  const value = normalizeShopProfile(profile)
  const supermarket = value.industry === 'supermarket'
  const liquids = value.industry === 'liquids'
  const productStock = liquids || ['stock', 'both'].includes(value.workflows)
  const stock = productStock || value.fastFood || value.restaurant
  return {
    checkoutLabel: supermarket ? 'Checkout' : 'Sell (POS)',
    overviewTitle: supermarket ? 'Supermarket at a glance' : 'Business at a glance',
    overviewDescription: supermarket ? 'Review checkout sales, stock levels, and daily operations.' : 'Review business health, stock, and team activity.',
    liquids,
    oil: liquids,
    productSales: productStock && (!liquids || value.features.productSales),
    services: value.features.services,
    stock,
    payments: ['payments', 'both'].includes(value.workflows),
    fastFood: value.fastFood,
    restaurant: value.restaurant,
  }
}

export function validateShopProfile(input) {
  if (input?.brandColor && !/^#[a-f0-9]{6}$/i.test(input.brandColor)) throw new Error('Choose a six-digit brand colour.')
  reportTimeZone(input?.reportingTimeZone ?? 'UTC')
  validateFields(input?.fields)
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['general', 'suggested', 'custom'].includes(input.mode)
    || !Object.hasOwn(businessModes, input.industry)) throw new Error('Choose a valid shop setup.')
  if (input.mode === 'custom') {
    for (const key of ['itemLabel', 'inventoryLabel', 'unit']) {
      if (typeof input[key] !== 'string' || !input[key].trim() || input[key].trim().length > (key === 'unit' ? 30 : 40)) throw new Error('Enter short names for your items, catalogue and unit.')
    }
    if (!Array.isArray(input.categories) || input.categories.length > 30 || input.categories.some(item => typeof item !== 'string' || item.trim().length > 80)) throw new Error('Use up to 30 categories, with at most 80 characters each.')
  }
  if (input.workspaceCatalogues !== undefined) {
    if (!input.workspaceCatalogues || typeof input.workspaceCatalogues !== 'object' || Array.isArray(input.workspaceCatalogues)) throw new Error('Check the workspace catalogue choices.')
    for (const [key, list] of Object.entries(input.workspaceCatalogues)) {
      if (!Object.hasOwn(catalogueWorkspaces, key) || !list || typeof list !== 'object' || Array.isArray(list)) throw new Error('Check the workspace catalogue choices.')
      for (const field of ['categories', 'units']) if (list[field] !== undefined && (!Array.isArray(list[field]) || list[field].length > 30 || list[field].some(item => typeof item !== 'string' || item.trim().length > 80))) throw new Error('Use up to 30 category or unit choices per workspace, with at most 80 characters each.')
    }
  }
  return normalizeShopProfile(input)
}

// Explicit presets do not change legacy normalization or existing business settings.
export const businessPresets = {
  retail: { label: 'Retail shop / mini-mart', industry: 'general', workflow: 'stock', screen: 'POS', workspace: 'Product sales' },
  supermarket: { label: 'Supermarket', industry: 'supermarket', workflow: 'stock', screen: 'POS', workspace: 'Product sales' },
  liquids: { label: 'Wholesale and retail oil business', industry: 'liquids', workflow: 'stock', screen: 'Oil', workspace: 'Oil sales', unit: 'litre', itemLabel: 'Oil product', inventoryLabel: 'Oil inventory', categories: ['Palm oil', 'Groundnut oil', 'Other oils', 'Containers and supplies'] },
  printing: { label: 'Printing and copy shop', industry: 'printing', workflow: 'payments', screen: 'Payments', workspace: 'Payments & receipts' },
  services: { label: 'Services / church office', industry: 'services', workflow: 'payments', screen: 'Payments', workspace: 'Payments & receipts' },
  takeaway: { label: 'Fast food / takeaway', industry: 'food-service', workflow: 'fast-food', screen: 'Counter', workspace: 'Order counter' },
  restaurant: { label: 'Restaurant', industry: 'food-service', workflow: 'restaurant', screen: 'Restaurant', workspace: 'Tables & tabs' },
  bar: { label: 'Bar / lounge', industry: 'drinks', workflow: 'restaurant', screen: 'Restaurant', workspace: 'Tables & tabs' },
}
export function applyBusinessPreset(profile, key) {
  if (!Object.hasOwn(businessPresets, key)) throw new Error('Choose a business preset.')
  const preset = businessPresets[key]
  const current = normalizeShopProfile(profile)
  const defaults = current.mode === 'custom' ? {} : Object.fromEntries(['unit', 'itemLabel', 'inventoryLabel', 'categories'].filter(name => preset[name] !== undefined).map(name => [name, preset[name]]))
  const targetCatalogue = ({ Oil: 'oil-sales', POS: 'product-sales', Payments: undefined, Counter: 'order-counter', Restaurant: 'tables-tabs' })[preset.screen]
  const workspaceCatalogues = { ...current.workspaceCatalogues }
  const currentFieldIds = new Set(current.fields.map(field => field.id))
  const customCount = current.fields.filter(field => field.id.startsWith('custom_')).length
  const lookupFields = templateFields(preset.industry, preset.itemLabel || current.itemLabel).filter(field => field.lookupKey && !currentFieldIds.has(field.id)).slice(0, Math.max(0, 40 - customCount))
  if (current.mode !== 'custom' && targetCatalogue) workspaceCatalogues[targetCatalogue] = {
    categories: [...(preset.categories || categoriesByIndustry[preset.industry] || categoriesByIndustry.general)],
    units: [...(unitSuggestionsByIndustry[preset.industry] || unitSuggestionsByIndustry.general)],
    disabledCategories: [], disabledUnits: [],
  }
  return validateShopProfile({ ...current, ...defaults, industry: preset.industry, fields: [...current.fields, ...lookupFields],
    workspaceCatalogues,
    mode: current.mode === 'custom' ? 'custom' : 'suggested',
    features: { ...current.features, productSales: preset.industry !== 'liquids' },
    workflows: preset.workflow, fastFood: preset.workflow === 'fast-food', restaurant: preset.workflow === 'restaurant' })
}

// Owner-facing workflow scope; catalogue choices keep their existing stored keys.
export const businessPresetGuidance = {
  retail: 'Stock checkout, receipts, returns and cash shifts. Configure actual items and devices before trading.',
  supermarket: 'Stock checkout and supplier operations. Weighed goods require configured keyboard readings or supported weight labels; verify your hardware.',
  liquids: 'Measured oil and container sales with optional bulk/customer rates. Configure products, containers and prices before trading.',
  printing: 'Receipts and optional jobs, estimates, invoices, deposits and recorded material costs. Configure service prices and material requirements.',
  services: 'Receipts, reusable service prices and optional jobs/invoices. Church collections adds funds, donors, pledges and statements; it does not provide full charity accounts or appointment booking.',
  takeaway: 'Menu orders, preparation, payment and handover, with optional recipes and food batches. Configure the menu and costs; online QR ordering requires internet.',
  restaurant: 'Tables, rounds, partial settlement and table reservations. Configure your menu and tables; reservation deposits are not provided.',
  bar: 'Tables and named tabs, rounds, settlement and table reservations. Configure drinks and stock links; admission and memberships are not managed.',
}
