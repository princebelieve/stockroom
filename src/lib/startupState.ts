export type StartupSettings = {
  ownerConfigured?: boolean
  cloudConfigured?: boolean
  existingBusiness?: boolean
}

export function resolveStartupState(settings: StartupSettings) {
  const ownerConfigured = settings.ownerConfigured === true
  const cloudConfigured = settings.cloudConfigured === true
  const existingBusiness = settings.existingBusiness === true
  const hasExistingDevice = cloudConfigured || existingBusiness || ownerConfigured

  return {
    hasExistingDevice,
    installerRequired: !hasExistingDevice && !ownerConfigured,
    setupRequired: !hasExistingDevice && !ownerConfigured,
  }
}
