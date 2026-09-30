import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { format: 'jwk' },
  privateKeyEncoding: { format: 'jwk' },
})
const publicBytes = Buffer.concat([Buffer.from([4]), Buffer.from(publicKey.x, 'base64url'), Buffer.from(publicKey.y, 'base64url')])
console.log(`VAPID_PUBLIC_KEY=${publicBytes.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey.d}`)
console.log('VAPID_SUBJECT=mailto:support@sbi.globalcreest.com')
