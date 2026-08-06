import assert from "node:assert/strict";
import test from "node:test";

import { TOUCH_TAP_LATCH_SECONDS, createTouchMovementLatch } from "../src/touch-movement-latch.mjs";

test("a released directional touch keeps one 180ms movement intent", () => {
  const latch = createTouchMovementLatch();
  latch.press("right", 5);
  assert.deepEqual(latch.movement(5.001), { moveX: 1, moveY: 0 });
  assert.deepEqual(latch.movement(5 + TOUCH_TAP_LATCH_SECONDS - .001), { moveX: 1, moveY: 0 });
  assert.deepEqual(latch.movement(5 + TOUCH_TAP_LATCH_SECONDS), { moveX: 0, moveY: 0 });
});

test("opposite taps cancel only stale latches while simultaneous held touches still sum", () => {
  const latch = createTouchMovementLatch();
  latch.press("left", 1);
  latch.press("right", 1.02);
  assert.deepEqual(latch.movement(1.03), { moveX: 1, moveY: 0 });

  latch.press("left", 2);
  assert.deepEqual(latch.movement(2.01, ["left", "right"]), { moveX: 0, moveY: 0 });
  assert.deepEqual(latch.movement(2.01, ["left"]), { moveX: -1, moveY: 0 });
});

test("reset removes every short-tap intent for start, restart, blur and visibility lifecycles", () => {
  const latch = createTouchMovementLatch();
  latch.press("up", 3);
  latch.press("right", 3.01);
  latch.reset();
  assert.deepEqual(latch.movement(3.02), { moveX: 0, moveY: 0 });
});
