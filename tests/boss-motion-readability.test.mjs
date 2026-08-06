import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG, PHASE, createGameState, timingForRound } from "../src/game-core.mjs";
import {
  CLASSIC_EXPLORE_MOTION,
  classicBossMotionPlan,
  classicCoreVisualPlan,
  classicLockVisualPlan,
  classicMemoryMotionPlan,
  classicTrackingTracePlan,
} from "../src/render-classic.mjs";

function lockedState(phase, progress = 0) {
  const state = createGameState({ started: true });
  const timing = timingForRound(1);
  const durations = {
    [PHASE.LOCK]: timing.lock,
    [PHASE.RELOCK]: timing.relock,
    [PHASE.PREDICTION]: timing.prediction,
    [PHASE.CORE_OPEN]: timing.coreOpen,
  };
  state.phase = phase;
  state.phaseTime = durations[phase] * (1 - progress);
  state.elapsed = 4 + progress * durations[phase];
  state.predictedSide = "right";
  state.lock = {
    side: "right",
    origin: { x: 0, y: 80 },
    zone: { x: 154, y: -4 },
    createdAt: 4,
  };
  return state;
}

const gapToTarget = (plan) => Math.hypot(
  plan.driverHead.x - plan.target.x,
  plan.driverHead.y - plan.target.y,
);

test("LOCK visibly retracts the driver and preloads the furnace body", () => {
  const plan = classicBossMotionPlan(lockedState(PHASE.LOCK, 0), 1);
  assert.equal(plan.stage, "locked");
  assert.ok(gapToTarget(plan) >= 16);
  assert.ok(Math.hypot(plan.bodyBase.x - plan.base.x, plan.bodyBase.y - plan.base.y) >= 4);
  assert.equal(plan.contact, false);
});

test("PREDICTION has load, hold and strike poses with mobile-readable travel", () => {
  const samples = [0.08, 0.5, 0.88].map((progress) =>
    classicBossMotionPlan(lockedState(PHASE.PREDICTION, progress), 2),
  );
  const gaps = samples.map(gapToTarget);
  assert.equal(new Set(gaps.map((gap) => gap.toFixed(3))).size, 3);
  const cssTravelAt320 = (Math.max(...gaps) - Math.min(...gaps)) * 0.25;
  assert.ok(cssTravelAt320 >= 18, `${cssTravelAt320}px is too little driver travel at 320px`);
  assert.ok(samples.every((plan) => !plan.contact));
});

test("ENGAGE tracks the real player x, then EXPLORE fixes one charged firing lane", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.ENGAGE;
  state.player.x = -120;
  const left = classicBossMotionPlan(state, 0);
  state.player.x = 140;
  const right = classicBossMotionPlan(state, 0.1);
  assert.equal(left.stage, "tracking");
  assert.ok(left.target.x < right.target.x);
  assert.equal(classicTrackingTracePlan(state).fixed, false);

  state.phase = PHASE.EXPLORE;
  state.explore = { lineX: 36, sampleEligible: true };
  state.phaseTime = timingForRound(1).explore;
  const fixedStart = classicBossMotionPlan(state, 0.2);
  state.player.x = -220;
  state.phaseTime = timingForRound(1).explore * (1 - CLASSIC_EXPLORE_MOTION.chargeEnd);
  const charged = classicBossMotionPlan(state, 0.8);
  state.phaseTime = timingForRound(1).explore * 0.02;
  const fired = classicBossMotionPlan(state, 1.3);
  assert.equal(fixedStart.target.x, charged.target.x);
  assert.equal(charged.target.x, fired.target.x);
  assert.equal(classicTrackingTracePlan(state).fixed, true);
  assert.ok(charged.driverRetract > fixedStart.driverRetract);
  assert.ok(fired.driverRetract < charged.driverRetract);
});

test("each first-round recover reacquires the player before the next numbered lane clamps", () => {
  const state = createGameState({ started: true });
  state.round = 1;
  state.memory = ["left"];
  state.phase = PHASE.EXPLORE_RECOVER;
  state.player.x = -140;
  const left = classicBossMotionPlan(state, 0);
  state.player.x = 160;
  const right = classicBossMotionPlan(state, 0.1);
  assert.equal(left.stage, "tracking-recover");
  assert.ok(left.target.x < right.target.x);
  assert.equal(classicTrackingTracePlan(state).sampleNumber, 2);

  state.memory = ["left", "right"];
  state.phase = PHASE.EXPLORE;
  state.explore = { lineX: 42, sampleEligible: true };
  const fixed = classicBossMotionPlan(state, 0.2);
  state.player.x = -220;
  assert.equal(classicBossMotionPlan(state, 0.3).target.x, fixed.target.x);
  assert.equal(classicTrackingTracePlan(state).sampleNumber, 3);
});

test("COMBINE keeps the driver on the majority side while the player moves", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.COMBINE;
  state.phaseTime = 0.3;
  state.memory = ["left", "right", "right"];
  state.predictedSide = "right";
  state.player.x = -200;
  const first = classicBossMotionPlan(state, 0);
  state.player.x = 220;
  const moved = classicBossMotionPlan(state, 0.1);
  assert.equal(first.target.x, moved.target.x);
  assert.equal(first.direction, 1);
  assert.equal(first.aimClamped, true);
});

