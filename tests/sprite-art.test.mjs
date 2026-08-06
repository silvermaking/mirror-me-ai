import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { CONFIG, PHASE, createGameState } from "../src/game-core.mjs";
import { classicTrackingGateConnectionPlan } from "../src/render-classic.mjs";
import { rigAnchorMetrics, rigBossDriverJoint, rigDrawPlan, validateRigCompositeSet, validateRigSpriteSet } from "../src/render-sprite.mjs";
import { SPRITE_REQUIRED_ANCHORS, SPRITE_REQUIRED_FRAMES, validateSpriteManifest } from "../src/sprite-art-contract.mjs";

const ROOT = resolve(import.meta.dirname, "..");
async function manifest() { return JSON.parse(await readFile(resolve(ROOT, "assets/2d/strips/sprites.json"), "utf8")); }
const SHA = Object.freeze({
  "v2:player-idle-authority-alpha.png": "ae86bffbd70b17d154b1532a4e30516e7692232de9cdef6c7674c95003c74050",
  "v2:player-contact-body-alpha.png": "0cbce1ccfa6a8196b413acdf9487d411ea39486ef37894aaad14506096597aac",
  "v2:player-blade-only-alpha.png": "84c7f1c38562962f75702c3cca88a664c3e5c08180e159b5761b1bba4c7bc48b",
  "v2:boss-idle-authority-alpha.png": "53c50cd567574dd75c9f65004ef087e54599ce94aa3958ae3e38ee98aef8d0d9",
  "v2:boss-shaft-tip-kit-alpha.png": "917c7c188bb1760c5c91b18a225e76d9583a6b24c4e3328e3b86b410b3fb3d3e",
  "v4:boss-body-left-armfree-alpha.png": "85db7172e1877dcd7eeebb3f02e0222507a2c96cae4b85a24dfb97116125682b",
  "v4:boss-body-right-armfree-alpha.png": "3063d67f0815b3cbe6848ad2310a904be6bef4c84779bf8e3bcf824e36d654bd",
  "v5:boss-joint-housings-v5-alpha.png": "9b3254fba95aa507ff0c4294cc16d1327cc3eb3a8cdd127a0fb1027c9a701643",
});

function locked(side, phase = PHASE.LOCK) {
  const state = createGameState({ started: true });
  state.phase = phase; state.phaseTime = .4;
  state.lock = { side, origin: { x: 0, y: 80 }, zone: { x: side === "left" ? -154 : 154, y: -4 }, createdAt: 0 };
  return state;
}
function contact(side) {
  const state = locked(side, PHASE.CORE_OPEN);
  state.boss.coreOpen = true;
  state.visual.attack = { hit: true, armor: false, remaining: .24 };
  return state;
}

test("approved rig-v5 directional housing sources, SHA, sourceRects and named anchors survive deterministic packing", async () => {
  const art = await manifest();
  assert.equal(validateSpriteManifest(art), true);
  assert.deepEqual(Object.keys(art.frames), SPRITE_REQUIRED_FRAMES);
  assert.equal(art.source, "approved-imagegen-rig-v5-directional-cuffs");
  for (const [source, sha256] of Object.entries(SHA)) assert.equal(art.sources[source].sha256, sha256);
  for (const frameId of SPRITE_REQUIRED_FRAMES) {
    const anchors = SPRITE_REQUIRED_ANCHORS[frameId];
    assert.deepEqual(Object.keys(art.frames[frameId].anchors), anchors);
    assert.deepEqual(Object.keys(art.sourceFrames[frameId].anchors), anchors);
  }
});

