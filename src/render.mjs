import { CONFIG, PHASE } from "./game-core.mjs";

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 720;
const VIEW = Object.freeze({
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  centerX: LOGICAL_WIDTH / 2,
  centerY: 405,
  scaleX: 1.03,
  scaleY: 0.77,
});

const COLORS = Object.freeze({
  ink: "#05070b",
  panel: "rgba(7, 11, 17, 0.88)",
  text: "#f2f7f8",
  muted: "#9baab1",
  cyan: "#38eff0",
  cyanPale: "#dffeff",
  magenta: "#f044bd",
  orange: "#ff7547",
  platinum: "#f7f4df",
  gold: "#ffd66b",
  danger: "#ff5d62",
});

const SIDE_LABEL = Object.freeze({ left: "왼쪽", right: "오른쪽" });

export function projectWorld(point) {
  return {
    x: VIEW.centerX + point.x * VIEW.scaleX,
    y: VIEW.centerY + point.y * VIEW.scaleY,
  };
}

function roundedRect(ctx, x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPanel(ctx, x, y, width, height, accent = "rgba(199,232,235,.18)") {
  ctx.save();
  roundedRect(ctx, x, y, width, height, 12);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawArena(ctx, now) {
  const rx = CONFIG.arenaRadiusX * VIEW.scaleX;
  const ry = CONFIG.arenaRadiusY * VIEW.scaleY;

  ctx.save();
  const glow = ctx.createRadialGradient(
    VIEW.centerX,
    VIEW.centerY - 30,
    30,
    VIEW.centerX,
    VIEW.centerY,
    rx,
  );
  glow.addColorStop(0, "#16252b");
  glow.addColorStop(0.62, "#0c151b");
  glow.addColorStop(1, "#070b10");
  ctx.beginPath();
  ctx.ellipse(VIEW.centerX, VIEW.centerY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = "rgba(116, 169, 176, 0.1)";
  ctx.lineWidth = 1;
  for (let ring = 0.22; ring < 1; ring += 0.19) {
    ctx.beginPath();
    ctx.ellipse(VIEW.centerX, VIEW.centerY, rx * ring, ry * ring, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let x = -360; x <= 360; x += 90) {
    const top = projectWorld({ x, y: -CONFIG.arenaRadiusY });
    const bottom = projectWorld({ x, y: CONFIG.arenaRadiusY });
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
  }
  for (let y = -210; y <= 210; y += 70) {
    const left = projectWorld({ x: -CONFIG.arenaRadiusX, y });
    const right = projectWorld({ x: CONFIG.arenaRadiusX, y });
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  const scanY = VIEW.centerY - ry + ((now * 28) % (ry * 2));
  const scan = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
  scan.addColorStop(0, "rgba(56,239,240,0)");
  scan.addColorStop(0.5, "rgba(56,239,240,.035)");
  scan.addColorStop(1, "rgba(56,239,240,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(VIEW.centerX - rx, scanY - 18, rx * 2, 36);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(VIEW.centerX, VIEW.centerY, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(205, 239, 240, .38)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(VIEW.centerX, VIEW.centerY + 5, rx + 8, ry + 7, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(56,239,240,.09)";
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.restore();
}

function clipArena(ctx) {
  ctx.beginPath();
  ctx.ellipse(
    VIEW.centerX,
    VIEW.centerY,
    CONFIG.arenaRadiusX * VIEW.scaleX,
    CONFIG.arenaRadiusY * VIEW.scaleY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.clip();
}

function drawExploreWarning(ctx, state, now) {
  if (state.phase !== PHASE.EXPLORE || !state.explore) return;
  const centerX = projectWorld({ x: state.explore.lineX, y: 0 }).x;
  const width = CONFIG.exploreLaneHalfWidth * VIEW.scaleX * 2;
  const pulse = 0.16 + Math.sin(now * 18) * 0.045;

  ctx.save();
  clipArena(ctx);
  const gradient = ctx.createLinearGradient(centerX - width / 2, 0, centerX + width / 2, 0);
  gradient.addColorStop(0, "rgba(255,117,71,0)");
  gradient.addColorStop(0.2, `rgba(255,117,71,${pulse})`);
  gradient.addColorStop(0.5, `rgba(255,117,71,${pulse + 0.11})`);
  gradient.addColorStop(0.8, `rgba(255,117,71,${pulse})`);
  gradient.addColorStop(1, "rgba(255,117,71,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(centerX - width / 2, VIEW.centerY - 250, width, 500);
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, VIEW.centerY - 235);
  ctx.lineTo(centerX - width / 2, VIEW.centerY + 235);
  ctx.moveTo(centerX + width / 2, VIEW.centerY - 235);
  ctx.lineTo(centerX + width / 2, VIEW.centerY + 235);
  ctx.stroke();
  ctx.restore();
}

function drawArmorShockWarning(ctx, state, now) {
  if (
    state.phase !== PHASE.CORE_OPEN ||
    !Number.isFinite(state.phaseTime) ||
    state.phaseTime > 0.6
  ) {
    return;
  }

  const center = projectWorld(state.boss);
  const remainingRatio = Math.max(0, Math.min(1, state.phaseTime / 0.6));
  const urgency = 1 - remainingRatio;
  const flash = 0.5 + Math.sin(now * (18 + urgency * 14)) * 0.5;
  const radiusX = CONFIG.armorShockRadius * VIEW.scaleX;
  const radiusY = CONFIG.armorShockRadius * VIEW.scaleY;
  const countdownScale = 0.28 + remainingRatio * 0.72;

  ctx.save();
  clipArena(ctx);

  const warningFill = ctx.createRadialGradient(
    center.x,
    center.y,
    18,
    center.x,
    center.y,
    radiusX,
  );
  warningFill.addColorStop(0, `rgba(255,117,71,${0.05 + urgency * 0.08})`);
  warningFill.addColorStop(0.68, `rgba(255,117,71,${0.035 + urgency * 0.08})`);
  warningFill.addColorStop(1, `rgba(255,117,71,${0.11 + urgency * 0.16 + flash * 0.07})`);
  ctx.fillStyle = warningFill;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,117,71,${0.52 + urgency * 0.3 + flash * 0.16})`;
  ctx.lineWidth = 3 + urgency * 2;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(247,244,223,${0.5 + urgency * 0.35})`;
  ctx.lineWidth = 3 + urgency * 3;
  ctx.shadowColor = COLORS.orange;
  ctx.shadowBlur = 10 + urgency * 14;
  ctx.beginPath();
  ctx.ellipse(
    center.x,
    center.y,
    radiusX * countdownScale,
    radiusY * countdownScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}

function drawWireGhost(ctx, point, alpha = 1) {
  const p = projectWorld(point);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = COLORS.magenta;
  ctx.fillStyle = "rgba(240,68,189,.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 2, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -47);
  ctx.lineTo(-11, -24);
  ctx.lineTo(-8, -4);
  ctx.moveTo(0, -47);
  ctx.lineTo(11, -24);
  ctx.lineTo(8, -4);
  ctx.moveTo(-8, -28);
  ctx.lineTo(8, -28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -55, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLockPrediction(ctx, state, now) {
  if (!state.lock) return;
  const zone = state.lock.zone;
  const center = projectWorld(zone);
  const origin = projectWorld(state.lock.origin);
  const boss = projectWorld(state.boss);
  const strike = state.phase === PHASE.PREDICTION;
  const pulse = strike ? 0.3 + Math.sin(now * 25) * 0.12 : 0.18;

  ctx.save();
  clipArena(ctx);

  ctx.beginPath();
  ctx.moveTo(boss.x, boss.y - 24);
  ctx.lineTo(center.x - CONFIG.lockZoneRadiusX * VIEW.scaleX * 0.58, center.y);
  ctx.lineTo(center.x + CONFIG.lockZoneRadiusX * VIEW.scaleX * 0.58, center.y);
  ctx.closePath();
  ctx.fillStyle = `rgba(240,68,189,${strike ? 0.17 : 0.08})`;
  ctx.fill();

  ctx.strokeStyle = COLORS.magenta;
  ctx.lineWidth = strike ? 5 : 3;
  ctx.setLineDash(strike ? [] : [15, 9]);
  ctx.beginPath();
  ctx.moveTo(boss.x, boss.y - 18);
  ctx.lineTo(center.x, center.y);
  ctx.stroke();

  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.78;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(center.x, center.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.ellipse(
    center.x,
    center.y,
    CONFIG.lockZoneRadiusX * VIEW.scaleX,
    CONFIG.lockZoneRadiusY * VIEW.scaleY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = `rgba(240,68,189,${pulse})`;
  ctx.fill();
  ctx.strokeStyle = COLORS.platinum;
  ctx.lineWidth = strike ? 4 : 2;
  ctx.stroke();

  ctx.strokeStyle = COLORS.magenta;
  ctx.lineWidth = 2;
  const cross = 15;
  ctx.beginPath();
  ctx.moveTo(center.x - cross, center.y);
  ctx.lineTo(center.x + cross, center.y);
  ctx.moveTo(center.x, center.y - cross);
  ctx.lineTo(center.x, center.y + cross);
  ctx.stroke();
  ctx.restore();

  drawWireGhost(ctx, zone, strike ? 1 : 0.82);
}

function drawDashTrail(ctx, state) {
  const dash = state.visual.lastDash;
  if (!dash) return;
  const from = projectWorld(dash.from);
  const to = projectWorld(dash.to);
  const duration = Number.isFinite(dash.duration) && dash.duration > 0 ? dash.duration : 0.48;
  const alpha = Math.max(0, Math.min(1, dash.remaining / duration));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * 5;
  const ny = (dx / length) * 5;

  ctx.save();
  const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  gradient.addColorStop(0, "rgba(56,239,240,0)");
  gradient.addColorStop(1, `rgba(56,239,240,${alpha * 0.8})`);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(from.x + nx, from.y + ny);
  ctx.lineTo(to.x + nx, to.y + ny);
  ctx.moveTo(from.x - nx, from.y - ny);
  ctx.lineTo(to.x - nx, to.y - ny);
  ctx.stroke();
  ctx.restore();
}

function drawArm(ctx, shoulder, target, isLocked) {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const elbow = {
    x: shoulder.x + dx * 0.53 + (dx >= 0 ? 18 : -18),
    y: shoulder.y + dy * 0.42 - 22,
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111923";
  ctx.lineWidth = 35;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(target.x, target.y - 22);
  ctx.stroke();
  ctx.strokeStyle = isLocked ? "rgba(240,68,189,.8)" : "rgba(197,225,229,.2)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#17212d";
  ctx.beginPath();
  ctx.arc(elbow.x, elbow.y, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMemorySlots(ctx, state, bossBase, now) {
  const filled = state.memory.slice(-3);
  const combining = state.phase === PHASE.COMBINE;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 15px system-ui, sans-serif";
  for (let index = 0; index < 3; index += 1) {
    const x = bossBase.x + (index - 1) * 38;
    const y = bossBase.y - 151 - Math.abs(index - 1) * 6;
    const side = filled[index];
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x + 14, y - 4);
    ctx.lineTo(x + 10, y + 14);
    ctx.lineTo(x - 10, y + 14);
    ctx.lineTo(x - 14, y - 4);
    ctx.closePath();
    ctx.fillStyle = side
      ? combining
        ? `rgba(240,68,189,${0.62 + Math.sin(now * 18 + index) * 0.18})`
        : "rgba(56,239,240,.62)"
      : "rgba(3,7,12,.82)";
    ctx.fill();
    ctx.strokeStyle = side ? (combining ? COLORS.magenta : COLORS.cyan) : "rgba(190,220,224,.27)";
    ctx.lineWidth = side ? 2.5 : 1.5;
    ctx.stroke();
    if (side) {
      ctx.fillStyle = COLORS.platinum;
      ctx.fillText(side === "left" ? "‹" : "›", x, y - 1);
    }
  }
  ctx.fillStyle = "rgba(211,232,234,.7)";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.letterSpacing = "0.12em";
  ctx.fillText("MEMORY", bossBase.x, bossBase.y - 185);
  ctx.restore();
}

function drawBoss(ctx, state, now) {
  const base = projectWorld(state.boss);
  const targetPoint = state.lock
    ? projectWorld(state.lock.zone)
    : state.explore
      ? projectWorld({ x: state.explore.lineX, y: state.player.y })
      : projectWorld(state.player);
  const locked = Boolean(state.lock);

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + 8, 105, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawArm(ctx, { x: base.x - 55, y: base.y - 90 }, targetPoint, locked);
  drawArm(ctx, { x: base.x + 55, y: base.y - 90 }, targetPoint, locked);

  ctx.save();
  const armorGradient = ctx.createLinearGradient(base.x - 100, base.y - 165, base.x + 90, base.y);
  armorGradient.addColorStop(0, "#25313d");
  armorGradient.addColorStop(0.45, "#0a1018");
  armorGradient.addColorStop(1, "#18222c");
  ctx.fillStyle = armorGradient;
  ctx.strokeStyle = locked ? "rgba(240,68,189,.55)" : "rgba(202,232,235,.24)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - 172);
  ctx.lineTo(base.x + 78, base.y - 124);
  ctx.lineTo(base.x + 92, base.y - 40);
  ctx.lineTo(base.x + 54, base.y + 2);
  ctx.lineTo(base.x - 54, base.y + 2);
  ctx.lineTo(base.x - 92, base.y - 40);
  ctx.lineTo(base.x - 78, base.y - 124);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#05080e";
  ctx.strokeStyle = locked ? COLORS.magenta : COLORS.orange;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(base.x - 43, base.y - 130);
  ctx.lineTo(base.x + 43, base.y - 130);
  ctx.lineTo(base.x + 29, base.y - 105);
  ctx.lineTo(base.x - 29, base.y - 105);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const eyeDirection = Math.sign(targetPoint.x - base.x) * 5;
  ctx.fillStyle = locked ? COLORS.magenta : COLORS.orange;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.fillRect(base.x - 17 + eyeDirection, base.y - 121, 34, 5);
  ctx.shadowBlur = 0;

  const coreY = base.y - 68;
  if (state.boss.coreOpen) {
    const coreGlow = ctx.createRadialGradient(base.x, coreY, 2, base.x, coreY, 44);
    coreGlow.addColorStop(0, "rgba(255,255,235,1)");
    coreGlow.addColorStop(0.28, "rgba(255,214,107,.95)");
    coreGlow.addColorStop(1, "rgba(255,214,107,0)");
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(base.x, coreY, 44 + Math.sin(now * 14) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.platinum;
    ctx.beginPath();
    ctx.moveTo(base.x, coreY - 25);
    ctx.lineTo(base.x + 22, coreY);
    ctx.lineTo(base.x, coreY + 25);
    ctx.lineTo(base.x - 22, coreY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,214,107,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base.x - 76, coreY - 25);
    ctx.lineTo(base.x - 34, coreY);
    ctx.moveTo(base.x + 76, coreY - 25);
    ctx.lineTo(base.x + 34, coreY);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#070b11";
    ctx.strokeStyle = "rgba(193,222,225,.25)";
    ctx.lineWidth = 2;
    roundedRect(ctx, base.x - 38, coreY - 24, 76, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(base.x - 30, coreY - 12);
    ctx.lineTo(base.x + 30, coreY + 12);
    ctx.moveTo(base.x + 30, coreY - 12);
    ctx.lineTo(base.x - 30, coreY + 12);
    ctx.stroke();
  }
  ctx.restore();

  drawMemorySlots(ctx, state, base, now);
}

function drawPlayer(ctx, state, now) {
  const p = projectWorld(state.player);
  const invulnerable = state.timers.invulnerable > 0;
  const blink = invulnerable && Math.sin(now * 42) > 0.3;
  const boss = projectWorld(state.boss);
  const angle = Math.atan2(boss.y - p.y, boss.x - p.x);

  ctx.save();
  ctx.globalAlpha = blink ? 0.48 : 1;
  ctx.fillStyle = "rgba(0,0,0,.62)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 3, 25, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(p.x, p.y);
  ctx.fillStyle = "#eafafb";
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -54);
  ctx.lineTo(17, -33);
  ctx.lineTo(12, -5);
  ctx.lineTo(-12, -5);
  ctx.lineTo(-17, -33);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#091017";
  ctx.beginPath();
  ctx.arc(0, -61, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.cyan;
  ctx.beginPath();
  ctx.moveTo(-6, -61);
  ctx.lineTo(7, -61);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, p.y - 28);
  ctx.rotate(angle);
  ctx.strokeStyle = COLORS.cyanPale;
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(42, 0);
  ctx.stroke();
  ctx.restore();

  if (state.visual.attack) {
    const attackAlpha = Math.max(0, Math.min(1, state.visual.attack.remaining / 0.24));
    ctx.save();
    ctx.translate(p.x, p.y - 25);
    ctx.rotate(angle);
    ctx.strokeStyle = state.visual.attack.hit ? COLORS.platinum : COLORS.cyan;
    ctx.shadowColor = state.visual.attack.hit ? COLORS.gold : COLORS.cyan;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = attackAlpha;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(10, 0, 55, -0.72, 0.72);
    ctx.stroke();
    ctx.restore();
  }
}

function drawImpact(ctx, state, now) {
  const impact = state.visual.impact;
  if (!impact) return;
  const p = projectWorld(impact);
  const color = impact.tone === "core" ? COLORS.gold : impact.tone === "armor" ? COLORS.cyan : COLORS.danger;
  const progress = 1 - Math.max(0, impact.remaining) / 0.38;
  const radius = 12 + progress * 42;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y - (impact.tone === "core" ? 55 : 15), radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6 + now;
    ctx.fillRect(
      p.x + Math.cos(angle) * radius - 2,
      p.y - 20 + Math.sin(angle) * radius - 2,
      4,
      4,
    );
  }
  ctx.restore();
}

function drawCellBar(ctx, x, y, count, filled, color, label, align = "left") {
  const cellWidth = 30;
  const gap = 6;
  const width = count * cellWidth + (count - 1) * gap;
  const startX = align === "center" ? x - width / 2 : x;
  ctx.save();
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = align === "center" ? "center" : "left";
  ctx.fillText(label, align === "center" ? x : startX, y - 9);
  for (let index = 0; index < count; index += 1) {
    const cellX = startX + index * (cellWidth + gap);
    roundedRect(ctx, cellX, y, cellWidth, 11, 3);
    ctx.fillStyle = index < filled ? color : "rgba(199,232,235,.1)";
    ctx.fill();
    ctx.strokeStyle = index < filled ? "rgba(247,244,223,.72)" : "rgba(199,232,235,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function drawHud(ctx, state) {
  drawPanel(ctx, 28, 24, 230, 76, "rgba(56,239,240,.24)");
  drawCellBar(ctx, 48, 61, CONFIG.playerMaxShield, state.player.shield, COLORS.cyan, "PLAYER SHIELD");

  drawPanel(ctx, 480, 18, 320, 88, "rgba(255,214,107,.22)");
  drawCellBar(
    ctx,
    VIEW.centerX,
    58,
    CONFIG.bossMaxCore,
    state.boss.coreHp,
    state.boss.coreOpen ? COLORS.gold : COLORS.platinum,
    state.boss.coreOpen ? "CORE EXPOSED — 직접 공격" : "AI CORE / ARMORED",
    "center",
  );

  drawPanel(ctx, 1008, 24, 244, 92, "rgba(240,68,189,.22)");
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.text;
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.fillText(`ROUND ${state.round}`, 1230, 53);
  ctx.font = "700 15px ui-monospace, monospace";
  ctx.fillStyle = COLORS.cyanPale;
  ctx.fillText(`${String(state.stats.score).padStart(5, "0")} PTS`, 1230, 78);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "650 12px system-ui, sans-serif";
  ctx.fillText(`${formatTime(state.elapsed)}  ·  OUTSMART ${state.stats.outsmarts}`, 1230, 99);
  ctx.restore();
}

function phasePrompt(state) {
  switch (state.phase) {
    case PHASE.ENGAGE:
      return "장갑을 직접 확인하라 — 주황 경고에는 횡대시";
    case PHASE.EXPLORE:
      return "탐색 베기 · 좌우로 대시해 흔적을 남겨라";
    case PHASE.EXPLORE_RECOVER:
      return "AI가 다음 표본을 찾는다";
    case PHASE.COMBINE:
      return "세 기억이 하나의 미래로 결합된다";
    case PHASE.LOCK:
    case PHASE.RELOCK:
      return "LOCK · 자홍 예측은 고정됐다";
    case PHASE.PREDICTION:
      return "자홍 예측이 고정됐다 · 선택하라";
    case PHASE.CORE_OPEN:
      return state.phaseTime <= 0.6
        ? "장갑 복귀 · 지금 이탈!"
        : "코어 노출 · 가까이서 직접 공격!";
    case PHASE.ROUND_CLEAR:
      return "AI가 새 장갑을 재구성한다";
    default:
      return "";
  }
}

function drawPrompt(ctx, state) {
  const text = phasePrompt(state);
  if (!text || state.phase === PHASE.GAME_OVER) return;
  ctx.save();
  ctx.font = "750 14px system-ui, sans-serif";
  const width = Math.min(560, ctx.measureText(text).width + 52);
  drawPanel(ctx, VIEW.centerX - width / 2, 659, width, 38, "rgba(199,232,235,.2)");
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, VIEW.centerX, 678);
  ctx.restore();
}

function drawBanner(ctx, state) {
  const banner = state.visual.banner;
  if (!banner || state.phase === PHASE.GAME_OVER) return;
  const toneColor =
    banner.tone === "success"
      ? COLORS.platinum
      : banner.tone === "danger"
        ? COLORS.danger
        : banner.tone === "lock" || banner.tone === "prediction"
          ? COLORS.magenta
          : COLORS.cyanPale;
  const alpha = Math.min(1, Math.max(0, banner.remaining * 4));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = toneColor;
  ctx.shadowColor = toneColor;
  ctx.shadowBlur = 18;
  ctx.font = "900 36px system-ui, sans-serif";
  ctx.fillText(banner.text, VIEW.centerX, 150);
  ctx.shadowBlur = 0;
  if (banner.subtext) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "650 14px system-ui, sans-serif";
    ctx.fillText(banner.subtext, VIEW.centerX, 177);
  }
  ctx.restore();
}

function drawEventToast(ctx, toast) {
  if (!toast) return;
  const color =
    toast.tone === "danger"
      ? COLORS.danger
      : toast.tone === "success"
        ? COLORS.platinum
        : toast.tone === "armor"
          ? COLORS.cyan
          : COLORS.magenta;
  ctx.save();
  ctx.globalAlpha = toast.alpha;
  roundedRect(ctx, VIEW.centerX - 205, 121, 410, toast.subtext ? 68 : 52, 10);
  ctx.fillStyle = "rgba(3,6,10,.86)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.font = "900 27px system-ui, sans-serif";
  ctx.fillText(toast.text, VIEW.centerX, 154);
  ctx.shadowBlur = 0;
  if (toast.subtext) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "650 12px system-ui, sans-serif";
    ctx.fillText(toast.subtext, VIEW.centerX, 177);
  }
  ctx.restore();
}

function deathTitle(death) {
  if (!death) return "분석 완료";
  if (death.kind === "read") return "당신의 습관을 읽혔다";
  if (death.kind === "greed") return "한 번 더가 패배가 됐다";
  return `${death.attackName || "공격"}에 쓰러졌다`;
}

function drawDeathMemory(ctx, state, x, y) {
  const memory = state.death?.memory ?? [];
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "800 18px system-ui, sans-serif";
  for (let index = 0; index < 3; index += 1) {
    const side = memory[index];
    const cellX = x + index * 54;
    roundedRect(ctx, cellX, y, 44, 40, 8);
    ctx.fillStyle = side ? "rgba(56,239,240,.18)" : "rgba(199,232,235,.05)";
    ctx.fill();
    ctx.strokeStyle = side ? COLORS.cyan : "rgba(199,232,235,.18)";
    ctx.stroke();
    if (side) {
      ctx.fillStyle = COLORS.cyanPale;
      ctx.fillText(side === "left" ? "←" : "→", cellX + 22, y + 21);
    }
  }
  ctx.restore();
}

function drawGameOver(ctx, state, best = null) {
  const readDeath = state.death?.kind === "read";
  ctx.save();
  ctx.fillStyle = "rgba(2,4,8,.73)";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawPanel(ctx, 330, 138, 620, 470, "rgba(255,93,98,.48)");

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.danger;
  ctx.font = "900 17px system-ui, sans-serif";
  ctx.fillText("ANALYSIS COMPLETE", VIEW.centerX, 180);
  ctx.fillStyle = COLORS.platinum;
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.fillText(deathTitle(state.death), VIEW.centerX, 226);

  const predicted = state.death?.predictedSide;
  const actual = state.death?.actualSide;
  if (readDeath) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "650 13px system-ui, sans-serif";
    ctx.fillText("AI가 기억한 세 번의 횡대시", VIEW.centerX, 264);
    drawDeathMemory(ctx, state, VIEW.centerX - 76, 279);
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(
      `예측 ${SIDE_LABEL[predicted] || "-"}${actual ? `  ·  실제 ${SIDE_LABEL[actual]}` : ""}`,
      VIEW.centerX,
      349,
    );
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "750 12px system-ui, sans-serif";
    ctx.fillText("치명타 충돌 근거", VIEW.centerX, 275);
    ctx.fillStyle = COLORS.orange;
    ctx.font = "850 22px system-ui, sans-serif";
    ctx.fillText(state.death?.attackName || "전장 공격", VIEW.centerX, 310);
    ctx.fillStyle = COLORS.text;
    ctx.font = "650 13px system-ui, sans-serif";
    ctx.fillText(
      state.death?.kind === "greed"
        ? "코어가 닫힐 때 장갑 복귀 충격 범위 안에 남아 있었다"
        : "바닥에 표시된 위험 범위와 실제 플레이어 위치가 겹쳤다",
      VIEW.centerX,
      343,
    );
  }

  roundedRect(ctx, 390, 371, 500, 66, 10);
  ctx.fillStyle = "rgba(240,68,189,.1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(240,68,189,.42)";
  ctx.stroke();
  ctx.fillStyle = COLORS.magenta;
  ctx.font = "800 12px system-ui, sans-serif";
  ctx.fillText("다음 판에 바꿀 한 가지", VIEW.centerX, 396);
  ctx.fillStyle = COLORS.platinum;
  ctx.font = "800 17px system-ui, sans-serif";
  ctx.fillText(state.death?.tip || "경고 구역을 보고 대시", VIEW.centerX, 421);

  ctx.fillStyle = COLORS.text;
  ctx.font = "750 13px ui-monospace, monospace";
  ctx.fillText(
    `도달 ROUND ${state.round}  ·  CORE ${state.boss.coreHp}/${CONFIG.bossMaxCore}  ·  ${state.stats.score} PTS  ·  ${formatTime(state.elapsed)}  ·  OUTSMART ${state.stats.outsmarts}`,
    VIEW.centerX,
    473,
  );
  if (best) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "650 12px system-ui, sans-serif";
    ctx.fillText(
      `최고 기록  R${best.currentRound || 1} · ${best.score || 0}점 · ${best.outsmarts || 0}회 속임`,
      VIEW.centerX,
      500,
    );
  }

  const remaining = Math.max(0, CONFIG.restartDelay - state.gameOverElapsed);
  if (remaining > 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "750 15px system-ui, sans-serif";
    ctx.fillText(`재시작 준비 ${remaining.toFixed(1)}초`, VIEW.centerX, 554);
  } else {
    roundedRect(ctx, 433, 526, 414, 55, 10);
    ctx.fillStyle = COLORS.cyan;
    ctx.fill();
    ctx.fillStyle = "#031011";
    ctx.font = "900 17px system-ui, sans-serif";
    ctx.fillText("ENTER / SPACE · 다시 속이기", VIEW.centerX, 554);
  }
  ctx.restore();
}

function drawWaitingScene(ctx, now) {
  const stateLike = {
    player: { x: CONFIG.playerStartX, y: CONFIG.playerStartY },
    boss: { x: CONFIG.bossX, y: CONFIG.bossY, coreOpen: false },
    memory: [],
    phase: PHASE.WAITING,
    lock: null,
    explore: null,
    timers: { invulnerable: 0 },
    visual: { attack: null },
  };
  drawBoss(ctx, stateLike, now);
  drawPlayer(ctx, stateLike, now);
}

export function renderGame(ctx, state, { now = 0, best = null, eventToast = null } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawArena(ctx, now);

  if (state.phase === PHASE.WAITING) {
    drawWaitingScene(ctx, now);
    ctx.restore();
    return;
  }

  drawExploreWarning(ctx, state, now);
  drawArmorShockWarning(ctx, state, now);
  drawLockPrediction(ctx, state, now);
  drawDashTrail(ctx, state);
  drawBoss(ctx, state, now);
  drawPlayer(ctx, state, now);
  drawImpact(ctx, state, now);
  drawHud(ctx, state);
  drawPrompt(ctx, state);
  if (eventToast) drawEventToast(ctx, eventToast);
  else drawBanner(ctx, state);
  if (state.phase === PHASE.GAME_OVER) drawGameOver(ctx, state, best);
  ctx.restore();
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("Canvas element is required");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  const seenEvents = new Set();
  let activeToast = null;

  function toastForEvents(events, now) {
    let selected = null;
    const options = {
      remember: (event) => ({
        priority: 20,
        text: `REMEMBER ${event.memory?.length || 0}/3`,
        subtext: `${SIDE_LABEL[event.side] || "횡"}대시가 보스의 기억 조각으로 접혔다`,
        tone: "memory",
      }),
      armor_hit: () => ({
        priority: 35,
        text: "ARMORED · 피해 0",
        subtext: "닫힌 장갑에는 코어 피해가 들어가지 않는다",
        tone: "armor",
      }),
      core_hit: (event) => ({
        priority: 45,
        text: "CORE -1",
        subtext: `직접 타격 · 남은 코어 ${event.hp}/${CONFIG.bossMaxCore}`,
        tone: "success",
      }),
      player_hit: (event) => ({
        priority: 55,
        text: "SHIELD -1",
        subtext: `남은 보호막 ${event.shield}/${CONFIG.playerMaxShield}`,
        tone: "danger",
      }),
      outsmart: () => ({
        priority: 90,
        text: "OUTSMART",
        subtext: "AI가 빈 예측을 내려쳤다 · 열린 코어를 직접 베어라",
        tone: "success",
      }),
      read: (event) => ({
        priority: 100,
        text: "READ",
        subtext: `예측과 실제가 모두 ${SIDE_LABEL[event.side] || "같은 측면"}이었다`,
        tone: "danger",
      }),
      round_clear: (event) => ({
        priority: 95,
        text: `ROUND ${event.round} CLEAR`,
        subtext: "AI가 더 빠른 장갑으로 재구성된다",
        tone: "success",
      }),
    };

    for (const event of events || []) {
      const key = `${event.id}:${event.type}`;
      if (seenEvents.has(key)) continue;
      seenEvents.add(key);
      const makeToast = options[event.type];
      if (!makeToast) continue;
      const candidate = makeToast(event);
      if (!selected || candidate.priority >= selected.priority) selected = candidate;
    }
    if (seenEvents.size > 300) seenEvents.clear();
    if (selected) activeToast = { ...selected, expiresAt: now + 0.82 };
    if (!activeToast || now >= activeToast.expiresAt) {
      activeToast = null;
      return null;
    }
    return {
      ...activeToast,
      alpha: Math.min(1, Math.max(0, (activeToast.expiresAt - now) * 5)),
    };
  }

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
    const now = options.now || 0;
    const eventToast = toastForEvents(state.events, now);
    renderGame(ctx, state, { ...options, eventToast });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { render, resize };
}

export const RENDER_SIZE = Object.freeze({ width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT });
