export type BusinessMode =
  | 'general' | 'grocery' | 'supermarket' | 'wholesale' | 'food-service'
  | 'food-manufacturing' | 'bakery' | 'drinks' | 'hotel' | 'pharmacy'
  | 'health-beauty' | 'clothing' | 'electronics' | 'building' | 'cement'
  | 'automotive' | 'agriculture' | 'furniture' | 'office' | 'books'
  | 'hardware' | 'hospitality' | 'bulk' | 'services'
export const businessModes: Record<BusinessMode, { label: string; unit: string; note: string }> = {
  general: { label: 'General retail', unit: 'item', note: 'Use for mixed packaged goods and everyday retail.' },
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
export function BusinessProfileSettings({ value, onChange }: { value: BusinessMode; onChange: (value: BusinessMode) => void }) {
  return <label>Business type<span>{businessModes[value].note}</span><select value={value} onChange={event => onChange(event.target.value as BusinessMode)}>{Object.entries(businessModes).map(([key, mode]) => <option key={key} value={key}>{mode.label}</option>)}</select></label>
}
