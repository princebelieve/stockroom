import assert from 'node:assert/strict'
import test from 'node:test'
import { createUser, listUsers, updateUserRole } from '../server/db.mjs'

test('team member records get valid timestamps and admins can be demoted to cashier', () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const memberId = `team-role-${suffix}`
  const created = createUser({
    id: memberId,
    name: 'Team Admin',
    email: `team-admin-${suffix}@example.com`,
    username: `teamadmin${suffix.slice(0, 8)}`,
    password: 'Password123',
    role: 'admin',
  })

  assert.ok(created.createdAt)
  assert.doesNotThrow(() => new Date(created.createdAt).toISOString())

  const demoted = updateUserRole(memberId, 'cashier', false)
  assert.equal(demoted.role, 'cashier')
  assert.equal(demoted.operationalAccess, false)

  const row = listUsers().find((user) => user.id === memberId)
  assert.ok(row)
  assert.equal(row.role, 'cashier')
  assert.equal(row.operationalAccess, false)
})
