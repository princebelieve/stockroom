export function conflictReview(input, user) {
  if (!['owner', 'admin'].includes(user?.role)) throw new Error('Owner or admin access required.')
  const note = typeof input?.note === 'string' ? input.note.trim() : ''
  if (!['corrected', 'accepted'].includes(input?.action) || input.confirmed !== true || note.length < 10 || note.length > 1000) throw new Error('Inspect both versions, verify the current records, and explain the correction or accepted outcome (10-1000 characters).')
  return { action: input.action, note, reviewerId: user.id, reviewedAt: new Date().toISOString() }
}
export const conflictReviewSchema = 'CREATE TABLE IF NOT EXISTS sync_conflict_reviews (conflict_id TEXT PRIMARY KEY, action TEXT NOT NULL, note TEXT NOT NULL, reviewer_id TEXT NOT NULL, reviewed_at TEXT NOT NULL)'
