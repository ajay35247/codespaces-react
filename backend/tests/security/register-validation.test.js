import test from 'node:test';
import assert from 'node:assert/strict';
import { validationResult } from 'express-validator';

import { PUBLIC_ROLES, registerValidationRules } from '../../src/routes/auth.js';

const validBasePayload = {
  name: 'Public User',
  email: 'person@gmail.com',
  password: 'Short@1',
  phone: '+91 9876543210',
  gstin: '27AAPCU9603R1Z0',
};

async function getValidationErrors(body) {
  const req = { body };
  for (const validator of registerValidationRules) {
    await validator.run(req);
  }
  return validationResult(req).array().map((entry) => entry.msg);
}

test('register validators allow every public role', async () => {
  for (const role of PUBLIC_ROLES) {
    const errors = await getValidationErrors({
      ...validBasePayload,
      role,
    });

    assert.deepEqual(errors, [], `Expected no validation errors for role: ${role}`);
  }
});

test('register validators allow personal Gmail accounts', async () => {
  const errors = await getValidationErrors({
    ...validBasePayload,
    role: 'shipper',
    email: 'sample.person@gmail.com',
  });

  assert.deepEqual(errors, []);
});

test('register validators reject malformed email', async () => {
  const errors = await getValidationErrors({
    ...validBasePayload,
    role: 'driver',
    email: 'not-an-email',
  });

  assert.equal(errors.includes('Please enter a valid email address.'), true);
});

test('register validators reject unsupported role', async () => {
  const errors = await getValidationErrors({
    ...validBasePayload,
    role: 'admin',
  });

  assert.equal(errors.includes('Role must be one of: shipper, driver, fleet-manager, broker.'), true);
});

test('register validators reject weak password length', async () => {
  const errors = await getValidationErrors({
    ...validBasePayload,
    role: 'broker',
    password: 'ab12',
  });

  assert.equal(errors.includes('Password must be between 6 and 8 characters.'), true);
});

test('register validators reject password longer than 8 characters', async () => {
  const errors = await getValidationErrors({
    ...validBasePayload,
    role: 'broker',
    password: 'Stronger@1234',
  });

  assert.equal(errors.includes('Password must be between 6 and 8 characters.'), true);
});
