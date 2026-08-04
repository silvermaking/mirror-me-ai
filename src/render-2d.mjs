import { CONFIG, PHASE, timingForRound } from "./game-core.mjs";
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
  player: new URL("../assets/2d/sprites/player-sheet.svg", import.meta.url),
  boss: new URL("../assets/2d/sprites/boss-sheet.svg", import.meta.url),
});
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
export function playerWeaponGeometry(state, playerPoint, bossPoint) {
  const player = coreToScreen(playerPoint);
  const core = coreAnchor(bossPoint);
  const attack = state.visual?.attack;
  const directCoreAttack = Boolean(attack?.hit && !attack.armor && state.boss.coreOpen);
  const armorAttack = Boolean(attack?.armor);
  const target = directCoreAttack ? core : armorAttack ? armorAnchor(bossPoint) : null;
  // The authored player holds the hilt on its right.  Mirror the entire
  // whole-body key pose when the true floor-plane target sits to its left,
  // then derive the same mirrored hilt for the single dynamic blade.
  const flipX = Boolean(target && target.x < player.x);
  const hand = { x: player.x + PLAYER_SPRITE.hand.x * (flipX ? -1 : 1), y: player.y + PLAYER_SPRITE.hand.y };
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

export function playerFrameFor(state) {
  const attack = state.visual?.attack;
  if (attack?.remaining > 0) {
    const progress = clamp(1 - attack.remaining / .24, 0, 1);
    if (progress < .28) return { id: "player-attack-windup", index: 3, phase: "windup" };
    if (progress <= .58) return { id: "player-attack-contact", index: 4, phase: "contact" };
    return { id: "player-attack-recoil", index: 5, phase: "recoil" };
  }
  if (state.visual?.lastDash?.remaining > 0) return { id: "player-dash", index: 2, phase: "dash" };
  if (Math.hypot(state.player.lastMove?.x || 0, state.player.lastMove?.y || 0) > .1) return { id: "player-move", index: 1, phase: "move" };
  return { id: "player-idle", index: 0, phase: "idle" };
}

// Every combat draw gets its anchors, selected full-body key pose, weapon and
// flash from this one scene. Rendering never recomputes a competing contact point.
export function buildCombatScene(state) {
  const boss = coreToScreen(state.boss);
  const player = coreToScreen(state.player);
  const lockTarget = state.lock ? coreToScreen(state.lock.zone) : null;
  const driverVisible = Boolean(lockTarget && [PHASE.LOCK, PHASE.RELOCK, PHASE.PREDICTION, PHASE.CORE_OPEN, PHASE.ROUND_CLEAR].includes(state.phase));
  const weapon = playerWeaponGeometry(state, state.player, state.boss);
  const flash = weapon.contact && weapon.target ? { target: { ...weapon.target }, kind: weapon.kind } : null;
  return {
    boss,
    player,
    core: coreAnchor(state.boss),
    lockTarget,
    driverVisible,
    open: state.boss.coreOpen,
    weapon,
    playerFrame: playerFrameFor(state),
    bossFrame: spriteFrame(state, "boss"),
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
    driver: scene.driverVisible && scene.lockTarget ? { origin: bossDriverJointAnchor(scene.boss), target: scene.lockTarget } : null,
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
  path(ctx, polygon); ctx.fillStyle = COLORS.danger; ctx.fill();
  drawLine(ctx, coreToScreen({ x: left, y: minY }), coreToScreen({ x: left, y: maxY }), COLORS.dangerEdge, 4);
  drawLine(ctx, coreToScreen({ x: right, y: minY }), coreToScreen({ x: right, y: maxY }), COLORS.dangerEdge, 4);
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

function drawCombatants(ctx, state, scene, images) {
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
  // The actual floor point remains visible, so movement/impact cannot be mistaken for a sprite-only position.
  ctx.fillStyle = COLORS.cobaltLight; ctx.beginPath(); ctx.arc(plan.player.at.x, plan.player.at.y + 2, 4.5, 0, Math.PI * 2); ctx.fill();
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
export function drawCombatFrame(ctx, state, scene, images) {
  const combat = drawCombatants(ctx, state, scene, images);
  drawFeedback(ctx, state, combat);
  return combat;
}

function drawFeedback(ctx, state, combat) {
  const impact = state.visual?.impact;
  if (impact?.remaining > 0) {
    const point = combat.flash?.target;
    ctx.strokeStyle = impact.tone === "core" ? COLORS.white : impact.tone === "armor" ? COLORS.cobaltLight : COLORS.rust;
    const matchingContact = combat.flash && combat.flash.kind === impact.tone;
    if (matchingContact) { ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(point.x, point.y, 20 * (1 - impact.remaining / .38) + 10, 0, Math.PI * 2); ctx.stroke(); }
  }
  const banner = state.visual?.banner;
  if (banner?.remaining > 0) {
    const color = banner.tone === "danger" ? COLORS.rust : banner.tone === "lock" ? COLORS.vermilion : COLORS.ivoryLight;
    ctx.save(); ctx.textAlign = "center"; ctx.font = "800 28px system-ui, sans-serif"; ctx.fillStyle = color; ctx.fillText(banner.text, DESIGN_WIDTH / 2, 75);
    ctx.font = "600 16px system-ui, sans-serif"; ctx.fillStyle = COLORS.inkLight; ctx.fillText(banner.subtext, DESIGN_WIDTH / 2, 100); ctx.restore();
  }
  // Compact HUD only; the important relationships stay in the arena.
  ctx.save(); ctx.font = "700 15px system-ui, sans-serif"; ctx.fillStyle = COLORS.ink;
  ctx.fillText(`CORE ${"●".repeat(state.boss.coreHp)}${"○".repeat(CONFIG.bossMaxCore - state.boss.coreHp)}`, 30, 40);
  ctx.fillText(`WARD ${"◆".repeat(state.player.shield)}`, 30, 64); ctx.restore();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not load ${url.pathname}`)), { once: true });
    image.src = url.href;
  });
}

export function createRenderer(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("Canvas element is required");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D canvas context is required");
  let status = "loading";
  let error = null;
  let notifyStatus = () => {};
  let width = 0; let height = 0; let ratio = 0;
  const images = { player: null, boss: null };
  let swordContactError = null;
  let driverContactError = null;
  let playerGroundBodyError = 0;
  let readyResolve;
  let ready = new Promise((resolve) => { readyResolve = resolve; });

  const setStatus = (next, nextError = null) => { status = next; error = nextError; notifyStatus({ status, error }); };
  async function loadAssets() {
    setStatus("loading");
    try {
      const [player, boss] = await Promise.all([loadImage(ASSETS.player), loadImage(ASSETS.boss)]);
      images.player = player; images.boss = boss; setStatus("ready"); readyResolve?.(); readyResolve = null;
    } catch (loadError) { setStatus("error", loadError instanceof Error ? loadError : new Error(String(loadError))); }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width || DESIGN_WIDTH)); const nextHeight = Math.max(1, Math.round(rect.height || DESIGN_HEIGHT));
    const nextRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    if (nextWidth === width && nextHeight === height && nextRatio === ratio) return;
    width = nextWidth; height = nextHeight; ratio = nextRatio; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  function render(state) {
    resize(); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT); const offsetX = (width - DESIGN_WIDTH * scale) / 2; const offsetY = (height - DESIGN_HEIGHT * scale) / 2;
    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);
    const background = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT); background.addColorStop(0, "#111924"); background.addColorStop(1, COLORS.night); ctx.fillStyle = background; ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    const shake = state.visual?.shake || 0; if (shake) ctx.translate(Math.sin(performance.now() * .07) * shake * 12, Math.cos(performance.now() * .09) * shake * 8);
    drawArena(ctx); drawExplore(ctx, state); drawLock(ctx, state);
    const combat = drawCombatFrame(ctx, state, buildCombatScene(state), images);
    swordContactError = combat.swordContactError;
    driverContactError = combat.driverContactError;
    playerGroundBodyError = combat.playerGroundBodyError;
    ctx.restore();
  }
  function retry() { if (status === "error") { ready = new Promise((resolve) => { readyResolve = resolve; }); void loadAssets(); } return ready; }
  void loadAssets();
  return { render, resize, retry, dispose() {}, get status() { return status; }, get error() { return error; }, get ready() { return ready; }, get info() { return { renderer: "canvas-2d", assets: Object.values(images).filter(Boolean).length, projection: "35deg-quarter", swordContactError, driverContactError, playerGroundBodyError }; }, get isReady() { return status === "ready"; }, set onStatusChange(callback) { notifyStatus = typeof callback === "function" ? callback : () => {}; } };
}
