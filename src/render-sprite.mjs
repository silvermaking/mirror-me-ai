import { PHASE, createGameState } from "./game-core.mjs";
import {
  classicBladeContactPlan,
  classicBossMotionPlan,
  createRenderer as createClassicRenderer,
  projectWorld,
} from "./render-classic.mjs";
import { validateSpriteManifest } from "./sprite-art-contract.mjs";

const MANIFEST_URL = new URL("../assets/2d/strips/sprites.json", import.meta.url);
const PLAYER_SCALE = .66;
const BOSS_SCALE = .96;
const CONTACT_SMEAR_SECONDS = .048;
const EPSILON = 1e-7;

function point(value) { return { x: value[0], y: value[1] }; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function unit(from, to) {
  const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy);
  return length > EPSILON ? { x: dx / length, y: dy / length, length } : { x: 1, y: 0, length: 0 };
}
function distanceToAxis(pointOnAxis, axis, point) {
  return Math.abs((point.x - pointOnAxis.x) * axis.y - (point.y - pointOnAxis.y) * axis.x);
}

// A body has exactly one transform: fixed translate + uniform scale. It has no
// rotation, mirror, state-specific scale, or frame offset.
export function fixedAnchorTransform(frame, anchorName, target, scale) {
  return Object.freeze({
    origin: Object.freeze({ ...target }), sourceAnchor: Object.freeze(point(frame.anchors[anchorName])),
    rotation: 0, scaleX: scale, scaleY: scale, body: true,
  });
}

export function projectSpriteAnchor(transform, frame, anchorName) {
  const anchor = point(frame.anchors[anchorName]);
  const dx = (anchor.x - transform.sourceAnchor.x) * transform.scaleX;
  const dy = (anchor.y - transform.sourceAnchor.y) * transform.scaleY;
  const cosine = Math.cos(transform.rotation); const sine = Math.sin(transform.rotation);
  return { x: transform.origin.x + dx * cosine - dy * sine, y: transform.origin.y + dx * sine + dy * cosine };
}

export function drawSpriteFrame(ctx, image, frame, transform) {
  const [sx, sy, sw, sh] = frame.rect;
  ctx.save();
  ctx.translate(transform.origin.x, transform.origin.y);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scaleX, transform.scaleY);
  ctx.drawImage(image, sx, sy, sw, sh, -transform.sourceAnchor.x, -transform.sourceAnchor.y, sw, sh);
  ctx.restore();
}

function bodyFrame(state) {
  if (state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) return `boss-miss-${state.lock?.side || "left"}`;
  if (state.lock && [PHASE.COMBINE, PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION].includes(state.phase)) return `boss-lock-${state.lock.side}`;
  return "boss-idle";
}
function playerBodyFrame(state) { return state.visual?.attack ? "player-contact" : "player-idle"; }
function activeDriver(state) { return Boolean(state.lock?.zone) && [PHASE.COMBINE, PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION, PHASE.CORE_OPEN, PHASE.ROUND_CLEAR].includes(state.phase); }

function partTransform(frame, anchorName, target, rotation, scaleX, scaleY) {
  return Object.freeze({ origin: Object.freeze({ ...target }), sourceAnchor: Object.freeze(point(frame.anchors[anchorName])), rotation, scaleX, scaleY, body: false });
}

export function rigDrawPlan(state, manifest, now = 0) {
  const player = manifest.frames[playerBodyFrame(state)];
  const bossFrameId = bodyFrame(state);
  const boss = manifest.frames[bossFrameId];
  const playerTransform = fixedAnchorTransform(player, "feet", projectWorld(state.player), PLAYER_SCALE);
  const bossTransform = fixedAnchorTransform(boss, "root", projectWorld(state.boss), BOSS_SCALE);
  const grip = projectSpriteAnchor(playerTransform, player, "sword_grip");
  const blade = manifest.frames["player-blade"];
  const classicBlade = classicBladeContactPlan(state, now);
  const authoredBladeLength = Math.abs(blade.anchors.sword_tip[0] - blade.anchors.sword_grip[0]) * PLAYER_SCALE;
  const attackElapsed = Math.max(0, .24 - (Number.isFinite(state.visual?.attack?.remaining) ? state.visual.attack.remaining : .24));
  const confirmedContact = Boolean(state.visual?.attack && !state.visual.attack.armor && classicBlade.motion.contact && attackElapsed <= CONTACT_SMEAR_SECONDS + EPSILON);
  const bladeTarget = confirmedContact ? classicBlade.tip : {
    x: grip.x + Math.cos(classicBlade.angle) * authoredBladeLength,
    y: grip.y + Math.sin(classicBlade.angle) * authoredBladeLength,
  };
  const bladeAxis = unit(grip, bladeTarget);
  const bladeTransform = partTransform(
    blade, "sword_grip", grip, Math.atan2(bladeAxis.y, bladeAxis.x),
    confirmedContact ? bladeAxis.length / Math.abs(blade.anchors.sword_tip[0] - blade.anchors.sword_grip[0]) : PLAYER_SCALE,
    PLAYER_SCALE,
  );

  let driver = null;
  if (activeDriver(state)) {
    const shaft = manifest.frames["driver-shaft"];
    const tip = manifest.frames["driver-tip"];
    // This axis is authored by the selected LOCK body, once. MISS may change
    // the painted body, but it must cover this same shaft line rather than
    // silently aiming again from its different socket.
    const lockFrame = manifest.frames[`boss-lock-${state.lock.side}`];
    const lockTransform = fixedAnchorTransform(lockFrame, "root", projectWorld(state.boss), BOSS_SCALE);
    const joint = projectSpriteAnchor(lockTransform, lockFrame, "driver_joint");
    const target = projectWorld(state.lock.zone);
    const axis = unit(joint, target);
    const angle = Math.atan2(axis.y, axis.x);
    const choreography = classicBossMotionPlan(state, now);
    const committed = choreography.contact || state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR;
    const extension = committed
      ? 1
      : state.phase === PHASE.PREDICTION
        ? (choreography.driverRetract <= 8 ? 1 : Math.max(.08, 1 - choreography.driverRetract / 120))
        : .08;
    const head = { x: joint.x + axis.x * axis.length * extension, y: joint.y + axis.y * axis.length * extension };
    const tipLength = Math.abs(tip.anchors.driver_tip[0] - tip.anchors.tip_socket[0]) * BOSS_SCALE;
    const socket = { x: head.x - axis.x * tipLength, y: head.y - axis.y * tipLength };
    const shaftLength = Math.max(0, distance(joint, socket));
    const cuff = bossFrameId.startsWith("boss-miss-") ? manifest.frames[`driver-cuff-${state.lock.side}`] : null;
    const cuffTransform = cuff
      ? partTransform(cuff, "driver_joint", joint, angle, BOSS_SCALE * cuff.presentationScale, BOSS_SCALE * cuff.presentationScale)
      : null;
    driver = Object.freeze({
      target: Object.freeze(target), joint: Object.freeze(joint), head: Object.freeze(head), socket: Object.freeze(socket), axis: Object.freeze({ x: axis.x, y: axis.y }), extension,
      shaft, tip, cuff, cuffTransform,
      shaftTransform: partTransform(shaft, "shaft_in", joint, angle, shaftLength / Math.abs(shaft.anchors.shaft_out[0] - shaft.anchors.shaft_in[0]), BOSS_SCALE),
      tipTransform: partTransform(tip, "tip_socket", socket, angle, BOSS_SCALE, BOSS_SCALE),
    });
  }
  return Object.freeze({
    player: Object.freeze({ frame: player, transform: playerTransform, grip: Object.freeze(grip), blade, bladeTransform, bladeTarget: Object.freeze(bladeTarget), confirmedContact }),
    boss: Object.freeze({ frameId: bossFrameId, frame: boss, transform: bossTransform, driver }),
  });
}

// The gate cable is stage geometry, but its source must remain the active
// authored body frame's driver anchor rather than a classic-body estimate.
export function rigBossDriverJoint(state, manifest, now = 0) {
  const boss = rigDrawPlan(state, manifest, now).boss;
  return Object.freeze(projectSpriteAnchor(boss.transform, boss.frame, "driver_joint"));
}

