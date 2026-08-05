import { CONFIG, PHASE, timingForRound } from "./game-core.mjs";
import {
  CLASSIC_ART_ASSETS,
  CLASSIC_ART_LIMITS,
  CLASSIC_ART_PARTS,
  CLASSIC_RELIC_PARTS,
} from "./classic-art-contract.mjs";
import { createVisualDynamics } from "./visual-dynamics.mjs";

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 720;
const VIEW = Object.freeze({
  centerX: LOGICAL_WIDTH / 2,
  centerY: 404,
  scaleX: 1.03,
  scaleY: 0.77,
});

const COLORS = Object.freeze({
  soot: "#171313",
  deepSoot: "#080706",
  brick: "#513a2b",
  brickLight: "#80614a",
  iron: "#211e1b",
  ironEdge: "#665447",
  porcelain: "#b9ab91",
  porcelainLight: "#dfd0b2",
  brass: "#8d6b36",
  brassLight: "#c49c50",
  rust: "#9d422b",
  rustBright: "#c55c32",
  ash: "#a69b85",
  enamel: "#52b7ae",
  enamelLight: "#b9ece1",
  heat: "#f3bb62",
  fire: "#fff0c2",
  white: "#eee7d9",
});

const CLASSIC_ART_URLS = Object.freeze(Object.fromEntries(
  Object.entries(CLASSIC_ART_ASSETS).map(([name, asset]) => [
    name,
    new URL(`../${asset.file}`, import.meta.url),
  ]),
));

const ATTACK_VISUAL_DURATION = 0.24;

