type CameraMediaDevices = Pick<MediaDevices, 'getUserMedia'>

/** Request the rear camera; do not silently switch to a front-facing camera. */
export async function requestBarcodeCamera(mediaDevices: CameraMediaDevices) {
  return mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } })
}

export function cameraAccessUnavailableMessage(secureContext: boolean, mediaDevicesPresent: boolean) {
  if (!secureContext) return 'Camera access requires a secure HTTPS connection. Open Stockroom at its HTTPS address.'
  if (!mediaDevicesPresent) return 'This iPhone app window does not expose the browser camera API. Open Stockroom directly in Safari, then try the scanner again.'
  return 'This browser does not expose camera access. Open Stockroom directly in Safari, then try the scanner again.'
}

export function cameraFailureMessage(error: unknown) {
  const failure = error instanceof Error ? error : new Error(String(error))
  if (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') return 'Camera permission was denied or blocked. Allow camera access for Stockroom in Safari or iPhone Settings, then try again.'
  if (failure.name === 'NotFoundError' || failure.name === 'OverconstrainedError') return 'The browser could not find a rear-facing camera. Check that the iPhone rear camera is available, then try again.'
  if (failure.name === 'NotReadableError' || failure.name === 'AbortError') return 'The rear camera could not start. Close other apps using the camera and try again.'
  return `The rear camera could not start (${failure.name}: ${failure.message}).`
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
