function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Match every typed word as a fragment of at least one searchable field. */
export function matchesSearchText(query: string, fields: unknown[]): boolean {
  const terms = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean)
  if (!terms.length) return true
  const searchable = fields.map(normalizeSearchText).filter(Boolean)
  return terms.every(term => searchable.some(field => field.includes(term)))
}