function drawImagePart(ctx, art, image, part, at, {
  anchor = Object.keys(part.anchors)[0],
  rotation = 0,
  scaleX = 1,
  scaleY = scaleX,
  alpha = 1,
} = {}) {
  if (!image || !part?.anchors?.[anchor]) return false;
  const [sourceX, sourceY, sourceWidth, sourceHeight] = part.sourceRect;
  const [anchorX, anchorY] = part.anchors[anchor];
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(at.x, at.y);
  ctx.rotate(rotation);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -anchorX,
    -anchorY,
    sourceWidth,
    sourceHeight,
  );
  ctx.restore();
  if (art?.metrics) art.metrics.drawImages += 1;
  return true;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.Image !== "function") {
      reject(new Error("Image decoding is unavailable"));
      return;
    }
    const image = new globalThis.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url.pathname}`));
    image.src = url.href;
  });
}

async function loadClassicArt() {
  const entries = await Promise.all(Object.entries(CLASSIC_ART_URLS).map(async ([name, url]) => [
    name,
    await loadImage(url),
  ]));
  return Object.freeze(Object.fromEntries(entries));
}

export function projectWorld(point) {
  return {
    x: VIEW.centerX + point.x * VIEW.scaleX,
    y: VIEW.centerY + point.y * VIEW.scaleY,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function roundedRect(ctx, x, y, width, height, radius = 8) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function ellipse(ctx, point, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, rx, ry, 0, 0, Math.PI * 2);
}

function line(ctx, from, to) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
}

function lines(ctx, segments) {
  ctx.beginPath();
  for (const [from, to] of segments) {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
}

function vector(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length, length };
}

function pointAlong(from, to, amount) {
  return { x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount) };
}

function perpendicular(direction, amount) {
  return { x: -direction.y * amount, y: direction.x * amount };
}

function transformLocal(root, local, rotation = 0, scale = 1) {
  const x = local.x * scale;
  const y = local.y * scale;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: root.x + x * cosine - y * sine,
    y: root.y + x * sine + y * cosine,
  };
}

export function classicCoreScreenAnchor(state, now = 0) {
  const base = projectWorld(state.boss);
  const target = state.lock
    ? projectWorld(state.lock.zone)
    : projectWorld({ x: state.boss.x + 154, y: state.boss.y + 116 });
  const resolved = state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR;
  const direction = target.x >= base.x ? 1 : -1;
  const tilt = resolved ? direction * 0.27 : state.lock ? direction * 0.035 : 0;
  const shake = state.visual.shake ? Math.sin(now * 85) * state.visual.shake * 14 : 0;
  const bodyBase = {
    x: base.x + shake + (resolved ? direction * 29 : 0),
    y: base.y + (resolved ? 27 : 0),
  };
  const root = { x: bodyBase.x, y: bodyBase.y + 9 };
  return transformLocal(root, { x: 4, y: -63 }, tilt, 1.02);
}

function easeOutCubic(value) {
  const amount = clamp(value, 0, 1);
  return 1 - (1 - amount) ** 3;
}

function easeInOutCubic(value) {
  const amount = clamp(value, 0, 1);
  return amount < 0.5
    ? 4 * amount ** 3
    : 1 - ((-2 * amount + 2) ** 3) / 2;
}

export function classicAttackVisualPlan(state) {
  const attack = state.visual?.attack;
  if (!attack) {
    return Object.freeze({
      active: false,
      progress: 0,
      phase: "idle",
      contact: false,
      angleOffset: 0,
      bodyLean: 0,
      trailAlpha: 0,
    });
  }

  const progress = clamp(1 - attack.remaining / ATTACK_VISUAL_DURATION, 0, 1);
  const resultContact = Boolean(attack.hit || attack.armor);
  let phase = "contact";
  let angleOffset = 0;
  let bodyLean = 0.08;

  // game-core applies HP and armor results on the input frame. The renderer
  // therefore begins at honest contact, then makes the otherwise invisible
  // result readable through a broad, foot-anchored follow-through.
  if (progress <= 0.2) {
    const amount = easeOutCubic(progress / 0.2);
    angleOffset = 0;
    bodyLean = 0.08 + amount * 0.05;
  } else if (progress <= 0.7) {
    phase = "cut";
    const amount = easeInOutCubic((progress - 0.2) / 0.5);
    angleOffset = mix(0.16, 1.82, amount);
    bodyLean = mix(0.13, 0.21, amount);
  } else {
    phase = "recoil";
    const amount = easeOutCubic((progress - 0.7) / 0.3);
    angleOffset = mix(1.82, 0.88, amount);
    bodyLean = mix(0.21, 0.04, amount);
  }

  return Object.freeze({
    active: true,
    progress,
    phase,
    contact: resultContact && progress <= 0.2,
    angleOffset,
    bodyLean,
    trailAlpha: clamp(1 - progress * 0.7, 0.24, 1),
  });
}

export function classicCoreVisualPlan(state, now = 0) {
  const open = Boolean(state.boss?.coreOpen);
  const duration = timingForRound(Number.isFinite(state.round) ? state.round : 1).coreOpen;
  const openAge = state.phase === PHASE.CORE_OPEN
    ? Math.max(0, duration - (state.phaseTime || 0))
    : open ? 1 : 0;
  const exposure = open
    ? clamp(1 - Math.exp(-18 * openAge) * Math.cos(25 * openAge), 0, 1.08)
    : 0;
  const impact = state.visual?.impact;
  const hitAge = impact?.tone === "core"
    ? clamp(0.3 - impact.remaining, 0, 0.3)
    : Infinity;
  const hitCompression = Number.isFinite(hitAge)
    ? Math.exp(-18 * hitAge) * Math.cos(34 * hitAge)
    : 0;
  const pulse = 1 + Math.sin(now * 13) * 0.035;
  return Object.freeze({
    anchor: classicCoreScreenAnchor(state, now),
    open,
    openAge,
    exposure,
    hitAge,
    radius: Math.max(0, 22 * exposure * pulse * (1 - hitCompression * 0.28)),
    shutterKick: Number.isFinite(hitAge) ? hitCompression * 0.11 : 0,
    reflectionAlpha: open ? clamp(0.12 + exposure * 0.24, 0, 0.38) : 0,
  });
}

export function classicBladeContactPlan(state, now = 0) {
  const point = projectWorld(state.player);
  const boss = projectWorld(state.boss);
  const hand = { x: point.x, y: point.y - 29 };
  const target = state.boss.coreOpen ? classicCoreScreenAnchor(state, now) : boss;
  const targetAngle = Math.atan2(target.y - hand.y, target.x - hand.x);
  const contactLength = Math.hypot(target.x - hand.x, target.y - hand.y);
  const motion = classicAttackVisualPlan(state);
  const swingSide = target.x >= hand.x ? 1 : -1;
  const angle = targetAngle + motion.angleOffset * swingSide;
  const length = motion.contact
    ? contactLength
    : state.visual.attack?.armor
      ? 43
      : motion.active ? 54 : 43;
  return {
    hand,
    target,
    targetAngle,
    angle,
    length,
    contactLength,
    swingSide,
    motion,
    tip: {
      x: hand.x + Math.cos(angle) * length,
      y: hand.y + Math.sin(angle) * length,
    },
  };
}

export function classicImpactScreenAnchor(state, now = 0) {
  const impact = state.visual.impact;
  if (!impact) return null;
  if (impact.tone === "core") return classicCoreScreenAnchor(state, now);
  const point = projectWorld(impact);
  return { x: point.x, y: point.y - 42 };
}

function drawFiringHall(ctx) {
  const wall = ctx.createLinearGradient(0, 0, 0, 360);
  wall.addColorStop(0, "#100d0c");
  wall.addColorStop(0.68, "#272019");
  wall.addColorStop(1, "#453426");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, 460);

  ctx.save();
  ctx.globalAlpha = 0.62;
  for (let index = 0; index < 10; index += 1) {
    const x = 34 + index * 137;
    ctx.fillStyle = index % 2 ? "#201913" : "#2c2118";
    ctx.fillRect(x, 34, 58, 312);
    ctx.fillStyle = "rgba(206,168,99,.13)";
    ctx.fillRect(x + 7, 38, 5, 300);
    ctx.strokeStyle = "rgba(0,0,0,.48)";
    ctx.lineWidth = 3;
    for (let y = 72; y < 325; y += 42) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 58, y);
      ctx.stroke();
    }
  }
  ctx.restore();

  const haze = ctx.createLinearGradient(0, 160, 0, 390);
  haze.addColorStop(0, "rgba(227,190,121,.08)");
  haze.addColorStop(1, "rgba(15,11,9,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 120, LOGICAL_WIDTH, 300);
}

function drawArena(ctx, now) {
  drawFiringHall(ctx);
  const rx = CONFIG.arenaRadiusX * VIEW.scaleX;
  const ry = CONFIG.arenaRadiusY * VIEW.scaleY;
  const center = { x: VIEW.centerX, y: VIEW.centerY };

  ctx.save();
  ellipse(ctx, center, rx + 17, ry + 16);
  ctx.fillStyle = "#17120f";
  ctx.fill();
  ctx.strokeStyle = "#6d5845";
  ctx.lineWidth = 5;
  ctx.stroke();

  ellipse(ctx, center, rx, ry);
  ctx.clip();
  const floor = ctx.createRadialGradient(center.x, center.y - 38, 24, center.x, center.y, rx);
  floor.addColorStop(0, "#705541");
  floor.addColorStop(0.56, "#4d382b");
  floor.addColorStop(1, "#261d18");
  ctx.fillStyle = floor;
  ctx.fillRect(center.x - rx, center.y - ry, rx * 2, ry * 2);

  ctx.strokeStyle = "rgba(224,196,152,.18)";
  ctx.lineWidth = 1.2;
  for (let ring = 0.19; ring <= 0.95; ring += 0.19) {
    ellipse(ctx, center, rx * ring, ry * ring);
    ctx.stroke();
  }
  for (let row = -5; row <= 5; row += 1) {
    const y = center.y + row * 32;
    const offset = row % 2 ? 28 : 0;
    ctx.strokeStyle = "rgba(28,19,15,.46)";
    ctx.beginPath();
    ctx.moveTo(center.x - rx, y);
    ctx.lineTo(center.x + rx, y);
    ctx.stroke();
    for (let x = center.x - rx + offset; x < center.x + rx; x += 74) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(12,10,9,.9)";
  ctx.lineWidth = 11;
  ellipse(ctx, center, rx * 0.89, ry * 0.89);
  ctx.stroke();
  ctx.strokeStyle = "rgba(164,128,80,.45)";
  ctx.lineWidth = 2;
  ellipse(ctx, center, rx * 0.89, ry * 0.89);
  ctx.stroke();

  const dust = 0.06 + Math.sin(now * 0.5) * 0.015;
  ctx.fillStyle = `rgba(239,216,173,${dust})`;
  for (let index = 0; index < 26; index += 1) {
    const x = center.x - rx + ((index * 131) % Math.round(rx * 2));
    const y = center.y - ry + ((index * 71) % Math.round(ry * 2));
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();

  ctx.save();
  ellipse(ctx, center, rx + 17, ry + 16);
  ctx.strokeStyle = "rgba(231,208,170,.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawExploreWarning(ctx, state) {
  if (state.phase !== PHASE.EXPLORE || !state.explore) return;
  const center = projectWorld({ x: state.explore.lineX, y: 0 });
  const half = CONFIG.exploreLaneHalfWidth * VIEW.scaleX;
  const urgency = 1 - clamp(state.phaseTime / 0.55, 0, 1);
  const top = VIEW.centerY - 210;
  const bottom = VIEW.centerY + 208;

  ctx.save();
  ctx.globalAlpha = 0.72 + urgency * 0.28;
  ctx.fillStyle = "rgba(124,46,29,.16)";
  ctx.fillRect(center.x - half, top, half * 2, bottom - top);
  ctx.strokeStyle = COLORS.rustBright;
  ctx.lineWidth = 3 + urgency * 2;
  lines(ctx, [
    [{ x: center.x - half, y: top }, { x: center.x - half, y: bottom }],
    [{ x: center.x + half, y: top }, { x: center.x + half, y: bottom }],
  ]);
  ctx.stroke();
  ctx.strokeStyle = COLORS.porcelainLight;
  ctx.lineWidth = 4;
  const gap = clamp(state.phaseTime / 0.55, 0, 1) * 185;
  lines(ctx, [
    [{ x: center.x - half - 8, y: VIEW.centerY - gap }, { x: center.x + half + 8, y: VIEW.centerY - gap }],
    [{ x: center.x - half - 8, y: VIEW.centerY + gap }, { x: center.x + half + 8, y: VIEW.centerY + gap }],
  ]);
  ctx.stroke();
  ctx.restore();
}

function drawKilnTarget(ctx, state, now, art) {
  if (!state.lock) return;
  const target = projectWorld(state.lock.zone);
  const striking = state.phase === PHASE.PREDICTION;
  const resolved = state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR;
  const pulse = 0.6 + Math.sin(now * 12) * 0.15;
  const rx = CONFIG.lockZoneRadiusX * VIEW.scaleX;
  const ry = CONFIG.lockZoneRadiusY * VIEW.scaleY;

  ctx.save();
  ellipse(ctx, target, rx, ry);
  ctx.fillStyle = resolved ? "rgba(64,31,23,.24)" : "rgba(137,53,33,.21)";
  ctx.fill();
  ctx.strokeStyle = resolved ? "rgba(55,40,31,.82)" : COLORS.rustBright;
  ctx.lineWidth = striking ? 5 : 3;
  ctx.stroke();
  ctx.strokeStyle = resolved ? "rgba(19,16,13,.8)" : `rgba(221,163,104,${pulse})`;
  ctx.lineWidth = 2;
  ellipse(ctx, target, rx * 0.66, ry * 0.66);
  ctx.stroke();

  if (!resolved) {
    ctx.fillStyle = COLORS.rust;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const x = target.x + Math.cos(angle) * rx * 0.96;
      const y = target.y + Math.sin(angle) * ry * 0.96;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillRect(-5, -4, 10, 8);
      ctx.restore();
    }
  }
  drawImagePart(ctx, art, art?.images?.relics, CLASSIC_RELIC_PARTS.lock, target, {
    anchor: "root",
    scaleX: 1.08,
    scaleY: 0.78,
    alpha: resolved ? 0.42 : 0.92,
  });
  ctx.restore();
}

function drawDashSkid(ctx, state) {
  const dash = state.visual.lastDash;
  if (!dash) return;
  const from = projectWorld(dash.from);
  const to = projectWorld(dash.to);
  const alpha = clamp(dash.remaining / dash.duration, 0, 1);
  const direction = vector(from, to);
  const normal = perpendicular(direction, 4);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = COLORS.enamel;
  ctx.lineWidth = 4;
  lines(ctx, [
    [{ x: from.x + normal.x, y: from.y + normal.y }, { x: to.x + normal.x, y: to.y + normal.y }],
    [{ x: from.x - normal.x, y: from.y - normal.y }, { x: to.x - normal.x, y: to.y - normal.y }],
  ]);
  ctx.stroke();
  ctx.fillStyle = COLORS.enamelLight;
  ellipse(ctx, to, 5, 2.5);
  ctx.fill();
  ctx.restore();
}

function drawCoreReflection(ctx, state, now) {
  const core = classicCoreVisualPlan(state, now);
  if (!core.open || core.exposure <= 0.02) return;
  const floor = projectWorld(state.boss);
  const width = 72 * core.exposure;
  const height = 16 * core.exposure;
  const reflection = ctx.createRadialGradient(
    core.anchor.x,
    floor.y + 26,
    0,
    core.anchor.x,
    floor.y + 26,
    width,
  );
  reflection.addColorStop(0, `rgba(255,248,218,${core.reflectionAlpha})`);
  reflection.addColorStop(0.42, `rgba(243,187,98,${core.reflectionAlpha * 0.58})`);
  reflection.addColorStop(1, "rgba(197,92,50,0)");
  ctx.save();
  ctx.fillStyle = reflection;
  ellipse(ctx, { x: core.anchor.x, y: floor.y + 26 }, width, height);
  ctx.fill();
  ctx.restore();
}

function drawMemorySlab(ctx, x, y, side, active) {
  const cutLeft = side === "left";
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (cutLeft) {
    ctx.moveTo(-16, -16);
    ctx.lineTo(3, -16);
    ctx.lineTo(16, -4);
    ctx.lineTo(12, 18);
    ctx.lineTo(-16, 18);
    ctx.lineTo(-16, 1);
    ctx.lineTo(-8, -7);
    ctx.closePath();
  } else {
    ctx.moveTo(-3, -16);
    ctx.lineTo(16, -16);
    ctx.lineTo(16, 1);
    ctx.lineTo(8, 9);
    ctx.lineTo(16, 18);
    ctx.lineTo(-12, 18);
    ctx.lineTo(-16, -4);
    ctx.closePath();
  }
  ctx.fillStyle = active ? COLORS.porcelainLight : COLORS.porcelain;
  ctx.fill();
  ctx.strokeStyle = active ? COLORS.brassLight : COLORS.ironEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(48,31,22,.74)";
  ctx.lineWidth = 1.5;
  line(ctx, { x: -8, y: 4 }, { x: 8, y: 4 });
  ctx.stroke();
  ctx.restore();
}

function drawMemoryRack(ctx, state, base, now, art) {
  ctx.save();
  ctx.strokeStyle = COLORS.iron;
  ctx.lineWidth = 8;
  line(ctx, { x: base.x - 54, y: base.y - 133 }, { x: base.x + 54, y: base.y - 133 });
  ctx.stroke();
  ctx.strokeStyle = COLORS.brass;
  ctx.lineWidth = 2;
  line(ctx, { x: base.x - 54, y: base.y - 139 }, { x: base.x + 54, y: base.y - 139 });
  ctx.stroke();

  // The state machine immediately keeps only the real opposite escape after an
  // OUTSMART. The still-locked three slabs remain on the boss for this one
  // physical aftermath, so the empty impact visibly follows from its belief.
  const lockedAfterimage =
    (state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) &&
    state.lock?.side;
  const filled = lockedAfterimage
    ? [state.lock.side, state.lock.side, state.lock.side]
    : state.memory.slice(-3);
  const combining = state.phase === PHASE.COMBINE || Boolean(state.lock);
  for (let index = 0; index < 3; index += 1) {
    const side = filled[index];
    const x = base.x + (index - 1) * 37;
    const wobble = combining && side ? Math.sin(now * 18 + index) * 1.5 : 0;
    ctx.fillStyle = "#100d0b";
    roundedRect(ctx, x - 18, base.y - 166, 36, 48, 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.ironEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (side) {
      const plaque = { x: x + wobble, y: base.y - 143 };
      const usedArt = drawImagePart(
        ctx,
        art,
        art?.images?.relics,
        CLASSIC_RELIC_PARTS.memory,
        plaque,
        {
          anchor: "root",
          rotation: side === "left" ? -0.13 : 0.13,
          scaleX: 0.78,
          scaleY: 0.88,
          alpha: combining ? 1 : 0.9,
        },
      );
      if (!usedArt) drawMemorySlab(ctx, plaque.x, plaque.y, side, combining);
      if (usedArt) {
        ctx.save();
        ctx.translate(plaque.x, plaque.y + 1);
        ctx.strokeStyle = combining ? COLORS.rustBright : COLORS.iron;
        ctx.lineWidth = 2;
        line(ctx, { x: -6, y: 0 }, { x: side === "left" ? -13 : 13, y: 0 });
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  if (combining && state.predictedSide) {
    const direction = state.predictedSide === "left" ? -1 : 1;
    ctx.strokeStyle = COLORS.brassLight;
    ctx.lineWidth = 4;
    line(ctx, { x: base.x, y: base.y - 119 }, { x: base.x + direction * 62, y: base.y - 105 });
    ctx.stroke();
  }
  ctx.restore();
}

function drawPileDriver(ctx, from, target, embedded, intensity) {
  const direction = vector(from, target);
  const normal = perpendicular(direction, 1);
  const reach = Math.max(42, direction.length - 10);
  const end = { x: from.x + direction.x * reach, y: from.y + direction.y * reach };
  const railStart = { x: from.x + normal.x * 23, y: from.y + normal.y * 23 };
  const railEnd = { x: end.x + normal.x * 23, y: end.y + normal.y * 23 };
  const otherStart = { x: from.x - normal.x * 23, y: from.y - normal.y * 23 };
  const otherEnd = { x: end.x - normal.x * 23, y: end.y - normal.y * 23 };
  const collar = pointAlong(from, end, 0.24);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#181510";
  ctx.lineWidth = 62;
  line(ctx, from, end);
  ctx.stroke();
  ctx.strokeStyle = COLORS.ironEdge;
  ctx.lineWidth = 50;
  line(ctx, from, end);
  ctx.stroke();
  ctx.strokeStyle = "#30291f";
  ctx.lineWidth = 35;
  line(ctx, from, end);
  ctx.stroke();
  ctx.strokeStyle = COLORS.brass;
  ctx.lineWidth = 3;
  lines(ctx, [[railStart, railEnd], [otherStart, otherEnd]]);
  ctx.stroke();

  ctx.fillStyle = COLORS.porcelain;
  ctx.strokeStyle = COLORS.iron;
  ctx.lineWidth = 4;
  ctx.save();
  ctx.translate(collar.x, collar.y);
  ctx.rotate(Math.atan2(direction.y, direction.x));
  roundedRect(ctx, -24, -39, 48, 78, 7);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(62,42,30,.62)";
  ctx.lineWidth = 2;
  lines(ctx, [
    [{ x: -17, y: -20 }, { x: 17, y: -20 }],
    [{ x: -17, y: 8 }, { x: 17, y: 8 }],
  ]);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(end.x, end.y);
  ctx.rotate(Math.atan2(direction.y, direction.x));
  ctx.fillStyle = embedded ? "#100e0c" : COLORS.iron;
  ctx.strokeStyle = embedded ? COLORS.rustBright : COLORS.ironEdge;
  ctx.lineWidth = 5;
  roundedRect(ctx, -22, -46, 45, 92, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = embedded ? "rgba(145,61,37,.36)" : "#332a21";
  ctx.fillRect(-13, -36, 27, 72);
  ctx.restore();

  if (embedded) {
    ctx.strokeStyle = `rgba(225,183,118,${0.32 + intensity * 0.28})`;
    ctx.lineWidth = 2;
    const cracks = [];
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 + 0.4;
      const crackStart = { x: end.x + Math.cos(angle) * 22, y: end.y + Math.sin(angle) * 12 };
      const crackEnd = { x: end.x + Math.cos(angle) * (45 + index * 4), y: end.y + Math.sin(angle) * (28 + index * 3) };
      cracks.push([crackStart, crackEnd]);
    }
    lines(ctx, cracks);
    ctx.stroke();
  }
  ctx.restore();
  return { end, direction };
}

export function classicDriverContact(target) {
  return { x: target.x, y: target.y };
}

function drawAuthoredPileDriver(ctx, from, target, embedded, intensity, art) {
  const image = art?.images?.driver;
  if (!image) return null;
  const direction = vector(from, target);
  const angle = Math.atan2(direction.y, direction.x);
  const railStart = {
    x: from.x + direction.x * 13,
    y: from.y + direction.y * 13,
  };
  const railLength = Math.max(28, direction.length - 83);

  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.driver.rail, railStart, {
    anchor: "start",
    rotation: angle,
    scaleX: railLength / 136,
    scaleY: 0.72,
  });
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.driver.shoulder, from, {
    anchor: "axis",
    rotation: angle,
    scaleX: 0.6,
  });
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.driver.head, classicDriverContact(target), {
    anchor: "contact",
    rotation: angle,
    scaleX: 0.72,
  });

  if (embedded) {
    ctx.save();
    ctx.globalAlpha = 0.58 + Math.min(0.32, intensity * 0.24);
    ctx.strokeStyle = COLORS.rustBright;
    ctx.lineWidth = 2.5;
    const cracks = [];
    for (let index = 0; index < 5; index += 1) {
      const crackAngle = (Math.PI * 2 * index) / 5 + 0.4;
      cracks.push([
        {
          x: target.x + Math.cos(crackAngle) * 16,
          y: target.y + Math.sin(crackAngle) * 9,
        },
        {
          x: target.x + Math.cos(crackAngle) * (38 + index * 4),
          y: target.y + Math.sin(crackAngle) * (21 + index * 3),
        },
      ]);
    }
    lines(ctx, cracks);
    ctx.stroke();
    ctx.restore();
  }
  return { end: classicDriverContact(target), direction };
}

function drawDriver(ctx, from, target, embedded, intensity, art) {
  return drawAuthoredPileDriver(ctx, from, target, embedded, intensity, art)
    || drawPileDriver(ctx, from, target, embedded, intensity);
}

function drawBraceArm(ctx, from, ground) {
  const elbow = pointAlong(from, ground, 0.48);
  ctx.save();
  ctx.strokeStyle = COLORS.iron;
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  lines(ctx, [[from, elbow], [elbow, ground]]);
  ctx.stroke();
  ctx.strokeStyle = COLORS.brass;
  ctx.lineWidth = 3;
  lines(ctx, [[from, elbow], [elbow, ground]]);
  ctx.stroke();
  ctx.fillStyle = COLORS.porcelain;
  ctx.strokeStyle = COLORS.iron;
  ctx.lineWidth = 3;
  ellipse(ctx, elbow, 15, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17130f";
  ctx.fillRect(ground.x - 18, ground.y - 7, 36, 14);
  ctx.restore();
}

function drawFurnaceBody(ctx, state, base, tilt, now, pile) {
  const coreOpen = state.boss.coreOpen;
  ctx.save();
  ctx.translate(base.x, base.y - 59);
  ctx.rotate(tilt);

  ctx.fillStyle = "rgba(0,0,0,.48)";
  ellipse(ctx, { x: 0, y: 65 }, 94, 30);
  ctx.fill();

  ctx.fillStyle = COLORS.iron;
  ctx.strokeStyle = COLORS.ironEdge;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-90, -55);
  ctx.lineTo(-62, -105);
  ctx.lineTo(55, -107);
  ctx.lineTo(92, -54);
  ctx.lineTo(80, 42);
  ctx.lineTo(42, 67);
  ctx.lineTo(-72, 55);
  ctx.lineTo(-98, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.porcelain;
  ctx.strokeStyle = "#4b3c31";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-78, -46);
  ctx.lineTo(-52, -89);
  ctx.lineTo(-20, -84);
  ctx.lineTo(-35, 48);
  ctx.lineTo(-68, 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(27, -88);
  ctx.lineTo(57, -82);
  ctx.lineTo(78, -43);
  ctx.lineTo(65, 39);
  ctx.lineTo(34, 47);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(70,49,35,.75)";
  ctx.lineWidth = 2;
  lines(ctx, [
    [{ x: -61, y: -45 }, { x: -33, y: -15 }],
    [{ x: -64, y: -4 }, { x: -34, y: 20 }],
    [{ x: 32, y: -50 }, { x: 64, y: -18 }],
    [{ x: 32, y: 7 }, { x: 63, y: 27 }],
  ]);
  ctx.stroke();

  const shutterY = -12;
  ctx.fillStyle = "#100d0b";
  roundedRect(ctx, -40, shutterY - 31, 80, 66, 6);
  ctx.fill();
  ctx.strokeStyle = COLORS.brass;
  ctx.lineWidth = 3;
  ctx.stroke();

  if (coreOpen) {
    const glow = ctx.createRadialGradient(0, shutterY + 1, 3, 0, shutterY + 1, 48);
    glow.addColorStop(0, "rgba(255,241,198,.96)");
    glow.addColorStop(0.34, "rgba(242,175,82,.78)");
    glow.addColorStop(1, "rgba(177,66,29,0)");
    ctx.fillStyle = glow;
    ellipse(ctx, { x: 0, y: shutterY + 1 }, 45, 42);
    ctx.fill();
    ctx.fillStyle = "#33170e";
    roundedRect(ctx, -26, shutterY - 20, 52, 42, 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.brickLight;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = COLORS.fire;
    ctx.fillRect(-10, shutterY - 8, 20, 23 + Math.sin(now * 18) * 4);
    ctx.fillStyle = COLORS.heat;
    ctx.fillRect(-18, shutterY + 6, 36, 12);
    ctx.fillStyle = COLORS.porcelain;
    ctx.strokeStyle = COLORS.iron;
    ctx.lineWidth = 3;
    ctx.save();
    ctx.rotate(-0.66);
    roundedRect(ctx, -83, shutterY - 19, 34, 42, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.66);
    roundedRect(ctx, 49, shutterY - 19, 34, 42, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = COLORS.porcelain;
    roundedRect(ctx, -33, shutterY - 24, 66, 52, 5);
    ctx.fill();
    ctx.strokeStyle = COLORS.ironEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(69,49,36,.88)";
    ctx.lineWidth = 3;
    lines(ctx, [
      [{ x: -26, y: shutterY - 16 }, { x: 25, y: shutterY + 18 }],
      [{ x: 26, y: shutterY - 16 }, { x: -25, y: shutterY + 18 }],
    ]);
    ctx.stroke();
  }

  const linkEnd = pile?.end || { x: base.x + 120, y: base.y + 15 };
  ctx.restore();

  if (coreOpen) {
    const chest = { x: base.x + Math.cos(tilt) * 20, y: base.y - 62 };
    ctx.save();
    ctx.strokeStyle = COLORS.brassLight;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    line(ctx, { x: chest.x + 35, y: chest.y + 4 }, { x: linkEnd.x - 12, y: linkEnd.y - 10 });
    ctx.stroke();
    ctx.strokeStyle = "rgba(35,22,15,.9)";
    ctx.lineWidth = 1.5;
    line(ctx, { x: chest.x + 35, y: chest.y + 4 }, { x: linkEnd.x - 12, y: linkEnd.y - 10 });
    ctx.stroke();
    ctx.restore();
  }
}

function drawAuthoredFurnaceBody(ctx, state, base, tilt, now, pile, art, secondaryKick = 0) {
  const image = art?.images?.boss;
  if (!image) return false;
  const coreOpen = state.boss.coreOpen;
  const root = { x: base.x, y: base.y + 9 };
  const bodyScale = 1.02;
  const coreVisual = classicCoreVisualPlan(state, now);
  const core = coreVisual.anchor;
  const leftHinge = transformLocal(root, { x: -24, y: -43 }, tilt, 1);
  const rightHinge = transformLocal(root, { x: 27, y: -43 }, tilt, 1);

  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.back, root, {
    anchor: "root",
    rotation: tilt,
    scaleX: bodyScale,
  });

  if (coreOpen) {
    ctx.save();
    ctx.globalAlpha = clamp(coreVisual.exposure, 0, 1);
    ctx.fillStyle = "rgba(4,3,3,.96)";
    ellipse(ctx, core, 37, 34);
    ctx.fill();

    const glowRadius = 61 * coreVisual.exposure;
    const glow = ctx.createRadialGradient(core.x, core.y, 2, core.x, core.y, glowRadius);
    glow.addColorStop(0, "rgba(255,255,246,1)");
    glow.addColorStop(0.24, "rgba(255,240,194,.95)");
    glow.addColorStop(0.6, "rgba(234,157,68,.46)");
    glow.addColorStop(1, "rgba(174,55,24,0)");
    ctx.fillStyle = glow;
    ellipse(ctx, core, glowRadius, glowRadius * 0.86);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,245,214,.84)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const crackLength = 31 * coreVisual.exposure;
    lines(ctx, [
      [{ x: core.x - 12, y: core.y - 8 }, { x: core.x - crackLength, y: core.y - 21 }],
      [{ x: core.x + 13, y: core.y - 7 }, { x: core.x + crackLength, y: core.y - 19 }],
      [{ x: core.x - 13, y: core.y + 8 }, { x: core.x - crackLength, y: core.y + 20 }],
      [{ x: core.x + 13, y: core.y + 8 }, { x: core.x + crackLength, y: core.y + 22 }],
    ]);
    ctx.stroke();

    ctx.fillStyle = "#fffdf1";
    ellipse(ctx, core, coreVisual.radius, coreVisual.radius * 0.94);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.98)";
    ctx.lineWidth = 4;
    ellipse(ctx, core, coreVisual.radius + 6, coreVisual.radius + 4);
    ctx.stroke();

    if (Number.isFinite(coreVisual.hitAge) && coreVisual.hitAge <= 0.12) {
      const hitProgress = clamp(coreVisual.hitAge / 0.12, 0, 1);
      ctx.globalAlpha = 1 - hitProgress;
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 10 - hitProgress * 6;
      ellipse(ctx, core, 27 + hitProgress * 34, 24 + hitProgress * 27);
      ctx.stroke();
    }
    ctx.restore();
  }

  const shellOpen = coreOpen
    ? 0.72 * coreVisual.exposure + coreVisual.shutterKick + secondaryKick * 0.42
    : 0.06;
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.shellLeft, leftHinge, {
    anchor: "hinge",
    rotation: tilt - shellOpen,
    scaleX: 0.9,
  });
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.shellRight, rightHinge, {
    anchor: "hinge",
    rotation: tilt + shellOpen * 0.88,
    scaleX: 0.9,
  });

  const shutterOpen = coreOpen
    ? 0.94 * coreVisual.exposure + coreVisual.shutterKick * 1.35 + secondaryKick * 0.58
    : 0.02;
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.shutterLeft, core, {
    anchor: "hinge",
    rotation: tilt - shutterOpen,
    scaleX: 0.72,
  });
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.shutterRight, core, {
    anchor: "hinge",
    rotation: tilt + shutterOpen,
    scaleX: 0.72,
  });

  const crown = transformLocal(root, { x: 22, y: -145 }, tilt, 1);
  drawImagePart(ctx, art, image, CLASSIC_ART_PARTS.boss.sightCrown, crown, {
    anchor: "root",
    rotation: tilt,
    scaleX: 0.72,
  });

  if (coreOpen && pile?.end) {
    ctx.save();
    ctx.strokeStyle = COLORS.brassLight;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    line(ctx, { x: core.x + 27, y: core.y + 8 }, { x: pile.end.x - 12, y: pile.end.y - 10 });
    ctx.stroke();
    ctx.strokeStyle = "rgba(35,22,15,.9)";
    ctx.lineWidth = 1.5;
    line(ctx, { x: core.x + 27, y: core.y + 8 }, { x: pile.end.x - 12, y: pile.end.y - 10 });
    ctx.stroke();
    ctx.restore();
  }
  return true;
}

function drawBoss(ctx, state, now, art, dynamics = null) {
  const base = projectWorld(state.boss);
  // The small stabilizer reads exploration lanes. The heavy pile-driver remains
  // visibly stowed until LOCK commits it to a fixed plate, keeping the player
  // and the live floor warning unobscured during sampling.
  const target = state.lock
    ? projectWorld(state.lock.zone)
    : projectWorld({ x: state.boss.x + 154, y: state.boss.y + 116 });
  const locked = Boolean(state.lock);
  const resolved = state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR;
  const direction = target.x >= base.x ? 1 : -1;
  // A miss is not a generic glow state: the pile-driver stays buried while its
  // overextension drags the low furnace body sideways and pulls its shutters.
  const dynamicsKick = dynamics?.springValue(1) || 0;
  const tilt = resolved ? direction * 0.27 : locked ? direction * 0.035 : 0;
  const shake = state.visual.shake ? Math.sin(now * 85) * state.visual.shake * 14 : 0;
  const bodyBase = {
    x: base.x + shake + (resolved ? direction * 29 : 0),
    y: base.y + (resolved ? 27 : 0),
  };
  const shoulder = { x: bodyBase.x + direction * 58, y: bodyBase.y - 112 };
  const braceStart = { x: bodyBase.x - direction * 60, y: bodyBase.y - 82 };
  const braceGround = { x: bodyBase.x - direction * 132, y: bodyBase.y + 30 };

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.56)";
  ellipse(ctx, { x: bodyBase.x, y: bodyBase.y + 29 }, 130, 39);
  ctx.fill();
  ctx.restore();

  drawBraceArm(ctx, braceStart, braceGround);
  const pile = drawDriver(ctx, shoulder, target, resolved, state.visual.shake || 0, art);
  const authoredBody = drawAuthoredFurnaceBody(
    ctx,
    state,
    bodyBase,
    tilt,
    now,
    pile,
    art,
    dynamicsKick,
  );
  if (!authoredBody) drawFurnaceBody(ctx, state, bodyBase, tilt, now, pile);
  drawMemoryRack(ctx, state, bodyBase, now, art);

  const sight = { x: bodyBase.x + direction * 23, y: bodyBase.y - 145 };
  ctx.save();
  if (!authoredBody) {
    ctx.fillStyle = "#17120f";
    ctx.strokeStyle = COLORS.brassLight;
    ctx.lineWidth = 3;
    roundedRect(ctx, sight.x - 15, sight.y - 10, 30, 20, 5);
    ctx.fill();
    ctx.stroke();
  }
  if (locked) {
    ctx.strokeStyle = COLORS.rustBright;
    ctx.lineWidth = 2.5;
    line(ctx, sight, target);
    ctx.stroke();
    ctx.strokeStyle = "rgba(224,186,117,.66)";
    ctx.lineWidth = 1;
    line(ctx, { x: sight.x + direction * 4, y: sight.y + 4 }, { x: target.x, y: target.y });
    ctx.stroke();
  }
  ctx.restore();
}

function drawSwingTrail(ctx, state, blade) {
  if (!blade.motion.active) return;
  const { motion } = blade;
  const sweep = blade.angle - blade.targetAngle;
  if (Math.abs(sweep) < 0.04 && !motion.contact) return;
  const color = state.visual.attack?.hit
    ? "#fff7d6"
    : state.visual.attack?.armor
      ? COLORS.porcelainLight
      : COLORS.enamelLight;
  const radius = motion.contact
    ? Math.min(142, Math.max(64, blade.contactLength))
    : 66;
  const sampleCount = 18;
  const points = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const amount = index / sampleCount;
    const curvedAmount = easeOutCubic(amount);
    const angle = mix(blade.targetAngle, blade.angle, curvedAmount);
    const localRadius = radius * mix(0.76, 1, amount);
    points.push({
      x: blade.hand.x + Math.cos(angle) * localRadius,
      y: blade.hand.y + Math.sin(angle) * localRadius,
    });
  }

  ctx.save();
  ctx.globalAlpha = motion.trailAlpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = "rgba(8,7,6,.76)";
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = state.visual.attack?.hit ? 12 : 10;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,245,.92)";
  ctx.lineWidth = 3.5;
  ctx.stroke();

  if (motion.phase !== "contact") {
    const echoAngle = blade.angle - blade.swingSide * 0.43;
    ctx.globalAlpha *= 0.42;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    line(ctx, blade.hand, {
      x: blade.hand.x + Math.cos(echoAngle) * 59,
      y: blade.hand.y + Math.sin(echoAngle) * 59,
    });
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, state, now, art, dynamics = null) {
  const point = projectWorld(state.player);
  const boss = projectWorld(state.boss);
  const blade = classicBladeContactPlan(state, now);
  const angle = blade.angle;
  const bladeLength = blade.length;
  const blinking = state.timers.invulnerable > 0 && Math.sin(now * 40) > 0.2;

  ctx.save();
  ctx.globalAlpha = blinking ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ellipse(ctx, { x: point.x, y: point.y + 4 }, 20, 7);
  ctx.fill();
  drawSwingTrail(ctx, state, blade);
  const facing = boss.x >= point.x ? 1 : -1;
  const movementLean = clamp(state.player.lastMove?.x || 0, -1, 1) * -0.07
    + (dynamics?.springValue(0) || 0);
  const dashLean = state.visual.lastDash ? facing * -0.06 : 0;
  const attackLean = blade.motion.bodyLean * blade.swingSide;
  drawImagePart(ctx, art, art?.images?.player, CLASSIC_ART_PARTS.player.cloak, point, {
    anchor: "foot",
    rotation: movementLean + dashLean + attackLean,
    scaleX: facing * 0.61,
    scaleY: 0.61,
    alpha: blinking ? 0.45 : 1,
  });
  ctx.fillStyle = COLORS.enamelLight;
  ellipse(ctx, point, 5, 3);
  ctx.fill();
  ctx.strokeStyle = COLORS.enamel;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.translate(point.x, point.y);
  ctx.rotate(attackLean);
  ctx.fillStyle = "#2b2924";
  ctx.strokeStyle = "#13110e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-13, -8);
  ctx.lineTo(-10, -39);
  ctx.lineTo(0, -52);
  ctx.lineTo(12, -38);
  ctx.lineTo(14, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.porcelainLight;
  ctx.beginPath();
  ctx.moveTo(-6, -39);
  ctx.lineTo(0, -49);
  ctx.lineTo(6, -39);
  ctx.lineTo(4, -28);
  ctx.lineTo(-4, -28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.enamel;
  ctx.fillRect(-13, -28, 8, 18);
  ctx.restore();

  ctx.save();
  ctx.translate(point.x, point.y - 29);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(9,7,6,.88)";
  ctx.lineWidth = 10;
  line(ctx, { x: 4, y: 0 }, { x: bladeLength, y: 0 });
  ctx.stroke();
  ctx.strokeStyle = state.visual.attack?.hit ? "#fffdf0" : "#e8e0d0";
  ctx.lineWidth = 5.5;
  line(ctx, { x: 4, y: 0 }, { x: bladeLength, y: 0 });
  ctx.stroke();
  ctx.strokeStyle = COLORS.brassLight;
  ctx.lineWidth = 2;
  line(ctx, { x: 9, y: -7 }, { x: 9, y: 7 });
  ctx.stroke();
  ctx.restore();
}

function drawImpact(ctx, state, now, art) {
  const impact = state.visual.impact;
  if (!impact) return;
  const point = classicImpactScreenAnchor(state, now);
  const alpha = clamp(impact.remaining / (impact.tone === "core" ? 0.3 : 0.24), 0, 1);
  const color = impact.tone === "core" ? COLORS.fire : impact.tone === "armor" ? COLORS.porcelainLight : COLORS.rustBright;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = impact.tone === "core" ? 8 : 5;
  const radius = 14 + (1 - alpha) * 44;
  ellipse(ctx, point, radius, radius * 0.54);
  ctx.stroke();
  if (impact.tone === "core") {
    ctx.globalAlpha = Math.min(1, alpha * 1.35);
    ctx.strokeStyle = "#fffdf3";
    ctx.lineWidth = 5;
    lines(ctx, [
      [{ x: point.x - radius * 0.72, y: point.y - radius * 0.42 }, { x: point.x + radius * 0.72, y: point.y + radius * 0.42 }],
      [{ x: point.x - radius * 0.72, y: point.y + radius * 0.42 }, { x: point.x + radius * 0.72, y: point.y - radius * 0.42 }],
    ]);
    ctx.stroke();
  }
  const impactImage = art?.images?.impact;
  const duration = impact.tone === "core" ? 0.3 : 0.24;
  const age = clamp(duration - impact.remaining, 0, duration);
  const blade = classicBladeContactPlan(state, now);
  const burstAngle = Math.atan2(point.y - blade.hand.y, point.x - blade.hand.x);
  const spreadAngles = [-0.86, -0.43, -0.08, 0.41, 0.79];
  for (let index = 0; index < 5; index += 1) {
    const angle = burstAngle + spreadAngles[index];
    const speed = (impact.tone === "core" ? 176 : 118) * (0.82 + index * 0.055);
    const shardPoint = {
      x: point.x + Math.cos(angle) * speed * age,
      y: point.y + Math.sin(angle) * speed * age + 250 * age * age,
    };
    const part = CLASSIC_ART_PARTS.impact[`shard${index + 1}`];
    const usedArt = drawImagePart(ctx, art, impactImage, part, shardPoint, {
      anchor: "root",
      rotation: angle + age * (index % 2 ? -9 : 10),
      scaleX: 0.2 + (1 - alpha) * 0.13,
      alpha,
    });
    if (!usedArt) {
      ctx.fillStyle = color;
      ctx.fillRect(shardPoint.x - 2, shardPoint.y - 2, 4, 4);
    }
  }
  ctx.restore();
}

function drawDynamicParticles(ctx, dynamics) {
  if (!dynamics || dynamics.particleCount <= 0) return;
  ctx.save();
  ctx.fillStyle = COLORS.fire;
  ctx.strokeStyle = "rgba(197,92,50,.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let particleAlpha = 0;
  dynamics.forEachParticle((_index, x, y, rotation, alpha, progress) => {
    const size = mix(4.8, 1.2, progress);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const px = (localX, localY) => ({
      x: x + localX * cosine - localY * sine,
      y: y + localX * sine + localY * cosine,
    });
    const a = px(size, 0);
    const b = px(0, size * 0.42);
    const c = px(-size, 0);
    const d = px(0, -size * 0.42);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    particleAlpha = Math.max(particleAlpha, alpha);
  });
  ctx.globalAlpha = particleAlpha;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCoreClosureWarning(ctx, state) {
  if (state.phase !== PHASE.CORE_OPEN || state.phaseTime > 0.6) return;
  const point = projectWorld(state.boss);
  const progress = 1 - clamp(state.phaseTime / 0.6, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(197,92,50,${0.45 + progress * 0.35})`;
  ctx.lineWidth = 3 + progress * 2;
  ctx.setLineDash([11, 8]);
  ellipse(ctx, point, CONFIG.armorShockRadius * VIEW.scaleX, CONFIG.armorShockRadius * VIEW.scaleY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawGroundHint(ctx, at, label, color, direction = 0) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.transform(1, 0, 0.18, 0.72, 0, 0);
  ctx.font = "900 23px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(8,7,6,.88)";
  ctx.lineWidth = 7;
  ctx.strokeText(label, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(label, 0, 0);
  if (direction) {
    ctx.strokeStyle = "rgba(8,7,6,.82)";
    ctx.lineWidth = 10;
    lines(ctx, [
      [{ x: direction * 72, y: -10 }, { x: direction * 94, y: 0 }],
      [{ x: direction * 72, y: 10 }, { x: direction * 94, y: 0 }],
    ]);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    lines(ctx, [
      [{ x: direction * 72, y: -10 }, { x: direction * 94, y: 0 }],
      [{ x: direction * 72, y: 10 }, { x: direction * 94, y: 0 }],
    ]);
    ctx.stroke();
  }
  ctx.restore();
}

export function classicFirstRunGuidanceStage(state) {
  if (state.round !== 1 || state.phase === PHASE.GAME_OVER || state.phase === PHASE.WAITING) {
    return null;
  }
  const elapsed = Number.isFinite(state.elapsed) ? state.elapsed : 0;
  if (
    state.phase === PHASE.EXPLORE &&
    elapsed <= 3.4 &&
    state.memory.length === 0 &&
    !state.lock
  ) {
    return "escape";
  }
  if (
    state.lock &&
    state.predictedSide &&
    (state.phase === PHASE.COMBINE || state.phase === PHASE.LOCK || state.phase === PHASE.PREDICTION)
  ) {
    return "opposite";
  }
  if (state.phase === PHASE.CORE_OPEN && state.stats?.coreHits === 0) return "core";
  return null;
}

function drawFirstRunGuidance(ctx, state, now) {
  const stage = classicFirstRunGuidanceStage(state);
  if (!stage) return;
  const player = projectWorld(state.player);
  if (stage === "escape") {
    const pulse = 0.78 + Math.sin(now * 9) * 0.14;
    ctx.save();
    ctx.globalAlpha = pulse;
    drawGroundHint(
      ctx,
      { x: player.x, y: Math.min(620, player.y + 58) },
      "WASD · 주홍선 밖으로",
      COLORS.enamelLight,
    );
    ctx.restore();
    return;
  }

  if (stage === "opposite") {
    const direction = state.predictedSide === "right" ? -1 : 1;
    const origin = projectWorld(state.lock.origin || state.boss);
    drawGroundHint(
      ctx,
      { x: clamp(origin.x + direction * 155, 175, 1105), y: clamp(origin.y + 116, 190, 620) },
      "반대로",
      COLORS.enamelLight,
      direction,
    );
    return;
  }

  if (stage === "core") {
    drawGroundHint(
      ctx,
      { x: player.x, y: Math.min(620, player.y + 58) },
      "J · 순백 코어",
      "#fffdf1",
    );
  }
}

function drawMinimalGameOver(ctx, state) {
  const alpha = 0.18;
  ctx.save();
  ctx.fillStyle = `rgba(8,6,5,${alpha})`;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const target = state.lock ? projectWorld(state.lock.zone) : projectWorld(state.player);
  const player = projectWorld(state.player);
  ctx.strokeStyle = COLORS.rustBright;
  ctx.lineWidth = 3;
  ellipse(ctx, target, 76, 46);
  ctx.stroke();
  ctx.strokeStyle = COLORS.enamelLight;
  ctx.lineWidth = 3;
  ellipse(ctx, player, 16, 8);
  ctx.stroke();
  ctx.restore();
}

function waitingState() {
  return {
    phase: PHASE.WAITING,
    phaseTime: 0,
    player: { x: CONFIG.playerStartX, y: CONFIG.playerStartY, lastMove: { x: 0, y: -1 } },
    boss: { x: CONFIG.bossX, y: CONFIG.bossY, coreOpen: false },
    memory: [],
    lock: null,
    explore: null,
    timers: { invulnerable: 0 },
    visual: { lastDash: null, attack: null, impact: null, shake: 0 },
  };
}

export function renderGame(ctx, state, { now = 0, art = null, dynamics = null } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.fillStyle = COLORS.deepSoot;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawArena(ctx, now);

  const scene = state.phase === PHASE.WAITING ? waitingState() : state;
  drawExploreWarning(ctx, scene);
  drawKilnTarget(ctx, scene, now, art);
  drawDashSkid(ctx, scene);
  drawCoreClosureWarning(ctx, scene);
  drawCoreReflection(ctx, scene, now);
  drawBoss(ctx, scene, now, art, dynamics);
  drawPlayer(ctx, scene, now, art, dynamics);
  drawImpact(ctx, scene, now, art);
  drawDynamicParticles(ctx, dynamics);
  drawFirstRunGuidance(ctx, scene, now);
  if (state.phase === PHASE.GAME_OVER) drawMinimalGameOver(ctx, state);
  ctx.restore();
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("Canvas element is required");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  const reducedMotionQuery = typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const dynamics = createVisualDynamics({
    springs: [
      { frequency: 17, dampingRatio: 0.58 },
      { frequency: 22, dampingRatio: 0.38 },
    ],
    reducedMotion: Boolean(reducedMotionQuery?.matches),
  });

  const renderer = {
    isReady: true,
    status: "ready",
    info: {
      mode: "classic-fallback",
      artStatus: "loading",
      assetCount: 0,
      drawImages: 0,
      dpr: 1,
      particles: 0,
      visualPhysics: "spring-ballistic",
    },
    onStatusChange: null,
  };
  let images = null;
  let loadGeneration = 0;
  let previousNow = null;

  function updateDynamics(state, now) {
    const events = Array.isArray(state.events) ? state.events : [];
    if (events.some((event) => event.type === "start" || event.type === "restart")) {
      dynamics.reset();
    }
    dynamics.setReducedMotion(Boolean(reducedMotionQuery?.matches));

    const blade = classicBladeContactPlan(state, now);
    for (const event of events) {
      if (event.type !== "core_hit" && event.type !== "armor_hit") continue;
      const point = classicImpactScreenAnchor(state, now);
      if (!point) continue;
      dynamics.spawnOnce(`${event.type}:${event.id}`, {
        seed: Number.isFinite(event.id) ? event.id : state.eventSerial,
        x: point.x,
        y: point.y,
        directionX: point.x - blade.hand.x,
        directionY: point.y - blade.hand.y,
        count: event.type === "core_hit" ? 12 : 7,
        speed: event.type === "core_hit" ? 188 : 126,
        spread: event.type === "core_hit" ? 1.42 : 0.94,
        duration: event.type === "core_hit" ? 0.38 : 0.26,
        gravity: 270,
      });
    }

    const delta = previousNow == null ? 1 / 60 : Math.max(0, now - previousNow);
    previousNow = now;
    const dashDirection = state.visual?.lastDash
      ? Math.sign((state.visual.lastDash.to?.x || 0) - (state.visual.lastDash.from?.x || 0))
      : 0;
    const movementTarget = clamp(state.player?.lastMove?.x || 0, -1, 1) * -0.08
      + dashDirection * -0.07;
    const base = projectWorld(state.boss || { x: 0, y: 0 });
    const target = state.lock?.zone ? projectWorld(state.lock.zone) : { x: base.x + 1, y: base.y };
    const bossDirection = target.x >= base.x ? 1 : -1;
    const impactTarget = state.visual?.impact?.tone === "core" ? bossDirection * 0.14 : 0;
    dynamics.step(delta, [movementTarget, impactTarget]);
    renderer.info.particles = dynamics.particleCount;
  }

  async function refreshArt() {
    const generation = ++loadGeneration;
    renderer.info.artStatus = "loading";
    try {
      const loaded = await loadClassicArt();
      if (generation !== loadGeneration) return;
      images = loaded;
      renderer.info.mode = "classic-cutout";
      renderer.info.artStatus = "ready";
      renderer.info.assetCount = Object.keys(loaded).length;
      renderer.info.error = null;
    } catch (error) {
      if (generation !== loadGeneration) return;
      images = null;
      renderer.info.mode = "classic-fallback";
      renderer.info.artStatus = "fallback";
      renderer.info.assetCount = 0;
      renderer.info.error = error instanceof Error ? error.message : String(error);
    }
    if (typeof renderer.onStatusChange === "function") renderer.onStatusChange();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(
      CLASSIC_ART_LIMITS.maxDevicePixelRatio,
      Math.max(1, globalThis.devicePixelRatio || 1),
    );
    renderer.info.dpr = ratio;
    const width = Math.max(1, Math.round((rect.width || LOGICAL_WIDTH) * ratio));
    const height = Math.max(1, Math.round((rect.height || LOGICAL_HEIGHT) * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(state, options = {}) {
    renderer.info.drawImages = 0;
    resize();
    const now = Number.isFinite(options.now) ? options.now : 0;
    updateDynamics(state, now);
    ctx.setTransform(canvas.width / LOGICAL_WIDTH, 0, 0, canvas.height / LOGICAL_HEIGHT, 0, 0);
    renderGame(ctx, state, {
      ...options,
      now,
      art: images ? { images, metrics: renderer.info } : null,
      dynamics,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderer.render = render;
  renderer.resize = resize;
  renderer.retry = refreshArt;
  void refreshArt();
  return renderer;
}

export const RENDER_SIZE = Object.freeze({ width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT });
