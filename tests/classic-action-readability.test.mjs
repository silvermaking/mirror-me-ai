import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG, PHASE, createGameState, timingForRound } from "../src/game-core.mjs";
import {
  classicAttackVisualPlan,
  classicBladeContactPlan,
  classicBossMotionPlan,
  classicCoreScreenAnchor,
  classicCoreVisualPlan,
  CLASSIC_TUTORIAL_CUE_SECONDS,
  classicMemoryEscapeChevronPlan,
  classicExploreTutorialLabel,
  classicTrackingGatePlan,
  classicTrackingGateConnectionPlan,
  classicTutorialCueVisible,
  consumeClassicTutorialCueEvents,
  createClassicTutorialCueState,
  projectWorld,
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

test("first-run explore cues repeat once per physical sample and reset on a new run", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.EXPLORE;
  state.explore = { lineX: 0, sampleEligible: true };
  const cues = createClassicTutorialCueState();
  const explore = { id: 11, type: "explore_warning" };
  const first = consumeClassicTutorialCueEvents(cues, state, [explore], 2);
  assert.equal(first.kind, "wasd"); assert.equal(first.sampleNumber, 1); assert.equal(first.expiresAt, Infinity);
  assert.equal(classicTutorialCueVisible(first, state, 2 + CLASSIC_TUTORIAL_CUE_SECONDS * 3), true, "the first cue remains through its explore window");
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [explore], 2.1), first, "the same event cannot renew a rendered cue");
  state.memory = ["left"];
  const second = consumeClassicTutorialCueEvents(cues, state, [{ id: 12, type: "explore_warning" }], 2.2);
  assert.equal(second.kind, "wasd"); assert.equal(second.sampleNumber, 2);
  state.memory = ["left", "right"];
  const third = consumeClassicTutorialCueEvents(cues, state, [{ id: 13, type: "explore_warning" }], 2.3);
  assert.equal(third.kind, "wasd"); assert.equal(third.sampleNumber, 3);
  state.memory = ["left", "right", "left"];
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [{ id: 14, type: "explore_warning" }], 2.4), third, "a full memory rack cannot start a fourth explore cue");
  assert.deepEqual(classicExploreTutorialLabel(first, 1280), { mode: "keyboard", text: "WASD · 1/3" });
  assert.deepEqual(classicExploreTutorialLabel(third, 320), { mode: "touch", text: "TAP ← 3/3 →" });
  assert.deepEqual(classicExploreTutorialLabel(second, 1280, true), { mode: "touch", text: "TAP ← 2/3 →" });
  state.phase = PHASE.EXPLORE_RECOVER;
  assert.equal(classicTutorialCueVisible(third, state, 9), false, "the cue vanishes immediately on explore resolution");
  state.phase = PHASE.EXPLORE;
  state.memory = [];
  const lock = { id: 15, type: "lock", side: "right" };
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [lock], 2.5).kind, "opposite");
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [{ id: 16, type: "outsmart", side: "right" }], 2.6).kind, "attack");
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [{ id: 17, type: "core_hit", windowHits: 2 }], 2.7).kind, "exit");
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [{ id: 18, type: "core_hit", windowHits: 3 }], 2.8).kind, "exit", "each physical late hit gets only its own 600ms exit arrow");
  consumeClassicTutorialCueEvents(cues, state, [{ id: 19, type: "restart" }], 3);
  assert.equal(consumeClassicTutorialCueEvents(cues, state, [{ id: 11, type: "explore_warning" }], 3.1).kind, "wasd", "restart resets every explore event id");
});

test("the successful escape chevron shares the memory flight endpoint for 420ms", () => {
  const state = createGameState({ started: true });
  state.visual.escapeMarker = { x: 144, y: 92, side: "right", duration: .72, remaining: .31 };
  const cue = classicMemoryEscapeChevronPlan(state);
  assert.equal(cue.active, true); assert.equal(cue.direction, 1);
  assert.deepEqual(cue.endpoint, projectWorld(state.visual.escapeMarker));
  state.visual.escapeMarker.remaining = .29;
  assert.equal(classicMemoryEscapeChevronPlan(state).active, false);
});

test("first-round tracking gate follows the live player, then freezes at the exact explore lane", () => {
  const state = createGameState({ started: true });
  state.round = 1;
  state.memory = [];
  state.phase = PHASE.ENGAGE;
  state.player = { ...state.player, x: -88, y: 42 };
  const first = classicTrackingGatePlan(state);
  assert.equal(first.active, true); assert.equal(first.moving, true); assert.equal(first.fixed, false);
  assert.equal(first.targetWorld.x, -88);
  assert.equal(first.halfWorld, CONFIG.exploreLaneHalfWidth);
  const memoryBefore = [...state.memory];

  state.player.x = 116;
  const dragged = classicTrackingGatePlan(state);
  assert.equal(dragged.targetWorld.x, 116, "the whole gate follows the live tracked x in ENGAGE");
  assert.notEqual(dragged.target.x, first.target.x);
  assert.deepEqual(state.memory, memoryBefore, "the renderer gate cannot manufacture a remember mark");

  state.phase = PHASE.EXPLORE;
  state.phaseTime = timingForRound(1).explore;
  state.explore = { lineX: -31, sampleEligible: true };
  state.player.x = 171;
  const frozen = classicTrackingGatePlan(state);
  assert.equal(frozen.active, true); assert.equal(frozen.moving, false); assert.equal(frozen.fixed, true);
  assert.equal(frozen.targetWorld.x, -31);
  assert.notEqual(frozen.targetWorld.x, state.player.x, "the frozen gate never chases the exit");
  assert.equal(frozen.halfWorld, CONFIG.exploreLaneHalfWidth);
});

test("classic fallback keeps the gate cable connected to its own driver root", () => {
  const state = createGameState({ started: true });
  state.round = 1; state.phase = PHASE.ENGAGE; state.player = { ...state.player, x: -64, y: 112 };
  const fallback = classicTrackingGateConnectionPlan(state, null, .3);
  const motion = classicBossMotionPlan(state, .3);
  assert.equal(fallback.active, true);
  assert.deepEqual(fallback.joint, motion.shoulder);
  assert.equal(fallback.header.x, fallback.gate.target.x);
  assert.ok(fallback.left.x < fallback.header.x && fallback.header.x < fallback.right.x);
});
