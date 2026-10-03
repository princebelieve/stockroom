export function validQuantity(value, minimum = 0) {
  const n = Number(value)
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= minimum && Number.isSafeInteger(Math.round(n * 1000)) && Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001
}
export function quantity(value, minimum = 0) {
  if (!validQuantity(value, minimum)) throw new Error('Enter a valid quantity with at most three decimal places.')
  return Math.round(Number(value) * 1000) / 1000
}
