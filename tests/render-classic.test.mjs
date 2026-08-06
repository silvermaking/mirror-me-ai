import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG, PHASE, createGameState, timingForRound } from "../src/game-core.mjs";
import {
  CLASSIC_CORE_MISS_GAP,
  CLASSIC_MEMORY_FLIGHT_SECONDS,
  CLASSIC_MEMORY_DIRECTION_GLYPH,
  classicAuthoredBladePlan,
  classicBladeContactPlan,
  classicBraceArticulationPlan,
  classicCoreScreenAnchor,
  classicCorePressureZonePlan,
  classicCoreExitCuePlan,
  classicCoreVisualPlan,
  classicDriverContact,
  classicImpactScreenAnchor,
  classicMemoryGroundTracePlan,
  classicMemoryRackSidePlan,
  classicMemorySocketPlan,
  classicExploreCuePlan,
  classicPlayerFrontReadabilityPlan,
  classicPlayerGroundingPlan,
  projectWorld,
  classicViewportCueScale,
} from "../src/render-classic.mjs";

test("memory direction glyph remains a filled readable mark at 320", () => {
  assert.ok(CLASSIC_MEMORY_DIRECTION_GLYPH.cssWidthAt320 >= 12);
  assert.ok(CLASSIC_MEMORY_DIRECTION_GLYPH.cssHeightAt320 >= 10);
  assert.equal(classicViewportCueScale(320), 1.55);
  assert.equal(classicViewportCueScale(1280), 1);
});

test("first-round explore repeats numbered bilateral escape hardware for samples one to three", () => {
  const state = createGameState({ started: true });
  state.round = 1;
  state.phase = PHASE.EXPLORE;
  state.explore = { lineX: 24, sampleEligible: true };
  for (const memoryCount of [0, 1, 2]) {
    state.memory = Array.from({ length: memoryCount }, () => "left");
    const desktop = classicExploreCuePlan(state, 1280);
    const compact = classicExploreCuePlan(state, 320);
    assert.equal(desktop.sampleNumber, memoryCount + 1);
    assert.ok(desktop.left.inner.x < desktop.center.x - desktop.half);
    assert.ok(desktop.right.inner.x > desktop.center.x + desktop.half);
    assert.ok(compact.cueScale > desktop.cueScale);
    assert.deepEqual(compact.center, desktop.center, "responsive cues must not move the firing lane");
  }
});

test("memory evidence flies for 420ms into three body-side sockets and keeps three ground traces", () => {
  assert.equal(CLASSIC_MEMORY_FLIGHT_SECONDS, 0.42);
  const base = { x: 640, y: 310 };
  const sockets = [0, 1, 2].map((index) => classicMemorySocketPlan(base, index));
  assert.ok(sockets.every((socket) => socket.x < base.x));
  assert.equal(new Set(sockets.map((socket) => socket.y)).size, 3);

  const traces = classicMemoryGroundTracePlan([
    { x: -180, y: 80, side: "left" },
    { x: -90, y: 60, side: "right" },
    { x: 20, y: 40, side: "right" },
    { x: 110, y: 20, side: "left" },
  ]);
  assert.equal(traces.length, 3);
  assert.deepEqual(traces.map((trace) => trace.side), ["right", "right", "left"]);
});

test("the memory rack crosses to the brace side when a left-side driver locks", () => {
  const state = createGameState({ started: true });
  assert.equal(classicMemoryRackSidePlan(state), -1);

  state.predictedSide = "left";
  state.phase = PHASE.COMBINE;
  state.phaseTime = 0.55;
  assert.equal(classicMemoryRackSidePlan(state), -1);
  state.phaseTime = 0;
  assert.equal(classicMemoryRackSidePlan(state), 1);

  state.phase = PHASE.LOCK;
  assert.equal(classicMemoryRackSidePlan(state), 1);
  assert.ok(classicMemorySocketPlan({ x: 640, y: 310 }, 1, 1).x > 640);
});

function coreContactState() {
  const state = createGameState({ started: true });
  return {
    ...state,
    phase: PHASE.CORE_OPEN,
    player: { ...state.player, x: 18, y: -34 },
    boss: { ...state.boss, coreOpen: true },
    lock: {
      side: "right",
      origin: { x: 0, y: 80 },
      zone: { x: 154, y: -4 },
    },
    visual: {
      ...state.visual,
      attack: { hit: true, armor: false, remaining: 0.239 },
      impact: { x: state.boss.x, y: state.boss.y, tone: "core", remaining: 0.3 },
      shake: 0,
    },
  };
}

