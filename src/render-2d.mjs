import { CONFIG, PHASE, timingForRound } from "./game-core.mjs";
import { MAP_ART_ATLASES } from "./art-contract.mjs";
import { BOSS_DRIVER_JOINT_SOURCE } from "../assets/2d/sprites/sprite-contract.mjs";

// Rendering is deliberately a one-way projection of game-core's single floor plane.
// Nothing in this module writes back to state or changes hit / movement positions.
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const ORIGIN = Object.freeze({ x: 640, y: 344 });
const ISO = Object.freeze({ xx: 0.83, xy: 0.39, yx: -0.31, yy: 0.34 });
const COLORS = Object.freeze({
  night: "#11141b", ink: "#171b24", inkLight: "#29303a", ivory: "#ddd3b6",
  ivoryLight: "#fbf7e9", ivoryShade: "#aaa083", cobalt: "#173f92", cobaltLight: "#4a78cf",
  vermilion: "#a9322a", rust: "#c46a4e", silver: "#bdc6cc", gold: "#b99a43", white: "#ffffff",
  river: "#779bb4", danger: "rgba(190, 92, 71, .38)", dangerEdge: "#d78366",
});

const ASSETS = Object.freeze({
  arena: new URL(`../${MAP_ART_ATLASES.arena.file}`, import.meta.url),
  boss: new URL(`../${MAP_ART_ATLASES.boss.file}`, import.meta.url),
  driver: new URL(`../${MAP_ART_ATLASES.driver.file}`, import.meta.url),
  player: new URL(`../${MAP_ART_ATLASES.player.file}`, import.meta.url),
  relics: new URL(`../${MAP_ART_ATLASES.relics.file}`, import.meta.url),
  manifest: new URL(`../${MAP_ART_ATLASES.manifest.file}`, import.meta.url),
});
const ART_SCALE = Object.freeze({ boss: .62, player: .58, memory: .195, seal: .5 });
const PLAYER_SPRITE = Object.freeze({
  width: 104,
  height: 120,
  // Matches the authored contact hilt after its 64px source cell is scaled
  // into the 104×120 runtime sprite (x +20, y -58 from the floor anchor).
  hand: { x: 20, y: -58 },
});
// This is the authored compass-tool joint in the LOCK source cell: [59, 32].
// It is converted through the exact boss draw rect rather than approximated
// with a second set of runtime offsets.
const BOSS_SPRITE = Object.freeze({
  width: 316,
  height: 274,
  sourceSize: 64,
  driverJoint: BOSS_DRIVER_JOINT_SOURCE,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOut = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;

export function coreToScreen(point) {
  return {
    x: ORIGIN.x + point.x * ISO.xx + point.y * ISO.xy,
    y: ORIGIN.y + point.x * ISO.yx + point.y * ISO.yy,
  };
}

export function coreAnchor(bossPoint) {
  const boss = coreToScreen(bossPoint);
  return { x: boss.x, y: boss.y - 48 };
}

export function driverStampCenter(lockTarget) {
  return { x: lockTarget.x, y: lockTarget.y };
}

export function bossDriverJointAnchor(bossPoint) {
  return {
    x: bossPoint.x - BOSS_SPRITE.width / 2 + BOSS_SPRITE.driverJoint.x * BOSS_SPRITE.width / BOSS_SPRITE.sourceSize,
    y: bossPoint.y - BOSS_SPRITE.height + BOSS_SPRITE.driverJoint.y * BOSS_SPRITE.height / BOSS_SPRITE.sourceSize,
  };
}

function frameFrom(manifest, frameId) {
  return manifest?.frames?.[frameId] || null;
}

function anchoredPoint(frame, anchorName, target, targetAnchorName, scale = 1, flipX = false) {
  const anchor = frame?.anchors?.[anchorName];
  const targetAnchor = frame?.anchors?.[targetAnchorName];
  if (!anchor || !targetAnchor) return { ...target };
  return {
    x: target.x + (anchor[0] - targetAnchor[0]) * scale * (flipX ? -1 : 1),
    y: target.y + (anchor[1] - targetAnchor[1]) * scale,
  };
}

function drawAnchoredFrame(ctx, image, frame, target, anchorName, scale = 1, { flipX = false, rotation = 0, alpha = 1 } = {}) {
  if (!image || !frame) return false;
  const anchor = frame.anchors?.[anchorName];
  if (!anchor) return false;
  const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.rect;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(target.x, target.y);
  ctx.rotate(rotation);
  ctx.scale(flipX ? -scale : scale, scale);
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -anchor[0],
    -anchor[1],
    sourceWidth,
    sourceHeight,
  );
  ctx.restore();
  return true;
}

function drawTwoAnchorFrame(ctx, image, frame, startAnchorName, endAnchorName, targetStart, targetEnd, alpha = 1) {
  if (!image || !frame) return false;
  const sourceStart = frame.anchors?.[startAnchorName];
  const sourceEnd = frame.anchors?.[endAnchorName];
  if (!sourceStart || !sourceEnd) return false;
  const sourceDx = sourceEnd[0] - sourceStart[0];
  const sourceDy = sourceEnd[1] - sourceStart[1];
  const targetDx = targetEnd.x - targetStart.x;
  const targetDy = targetEnd.y - targetStart.y;
  const sourceLength = Math.hypot(sourceDx, sourceDy) || 1;
  const targetLength = Math.hypot(targetDx, targetDy) || 1;
  const scale = targetLength / sourceLength;
  const rotation = Math.atan2(targetDy, targetDx) - Math.atan2(sourceDy, sourceDx);
  const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.rect;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(targetStart.x, targetStart.y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -sourceStart[0],
    -sourceStart[1],
    sourceWidth,
    sourceHeight,
  );
  ctx.restore();
  return true;
}

function attackLunge(progress) {
  if (progress < .28) return .22 * easeOut(progress / .28); // prepare
  if (progress < .45) return .22 + .78 * easeOut((progress - .28) / .17); // commit
  if (progress <= .58) return 1; // impact hold
  return 1 - .68 * easeOut((progress - .58) / .42); // recoil
}

export function armorAnchor(bossPoint) {
  return coreToScreen({ x: bossPoint.x, y: bossPoint.y + CONFIG.bossRadius * .55 });
}

// Single source of truth for the visual weapon path. The body stays on the
// game-core floor point; only the sword line reaches out to the true contact.
export function playerWeaponGeometry(
  state,
  playerPoint,
  bossPoint,
  { coreTarget = null, armorTarget = null, playerFrame = null, playerScale = 1 } = {},
) {
  const player = coreToScreen(playerPoint);
  const core = coreTarget || coreAnchor(bossPoint);
  const attack = state.visual?.attack;
  const directCoreAttack = Boolean(attack?.hit && !attack.armor && state.boss.coreOpen);
  const armorAttack = Boolean(attack?.armor);
  const target = directCoreAttack ? core : armorAttack ? armorTarget || armorAnchor(bossPoint) : null;
  // The authored player holds the hilt on its right.  Mirror the entire
  // whole-body key pose when the true floor-plane target sits to its left,
  // then derive the same mirrored hilt for the single dynamic blade.
  const flipX = Boolean(target && target.x < player.x);
  const hand = playerFrame
    ? anchoredPoint(playerFrame, "hand", player, "feet", playerScale, flipX)
    : { x: player.x + PLAYER_SPRITE.hand.x * (flipX ? -1 : 1), y: player.y + PLAYER_SPRITE.hand.y };
  if (!target) return { body: player, hand, tip: hand, target: null, contact: false, kind: null, flipX: false };
  const progress = clamp(1 - attack.remaining / 0.24, 0, 1);
  const dx = target.x - hand.x; const dy = target.y - hand.y;
  const distance = Math.hypot(dx, dy) || 1;
  const rest = { x: hand.x + dx / distance * Math.min(distance, 54), y: hand.y + dy / distance * Math.min(distance, 54) };
  const lunge = attackLunge(progress);
  const tip = { x: rest.x + (target.x - rest.x) * lunge, y: rest.y + (target.y - rest.y) * lunge };
  return {
    body: player,
    hand,
    tip,
    target,
    contact: progress >= .45 && progress <= .58,
    kind: directCoreAttack ? "core" : "armor",
    flipX,
  };
}

export function playerFrameFor(state, observedMoving = null) {
  const attack = state.visual?.attack;
  if (attack?.remaining > 0) {
    const progress = clamp(1 - attack.remaining / .24, 0, 1);
    if (progress < .28) return { id: "player-attack-windup", index: 3, phase: "windup" };
    if (progress <= .58) return { id: "player-attack-contact", index: 4, phase: "contact" };
    return { id: "player-attack-recoil", index: 5, phase: "recoil" };
  }
  if (state.visual?.impact?.tone === "danger" && state.visual.impact.remaining > 0) {
    return { id: "player-hurt", index: 6, phase: "hurt" };
  }
  if (state.visual?.lastDash?.remaining > 0) return { id: "player-dash", index: 2, phase: "dash" };
  const moving = observedMoving ?? Math.hypot(state.player.lastMove?.x || 0, state.player.lastMove?.y || 0) > .1;
  if (moving) return { id: "player-move", index: 1, phase: "move" };
  return { id: "player-idle", index: 0, phase: "idle" };
}

function bossFrameIdFor(state) {
  if (state.visual?.impact?.tone === "core" && state.visual.impact.remaining > 0) return "boss-core-hit";
  if (state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) return "boss-collapse-open";
  if ([PHASE.COMBINE, PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION].includes(state.phase)) return "boss-lock";
  return "boss-closed";
}

function collapseProgressFor(state) {
  if (state.phase === PHASE.ROUND_CLEAR) return 1;
  if (state.phase !== PHASE.CORE_OPEN) return 0;
  const elapsed = timingForRound(Number.isFinite(state.round) ? state.round : 1).coreOpen - state.phaseTime;
  return easeOut(elapsed / .18);
}

function authoredPlayerFrameId(frame) {
  return frame.id === "player-move" ? "player-run" : frame.id;
}

// Every combat draw gets its anchors, selected full-body key pose, weapon and
// flash from this one scene. Rendering never recomputes a competing contact point.
export function buildCombatScene(state, { observedMoving = null, artManifest = null } = {}) {
  const boss = coreToScreen(state.boss);
  const player = coreToScreen(state.player);
  const lockTarget = state.lock ? coreToScreen(state.lock.zone) : null;
  const driverVisible = Boolean(lockTarget && [PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION, PHASE.CORE_OPEN, PHASE.ROUND_CLEAR].includes(state.phase));
  const playerFrame = playerFrameFor(state, observedMoving);
  const bossFrameId = bossFrameIdFor(state);
  const bossArtFrame = frameFrom(artManifest, bossFrameId);
  const lockBossArtFrame = frameFrom(artManifest, "boss-lock");
  const collapseProgress = collapseProgressFor(state);
  const playerArtFrame = frameFrom(artManifest, authoredPlayerFrameId(playerFrame));
  const authoredCore = bossArtFrame
    ? anchoredPoint(bossArtFrame, "core", boss, "feet", ART_SCALE.boss)
    : coreAnchor(state.boss);
  const openShoulder = bossArtFrame
    ? anchoredPoint(bossArtFrame, "shoulder", boss, "feet", ART_SCALE.boss)
    : null;
  const lockedShoulder = lockBossArtFrame
    ? anchoredPoint(lockBossArtFrame, "shoulder", boss, "feet", ART_SCALE.boss)
    : openShoulder;
  const authoredShoulder = openShoulder && lockedShoulder && state.phase === PHASE.CORE_OPEN
    ? {
        x: lockedShoulder.x + (openShoulder.x - lockedShoulder.x) * collapseProgress,
        y: lockedShoulder.y + (openShoulder.y - lockedShoulder.y) * collapseProgress,
      }
    : openShoulder;
  const armorTarget = bossArtFrame
    ? { x: authoredCore.x + 70 * ART_SCALE.boss, y: authoredCore.y + 54 * ART_SCALE.boss }
    : null;
  const weapon = playerWeaponGeometry(state, state.player, state.boss, {
    coreTarget: authoredCore,
    armorTarget,
    playerFrame: playerArtFrame,
    playerScale: ART_SCALE.player,
  });
  const flash = weapon.contact && weapon.target ? { target: { ...weapon.target }, kind: weapon.kind } : null;
  return {
    boss,
    player,
    core: authoredCore,
    lockTarget,
    driverVisible,
    open: state.boss.coreOpen,
    weapon,
    playerFrame,
    bossFrame: spriteFrame(state, "boss"),
    bossFrameId,
    bossArtFrame,
    lockBossArtFrame,
    collapseProgress,
    playerArtFrame,
    driverOrigin: authoredShoulder,
    artManifest,
    flash,
  };
}

// This plan is the renderer's only combat-coordinate interface.  Keeping the
// selected body frame, grounded body point, blade, flash, and stamp target in
// one object makes it impossible for a draw call to quietly use a second set
// of combat constants.
export function combatDrawPlan(scene) {
  return {
    player: { at: scene.weapon.body, frame: scene.playerFrame, flipX: scene.weapon.flipX },
    boss: { at: scene.boss, frame: scene.bossFrame, open: scene.open },
    blade: scene.weapon.target ? scene.weapon : null,
    flash: scene.flash,
    driver: scene.driverVisible && scene.lockTarget ? { origin: scene.driverOrigin || bossDriverJointAnchor(scene.boss), target: scene.lockTarget } : null,
    core: scene.core,
  };
}

function projectVector(x, y) {
  return { x: x * ISO.xx + y * ISO.xy, y: x * ISO.yx + y * ISO.yy };
}

function ellipsePoints(center, radiusX, radiusY, steps = 72) {
  return Array.from({ length: steps }, (_, index) => {
    const angle = (Math.PI * 2 * index) / steps;
    return coreToScreen({ x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY });
  });
}

function path(ctx, points, close = true) {
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  if (close) ctx.closePath();
}

function drawLine(ctx, from, to, stroke, width = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawArena(ctx) {
  const arena = ellipsePoints({ x: 0, y: 0 }, CONFIG.arenaRadiusX, CONFIG.arenaRadiusY);
  const shadow = arena.map((point) => ({ x: point.x + 10, y: point.y + 17 }));
  path(ctx, shadow); ctx.fillStyle = "rgba(0, 0, 0, .38)"; ctx.fill();
  path(ctx, arena);
  const fill = ctx.createLinearGradient(250, 150, 940, 590);
  fill.addColorStop(0, "#f0e8ce"); fill.addColorStop(.56, COLORS.ivory); fill.addColorStop(1, "#b9ac8d");
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = "rgba(50, 54, 54, .33)"; ctx.lineWidth = 2;
  for (const factor of [.22, .42, .64, .83]) { path(ctx, ellipsePoints({ x: 0, y: 0 }, CONFIG.arenaRadiusX * factor, CONFIG.arenaRadiusY * factor)); ctx.stroke(); }
  // One river and modest contour arcs establish the map without turning the floor into texture.
  const river = [{ x: -330, y: -150 }, { x: -205, y: -102 }, { x: -95, y: -42 }, { x: 35, y: -32 }, { x: 138, y: 48 }, { x: 298, y: 132 }].map(coreToScreen);
  drawLine(ctx, river[0], river[1], COLORS.river, 8, .62);
  for (let index = 1; index < river.length - 1; index += 1) {
    drawLine(ctx, river[index], river[index + 1], COLORS.river, 8, .62);
  }
  const compass = coreToScreen({ x: -282, y: 120 });
  ctx.save(); ctx.translate(compass.x, compass.y); ctx.rotate(-.28); ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(0, 45); ctx.moveTo(-45, 0); ctx.lineTo(45, 0); ctx.stroke();
  ctx.restore();
}

function drawExplore(ctx, state) {
  if (!state.explore || ![PHASE.EXPLORE, PHASE.GAME_OVER].includes(state.phase)) return;
  const minY = -CONFIG.arenaRadiusY, maxY = CONFIG.arenaRadiusY;
  const left = state.explore.lineX - CONFIG.exploreLaneHalfWidth;
  const right = state.explore.lineX + CONFIG.exploreLaneHalfWidth;
  const polygon = [{ x: left, y: minY }, { x: right, y: minY }, { x: right, y: maxY }, { x: left, y: maxY }].map(coreToScreen);
  const duration = timingForRound(state.round).explore;
  const remaining = clamp(state.phaseTime / duration, 0, 1);
  const pressure = 1 - remaining;
  const pulse = .5 + .5 * Math.sin(state.elapsed * (10 + pressure * 16));

  ctx.save();
  path(ctx, polygon);
  ctx.fillStyle = `rgba(169, 50, 42, ${.16 + pressure * .34 + pulse * .06})`;
  ctx.fill();

  // Ink hatching accelerates toward the immutable damage lane instead of
  // shrinking or lying about the collision boundary.
  ctx.clip();
  ctx.strokeStyle = `rgba(92, 28, 25, ${.22 + pressure * .32})`;
  ctx.lineWidth = 5;
  const slide = (state.elapsed * (70 + pressure * 90)) % 58;
  for (let offset = -DESIGN_HEIGHT; offset < DESIGN_WIDTH; offset += 58) {
    ctx.beginPath();
    ctx.moveTo(offset + slide, 120);
    ctx.lineTo(offset - 260 + slide, 650);
    ctx.stroke();
  }
  ctx.restore();

  const leftA = coreToScreen({ x: left, y: minY });
  const leftB = coreToScreen({ x: left, y: maxY });
  const rightA = coreToScreen({ x: right, y: minY });
  const rightB = coreToScreen({ x: right, y: maxY });
  ctx.save();
  ctx.shadowColor = COLORS.dangerEdge;
  ctx.shadowBlur = 7 + pressure * 16;
  drawLine(ctx, leftA, leftB, COLORS.dangerEdge, 5 + pressure * 3, .7 + pulse * .3);
  drawLine(ctx, rightA, rightB, COLORS.dangerEdge, 5 + pressure * 3, .7 + pulse * .3);
  ctx.restore();

  const warning = coreToScreen({ x: state.explore.lineX, y: minY + 22 });
  ctx.save();
  ctx.translate(warning.x, warning.y - 8);
  ctx.rotate(-.36);
  ctx.fillStyle = pressure > .66 ? COLORS.ivoryLight : COLORS.ink;
  ctx.font = "900 18px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.max(1, Math.ceil(state.phaseTime * 3))}`, 0, 0);
  ctx.restore();
}

function drawLock(ctx, state) {
  if (!state.lock) return;
  const locked = [PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION].includes(state.phase);
  const used = [PHASE.CORE_OPEN, PHASE.ROUND_CLEAR, PHASE.GAME_OVER].includes(state.phase);
  const target = coreToScreen(state.lock.zone);
  const zone = ellipsePoints(state.lock.zone, CONFIG.lockZoneRadiusX, CONFIG.lockZoneRadiusY, 36);
  path(ctx, zone); ctx.fillStyle = locked ? "rgba(169, 50, 42, .72)" : "rgba(130, 54, 37, .38)"; ctx.fill();
  ctx.strokeStyle = used ? "#754738" : COLORS.vermilion; ctx.lineWidth = 5; ctx.stroke();
  ctx.save(); ctx.translate(target.x, target.y); ctx.rotate(-.28); ctx.fillStyle = locked ? "#7c201c" : "#5c2a24";
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.ivory; ctx.fillRect(-2, -16, 4, 32); ctx.fillRect(-16, -2, 32, 4); ctx.restore();
}

function drawMemory(ctx, state, boss) {
  const base = { x: boss.x - 142, y: boss.y + 20 };
  for (let index = 0; index < 3; index += 1) {
    const plaque = { x: base.x - index * 48, y: base.y + index * 26 };
    ctx.save(); ctx.translate(plaque.x, plaque.y); ctx.rotate(-.22);
    ctx.fillStyle = index < state.memory.length ? COLORS.ivoryLight : "rgba(208, 197, 166, .42)";
    ctx.fillRect(-25, -15, 50, 30); ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 3; ctx.strokeRect(-25, -15, 50, 30);
    if (index < state.memory.length) {
      ctx.fillStyle = COLORS.silver; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      const side = state.memory[index] === "left" ? -1 : 1;
      ctx.strokeStyle = COLORS.vermilion; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * 22, -3); ctx.stroke();
    }
    ctx.restore();
  }
}

function spriteFrame(state, kind) {
  if (kind === "player") {
    return playerFrameFor(state).index;
  }
  if (state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) return 3;
  if (state.phase === PHASE.PREDICTION) return 2;
  if ([PHASE.LOCK, PHASE.RELOCK].includes(state.phase)) return 1;
  return state.phase === PHASE.EXPLORE ? 1 : 0;
}

function drawSprite(ctx, image, frame, columns, at, width, height, fallback, flipX = false) {
  if (image?.complete && image.naturalWidth > 0) {
    const sourceWidth = image.naturalWidth / columns;
    ctx.save();
    if (flipX) { ctx.translate(at.x * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(image, sourceWidth * frame, 0, sourceWidth, image.naturalHeight, at.x - width / 2, at.y - height, width, height);
    ctx.restore();
    return;
  }
  fallback();
}

function drawBossFallback(ctx, boss, open) {
  ctx.save(); ctx.translate(boss.x, boss.y);
  ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.ellipse(0, -46, 84, 70, -.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.ivory; ctx.beginPath(); ctx.ellipse(0, -52, 73, 59, -.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.ellipse(0, -52, 39, 40, -.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = open ? COLORS.white : COLORS.ivoryShade; ctx.beginPath(); ctx.ellipse(0, -42, open ? 28 : 11, open ? 31 : 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.ivoryLight; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-35, -106); ctx.lineTo(-10, -139); ctx.lineTo(8, -103); ctx.lineTo(40, -133); ctx.stroke();
  ctx.restore();
}

function drawPlayerFallback(ctx, player) {
  ctx.save(); ctx.translate(player.x, player.y); ctx.fillStyle = COLORS.cobalt; ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(-18, -58); ctx.lineTo(12, -70); ctx.lineTo(28, -18); ctx.lineTo(12, 4); ctx.fill();
  ctx.fillStyle = COLORS.ivoryLight; ctx.beginPath(); ctx.ellipse(0, -67, 13, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.ivoryLight; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(11, -39); ctx.lineTo(48, -71); ctx.stroke(); ctx.restore();
}

function drawDriver(ctx, origin, target, intensity) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const length = Math.hypot(dx, dy); if (length < 1) return target;
  const normal = { x: -dy / length, y: dx / length };
  const elbow = { x: origin.x + dx * .47 + normal.x * 28, y: origin.y + dy * .47 + normal.y * 28 };
  // A two-link compass arm originates at the authored boss driver and ends at the exact seal point.
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(elbow.x, elbow.y); ctx.lineTo(target.x, target.y); ctx.stroke();
  ctx.strokeStyle = COLORS.ivory; ctx.lineWidth = 19; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(elbow.x, elbow.y); ctx.lineTo(target.x, target.y); ctx.stroke();
  ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(elbow.x, elbow.y, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(elbow.x, elbow.y, 10, 0, Math.PI * 2); ctx.stroke();
  // This compass stamp is centered on the exact immutable LOCK point.
  ctx.fillStyle = intensity >= 1 ? COLORS.ink : COLORS.ivoryShade; ctx.beginPath(); ctx.arc(target.x, target.y, 25, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.vermilion; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(target.x, target.y, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = COLORS.ivoryLight; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(target.x - 13, target.y); ctx.lineTo(target.x + 13, target.y); ctx.moveTo(target.x, target.y - 13); ctx.lineTo(target.x, target.y + 13); ctx.stroke();
  ctx.restore();
  return driverStampCenter(target);
}

function drawWeaponContact(ctx, weapon) {
  if (!weapon.target) return;
  const dx = weapon.tip.x - weapon.hand.x; const dy = weapon.tip.y - weapon.hand.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const hiltWidth = 7; const tipWidth = 1.4;
  const blade = [
    { x: weapon.hand.x + normal.x * hiltWidth, y: weapon.hand.y + normal.y * hiltWidth },
    { x: weapon.tip.x + normal.x * tipWidth, y: weapon.tip.y + normal.y * tipWidth },
    weapon.tip,
    { x: weapon.tip.x - normal.x * tipWidth, y: weapon.tip.y - normal.y * tipWidth },
    { x: weapon.hand.x - normal.x * hiltWidth, y: weapon.hand.y - normal.y * hiltWidth },
  ];
  ctx.save(); path(ctx, blade); ctx.fillStyle = "#0c1532"; ctx.fill();
  const inner = [
    { x: weapon.hand.x + normal.x * 3.6, y: weapon.hand.y + normal.y * 3.6 },
    { x: weapon.tip.x + normal.x * .65, y: weapon.tip.y + normal.y * .65 }, weapon.tip,
    { x: weapon.tip.x - normal.x * .65, y: weapon.tip.y - normal.y * .65 },
    { x: weapon.hand.x - normal.x * 3.6, y: weapon.hand.y - normal.y * 3.6 },
  ];
  path(ctx, inner); ctx.fillStyle = COLORS.ivoryLight; ctx.fill();
  if (weapon.contact) {
    ctx.strokeStyle = weapon.kind === "core" ? COLORS.white : COLORS.cobaltLight; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(weapon.target.x, weapon.target.y, 18, -2.5, -.2); ctx.stroke();
  }
  ctx.restore();
}

function driverPoseFor(state, origin, fixedTarget, collapseProgress = 0) {
  const dx = fixedTarget.x - origin.x;
  const dy = fixedTarget.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const direction = { x: dx / length, y: dy / length };
  let setback = 0;
  if (state.phase === PHASE.LOCK || state.phase === PHASE.RELOCK) {
    const duration = state.phase === PHASE.RELOCK ? timingForRound(state.round).relock : timingForRound(state.round).lock;
    const progress = 1 - clamp(state.phaseTime / duration, 0, 1);
    setback = 112 - easeOut(progress) * 34;
  } else if (state.phase === PHASE.PREDICTION) {
    const progress = 1 - clamp(state.phaseTime / timingForRound(state.round).prediction, 0, 1);
    setback = 78 * (1 - easeOut(clamp(progress / .72, 0, 1)));
  }
  const stampCenter = {
    x: fixedTarget.x - direction.x * setback,
    y: fixedTarget.y - direction.y * setback,
  };
  const wrist = {
    x: stampCenter.x - direction.x * 84,
    y: stampCenter.y - direction.y * 84,
  };
  const elbow = {
    x: origin.x + (wrist.x - origin.x) * .47,
    y: origin.y + (wrist.y - origin.y) * .12 - 8,
  };
  if ((state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) && collapseProgress > 0) {
    const normal = { x: -direction.y, y: direction.x };
    const recoil = easeOut(collapseProgress);
    elbow.x += normal.x * 48 * recoil - direction.x * 18 * recoil;
    elbow.y += normal.y * 48 * recoil - direction.y * 18 * recoil;
    wrist.x += normal.x * 24 * recoil;
    wrist.y += normal.y * 24 * recoil;
  }
  return { elbow, wrist, stampCenter, fixedTarget, contacting: setback <= .75 };
}

function drawAuthoredDriver(ctx, state, scene, images) {
  if (!scene.driverVisible || !scene.lockTarget || !scene.driverOrigin) return null;
  const pose = driverPoseFor(state, scene.driverOrigin, scene.lockTarget, scene.collapseProgress);
  const upper = frameFrom(scene.artManifest, "driver-upper");
  const forearm = frameFrom(scene.artManifest, "driver-forearm");
  const stamp = frameFrom(scene.artManifest, "driver-stamp");

  // The target ray is frozen at LOCK. The stamp may slide only on this axis.
  ctx.save();
  ctx.strokeStyle = "rgba(238, 230, 207, .34)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(scene.driverOrigin.x, scene.driverOrigin.y);
  ctx.lineTo(scene.lockTarget.x, scene.lockTarget.y);
  ctx.stroke();
  ctx.restore();

  drawTwoAnchorFrame(ctx, images.driver, upper, "shoulder", "elbow", scene.driverOrigin, pose.elbow);
  drawTwoAnchorFrame(ctx, images.driver, forearm, "elbow", "wrist", pose.elbow, pose.wrist);
  drawTwoAnchorFrame(ctx, images.driver, stamp, "wrist", "stampCenter", pose.wrist, pose.stampCenter);
  return pose;
}

function authoredBossAnchor(scene, name) {
  return scene.bossArtFrame
    ? anchoredPoint(scene.bossArtFrame, name, scene.boss, "feet", ART_SCALE.boss)
    : null;
}

function drawAuthoredMemories(ctx, state, scene, images, displayMemory) {
  const plaque = frameFrom(scene.artManifest, "memory-plaque");
  const memory = Array.isArray(displayMemory) ? displayMemory.slice(0, 3) : state.memory.slice(0, 3);
  const sockets = ["memory1", "memory2", "memory3"].map((name) => authoredBossAnchor(scene, name));

  if (scene.lockTarget && memory.length >= 3) {
    ctx.save();
    ctx.strokeStyle = "rgba(142, 35, 28, .88)";
    ctx.lineWidth = 2.4;
    for (const socket of sockets) {
      if (!socket) continue;
      ctx.beginPath();
      ctx.moveTo(socket.x, socket.y);
      ctx.quadraticCurveTo(
        socket.x + (scene.lockTarget.x - socket.x) * .48,
        socket.y - 12,
        scene.lockTarget.x,
        scene.lockTarget.y,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  for (let index = 0; index < memory.length; index += 1) {
    const socket = sockets[index];
    if (!socket) continue;
    const side = memory[index] === "left" ? -1 : 1;
    drawAnchoredFrame(ctx, images.relics, plaque, socket, "root", ART_SCALE.memory, {
      rotation: side * .12,
    });
  }
}

function drawAuthoredSeal(ctx, scene, images) {
  if (!scene.lockTarget) return;
  const seal = frameFrom(scene.artManifest, "lock-seal");
  drawAnchoredFrame(ctx, images.relics, seal, scene.lockTarget, "root", ART_SCALE.seal, {
    rotation: -.12,
    alpha: scene.open ? .78 : 1,
  });
}

function drawAuthoredBlade(ctx, scene, images) {
  if (!scene.weapon.target) return;
  const blade = frameFrom(scene.artManifest, "boundary-blade");
  drawTwoAnchorFrame(
    ctx,
    images.relics,
    blade,
    "hand",
    "swordTip",
    scene.weapon.hand,
    scene.weapon.tip,
    scene.weapon.contact ? 1 : .9,
  );
  if (scene.weapon.contact) {
    const color = scene.weapon.kind === "core" ? COLORS.white : COLORS.cobaltLight;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(scene.weapon.target.x, scene.weapon.target.y, 17, -2.6, .45);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAuthoredCombatants(ctx, state, scene, images, { displayMemory = null } = {}) {
  const plan = combatDrawPlan(scene);
  ctx.save();
  ctx.fillStyle = "rgba(4, 6, 9, .36)";
  ctx.beginPath();
  ctx.ellipse(plan.boss.at.x, plan.boss.at.y + 8, 118, 31, -.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(plan.player.at.x, plan.player.at.y + 4, 27, 8, -.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (scene.open && scene.lockBossArtFrame && scene.collapseProgress < 1) {
    const recoilArc = Math.sin(scene.collapseProgress * Math.PI);
    drawAnchoredFrame(
      ctx,
      images.boss,
      scene.lockBossArtFrame,
      plan.boss.at,
      "feet",
      ART_SCALE.boss,
      { alpha: 1 - scene.collapseProgress },
    );
    drawAnchoredFrame(
      ctx,
      images.boss,
      scene.bossArtFrame,
      plan.boss.at,
      "feet",
      ART_SCALE.boss,
      { alpha: scene.collapseProgress, rotation: -.045 * recoilArc },
    );
  } else {
    drawAnchoredFrame(ctx, images.boss, scene.bossArtFrame, plan.boss.at, "feet", ART_SCALE.boss);
  }
  drawAuthoredSeal(ctx, scene, images);
  const driverPose = drawAuthoredDriver(ctx, state, scene, images);
  drawAuthoredMemories(ctx, state, scene, images, displayMemory);

  if (state.visual?.lastDash?.remaining > 0) {
    const dash = state.visual.lastDash;
    const from = coreToScreen(dash.from);
    const to = coreToScreen(dash.to);
    const alpha = clamp(dash.remaining / dash.duration, 0, 1);
    ctx.save();
    ctx.strokeStyle = COLORS.cobaltLight;
    ctx.globalAlpha = alpha * .75;
    ctx.lineWidth = 13;
    ctx.setLineDash([24, 15]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  const blink = state.timers?.invulnerable > 0 && Math.sin(state.elapsed * 42) > .35;
  drawAnchoredFrame(
    ctx,
    images.player,
    scene.playerArtFrame,
    plan.player.at,
    "feet",
    ART_SCALE.player,
    { flipX: plan.player.flipX, alpha: blink ? .52 : 1 },
  );
  drawAuthoredBlade(ctx, scene, images);

  if (scene.open) {
    ctx.save();
    ctx.globalAlpha = Math.max(.15, scene.collapseProgress || 1);
    ctx.fillStyle = "rgba(255, 255, 245, .92)";
    ctx.shadowColor = COLORS.white;
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(scene.core.x, scene.core.y, 10 + Math.sin(state.elapsed * 13) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const stampCenter = driverPose?.contacting ? { ...driverPose.stampCenter } : null;
  return {
    ...scene,
    stampCenter,
    playerGroundBodyError: 0,
    swordContactError: plan.blade?.contact
      ? Math.hypot(plan.blade.tip.x - plan.blade.target.x, plan.blade.tip.y - plan.blade.target.y)
      : null,
    driverContactError: stampCenter
      ? Math.hypot(stampCenter.x - scene.lockTarget.x, stampCenter.y - scene.lockTarget.y)
      : null,
  };
}

function drawCombatants(ctx, state, scene, images, presentation = {}) {
  if (scene.artManifest && images.driver && images.relics && scene.bossArtFrame && scene.playerArtFrame) {
    return drawAuthoredCombatants(ctx, state, scene, images, presentation);
  }
  const plan = combatDrawPlan(scene);
  // Ground shadows are derived from the same projected x/y positions as hit testing.
  ctx.fillStyle = "rgba(18, 20, 23, .26)"; ctx.beginPath(); ctx.ellipse(plan.boss.at.x, plan.boss.at.y + 7, 104, 26, -.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(plan.player.at.x, plan.player.at.y + 5, 30, 9, -.18, 0, Math.PI * 2); ctx.fill();
  drawSprite(ctx, images.boss, plan.boss.frame, 4, plan.boss.at, BOSS_SPRITE.width, BOSS_SPRITE.height, () => drawBossFallback(ctx, plan.boss.at, plan.boss.open));
  const stampCenter = plan.driver ? drawDriver(ctx, plan.driver.origin, plan.driver.target, state.phase === PHASE.PREDICTION || plan.boss.open ? 1 : .55) : null;
  drawMemory(ctx, state, plan.boss.at);
  if (state.visual?.lastDash?.remaining > 0) {
    const dash = state.visual.lastDash;
    drawLine(ctx, coreToScreen(dash.from), coreToScreen(dash.to), COLORS.cobaltLight, 10, clamp(dash.remaining / dash.duration, 0, 1));
  }
  drawSprite(ctx, images.player, plan.player.frame.index, 6, plan.player.at, PLAYER_SPRITE.width, PLAYER_SPRITE.height, () => drawPlayerFallback(ctx, plan.player.at), plan.player.flipX);
  if (plan.blade) drawWeaponContact(ctx, plan.blade);
  if (plan.boss.open) { ctx.fillStyle = COLORS.white; ctx.beginPath(); ctx.arc(plan.core.x, plan.core.y, 18 + Math.sin(performance.now() * .02) * 2, 0, Math.PI * 2); ctx.fill(); }
  return {
    ...scene,
    stampCenter,
    playerGroundBodyError: Math.hypot(plan.player.at.x - scene.player.x, plan.player.at.y - scene.player.y),
    swordContactError: plan.blade?.contact ? Math.hypot(plan.blade.tip.x - plan.blade.target.x, plan.blade.tip.y - plan.blade.target.y) : null,
    driverContactError: stampCenter ? Math.hypot(stampCenter.x - plan.driver.target.x, stampCenter.y - plan.driver.target.y) : null,
  };
}

// Kept exported for Canvas-spy regression tests. The production renderer calls
// this exact function, so the test observes the final drawImage/path calls.
export function drawCombatFrame(ctx, state, scene, images, presentation = {}) {
  const combat = drawCombatants(ctx, state, scene, images, presentation);
  drawFeedback(ctx, state, combat, presentation);
  return combat;
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function drawUiPlate(ctx, x, y, width, height, edge = COLORS.ivoryShade, fill = "rgba(10, 15, 23, .84)") {
  path(ctx, [
    { x, y: y + 5 },
    { x: x + 10, y },
    { x: x + width - 18, y },
    { x: x + width, y: y + 12 },
    { x: x + width - 8, y: y + height },
    { x: x + 12, y: y + height },
    { x, y: y + height - 9 },
  ]);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(238, 230, 207, .25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = edge;
  ctx.fillRect(x, y + 6, 4, height - 12);
}

function drawDiamond(ctx, x, y, width, height, fill, stroke) {
  path(ctx, [
    { x, y: y + height / 2 },
    { x: x + width / 2, y },
    { x: x + width, y: y + height / 2 },
    { x: x + width / 2, y: y + height },
  ]);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTopHud(ctx, state, compact = false) {
  const shield = Number.isFinite(state.player?.shield) ? state.player.shield : 0;
  const coreHp = Number.isFinite(state.boss?.coreHp) ? state.boss.coreHp : 0;
  const round = Number.isFinite(state.round) ? state.round : 1;
  const score = Number.isFinite(state.stats?.score) ? state.stats.score : 0;
  const outsmarts = Number.isFinite(state.stats?.outsmarts) ? state.stats.outsmarts : 0;

  ctx.save();
  if (compact) {
    const mobileWash = typeof ctx.createLinearGradient === "function"
      ? ctx.createLinearGradient(0, 0, 0, 74)
      : "rgba(5, 7, 11, .72)";
    if (typeof mobileWash !== "string") {
      mobileWash.addColorStop(0, "rgba(5, 7, 11, .92)");
      mobileWash.addColorStop(1, "rgba(5, 7, 11, .12)");
    }
    ctx.fillStyle = mobileWash;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 74);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.silver;
    ctx.font = "850 25px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("WARD", 28, 36);
    for (let index = 0; index < CONFIG.playerMaxShield; index += 1) {
      drawDiamond(
        ctx,
        128 + index * 54,
        18,
        38,
        19,
        index < shield ? COLORS.cobaltLight : "rgba(184, 193, 200, .12)",
        index < shield ? COLORS.ivoryLight : "rgba(184, 193, 200, .28)",
      );
    }

    ctx.fillStyle = state.boss?.coreOpen ? COLORS.white : COLORS.ivoryShade;
    ctx.fillText(state.boss?.coreOpen ? "CORE!" : "CORE", 358, 36);
    const mobileCoreWidth = 40;
    for (let index = 0; index < CONFIG.bossMaxCore; index += 1) {
      const x = 454 + index * 51;
      path(ctx, [
        { x, y: 19 + index % 2 },
        { x: x + mobileCoreWidth - 5, y: 19 + index % 2 },
        { x: x + mobileCoreWidth, y: 27 + index % 2 },
        { x: x + mobileCoreWidth - 4, y: 36 + index % 2 },
        { x: x + 2, y: 36 + index % 2 },
      ]);
      ctx.fillStyle = index < coreHp
        ? state.boss?.coreOpen ? COLORS.white : COLORS.ivoryShade
        : "rgba(184, 193, 200, .1)";
      ctx.fill();
      ctx.strokeStyle = index < coreHp ? COLORS.gold : "rgba(184, 193, 200, .22)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.ivoryLight;
    ctx.font = "900 27px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`R${String(round).padStart(2, "0")} · ${String(score).padStart(5, "0")} · O${outsmarts}`, 1244, 36);
    ctx.strokeStyle = COLORS.vermilion;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(892, 49);
    ctx.lineTo(1244, 49);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const wash = typeof ctx.createLinearGradient === "function"
    ? ctx.createLinearGradient(0, 0, 0, compact ? 145 : 118)
    : "rgba(5, 7, 11, .62)";
  if (typeof wash !== "string") {
    wash.addColorStop(0, "rgba(5, 7, 11, .86)");
    wash.addColorStop(.72, "rgba(5, 7, 11, .35)");
    wash.addColorStop(1, "rgba(5, 7, 11, 0)");
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, DESIGN_WIDTH, compact ? 145 : 118);

  const left = compact ? 30 : 34;
  const wardY = compact ? 29 : 27;
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.silver;
  ctx.font = `850 ${compact ? 21 : 11}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("CARTOGRAPHER · WARD", left, wardY);
  ctx.strokeStyle = COLORS.cobaltLight;
  ctx.lineWidth = compact ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(left, wardY + (compact ? 8 : 5));
  ctx.lineTo(left + (compact ? 250 : 145), wardY + (compact ? 8 : 5));
  ctx.stroke();
  for (let index = 0; index < CONFIG.playerMaxShield; index += 1) {
    const size = compact ? 35 : 18;
    drawDiamond(
      ctx,
      left + index * (compact ? 56 : 31),
      compact ? 47 : 41,
      size,
      compact ? 18 : 10,
      index < shield ? COLORS.cobaltLight : "rgba(184, 193, 200, .12)",
      index < shield ? COLORS.ivoryLight : "rgba(184, 193, 200, .28)",
    );
  }

  const coreY = compact ? 91 : 72;
  ctx.textAlign = "left";
  ctx.fillStyle = state.boss?.coreOpen ? COLORS.white : COLORS.ivoryShade;
  ctx.font = `850 ${compact ? 20 : 10}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(state.boss?.coreOpen ? "UNMAPPED CORE · OPEN · J" : "THE UNMAPPED KING · CORE SEALED", left, coreY);
  const cellWidth = compact ? 40 : 24;
  const gap = compact ? 10 : 6;
  const segmentY = coreY + (compact ? 13 : 8);
  for (let index = 0; index < CONFIG.bossMaxCore; index += 1) {
    const x = left + index * (cellWidth + gap);
    const jitter = index % 2 ? 2 : 0;
    path(ctx, [
      { x, y: segmentY + jitter },
      { x: x + cellWidth - 5, y: segmentY + jitter },
      { x: x + cellWidth, y: segmentY + (compact ? 7 : 4) + jitter },
      { x: x + cellWidth - 4, y: segmentY + (compact ? 14 : 8) + jitter },
      { x: x + 2, y: segmentY + (compact ? 14 : 8) + jitter },
    ]);
    ctx.fillStyle = index < coreHp
      ? state.boss?.coreOpen ? COLORS.white : COLORS.ivoryShade
      : "rgba(184, 193, 200, .1)";
    ctx.fill();
    ctx.strokeStyle = index < coreHp ? COLORS.gold : "rgba(184, 193, 200, .22)";
    ctx.lineWidth = compact ? 2 : 1;
    ctx.stroke();
  }

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.ivoryLight;
  ctx.font = `900 ${compact ? 30 : 21}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(`ROUND ${String(round).padStart(2, "0")}`, 1240, compact ? 41 : 38);
  ctx.strokeStyle = COLORS.vermilion;
  ctx.lineWidth = compact ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(compact ? 1050 : 1100, compact ? 50 : 46);
  ctx.lineTo(1240, compact ? 50 : 46);
  ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.font = `850 ${compact ? 22 : 14}px ui-monospace, monospace`;
  ctx.fillText(`${String(score).padStart(5, "0")} PTS`, 1240, compact ? 76 : 65);
  ctx.fillStyle = COLORS.silver;
  ctx.font = `750 ${compact ? 17 : 11}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(`${formatTime(state.elapsed)} · OUTSMART ${outsmarts}`, 1240, compact ? 101 : 83);
  ctx.restore();
}

function drawMobileHud(ctx, state) {
  drawTopHud(ctx, state, true);
}

function drawHud(ctx, state, viewScale = 1) {
  if (viewScale <= .35) {
    drawMobileHud(ctx, state);
    return;
  }
  drawTopHud(ctx, state, false);
}

function phasePrompt(state) {
  switch (state.phase) {
    case PHASE.ENGAGE:
      return "주홍 위험선 밖이면 회피 성공 · WASD와 대시 모두 가능";
    case PHASE.EXPLORE:
      return "탐색 공격 · 종료 순간 위험선 밖의 실제 측면을 보스가 기억한다";
    case PHASE.EXPLORE_RECOVER:
      return "보스가 다음 회피를 관찰한다";
    case PHASE.COMBINE:
      return "세 개의 기억 명판이 하나의 예측으로 결합된다";
    case PHASE.LOCK:
    case PHASE.RELOCK:
      return "LOCK · 주홍 인장과 도장 축은 이제 움직이지 않는다";
    case PHASE.PREDICTION:
      return "인장 밖으로 · 가르친 방향의 반대편으로 빠져라";
    case PHASE.CORE_OPEN:
      return state.phaseTime <= .6
        ? "장갑 복귀 · 지금 충격 범위 밖으로 이탈"
        : "순백 코어 OPEN · 가까이서 J로 직접 베어라";
    case PHASE.ROUND_CLEAR:
      return "AI가 더 빠른 봉인 장갑으로 재구성된다";
    default:
      return "";
  }
}

function drawPhasePrompt(ctx, state, viewScale = 1) {
  const prompt = phasePrompt(state);
  if (!prompt || state.phase === PHASE.GAME_OVER) return;
  ctx.save();
  const compact = viewScale <= .35;
  const width = compact ? 900 : 610;
  const x = (DESIGN_WIDTH - width) / 2;
  const top = compact ? 520 : 651;
  const bottom = compact ? 574 : 687;
  path(ctx, [
    { x, y: top + 9 },
    { x: x + 24, y: top },
    { x: x + width - 14, y: top + 3 },
    { x: x + width, y: top + 14 },
    { x: x + width - 27, y: bottom },
    { x: x + 19, y: bottom - 3 },
  ]);
  ctx.fillStyle = "rgba(229, 219, 189, .9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 70, 35, .72)";
  ctx.lineWidth = compact ? 2 : 1.5;
  ctx.stroke();
  ctx.strokeStyle = COLORS.vermilion;
  ctx.beginPath();
  ctx.moveTo(x + (compact ? 34 : 24), top + (compact ? 11 : 8));
  ctx.lineTo(x + (compact ? 34 : 24), bottom - (compact ? 10 : 7));
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "center";
  ctx.font = `850 ${compact ? 24 : 13}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(prompt, DESIGN_WIDTH / 2 + 8, compact ? 554 : 674);
  ctx.restore();
}

function bannerColor(tone) {
  if (tone === "danger") return COLORS.rust;
  if (tone === "lock" || tone === "prediction") return COLORS.vermilion;
  if (tone === "success") return COLORS.white;
  if (tone === "armor") return COLORS.cobaltLight;
  return COLORS.gold;
}

function drawAnnouncement(ctx, state, eventToast = null, viewScale = 1) {
  const banner = eventToast || state.visual?.banner;
  if (!banner || state.phase === PHASE.GAME_OVER) return;
  const remaining = eventToast ? eventToast.alpha : clamp((banner.remaining || 0) * 4, 0, 1);
  if (remaining <= 0) return;
  const color = bannerColor(banner.tone);
  const compact = viewScale <= .35;
  const left = compact ? 28 : 32;
  const right = compact ? 598 : 414;
  const top = compact ? 117 : 114;
  const bottom = compact ? banner.subtext ? 193 : 170 : banner.subtext ? 169 : 151;
  ctx.save();
  ctx.globalAlpha = remaining;
  path(ctx, [
    { x: left, y: top + 7 },
    { x: left + 15, y: top },
    { x: right - 31, y: top + 4 },
    { x: right, y: top + 14 },
    { x: right - 19, y: bottom },
    { x: left + 8, y: bottom - 4 },
  ]);
  ctx.fillStyle = "rgba(230, 220, 190, .94)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(left + (compact ? 18 : 12), top + 10, compact ? 7 : 4, bottom - top - 20);
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.ink;
  ctx.font = `900 ${compact ? 34 : 21}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(banner.text, left + (compact ? 43 : 29), compact ? 150 : 139);
  if (banner.subtext) {
    ctx.fillStyle = "#514934";
    ctx.font = `750 ${compact ? 19 : 10.5}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(banner.subtext, left + (compact ? 43 : 29), compact ? 178 : 158);
  }
  ctx.restore();
}

function drawImpactFeedback(ctx, state, combat) {
  const impact = state.visual?.impact;
  if (!impact?.remaining) return;
  const duration = impact.tone === "core" ? .3 : impact.tone === "armor" ? .24 : .38;
  const progress = 1 - clamp(impact.remaining / duration, 0, 1);
  const point = impact.tone === "core"
    ? combat.core
    : impact.tone === "armor"
      ? coreToScreen(impact)
      : coreToScreen(impact);
  const color = impact.tone === "core" ? COLORS.white : impact.tone === "armor" ? COLORS.cobaltLight : COLORS.rust;
  const radius = 12 + progress * (impact.tone === "core" ? 58 : 38);
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = impact.tone === "core" ? 7 : 5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + .2;
    const inner = radius + 5;
    const outer = radius + 24 + index % 2 * 8;
    ctx.beginPath();
    ctx.moveTo(point.x + Math.cos(angle) * inner, point.y + Math.sin(angle) * inner);
    ctx.lineTo(point.x + Math.cos(angle) * outer, point.y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFeedback(ctx, state, combat, { eventToast = null, viewScale = 1 } = {}) {
  drawImpactFeedback(ctx, state, combat);
  if (state.phase !== PHASE.WAITING && state.phase !== PHASE.GAME_OVER) {
    drawHud(ctx, state, viewScale);
    drawPhasePrompt(ctx, state, viewScale);
  }
  drawAnnouncement(ctx, state, eventToast, viewScale);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not load ${url.pathname}`)), { once: true });
    image.src = url.href;
  });
}

async function loadJson(url) {
  const response = await fetch(url.href);
  if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status})`);
  return response.json();
}

function createDisplayMemoryTracker() {
  const seen = new Set();
  let displayed = [];
  return (state) => {
    for (const event of state.events || []) {
      const key = `${event.id}:${event.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (["start", "restart", "round_start"].includes(event.type)) displayed = [];
      if (event.type === "remember" && Array.isArray(event.memory)) displayed = event.memory.slice(0, 3);
    }
    if (state.phase === PHASE.WAITING) displayed = [];
    // While the boss is sampling, the plaques follow the behavioral truth.
    // Once three samples have formed LOCK, keep that physical evidence visible
    // through the committed miss and core window even though game-core has
    // already seeded the next sample internally.
    if ([PHASE.ENGAGE, PHASE.EXPLORE].includes(state.phase)) displayed = state.memory.slice(0, 3);
    if (state.memory.length >= 3) displayed = state.memory.slice(0, 3);
    if (seen.size > 300) seen.clear();
    return displayed;
  };
}

function createToastTracker() {
  const seen = new Set();
  let active = null;
  let pending = null;
  const factories = {
    remember: (event) => ({
      priority: 35,
      text: `MEMORY ${event.memory?.length || 0}/3`,
      subtext: `${event.side === "left" ? "왼쪽" : "오른쪽"} 회피가 보스의 명판에 고정됐다`,
      tone: "memory",
    }),
    armor_hit: () => ({
      priority: 45,
      text: "SEALED · 피해 0",
      subtext: "닫힌 장갑은 코어 피해를 받지 않는다",
      tone: "armor",
    }),
    core_hit: (event) => ({
      priority: 90,
      text: "CORE −1",
      subtext: `검의 직접 접촉 · 남은 코어 ${event.hp}/${CONFIG.bossMaxCore}`,
      tone: "success",
    }),
    player_hit: (event) => ({
      priority: 80,
      text: "WARD −1",
      subtext: `위험선과 플레이어가 겹쳤다 · 남은 보호막 ${event.shield}/${CONFIG.playerMaxShield}`,
      tone: "danger",
    }),
    outsmart: () => ({
      priority: 95,
      text: "OUTSMART",
      subtext: "보스는 빈 인장을 내리쳤다 · 열린 코어를 직접 베어라",
      tone: "success",
    }),
    read: (event) => ({
      priority: 100,
      text: "READ",
      subtext: `보스가 기억한 ${event.side === "left" ? "왼쪽" : "오른쪽"}으로 다시 피했다`,
      tone: "danger",
    }),
    prediction_neutral: () => ({
      priority: 70,
      text: "EVADE",
      subtext: "위험선 밖 · 보스가 다음 행동을 다시 관찰한다",
      tone: "success",
    }),
    evade_unlearned: () => ({
      priority: 70,
      text: "EVADE",
      subtext: "가장자리에서 강제된 회피 · 보스는 기억하지 않는다",
      tone: "success",
    }),
    round_clear: (event) => ({
      priority: 98,
      text: `ROUND ${event.round} CLEAR`,
      subtext: "다음 라운드에는 봉인 동작이 더 빨라진다",
      tone: "success",
    }),
  };

  return (events, now) => {
    let selected = null;
    for (const event of events || []) {
      const key = `${event.id}:${event.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const create = factories[event.type];
      if (!create) continue;
      const candidate = create(event);
      if (!selected || candidate.priority >= selected.priority) selected = candidate;
    }
    if (seen.size > 300) seen.clear();
    if (active && now >= active.expiresAt) {
      active = pending ? { ...pending, expiresAt: now + .78 } : null;
      pending = null;
    }
    if (selected) {
      if (active && selected.priority < active.priority) {
        if (!pending || selected.priority >= pending.priority) pending = selected;
      } else {
        active = { ...selected, expiresAt: now + .9 };
        pending = null;
      }
    }
    if (!active) return null;
    return { ...active, alpha: clamp((active.expiresAt - now) * 5, 0, 1) };
  };
}

export function createRenderer(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("Canvas element is required");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D canvas context is required");
  let status = "loading";
  let error = null;
  let notifyStatus = () => {};
  let width = 0; let height = 0; let ratio = 0;
  const images = { arena: null, boss: null, driver: null, player: null, relics: null };
  let artManifest = null;
  let swordContactError = null;
  let driverContactError = null;
  let playerGroundBodyError = 0;
  let previousPlayer = null;
  const toastForEvents = createToastTracker();
  const displayMemoryForState = createDisplayMemoryTracker();
  let readyResolve;
  let ready = new Promise((resolve) => { readyResolve = resolve; });

  const setStatus = (next, nextError = null) => { status = next; error = nextError; notifyStatus({ status, error }); };
  async function loadAssets() {
    setStatus("loading");
    try {
      const [arena, boss, driver, player, relics, manifest] = await Promise.all([
        loadImage(ASSETS.arena),
        loadImage(ASSETS.boss),
        loadImage(ASSETS.driver),
        loadImage(ASSETS.player),
        loadImage(ASSETS.relics),
        loadJson(ASSETS.manifest),
      ]);
      Object.assign(images, { arena, boss, driver, player, relics });
      artManifest = manifest;
      setStatus("ready");
      readyResolve?.();
      readyResolve = null;
    } catch (loadError) { setStatus("error", loadError instanceof Error ? loadError : new Error(String(loadError))); }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width || DESIGN_WIDTH)); const nextHeight = Math.max(1, Math.round(rect.height || DESIGN_HEIGHT));
    const nextRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    if (nextWidth === width && nextHeight === height && nextRatio === ratio) return;
    width = nextWidth; height = nextHeight; ratio = nextRatio; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  function render(state, options = {}) {
    resize(); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT); const offsetX = (width - DESIGN_WIDTH * scale) / 2; const offsetY = (height - DESIGN_HEIGHT * scale) / 2;
    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);
    const background = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT); background.addColorStop(0, "#111924"); background.addColorStop(1, COLORS.night); ctx.fillStyle = background; ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    const shake = state.visual?.shake || 0; if (shake) ctx.translate(Math.sin(performance.now() * .07) * shake * 12, Math.cos(performance.now() * .09) * shake * 8);
    if (images.arena) ctx.drawImage(images.arena, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    else drawArena(ctx);
    drawExplore(ctx, state); drawLock(ctx, state);
    const observedMoving = previousPlayer
      ? Math.hypot(state.player.x - previousPlayer.x, state.player.y - previousPlayer.y) > .02
      : false;
    const now = Number.isFinite(options.now) ? options.now : performance.now() / 1000;
    const eventToast = toastForEvents(state.events, now);
    const displayMemory = displayMemoryForState(state);
    const combat = drawCombatFrame(
      ctx,
      state,
      buildCombatScene(state, { observedMoving, artManifest }),
      images,
      { eventToast, viewScale: scale, displayMemory },
    );
    swordContactError = combat.swordContactError;
    driverContactError = combat.driverContactError;
    playerGroundBodyError = combat.playerGroundBodyError;
    previousPlayer = { x: state.player.x, y: state.player.y };
    ctx.restore();
  }
  function retry() { if (status === "error") { ready = new Promise((resolve) => { readyResolve = resolve; }); void loadAssets(); } return ready; }
  void loadAssets();
  return { render, resize, retry, dispose() {}, get status() { return status; }, get error() { return error; }, get ready() { return ready; }, get info() { return { renderer: "canvas-2d-authored", assets: Object.values(images).filter(Boolean).length, artVersion: artManifest?.version || null, projection: "35deg-quarter", swordContactError, driverContactError, playerGroundBodyError }; }, get isReady() { return status === "ready"; }, set onStatusChange(callback) { notifyStatus = typeof callback === "function" ? callback : () => {}; } };
}
