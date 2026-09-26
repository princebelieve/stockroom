import { createHmac } from 'node:crypto'

export async function completeOwnerPasswordReset({ token, password, jwtSecret, passwordResets, accounts, refreshTokens, hashPassword, createAccessToken }) {
  const nextPassword = String(password || '')
  if (nextPassword.length < 10) throw new Error('Password must be at least 10 characters.')

  const tokenHash = createHmac('sha256', jwtSecret).update(String(token || '')).digest('hex')
  const reset = await passwordResets.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!reset) throw new Error('The reset link is invalid or has expired.')

  const account = await accounts.findOneAndUpdate(
    { _id: reset.accountId, role: 'owner' },
    { $set: { passwordHash: hashPassword(nextPassword), passwordChangedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!account) throw new Error('Only an owner password can be reset by email.')

  // Revoke owner refresh sessions, while keeping enrolled device identities
  // and their device credentials intact so a password reset doesn't disconnect
  // every installation or affect its local data and sync queue.
  await refreshTokens.deleteMany({ accountId: account._id })
  return { account, accessToken: createAccessToken(account) }
}
