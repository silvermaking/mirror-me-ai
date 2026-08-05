import assert from "node:assert/strict";
import test from "node:test";

import { PHASE, createGameState } from "../src/game-core.mjs";
import {
  classicAuthoredBladePlan,
  classicBladeContactPlan,
  classicBraceArticulationPlan,
  classicCoreScreenAnchor,
  classicDriverContact,
  classicImpactScreenAnchor,
  classicPlayerGroundingPlan,
  projectWorld,
} from "../src/render-classic.mjs";

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