test("classic direct-hit sword tip, core and impact share one screen anchor", () => {
  const state = coreContactState();
  const now = 2.4;
  const core = classicCoreScreenAnchor(state, now);
  const blade = classicBladeContactPlan(state, now);
  const impact = classicImpactScreenAnchor(state, now);

  assert.ok(Math.hypot(blade.tip.x - core.x, blade.tip.y - core.y) <= 1e-6);
  assert.ok(Math.hypot(impact.x - core.x, impact.y - core.y) <= 1e-6);

  const closeState = coreContactState();
  closeState.player = { ...closeState.player, x: 0, y: -90 };
  const closeCore = classicCoreScreenAnchor(closeState, now);
  const closeBlade = classicBladeContactPlan(closeState, now);
  assert.ok(Math.hypot(closeBlade.tip.x - closeCore.x, closeBlade.tip.y - closeCore.y) <= 1e-6);
});

test("an open-core gameplay miss stops the blade at least 18 logical pixels before the core surface", () => {
  const state = coreContactState();
  state.phaseTime = timingForRound(1).coreOpen - 0.24;
  state.visual.attack = { hit: false, armor: false, remaining: 0.239 };
  state.visual.impact = null;
  state.player = { ...state.player, x: 0, y: 92 };
  const blade = classicBladeContactPlan(state, 2.4);
  const core = classicCoreVisualPlan(state, 2.4);
  const centerGap = Math.hypot(blade.tip.x - core.anchor.x, blade.tip.y - core.anchor.y);
  assert.equal(blade.openCoreMiss, true);
  assert.ok(centerGap - core.radius >= CLASSIC_CORE_MISS_GAP - 1e-6);
  assert.ok(Math.hypot(blade.tip.x - core.anchor.x, blade.tip.y - core.anchor.y) > 1);
});

test("two and three core hits expose the exact shock ellipse and an outside player-facing safe notch", () => {
  for (const hits of [2, 3]) {
    const state = coreContactState();
    state.coreHitsThisWindow = hits;
    state.phaseTime = hits === 3 ? 0.38 : 1.2;
    state.player = { ...state.player, x: 56, y: -20 };
    const zone = classicCorePressureZonePlan(state);
    assert.equal(zone.active, true);
    assert.equal(zone.radiusX, CONFIG.armorShockRadius * 1.03);
    assert.equal(zone.radiusY, CONFIG.armorShockRadius * 0.77);
    const normalizedNotch = Math.hypot(
      (zone.safeNotch.x - zone.center.x) / zone.radiusX,
      (zone.safeNotch.y - zone.center.y) / zone.radiusY,
    );
    assert.ok(Math.abs(normalizedNotch - 1) <= 1e-9);
  }
});

test("LLL and RRR exit arrows choose arena-valid radial exits clear of the giant driver", () => {
  const plans = [-1, 1].map((sign) => {
    const state = coreContactState();
    state.player = { ...state.player, x: sign * 56, y: -20 };
    state.predictedSide = sign < 0 ? "left" : "right";
    state.lock = {
      side: state.predictedSide,
      origin: { x: sign * 282, y: 112 },
      zone: { x: sign * 376, y: 112 },
      createdAt: 4,
    };
    const plan = classicCoreExitCuePlan(state);
    const boundaryRadius = Math.hypot(
      plan.boundaryWorld.x - state.boss.x,
      plan.boundaryWorld.y - state.boss.y,
    );
    const endRadius = Math.hypot(
      plan.endWorld.x - state.boss.x,
      plan.endWorld.y - state.boss.y,
    );
    const arenaAmount =
      (plan.endWorld.x / (CONFIG.arenaRadiusX - CONFIG.playerRadius)) ** 2
      + (plan.endWorld.y / (CONFIG.arenaRadiusY - CONFIG.playerRadius)) ** 2;
    assert.ok(plan.candidateCount >= 3);
    assert.ok(plan.driverClearance >= 120, `${plan.driverClearance}px overlaps the driver`);
    assert.ok(Math.abs(boundaryRadius - CONFIG.armorShockRadius) <= 1e-9);
    assert.ok(endRadius > CONFIG.armorShockRadius);
    assert.ok(arenaAmount < 1);
    return plan;
  });
  assert.ok(plans[0].direction.x > 0, "LLL exits away from its left driver");
  assert.ok(plans[1].direction.x < 0, "RRR exits away from its right driver");
  assert.ok(Math.abs(plans[0].driverClearance - plans[1].driverClearance) <= 1e-9);
});

test("authored core plan exposes persistent one, two and three-hit damage stages", () => {
  for (const hits of [1, 2, 3]) {
    const state = coreContactState();
    state.coreHitsThisWindow = hits;
    state.visual.impact.remaining = 0.24;
    const core = classicCoreVisualPlan(state, 2.4);
    assert.equal(core.hitCount, hits);
    assert.equal(core.crackCount, hits);
    assert.ok(core.contactMarkAlpha > 0 && core.contactMarkAlpha < 1);
  }
});

