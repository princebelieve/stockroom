type CameraMediaDevices = Pick<MediaDevices, 'getUserMedia'>

export function requiresRearCamera(userAgent: string, platform: string, maxTouchPoints: number) {
  // DevTools device emulation can override userAgent without changing the
  // actual Windows platform. Honor an explicit desktop platform first.
  if (/^Win/i.test(platform) || /^Linux x86/i.test(platform)) return false
  if (/^Mac/i.test(platform)) return maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
}

/** Phones require their rear camera; desktops use their available webcam. */
export async function requestBarcodeCamera(mediaDevices: CameraMediaDevices, requireRearCamera: boolean) {
  return mediaDevices.getUserMedia({ video: requireRearCamera ? { facingMode: { exact: 'environment' } } : { facingMode: { ideal: 'user' } } })
}

export function cameraAccessUnavailableMessage(secureContext: boolean, mediaDevicesPresent: boolean, requireRearCamera: boolean) {
  if (!secureContext) return 'Camera access requires a secure HTTPS connection. Open Stockroom at its HTTPS address.'
  if (!mediaDevicesPresent && requireRearCamera) return 'This mobile app window does not expose the browser camera API. Open Stockroom in Safari or your mobile browser, then try the scanner again.'
  if (!mediaDevicesPresent) return 'This browser window does not expose the camera API. Open Stockroom in a supported browser, then try the scanner again.'
  return 'This browser does not expose camera access. Open Stockroom directly in Safari, then try the scanner again.'
}

export function cameraFailureMessage(error: unknown, requireRearCamera: boolean) {
  const failure = error instanceof Error ? error : new Error(String(error))
  if (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') return requireRearCamera
    ? 'Camera permission was denied or blocked. Allow camera access for Stockroom in Safari or your phone settings, then try again.'
    : 'Camera permission was denied or blocked. Allow camera access for Stockroom in your browser or operating system settings, then try again.'
  if (failure.name === 'NotFoundError' || failure.name === 'OverconstrainedError') return requireRearCamera
    ? 'The browser could not find a rear-facing camera. Check that the mobile device rear camera is available, then try again.'
    : 'The browser could not find an available camera. Connect or enable a webcam, then try again.'
  if (failure.name === 'NotReadableError' || failure.name === 'AbortError') return `The ${requireRearCamera ? 'rear camera' : 'camera'} could not start. Close other apps using the camera and try again.`
  return `The ${requireRearCamera ? 'rear camera' : 'camera'} could not start (${failure.name}: ${failure.message}).`
}

/** Wait for React to mount the scanner preview after its dialog state changes. */
export async function waitForCameraPreview<T>(
  getPreview: () => T | null,
  isCurrent: () => boolean,
  nextFrame: (callback: FrameRequestCallback) => number = callback => requestAnimationFrame(callback),
) {
  let preview = getPreview()
  for (let attempt = 0; !preview && attempt < 10 && isCurrent(); attempt += 1) {
    await new Promise<void>(resolve => nextFrame(() => resolve()))
    preview = getPreview()
  }
  return preview
}