export function rigAnchorMetrics(state, manifest, now = 0) {
  const plan = rigDrawPlan(state, manifest, now);
  const errors = { feet: distance(projectSpriteAnchor(plan.player.transform, plan.player.frame, "feet"), projectWorld(state.player)), blade: null, driver: null, cuffPivot: null, cuffAxis: null };
  if (plan.player.confirmedContact) errors.blade = distance(projectSpriteAnchor(plan.player.bladeTransform, plan.player.blade, "sword_tip"), plan.player.bladeTarget);
  if (plan.boss.driver && plan.boss.driver.extension === 1) errors.driver = distance(projectSpriteAnchor(plan.boss.driver.tipTransform, plan.boss.driver.tip, "driver_tip"), plan.boss.driver.target);
  if (plan.boss.driver?.cuff) {
    const cuffJoint = projectSpriteAnchor(plan.boss.driver.cuffTransform, plan.boss.driver.cuff, "driver_joint");
    const cuffShaft = projectSpriteAnchor(plan.boss.driver.cuffTransform, plan.boss.driver.cuff, "shaft_in");
    errors.cuffPivot = distance(cuffJoint, plan.boss.driver.joint);
    errors.cuffAxis = distanceToAxis(plan.boss.driver.joint, plan.boss.driver.axis, cuffShaft);
  }
  return Object.freeze({
    plan, errors: Object.freeze(errors),
    playerBodyScaleChange: 0, bossBodyScaleChange: 0,
    playerBodyRotationDegrees: 0, bossBodyRotationDegrees: 0,
    playerMirrored: false, bossMirrored: false,
    pass: Object.values(errors).filter(Number.isFinite).every((value) => value <= 1),
  });
}

export function validateRigSpriteSet(manifest) {
  if (!validateSpriteManifest(manifest)) return Object.freeze({ pass: false, reason: "manifest" });
  return Object.freeze({ pass: true, reason: null, playerBodyScaleChange: 0, bossBodyScaleChange: 0, bossBodyRotationDegrees: 0, mirrored: false });
}

export function validateRigCompositeSet(manifest) {
  const source = validateRigSpriteSet(manifest);
  if (!source.pass) return source;
  const samples = ["left", "right"].map((side) => {
    const state = createGameState({ started: true });
    state.phase = PHASE.CORE_OPEN; state.phaseTime = .4; state.boss.coreOpen = true;
    state.lock = { side, origin: { x: 0, y: 80 }, zone: { x: side === "left" ? -154 : 154, y: -4 }, createdAt: 0 };
    return { side, metrics: rigAnchorMetrics(state, manifest) };
  });
  const projected = Object.freeze(Object.fromEntries(["left", "right"].map((side) => {
    const cuff = manifest.frames[`driver-cuff-${side}`];
    const [,, width, height] = cuff.paintBounds;
    return [side, Object.freeze({ lengthCss: width * BOSS_SCALE * cuff.presentationScale / 4, thicknessCss: height * BOSS_SCALE * cuff.presentationScale / 4 })];
  })));
  const cuffError = Math.max(...samples.flatMap(({ metrics }) => [metrics.errors.cuffPivot || 0, metrics.errors.cuffAxis || 0]));
  const bboxPass = projected.left.lengthCss >= 16 && projected.left.lengthCss <= 19
    && projected.left.thicknessCss >= 15 && projected.left.thicknessCss <= 18
    && projected.right.lengthCss >= 10 && projected.right.lengthCss <= 13
    && projected.right.thicknessCss >= 10 && projected.right.thicknessCss <= 13.5;
  return Object.freeze({
    ...source, samples: Object.freeze(samples), maxCuffAxisError: cuffError, cuffProjectedBbox: projected,
    pass: cuffError <= 1 && bboxPass,
    reason: cuffError > 1 ? `SCENE FAIL: cuff deviates ${cuffError.toFixed(1)}px from immutable LOCK axis`
      : !bboxPass ? `SCENE FAIL: directional cuff 320 bboxes L ${projected.left.lengthCss.toFixed(1)}×${projected.left.thicknessCss.toFixed(1)}, R ${projected.right.lengthCss.toFixed(1)}×${projected.right.thicknessCss.toFixed(1)}px are out of range`
        : null,
  });
}

