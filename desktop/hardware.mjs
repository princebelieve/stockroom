import { createConnection } from 'node:net'

export function hardwareCommand(options) {
  if (!options || typeof options.host !== 'string' || !/^[a-zA-Z0-9.-]{1,253}$/.test(options.host) || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Enter a printer hostname/IP and a port from 1 to 65535.')
  if (options.action === 'drawer' && [0, 1].includes(options.pin)) return Buffer.from([27, 112, options.pin, 25, 250])
  if (options.action === 'cut' && ['full', 'partial'].includes(options.cut)) return Buffer.from([10, 29, 86, options.cut === 'full' ? 65 : 66, 0])
  throw new Error('Invalid hardware command.')
}

export async function sendHardwareCommand(options) {
  const bytes = hardwareCommand(options)
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port })
    const deadline = setTimeout(() => socket.destroy(new Error('Printer connection timed out. Check the device before retrying.')), 5000)
    socket.once('error', reject)
    socket.once('close', () => clearTimeout(deadline))
    socket.once('connect', () => socket.end(bytes, () => { socket.destroy(); resolve() }))
  })
}
