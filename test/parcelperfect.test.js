import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractQuoteFromV28,
  normalizeMatrixDestinations,
  normalizeWeights,
  pickQuoteRate,
  selectMatrixDestinations,
  SOUTH_AFRICA_MATRIX_CENTRES
} from '../src/services/parcelperfect.js';

test('normalizeWeights keeps unique positive numeric weights and sorts ascending', () => {
  assert.deepEqual(normalizeWeights([5, '2', -1, 'abc', 2, 1.5555]), [1.556, 2, 5]);
});

test('normalizeMatrixDestinations filters invalid destinations and normalizes type', () => {
  assert.deepEqual(
    normalizeMatrixDestinations([
      { place: 1234, town: 'Cape Town', type: 'major' },
      { place: '5678', name: 'Mthatha', type: 'regional' },
      { place: null, town: 'Invalid' }
    ]),
    [
      {
        place: 1234,
        town: 'Cape Town',
        name: 'Cape Town',
        type: 'major',
        postcode: null,
        province: null
      },
      {
        place: 5678,
        town: 'Mthatha',
        name: 'Mthatha',
        type: 'regional',
        postcode: null,
        province: null
      }
    ]
  );
});

test('extractQuoteFromV28 supports both top-level and nested result payloads', () => {
  assert.deepEqual(extractQuoteFromV28({ quoteno: 'Q1', rates: [{ service: 'SWE' }] }), {
    quoteno: 'Q1',
    rates: [{ service: 'SWE' }]
  });

  assert.deepEqual(extractQuoteFromV28({ result: { quoteno: 'Q2', rates: [{ service: 'ECO' }] } }), {
    quoteno: 'Q2',
    rates: [{ service: 'ECO' }]
  });
});

test('pickQuoteRate returns preferred service when available, else first rate', () => {
  const rates = [{ service: 'ECO' }, { service: 'SWE' }];
  assert.deepEqual(pickQuoteRate(rates, 'swe'), { service: 'SWE' });
  assert.deepEqual(pickQuoteRate(rates, 'missing'), { service: 'ECO' });
});


test('selectMatrixDestinations falls back to built-in South African centres', () => {
  const destinations = selectMatrixDestinations([], 'all');
  assert.equal(destinations.length, SOUTH_AFRICA_MATRIX_CENTRES.length);
});

test('selectMatrixDestinations filters by major or regional centre type', () => {
  const majorOnly = selectMatrixDestinations([], 'major');
  const regionalOnly = selectMatrixDestinations([], 'regional');
  assert.ok(majorOnly.length > 0);
  assert.ok(regionalOnly.length > 0);
  assert.ok(majorOnly.every((item) => item.type === 'major'));
  assert.ok(regionalOnly.every((item) => item.type === 'regional'));
});
