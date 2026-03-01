import test from 'node:test';
import assert from 'node:assert/strict';

import {
  syncState,
  getState,
  next,
  confirmHold,
  adjustPackedQty,
  setPackedQty
} from '../src/services/dispatchController.js';

test('next walks line items before rolling to next order', () => {
  syncState({
    queueOrderIds: ['1001', '1002'],
    lineItemKeysByOrderId: {
      '1001': ['a', 'b'],
      '1002': ['x']
    }
  });

  let state = getState();
  assert.equal(state.selectedOrderId, '1001');
  assert.equal(state.selectedLineItemKey, 'a');

  state = next();
  assert.equal(state.selectedOrderId, '1001');
  assert.equal(state.selectedLineItemKey, 'b');

  state = next();
  assert.equal(state.selectedOrderId, '1002');
  assert.equal(state.selectedLineItemKey, 'x');
});

test('quantity prompt adjusts and commits packed quantity', () => {
  syncState({
    queueOrderIds: ['2001'],
    lineItemKeysByOrderId: {
      '2001': ['line-1']
    }
  });

  let state = confirmHold();
  assert.equal(state.quantityPromptOpen, true);
  assert.equal(state.quantityPromptTargetLineItemKey, 'line-1');

  state = adjustPackedQty({ delta: 1 });
  assert.equal(state.quantityPromptOpen, true);
  assert.equal(state.quantityPromptQty, 1);

  state = setPackedQty({ qty: state.quantityPromptQty });
  assert.equal(state.quantityPromptOpen, false);
  assert.equal(state.lastPackedQtyCommittedLineItemKey, 'line-1');
  assert.equal(state.lastPackedQtyCommittedQty, 1);
});
