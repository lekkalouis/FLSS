import test from 'node:test';
import assert from 'node:assert/strict';

import { numberOrDefault } from '../src/utils/number.js';

test('numberOrDefault returns parsed number for valid inputs', () => {
  assert.equal(numberOrDefault('42', 10), 42);
  assert.equal(numberOrDefault('12.5', 10), 12.5);
});

test('numberOrDefault falls back for invalid and out-of-range values', () => {
  assert.equal(numberOrDefault(undefined, 5), 5);
  assert.equal(numberOrDefault('abc', 5), 5);
  assert.equal(numberOrDefault('-1', 5, { min: 0 }), 5);
});
