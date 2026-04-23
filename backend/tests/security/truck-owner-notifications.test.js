import test from 'node:test';
import assert from 'node:assert/strict';

import { PUBLIC_ROLES } from '../../src/routes/auth.js';
import UserModel from '../../src/schemas/UserSchema.js';
import NotificationModel from '../../src/schemas/NotificationSchema.js';

// ── Role enum ──────────────────────────────────────────────────────────────
test('truck_owner is a public role', () => {
  assert.ok(PUBLIC_ROLES.includes('truck_owner'), 'PUBLIC_ROLES must include truck_owner');
  assert.ok(!PUBLIC_ROLES.includes('admin'), 'admin is never a public role');
});

test('User schema accepts truck_owner on the role enum', () => {
  const roleEnum = UserModel.schema.path('role').enumValues;
  assert.ok(roleEnum.includes('truck_owner'), 'UserSchema.role enum must include truck_owner');
  assert.ok(roleEnum.includes('shipper'));
  assert.ok(roleEnum.includes('driver'));
  assert.ok(roleEnum.includes('broker'));
  assert.ok(roleEnum.includes('admin'));
});

test('User schema rejects an unknown role value', () => {
  const doc = new UserModel({
    name: 'Nobody',
    email: 'nobody@example.com',
    password: 'Short@1',
    role: 'something-else',
  });
  const err = doc.validateSync();
  assert.ok(err, 'Expected validation error for invalid role');
  assert.ok(err.errors && err.errors.role, 'Expected role validation error');
});

// ── Notification schema shape ──────────────────────────────────────────────
test('Notification schema requires userId, type, title', () => {
  const doc = new NotificationModel({});
  const err = doc.validateSync();
  assert.ok(err, 'Expected validation error');
  assert.ok(err.errors.userId, 'userId should be required');
  assert.ok(err.errors.type, 'type should be required');
  assert.ok(err.errors.title, 'title should be required');
});

test('Notification schema defaults readAt to null and stores meta', () => {
  const doc = new NotificationModel({
    userId: '507f1f77bcf86cd799439011',
    type: 'bid:placed',
    title: 'Hello',
    meta: { loadId: 'L-ABC' },
  });
  const err = doc.validateSync();
  assert.equal(err, undefined, 'Valid doc should not produce validation errors');
  assert.equal(doc.readAt, null);
  assert.equal(doc.meta.loadId, 'L-ABC');
  assert.ok(doc.createdAt instanceof Date);
});

test('Notification title field is length-capped to 200 chars', () => {
  const doc = new NotificationModel({
    userId: '507f1f77bcf86cd799439011',
    type: 'x',
    title: 'x'.repeat(201),
  });
  const err = doc.validateSync();
  assert.ok(err, 'Expected length validation error for title > 200');
  assert.ok(err.errors.title, 'title should have a length error');
});