test("driver axis stays immutable after LOCK and contacts only on resolution", () => {
  const lock = classicBossMotionPlan(lockedState(PHASE.LOCK, 0.2), 0);
  const strike = classicBossMotionPlan(lockedState(PHASE.PREDICTION, 0.85), 9);
  const resolvedState = lockedState(PHASE.CORE_OPEN, 0.1);
  resolvedState.boss.coreOpen = true;
  const resolved = classicBossMotionPlan(resolvedState, 12);
  assert.ok(Math.abs(lock.axisAngle - strike.axisAngle) <= 1e-12);
  assert.ok(Math.abs(lock.axisAngle - resolved.axisAngle) <= 1e-12);
  assert.ok(gapToTarget(strike) > 1);
  assert.ok(gapToTarget(resolved) <= 1e-12);
  assert.equal(resolved.contact, true);
});

test("committed miss transfers weight into asymmetric body collapse", () => {
  const state = lockedState(PHASE.CORE_OPEN, 0.12 / timingForRound(1).coreOpen);
  state.boss.coreOpen = true;
  state.phaseTime = timingForRound(1).coreOpen - 0.18;
  const plan = classicBossMotionPlan(state, 2);
  assert.equal(plan.stage, "overextended");
  assert.ok(Math.abs(plan.bodyBase.x - plan.base.x) >= 30);
  assert.ok(plan.bodyBase.y - plan.base.y >= 25);
  assert.ok(Math.abs(plan.bodyTilt) >= 0.28);
  assert.equal(plan.contact, true);
});

test("miss causality travels from contact to brace, body and finally shutters", () => {
  const duration = timingForRound(1).coreOpen;
  const atAge = (age) => {
    const state = lockedState(PHASE.CORE_OPEN, 0);
    state.boss.coreOpen = true;
    state.phaseTime = duration - age;
    return state;
  };
  const contact = classicBossMotionPlan(atAge(0), 0);
  const brace = classicBossMotionPlan(atAge(0.025), 0.025);
  const body = classicBossMotionPlan(atAge(0.07), 0.07);
  const shutter = classicCoreVisualPlan(atAge(0.12), 0.12);

  assert.equal(gapToTarget(contact), 0);
  assert.ok(Math.abs(contact.braceLoad) <= 1e-12);
  assert.ok(Math.abs(contact.bodyBase.x - contact.base.x) <= 1e-12);
  assert.ok(Math.abs(brace.braceLoad) >= 0.7);
  assert.ok(Math.abs(brace.braceLoad) * 26 * 0.25 >= 4);
  assert.ok(Math.abs(brace.bodyBase.x - brace.base.x) <= 1e-12);
  assert.ok(Math.abs(body.bodyBase.x - body.base.x) >= 15);
  assert.equal(classicCoreVisualPlan(atAge(0.07), 0.07).exposure, 0);
  assert.ok(shutter.exposure >= 0.5);
});

test("memory insertion precedes combine alignment and LOCK removes wobble state", () => {
  const state = createGameState({ started: true });
  state.memory = ["right"];
  state.visual.escapeMarker = {
    x: 90,
    y: 20,
    side: "right",
    duration: 0.72,
    remaining: 0.72,
  };
  state.phase = PHASE.EXPLORE_RECOVER;
  state.phaseTime = CONFIG.exploreRecoverDuration;
  assert.deepEqual(classicMemoryMotionPlan(state, 0), {
    active: true,
    inserting: true,
    insertion: 0,
    alignment: 0,
  });

  state.memory = ["right", "right", "right"];
  state.phase = PHASE.COMBINE;
  state.phaseTime = CONFIG.combineDuration - 0.12;
  state.visual.escapeMarker.remaining = 0.51;
  const thirdMidFlight = classicMemoryMotionPlan(state, 2);
  assert.equal(thirdMidFlight.inserting, true);
  assert.ok(thirdMidFlight.insertion > 0.45 && thirdMidFlight.insertion < 0.55);
  assert.equal(thirdMidFlight.alignment, 0);

  state.phaseTime = CONFIG.combineDuration - 0.54;
  state.visual.escapeMarker.remaining = 0.18;
  const combined = classicMemoryMotionPlan(state, 2);
  assert.equal(combined.inserting, false);
  assert.equal(combined.alignment, 1);

  state.phase = PHASE.LOCK;
  state.lock = { side: "right", origin: { x: 0, y: 0 }, zone: { x: 94, y: 0 }, createdAt: 0 };
  assert.equal(classicMemoryMotionPlan(state, 2).alignment, 1);
});

test("LOCK seal stamps once at a fixed target and settles within 200ms", () => {
  const state = lockedState(PHASE.LOCK, 0);
  state.elapsed = state.lock.createdAt;
  const first = classicLockVisualPlan(state);
  state.elapsed += 0.2;
  const settled = classicLockVisualPlan(state);
  assert.equal(first.stamp, 0);
  assert.ok(first.scale > 1.4);
  assert.equal(settled.stamp, 1);
  assert.ok(Math.abs(settled.scale - 1) < 0.01);
});
