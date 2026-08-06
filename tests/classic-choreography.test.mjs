import assert from "node:assert/strict";
import test from "node:test";

import { PHASE, createGameState } from "../src/game-core.mjs";
import {
  CLASSIC_ATTACK_TIMING,
  CLASSIC_CORE_CONTACT_MARK_MS,
  CLASSIC_CORE_HIT_LEVELS,
  CLASSIC_PLAYER_DRAW_ORDER,
  classicCoreOpportunityPlan,
  classicCoreReactionPlan,
  classicMemoryVotePlan,
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
    hitLevel: 0,
    hitAge: Infinity,
    faceCompression: 0,
    finsKick: 0,
    shutterKick: 0,
    bodyKick: 0,
    driverShoulderKick: 0,
    shellKick: 0,
    cracks: 0,
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

test("core hit levels escalate cracks and physical recoil without extending contact truth", () => {
  assert.equal(CLASSIC_CORE_CONTACT_MARK_MS, 120);
  assert.deepEqual(CLASSIC_CORE_HIT_LEVELS.map((level) => level.cracks), [1, 2, 3]);
  assert.deepEqual(CLASSIC_CORE_HIT_LEVELS.map((level) => level.driverShoulderPx), [16, 30, 48]);

  const samples = CLASSIC_CORE_HIT_LEVELS.map((level) => {
    const state = createGameState({ started: true });
    state.coreHitsThisWindow = level.hit;
    state.visual.impact = { tone: "core", remaining: 0.155 };
    return classicCoreReactionPlan(state);
  });
  assert.deepEqual(samples.map((sample) => sample.hitLevel), [1, 2, 3]);
  assert.deepEqual(samples.map((sample) => sample.cracks), [1, 2, 3]);
  assert.ok(Math.abs(samples[2].driverShoulderKick) > Math.abs(samples[1].driverShoulderKick));
  assert.ok(Math.abs(samples[1].driverShoulderKick) > Math.abs(samples[0].driverShoulderKick));
});

test("the second core hit visibly preloads closure before the risky third hit", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.CORE_OPEN;
  state.boss.coreOpen = true;
  state.phaseTime = 1.2;
  state.coreHitsThisWindow = 0;

  assert.deepEqual(classicCoreOpportunityPlan(state), {
    active: true,
    hits: 0,
    remaining: 1.2,
    approach: true,
    warning: false,
    urgent: false,
    closurePressure: 0,
  });

  state.coreHitsThisWindow = 2;
  const secondHit = classicCoreOpportunityPlan(state);
  assert.equal(secondHit.approach, false);
  assert.equal(secondHit.warning, true);
  assert.equal(secondHit.urgent, false);
  assert.equal(secondHit.closurePressure, 0.48);

  state.coreHitsThisWindow = 3;
  state.phaseTime = 0.38;
  const thirdHit = classicCoreOpportunityPlan(state);
  assert.equal(thirdHit.warning, true);
  assert.equal(thirdHit.urgent, true);
  assert.equal(thirdHit.closurePressure, 1);
});

test("core opportunity choreography is deterministic and never mutates gameplay state", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.CORE_OPEN;
  state.boss.coreOpen = true;
  state.phaseTime = 0.7;
  state.coreHitsThisWindow = 1;
  const before = structuredClone(state);
  assert.deepEqual(classicCoreOpportunityPlan(state), classicCoreOpportunityPlan(state));
  assert.deepEqual(state, before);
});

test("three physical memory votes ratchet toward the immutable majority prediction", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.COMBINE;
  state.memory = ["left", "right", "right"];
  state.predictedSide = "right";
  const before = structuredClone(state);
  const early = classicMemoryVotePlan(state, { progress: 0.24 });
  const late = classicMemoryVotePlan(state, { progress: 0.9 });
  assert.equal(late.active, true);
  assert.equal(late.majorityCount, 2);
  assert.equal(late.direction, 1);
  assert.deepEqual(late.votes.map((vote) => vote.agrees), [false, true, true]);
  assert.ok(late.pull > early.pull);
  assert.ok(late.ratchetStep > early.ratchetStep);
  assert.deepEqual(state, before);
});
