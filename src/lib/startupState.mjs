export function resolveStartupState(settings = {}) {
  const ownerConfigured = settings.ownerConfigured === true
  const cloudConfigured = settings.cloudConfigured === true
  const existingBusiness = settings.existingBusiness === true
  const hasExistingDevice = cloudConfigured || existingBusiness

  return {
    hasExistingDevice,
    installerRequired: !hasExistingDevice,
    setupRequired: !hasExistingDevice && !ownerConfigured,
  }
}