test("authored blade maps its real grip and tip onto the contact plan within one pixel", () => {
  const state = coreContactState();
  const blade = classicBladeContactPlan(state, 2.4);
  const authored = classicAuthoredBladePlan(state, 2.4);
  assert.ok(authored);
  assert.ok(Math.hypot(authored.at.x - blade.hand.x, authored.at.y - blade.hand.y) <= 1);
  assert.ok(Math.hypot(authored.tip.x - blade.tip.x, authored.tip.y - blade.tip.y) <= 1);
  assert.ok(authored.error <= 1);
});

test("authored brace links preserve shoulder, elbow and ground anchors", () => {
  for (const load of [-1, 0, 1]) {
    const plan = classicBraceArticulationPlan(
      { x: 712, y: 284 },
      { x: 544, y: 447 },
      load,
    );
    assert.ok(plan.upper && plan.lower);
    assert.ok(plan.upper.error <= 1);
    assert.ok(plan.lower.error <= 1);
    assert.ok(Math.hypot(plan.upper.end.x - plan.elbow.x, plan.upper.end.y - plan.elbow.y) <= 1);
    assert.ok(Math.hypot(plan.lower.end.x - plan.ground.x, plan.lower.end.y - plan.ground.y) <= 1);
  }
});

test("gameplay, foot, contact marker and shadow share one exact player anchor", () => {
  const state = coreContactState();
  const projected = projectWorld(state.player);
  const grounding = classicPlayerGroundingPlan(state);
  for (const anchor of [
    grounding.gameplay,
    grounding.foot,
    grounding.contactMarker,
    grounding.shadow,
  ]) {
    const logicalError = Math.hypot(anchor.x - projected.x, anchor.y - projected.y);
    assert.ok(logicalError <= 1, `${logicalError}px exceeds desktop grounding tolerance`);
    assert.ok(logicalError * 0.25 <= 1, `${logicalError * 0.25}px exceeds 320 grounding tolerance`);
  }
});

test("ready guard stays diagonal, clear of the body and foreground-readable at 320", () => {
  for (const playerX of [-100, 0, 100]) {
    for (const locomotionLean of [-0.2, 0, 0.2]) {
      const state = coreContactState();
      state.phase = PHASE.EXPLORE;
      state.boss.coreOpen = false;
      state.player = { ...state.player, x: playerX };
      state.visual.attack = null;
      state.visual.impact = null;
      const plan = classicPlayerFrontReadabilityPlan(state, 0, { locomotionLean });
      assert.deepEqual(plan.drawOrder, ["cloak", "rearArm", "body", "swordArm", "blade"]);
      assert.equal(plan.ready, true);
      assert.ok(plan.guardAngleDegrees >= 35 && plan.guardAngleDegrees <= 55);
      assert.equal(plan.bladeOverlapsBody, false);
      assert.ok(plan.bladeOutsideBodyCssAt320 >= 8);
      assert.ok(plan.swordArm.scale >= 0.35 && plan.swordArm.scale <= 0.75);
      assert.ok(plan.swordArm.error <= 1);
    }
  }
});

test("contact, cut and recoil keep a connected sword arm without moving foot or contact truth", () => {
  for (const [elapsedMs, phase] of [[0, "contact"], [120, "cut"], [210, "recoil"]]) {
    const state = coreContactState();
    state.visual.attack.remaining = (240 - elapsedMs) / 1000;
    const plan = classicPlayerFrontReadabilityPlan(state, 2.4);
    assert.equal(plan.blade.motion.phase, phase);
    assert.ok(plan.swordArm.scale >= 0.35 && plan.swordArm.scale <= 0.75);
    assert.ok(plan.swordArm.error <= 1);
    assert.deepEqual(classicPlayerGroundingPlan(state).foot, projectWorld(state.player));
    if (phase === "contact") {
      assert.ok(Math.hypot(
        plan.blade.tip.x - plan.blade.target.x,
        plan.blade.tip.y - plan.blade.target.y,
      ) <= 1);
    }
  }
});

test("classic LOCK driver contact does not alter the target coordinate", () => {
  const target = { x: 941.25, y: 486.5 };
  assert.deepEqual(classicDriverContact(target), target);
  assert.notEqual(classicDriverContact(target), target, "renderer returns a defensive point copy");
});

test("armor swing keeps the original short blade instead of faking core contact", () => {
  const state = coreContactState();
  state.boss.coreOpen = false;
  state.phase = PHASE.EXPLORE;
  state.visual.attack = { hit: false, armor: true, remaining: 0.12 };
  assert.equal(classicBladeContactPlan(state, 0).length, 43);
});
