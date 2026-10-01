export type FormReading = { fields: Record<'name' | 'barcode' | 'sku' | 'category' | 'unit' | 'stock' | 'reorder' | 'cost' | 'price', { value: string | number | null; state: 'blank' | 'uncertain' | 'suggested' }>; provider: string; template: string }
export function extractProductForm(annotation: unknown, provider?: string): FormReading