test("strip builder only crops, Lanczos-resizes and packs approved raster art", async () => {
  const source = await readFile(resolve(ROOT, "tools/build-sprite-strips.py"), "utf8");
  assert.match(source, /never draws, traces, repairs, or generates art/);
  assert.match(source, /Separable Lanczos-3 RGBA resize/);
  assert.doesNotMatch(source, /polygon\(|ellipse\(|draw_art\(/i);
  for (const file of ["player-body.png", "player-blade.png", "boss-body.png", "driver-shaft.png", "driver-tip.png", "driver-cuff.png"]) {
    const png = await readFile(resolve(ROOT, "assets/2d/strips", file));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("LOCK stays retracted; only L/R prediction resolution reaches the frozen target axis", async () => {
  const art = await manifest();
  assert.equal(validateRigSpriteSet(art).pass, true);
  for (const side of ["left", "right"]) {
    const hold = rigAnchorMetrics(locked(side), art);
    assert.ok(hold.errors.feet <= 1, `${side}: feet`);
    assert.equal(hold.errors.driver, null, `${side}: LOCK is not a completed strike`);
    assert.ok(hold.plan.boss.driver.extension < 1, `${side}: LOCK retract`);
    const resolve = locked(side, PHASE.PREDICTION); resolve.phaseTime = 0;
    const metric = rigAnchorMetrics(resolve, art);
    assert.ok(metric.errors.driver <= 1, `${side}: prediction tip`);
    assert.equal(metric.bossBodyScaleChange, 0);
    assert.equal(metric.bossBodyRotationDegrees, 0);
    assert.equal(metric.bossMirrored, false);
    assert.deepEqual(metric.plan.boss.driver.axis, hold.plan.boss.driver.axis, `${side}: immutable axis`);
  }
});

test("confirmed core contact smears only blade length for at most 48ms and keeps body/grip fixed", async () => {
  const art = await manifest();
  for (const side of ["left", "right"]) {
    const metric = rigAnchorMetrics(contact(side), art);
    assert.equal(metric.plan.player.confirmedContact, true);
    assert.ok(metric.errors.blade <= 1, `${side}: sword tip`);
    assert.ok(metric.errors.driver <= 1, `${side}: driver tip`);
    assert.equal(metric.playerBodyScaleChange, 0);
    assert.equal(metric.playerBodyRotationDegrees, 0);
    assert.equal(metric.playerMirrored, false);
  }
  const afterContact = contact("left"); afterContact.visual.attack.remaining = .18;
  assert.equal(rigAnchorMetrics(afterContact, art).plan.player.confirmedContact, false);
});

test("directional MISS housings, not invisible body sockets, cover their fixed axes", async () => {
  const art = await manifest();
  assert.equal(validateRigSpriteSet(art).pass, true);
  const composite = validateRigCompositeSet(art);
  assert.equal(composite.pass, true);
  assert.ok(composite.maxCuffAxisError <= 1);
  assert.ok(composite.cuffProjectedBbox.left.lengthCss >= 16 && composite.cuffProjectedBbox.left.lengthCss <= 19);
  assert.ok(composite.cuffProjectedBbox.left.thicknessCss >= 15 && composite.cuffProjectedBbox.left.thicknessCss <= 18);
  assert.ok(composite.cuffProjectedBbox.right.lengthCss >= 10 && composite.cuffProjectedBbox.right.lengthCss <= 13);
  assert.ok(composite.cuffProjectedBbox.right.thicknessCss >= 10 && composite.cuffProjectedBbox.right.thicknessCss <= 13.5);
  for (const { side, metrics } of composite.samples) {
    assert.ok(metrics.errors.cuffPivot <= 1, `${side}: cuff pivot`);
    assert.ok(metrics.errors.cuffAxis <= 1, `${side}: cuff tunnel axis`);
    assert.equal(metrics.bossBodyScaleChange, 0);
    assert.equal(metrics.bossBodyRotationDegrees, 0);
    const lockPlan = rigDrawPlan(locked(side), art);
    const missPlan = rigDrawPlan(contact(side), art);
    assert.equal(missPlan.boss.driver.cuff, art.frames[`driver-cuff-${side}`]);
    assert.deepEqual(missPlan.boss.driver.cuffTransform.origin, lockPlan.boss.driver.joint, `${side}: fixed cuff pivot through LOCK→MISS`);
    assert.equal(missPlan.boss.driver.cuffTransform.scaleX, missPlan.boss.driver.cuffTransform.scaleY, `${side}: no nonuniform cuff scale`);
  }
});

test("directional cuff 320 bounds reject both double-shrink and oversize", async () => {
  const art = await manifest();
  const shrunk = structuredClone(art); shrunk.frames["driver-cuff-left"].presentationScale = .2;
  assert.equal(validateRigCompositeSet(shrunk).pass, false);
  const oversized = structuredClone(art); oversized.frames["driver-cuff-right"].paintBounds[2] = 100;
  assert.equal(validateRigCompositeSet(oversized).pass, false);
});

test("directional housing source anchors are horizontal before the immutable axis rotation", async () => {
  const art = await manifest();
  for (const side of ["left", "right"]) {
    const anchors = art.sourceFrames[`driver-cuff-${side}`].anchors;
    assert.equal(anchors.driver_joint[1], anchors.shaft_in[1], `${side}: authored horizontal housing axis`);
  }
});

test("malformed rig manifests reject before a character layer can replace classic fallback", async () => {
  const art = await manifest(); const malformed = structuredClone(art);
  delete malformed.frames["driver-tip"].anchors.driver_tip;
  assert.equal(validateSpriteManifest(malformed), false);
  assert.equal(validateRigSpriteSet(malformed).pass, false);
});

test("the first-round gate cable begins at the active authored driver joint and stays continuous through fixation", async () => {
  const art = await manifest();
  const moving = createGameState({ started: true });
  moving.round = 1; moving.phase = PHASE.ENGAGE; moving.phaseTime = .42;
  moving.player = { ...moving.player, x: 96, y: 112 };
  const movingJoint = rigBossDriverJoint(moving, art, 1.1);
  const movingConnection = classicTrackingGateConnectionPlan(moving, movingJoint, 1.1);
  assert.equal(movingConnection.active, true);
  assert.ok(Math.hypot(movingConnection.joint.x - movingJoint.x, movingConnection.joint.y - movingJoint.y) <= 1);
  assert.equal(movingConnection.gate.halfWorld, CONFIG.exploreLaneHalfWidth);
  assert.equal(movingConnection.header.x, movingConnection.gate.target.x);
  assert.equal(movingConnection.header.y, movingConnection.left.y);
  assert.equal(movingConnection.header.y, movingConnection.right.y);
  assert.ok(Math.abs((movingConnection.right.x - movingConnection.left.x) - movingConnection.gate.half * 2) <= 1e-9);

  const fixed = structuredClone(moving);
  fixed.phase = PHASE.EXPLORE; fixed.phaseTime = 1.12;
  fixed.explore = { lineX: 96, sampleEligible: true };
  fixed.player.x = -122;
  const fixedJoint = rigBossDriverJoint(fixed, art, 1.12);
  const fixedConnection = classicTrackingGateConnectionPlan(fixed, fixedJoint, 1.12);
  assert.equal(fixedConnection.gate.fixed, true);
  assert.ok(Math.hypot(fixedConnection.joint.x - fixedJoint.x, fixedConnection.joint.y - fixedJoint.y) <= 1);
  assert.deepEqual(fixedConnection.header, movingConnection.header, "the joint-to-header cable cannot pop on ENGAGE→EXPLORE");
  assert.deepEqual(fixedConnection.joint, movingConnection.joint, "the active idle-body joint remains the same authored anchor");
});
