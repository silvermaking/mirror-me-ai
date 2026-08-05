import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/game-core.mjs";
import {
  CLASSIC_ATTACK_TIMING,
  CLASSIC_PLAYER_DRAW_ORDER,
  classicCoreReactionPlan,
  classicPlayerPosePlan,
} from "../src/classic-choreography.mjs";

test("authored player foreground order keeps the sword arm and blade in front", () => {
  assert.deepEqual(CLASSIC_PLAYER_DRAW_ORDER, [
    "cloak",
    "rearArm",
    "body",
    "swordArm",
    "blade",
  ]);
});

function stateAtAttackAge(elapsedMs, result = {}) {
  const state = createGameState({ started: true });
  state.visual.attack = {
    hit: Boolean(result.hit),
    armor: Boolean(result.armor),
    remaining: (CLASSIC_ATTACK_TIMING.durationMs - elapsedMs) / 1000,
  };
  return state;
}

test("player pose is contact-first, then cut, then recoil on fixed renderer time", () => {
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(0)).phase, "contact");
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(48)).phase, "contact");
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(49)).phase, "cut");
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(168)).phase, "cut");
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(169)).phase, "recoil");
  assert.equal(classicPlayerPosePlan(stateAtAttackAge(240)).phase, "recoil");
});

test("player full-body cut reads at mobile scale while the true foot never moves", () => {
  const contact = classicPlayerPosePlan(stateAtAttackAge(1), { swingSide: 1 });
  const cut = classicPlayerPosePlan(stateAtAttackAge(168), { swingSide: 1 });
  assert.deepEqual(contact.rootOffset, { x: 0, y: 0 });
  assert.deepEqual(cut.rootOffset, { x: 0, y: 0 });
  assert.ok(Math.abs(cut.torsoRotation - contact.torsoRotation) >= 0.35);
  assert.ok(Math.abs(cut.cloakCounterRotation - contact.cloakCounterRotation) >= 0.2);
  assert.ok(contact.handReach >= 35 && contact.handReach <= 58);
  assert.ok(cut.handReach >= 35 && cut.handReach <= 58);
});

test("player pose plan is deterministic, mirrored and does not mutate state", () => {
  const state = stateAtAttackAge(112, { hit: true });
  const before = structuredClone(state);
  const right = classicPlayerPosePlan(state, { swingSide: 1 });
  const again = classicPlayerPosePlan(state, { swingSide: 1 });
  const left = classicPlayerPosePlan(state, { swingSide: -1 });
  assert.deepEqual(right, again);
  assert.equal(left.torsoRotation, -right.torsoRotation);
  assert.equal(left.cloakCounterRotation, -right.cloakCounterRotation);
  assert.deepEqual(state, before);
});

test("only a direct core impact creates ordered core reaction channels", () => {
  const state = createGameState({ started: true });
  state.boss.coreOpen = true;
  assert.deepEqual(classicCoreReactionPlan(state), {
    directHit: false,
    hitAge: Infinity,
    faceCompression: 0,
    finsKick: 0,
    shutterKick: 0,
    bodyKick: 0,
  });

  state.visual.impact = { tone: "core", remaining: 0.3 };
  const contact = classicCoreReactionPlan(state);
  assert.equal(contact.directHit, true);
  assert.notEqual(contact.faceCompression, 0);
  assert.equal(contact.finsKick, 0);
  assert.equal(contact.shutterKick, 0);
  assert.equal(contact.bodyKick, 0);

  state.visual.impact.remaining = 0.245;
  const fins = classicCoreReactionPlan(state);
  assert.notEqual(fins.finsKick, 0);
  assert.equal(fins.shutterKick, 0);
  assert.equal(fins.bodyKick, 0);

  state.visual.impact.remaining = 0.205;
  const shutters = classicCoreReactionPlan(state);
  assert.notEqual(shutters.shutterKick, 0);
  assert.equal(shutters.bodyKick, 0);

  state.visual.impact.remaining = 0.175;
  assert.notEqual(classicCoreReactionPlan(state).bodyKick, 0);
});
