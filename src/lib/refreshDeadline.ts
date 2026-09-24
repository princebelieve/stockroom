export function refreshDeadline(milliseconds = 30_000) {
  const controller = new AbortController()
  const error = new Error('Refresh timed out. Check your connection and try again.')
  const timer = setTimeout(() => controller.abort(error), milliseconds)
  return {
    signal: controller.signal,
    async wait<T>(operation: Promise<T>): Promise<T> {
      controller.signal.throwIfAborted()
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(error)
        controller.signal.addEventListener('abort', abort, { once: true })
        operation.then(value => {
          if (controller.signal.aborted) reject(error)
          else resolve(value)
        }, reject).finally(() => controller.signal.removeEventListener('abort', abort))
      })
    },
    dispose() { clearTimeout(timer) },
  }
}
