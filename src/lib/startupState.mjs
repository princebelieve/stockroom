export function resolveStartupState(settings = {}) {
  const ownerConfigured = settings.ownerConfigured === true
  const cloudConfigured = settings.cloudConfigured === true
  const existingBusiness = settings.existingBusiness === true
  const hasExistingDevice = cloudConfigured || existingBusiness
  const requiresSetup = !hasExistingDevice && !ownerConfigured

  return {
    hasExistingDevice,
    installerRequired: requiresSetup,
    setupRequired: requiresSetup,
  }
}
