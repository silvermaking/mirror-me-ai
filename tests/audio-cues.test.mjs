import assert from "node:assert/strict";
import test from "node:test";

import { audioCuePlan } from "../src/audio.mjs";

test("oscillator fallback preserves the locked combat roles and delays", () => {
  const expected = {
    combine: [["cable-gather", .16]], lock: [["lock-body", 0], ["lock-latch", .045]],
    prediction_strike: [["driver-load", 0]], attack: [["blade-air", 0], ["blade-edge", .018]],
    armor_hit: [["porcelain-armor", 0]], outsmart: [["empty-plate", 0], ["chassis-collapse", .07], ["core-open", .13]],
    core_hit: [["core-contact", 0]], player_hit: [["player-hit", 0]], outsmart_confirmed: [],
  };
  for (const [event, roles] of Object.entries(expected)) {
    assert.deepEqual(audioCuePlan(event).map(({ role, delay }) => [role, delay]), roles);
  }
});

test("remember fallback is a three-step physical latch family", () => {
  const roles = [1, 2, 3].map((count) => audioCuePlan({ type: "remember", memory: Array(count).fill("left") })[0].role);
  assert.deepEqual(roles, ["memory-latch-1", "memory-latch-2", "memory-latch-3"]);
});
