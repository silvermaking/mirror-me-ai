import assert from "node:assert/strict";
import test from "node:test";

import { PHASE, createGameState, timingForRound } from "../src/game-core.mjs";
import {
  classicAttackVisualPlan,
  classicBladeContactPlan,
  classicCoreScreenAnchor,
  classicCoreVisualPlan,
  classicFirstRunGuidanceStage,
} from "../src/render-classic.mjs";

function attackState(remaining, { hit = false, armor = false } = {}) {
  const state = createGameState({ started: true });
  state.phase = hit ? PHASE.CORE_OPEN : PHASE.EXPLORE;
  state.player = { ...state.player, x: 18, y: -34 };
  state.boss = { ...state.boss, coreOpen: hit };
  state.lock = hit
    ? { side: "right", origin: { x: 0, y: 80 }, zone: { x: 154, y: -4 } }
    : null;
  state.visual.attack = { hit, armor, remaining };
  if (hit) {
    state.visual.impact = {
      x: state.boss.x,
      y: state.boss.y,
      tone: "core",
      remaining: 0.3,
    };
  }
  return state;
}

test("one attack has contact, cut and recoil poses with a mobile-readable sweep", () => {
  const samples = [
    attackState(0.239),
    attackState(0.16),
    attackState(0.08),
  ].map((state) => classicBladeContactPlan(state, 1));

  assert.deepEqual(samples.map((sample) => sample.motion.phase), ["contact", "cut", "cut"]);
  const sweep = Math.abs(samples[2].angle - samples[0].angle);
  assert.ok(sweep >= Math.PI / 4, `${sweep}rad is less than a 45deg sweep`);
  const cssTravelAt320 = Math.hypot(
    samples[2].tip.x - samples[0].tip.x,
    samples[2].tip.y - samples[0].tip.y,
  ) * 0.25;
  assert.ok(cssTravelAt320 >= 12, `${cssTravelAt320}px travel is too small at 320px`);
  assert.equal(new Set(samples.map((sample) => sample.angle.toFixed(4))).size, 3);
});

test("direct HP result starts with blade, core and impact on the same anchor", () => {
  const state = attackState(0.239, { hit: true });
  const blade = classicBladeContactPlan(state, 2.2);
  const core = classicCoreScreenAnchor(state, 2.2);
  assert.equal(classicAttackVisualPlan(state).contact, true);
  assert.ok(Math.hypot(blade.tip.x - core.x, blade.tip.y - core.y) <= 1);
});

test("settled open core is at least ten CSS pixels across at 320x180", () => {
  const state = attackState(0, { hit: true });
  state.visual.attack = null;
  state.visual.impact = null;
  const duration = timingForRound(1).coreOpen;
  state.phaseTime = duration - 0.24;
  const core = classicCoreVisualPlan(state, 1.4);
  assert.equal(core.open, true);
  assert.ok(core.exposure >= 0.95);
  assert.ok(core.radius * 2 * 0.25 >= 10);
  assert.ok(core.reflectionAlpha >= 0.3);
});

test("OUTSMART exposure alone never manufactures a hit response", () => {
  const state = attackState(0, { hit: true });
  state.visual.attack = null;
  state.visual.impact = null;
  const plan = classicCoreVisualPlan(state, 0);
  assert.equal(Number.isFinite(plan.hitAge), false);
  assert.equal(plan.shutterKick, 0);
});

test("first-run guidance follows the physical cause instead of preceding it", () => {
  const state = createGameState({ started: true });
  state.round = 1;
  state.elapsed = 0.2;
  state.phase = PHASE.ENGAGE;
  assert.equal(classicFirstRunGuidanceStage(state), null);

  state.phase = PHASE.EXPLORE;
  assert.equal(classicFirstRunGuidanceStage(state), "escape");

  state.phase = PHASE.LOCK;
  state.lock = { side: "right", origin: { x: 0, y: 80 }, zone: { x: 154, y: -4 } };
  state.predictedSide = "right";
  assert.equal(classicFirstRunGuidanceStage(state), "opposite");

  state.phase = PHASE.CORE_OPEN;
  state.boss.coreOpen = true;
  assert.equal(classicFirstRunGuidanceStage(state), "core");
});
