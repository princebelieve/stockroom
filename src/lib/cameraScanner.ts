type CameraMediaDevices = Pick<MediaDevices, 'getUserMedia'>

/** Open the rear camera when possible, then retry without a facing constraint. */
export async function requestBarcodeCamera(mediaDevices: CameraMediaDevices) {
  try {
    // Preserve the original rear-camera request used by Android and desktop
    // browsers that honor the facingMode constraint.
    return await mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch (strictError) {
    try {
      return await mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
    } catch {
      try { return await mediaDevices.getUserMedia({ video: true }) }
      catch { throw strictError }
    }
  }
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