function frameImage(images, frame) { return images[frame.sheet] || null; }
export function createSpriteCharacterLayer(manifest, images) {
  if (!validateRigSpriteSet(manifest).pass) throw new Error("Invalid rig sprite manifest");
  if (Object.keys(manifest.sheets).some((name) => !images[name])) throw new Error("Sprite strip image missing");
  return Object.freeze({
    getBossDriverJoint(state, { now }) {
      return rigBossDriverJoint(state, manifest, now);
    },
    drawBoss(ctx, state, { now }) {
      const boss = rigDrawPlan(state, manifest, now).boss;
      // Shaft/tip are behind the socket body: no duplicate cuff/barrel exists.
      if (boss.driver) {
        drawSpriteFrame(ctx, frameImage(images, boss.driver.shaft), boss.driver.shaft, boss.driver.shaftTransform);
        drawSpriteFrame(ctx, frameImage(images, boss.driver.tip), boss.driver.tip, boss.driver.tipTransform);
        if (boss.driver.cuff) drawSpriteFrame(ctx, frameImage(images, boss.driver.cuff), boss.driver.cuff, boss.driver.cuffTransform);
      }
      drawSpriteFrame(ctx, frameImage(images, boss.frame), boss.frame, boss.transform);
    },
    drawPlayer(ctx, state, { now }) {
      const player = rigDrawPlan(state, manifest, now).player;
      // The authored blade is behind the contact-body hands and guard.
      if (state.visual?.attack) drawSpriteFrame(ctx, frameImage(images, player.blade), player.blade, player.bladeTransform);
      drawSpriteFrame(ctx, frameImage(images, player.frame), player.frame, player.transform);
    },
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.Image !== "function") return reject(new Error("Image decoding is unavailable"));
    const image = new globalThis.Image(); image.decoding = "async";
    image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Unable to load ${url.pathname}`)); image.src = url.href;
  });
}
async function loadSpriteAssets() {
  const response = await fetch(MANIFEST_URL.href);
  if (!response.ok) throw new Error(`Unable to load ${MANIFEST_URL.pathname} (${response.status})`);
  const manifest = await response.json();
  if (!validateSpriteManifest(manifest)) throw new Error("Sprite manifest does not satisfy the rig anchor contract");
  const entries = await Promise.all(Object.entries(manifest.sheets).map(async ([name, sheet]) => [name, await loadImage(new URL(`../assets/2d/strips/${sheet.file}`, import.meta.url))]));
  return { manifest, images: Object.freeze(Object.fromEntries(entries)) };
}

// The trusted classic renderer owns arena/effects/LOCK/impact exactly once.
// A complete layer swaps both characters atomically; failed load restores only
// the classic characters, never two overlapping sets.
export function createRenderer(canvas) {
  const classic = createClassicRenderer(canvas); let generation = 0;
  classic.info.spriteStatus = "loading"; classic.info.spriteError = null;
  async function refreshSprites() {
    const current = ++generation; classic.info.spriteStatus = "loading"; classic.info.spriteError = null;
    try {
      const { manifest, images } = await loadSpriteAssets();
      if (current !== generation) return;
      const validation = validateRigCompositeSet(manifest);
      if (!validation.pass) throw new Error(`Rig sprite validation failed: ${validation.reason}`);
      classic.setCharacterLayer(createSpriteCharacterLayer(manifest, images));
      classic.info.spriteStatus = "ready"; classic.info.spriteFrames = Object.keys(manifest.frames).length; classic.info.spriteMetrics = validation;
    } catch (error) {
      if (current !== generation) return;
      classic.setCharacterLayer(null); classic.info.spriteStatus = "fallback"; classic.info.spriteFrames = 0;
      classic.info.spriteError = error instanceof Error ? error.message : String(error);
    }
    if (typeof classic.onStatusChange === "function") classic.onStatusChange();
  }
  const classicRetry = classic.retry;
  classic.retry = () => { classicRetry(); return refreshSprites(); };
  void refreshSprites();
  return classic;
}
