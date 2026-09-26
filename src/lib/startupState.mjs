export function resolveStartupState(settings = {}) {
  const ownerConfigured = settings.ownerConfigured === true
  const cloudConfigured = settings.cloudConfigured === true
  const existingBusiness = settings.existingBusiness === true
  const hasExistingDevice = cloudConfigured || existingBusiness || ownerConfigured
  const requiresSetup = !hasExistingDevice

  return {
    hasExistingDevice,
    installerRequired: requiresSetup,
    setupRequired: requiresSetup,
  }
}
