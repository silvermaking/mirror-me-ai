import { CONFIG, PHASE } from "./game-core.mjs";

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

function drawKilnTarget(ctx, state, now) {
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

function drawMemoryRack(ctx, state, base, now) {
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
    if (side) drawMemorySlab(ctx, x + wobble, base.y - 143, side, combining);
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

function drawBoss(ctx, state, now) {
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
  const pile = drawPileDriver(ctx, shoulder, target, resolved, state.visual.shake || 0);
  drawFurnaceBody(ctx, state, bodyBase, tilt, now, pile);
  drawMemoryRack(ctx, state, bodyBase, now);

  const sight = { x: bodyBase.x + direction * 23, y: bodyBase.y - 145 };
  ctx.save();
  ctx.fillStyle = "#17120f";
  ctx.strokeStyle = COLORS.brassLight;
  ctx.lineWidth = 3;
  roundedRect(ctx, sight.x - 15, sight.y - 10, 30, 20, 5);
  ctx.fill();
  ctx.stroke();
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

function drawPlayer(ctx, state, now) {
  const point = projectWorld(state.player);
  const boss = projectWorld(state.boss);
  const angle = Math.atan2(boss.y - point.y, boss.x - point.x);
  const blinking = state.timers.invulnerable > 0 && Math.sin(now * 40) > 0.2;

  ctx.save();
  ctx.globalAlpha = blinking ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ellipse(ctx, { x: point.x, y: point.y + 4 }, 20, 7);
  ctx.fill();
  ctx.fillStyle = COLORS.enamelLight;
  ellipse(ctx, point, 5, 3);
  ctx.fill();
  ctx.strokeStyle = COLORS.enamel;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.translate(point.x, point.y);
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
  ctx.strokeStyle = "#e8e0d0";
  ctx.lineWidth = 3.5;
  line(ctx, { x: 4, y: 0 }, { x: 43, y: 0 });
  ctx.stroke();
  ctx.strokeStyle = COLORS.brassLight;
  ctx.lineWidth = 2;
  line(ctx, { x: 9, y: -7 }, { x: 9, y: 7 });
  ctx.stroke();
  ctx.restore();

  if (state.visual.attack) {
    const alpha = clamp(state.visual.attack.remaining / 0.24, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(point.x, point.y - 28);
    ctx.rotate(angle);
    ctx.strokeStyle = state.visual.attack.hit ? COLORS.fire : COLORS.white;
    ctx.lineWidth = state.visual.attack.hit ? 5 : 3;
    ctx.beginPath();
    ctx.arc(13, 0, 51, -0.68, 0.68);
    ctx.stroke();
    ctx.restore();
  }
}

function drawImpact(ctx, state, now) {
  const impact = state.visual.impact;
  if (!impact) return;
  const point = projectWorld(impact);
  const alpha = clamp(impact.remaining / (impact.tone === "core" ? 0.3 : 0.24), 0, 1);
  const color = impact.tone === "core" ? COLORS.fire : impact.tone === "armor" ? COLORS.porcelainLight : COLORS.rustBright;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  const radius = 14 + (1 - alpha) * 44;
  ellipse(ctx, { x: point.x, y: point.y - 42 }, radius, radius * 0.54);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let index = 0; index < 5; index += 1) {
    const angle = now * 5 + (Math.PI * 2 * index) / 5;
    ctx.fillRect(point.x + Math.cos(angle) * radius - 2, point.y - 38 + Math.sin(angle) * radius * 0.45 - 2, 4, 4);
  }
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

function drawMinimalGameOver(ctx, state) {
  const alpha = 0.62;
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
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText(state.death?.tip || "다음에는 위험 구역 밖으로 이동", VIEW.centerX, 618);
  if (state.gameOverElapsed >= CONFIG.restartDelay) {
    ctx.fillStyle = COLORS.enamelLight;
    ctx.font = "800 14px system-ui, sans-serif";
    ctx.fillText("ENTER / SPACE · 다시 속이기", VIEW.centerX, 650);
  }
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

export function renderGame(ctx, state, { now = 0 } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.fillStyle = COLORS.deepSoot;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawArena(ctx, now);

  const scene = state.phase === PHASE.WAITING ? waitingState() : state;
  drawExploreWarning(ctx, scene);
  drawKilnTarget(ctx, scene, now);
  drawDashSkid(ctx, scene);
  drawCoreClosureWarning(ctx, scene);
  drawBoss(ctx, scene, now);
  drawPlayer(ctx, scene, now);
  drawImpact(ctx, scene, now);
  if (state.phase === PHASE.GAME_OVER) drawMinimalGameOver(ctx, state);
  ctx.restore();
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("Canvas element is required");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.max(1, Math.round((rect.width || LOGICAL_WIDTH) * ratio));
    const height = Math.max(1, Math.round((rect.height || LOGICAL_HEIGHT) * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(state, options = {}) {
    resize();
    ctx.setTransform(canvas.width / LOGICAL_WIDTH, 0, 0, canvas.height / LOGICAL_HEIGHT, 0, 0);
    renderGame(ctx, state, options);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { render, resize };
}

export const RENDER_SIZE = Object.freeze({ width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT });
