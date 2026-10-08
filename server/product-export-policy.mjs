// Evaluate the cloud's current entitlement and the snapshotted developer fee.
// Trading grace remains available, but catalogue downloads require current access.
export function productExportEligibility(access, record, configured = {}) {
  const started = Boolean(record?.reference || record?.exportedAt)
  const feeAmount = Number(started ? record.amount : configured.productExportFeeAmount) || 0
  const subscriptionAvailable = access?.blocked === false && ['active', 'trial', 'test', 'free'].includes(access.status)
  const error = record?.closedAt ? 'This business has completed its Stockroom exit.'
    : !subscriptionAvailable ? 'An active subscription or trial is required to download the product catalogue. Renew your subscription first.'
    : feeAmount > 0 && !record?.paidAt ? 'Complete the developer-configured one-time product export payment before downloading.' : ''
  return { canExport: !error, exportError: error, subscriptionAvailable, feeAmount }
}
