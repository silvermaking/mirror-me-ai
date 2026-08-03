export const SIDE = Object.freeze({ LEFT: "left", RIGHT: "right" });

export const PHASE = Object.freeze({
  WAITING: "waiting",
  ENGAGE: "engage",
  EXPLORE: "explore",
  EXPLORE_RECOVER: "explore_recover",
  COMBINE: "combine",
  LOCK: "lock",
  PREDICTION: "prediction",
  RELOCK: "relock",
  CORE_OPEN: "core_open",
  ROUND_CLEAR: "round_clear",
  GAME_OVER: "game_over",
});

export const CONFIG = Object.freeze({
  arenaRadiusX: 430,
  arenaRadiusY: 270,
  bossX: 0,
  bossY: -120,
  bossRadius: 78,
  playerStartX: 0,
  playerStartY: 112,
  playerRadius: 17,
  playerSpeed: 245,
  dashDistance: 94,
  dashCooldown: 0.32,
  attackCooldown: 0.46,
  attackRange: 142,
  maxCoreHitsPerWindow: 3,
  greedyExitDuration: 0.38,
  decisionDashTrailDuration: 2.2,
  armorShockRadius: 248,
  exploreLaneHalfWidth: 38,
  lockZoneRadiusX: 78,
  lockZoneRadiusY: 58,
  engageDuration: 0.55,
  exploreRecoverDuration: 0.16,
  combineDuration: 0.55,
  roundClearDuration: 1.15,
  restartDelay: 1.25,
  bannerDuration: 0.9,
  playerMaxShield: 3,
  bossMaxCore: 6,
});

const ACTIVE_PHASES = new Set([
  PHASE.ENGAGE,
  PHASE.EXPLORE,
  PHASE.EXPLORE_RECOVER,
  PHASE.COMBINE,
  PHASE.LOCK,
  PHASE.PREDICTION,
  PHASE.RELOCK,
  PHASE.CORE_OPEN,
]);

const oppositeSide = (side) =>
  side === SIDE.LEFT ? SIDE.RIGHT : SIDE.LEFT;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : null;
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function cloneState(state) {
  return {
    ...state,
    player: { ...state.player, lastMove: { ...state.player.lastMove } },
    boss: { ...state.boss },
    memory: [...state.memory],
    stats: { ...state.stats },
    timers: { ...state.timers },
    explore: state.explore ? { ...state.explore } : null,
    lock: state.lock
      ? {
          ...state.lock,
          origin: { ...state.lock.origin },
          zone: { ...state.lock.zone },
        }
      : null,
    decision: state.decision
      ? {
          ...state.decision,
          landing: state.decision.landing
            ? { ...state.decision.landing }
            : null,
        }
      : null,
    death: state.death
      ? { ...state.death, memory: [...state.death.memory] }
      : null,
    visual: {
      ...state.visual,
      lastDash: state.visual.lastDash
        ? {
            ...state.visual.lastDash,
            from: { ...state.visual.lastDash.from },
            to: { ...state.visual.lastDash.to },
          }
        : null,
      attack: state.visual.attack ? { ...state.visual.attack } : null,
      impact: state.visual.impact ? { ...state.visual.impact } : null,
      banner: state.visual.banner ? { ...state.visual.banner } : null,
    },
    events: [],
  };
}

function emit(state, type, detail = {}) {
  state.eventSerial += 1;
  state.events.push({ id: state.eventSerial, type, ...detail });
}

function setBanner(state, text, tone = "neutral", subtext = "") {
  state.visual.banner = {
    text,
    tone,
    subtext,
    remaining: CONFIG.bannerDuration,
  };
}

export function majoritySide(memory) {
  if (!Array.isArray(memory) || memory.length < 3) return null;
  const recent = memory.slice(-3);
  const rightCount = recent.filter((side) => side === SIDE.RIGHT).length;
  return rightCount >= 2 ? SIDE.RIGHT : SIDE.LEFT;
}

export function classifyLateralDash(dx, dy) {
  if (Math.abs(dx) < 0.001 || Math.abs(dx) < Math.abs(dy) * 0.55) {
    return null;
  }
  return dx < 0 ? SIDE.LEFT : SIDE.RIGHT;
}

export function resolvePrediction(predictedSide, actualSide, insideLockedZone) {
  if (!actualSide) return "execution_hit";
  if (actualSide === oppositeSide(predictedSide) && !insideLockedZone) {
    return "outsmart";
  }
  if (actualSide === predictedSide && insideLockedZone) return "read";
  if (insideLockedZone) return "execution_hit";
  return "neutral";
}

export function timingForRound(round) {
  const tier = Math.max(0, round - 1);
  return {
    explore: Math.max(0.82, 1.12 - tier * 0.035),
    lock: Math.max(0.42, 0.62 - tier * 0.018),
    relock: Math.max(0.34, 0.48 - tier * 0.012),
    prediction: Math.max(0.72, 1.05 - tier * 0.025),
    coreOpen: Math.max(1.62, 2.15 - tier * 0.045),
  };
}

export function createGameState({ started = false } = {}) {
  const state = {
    phase: started ? PHASE.ENGAGE : PHASE.WAITING,
    phaseTime: started ? CONFIG.engageDuration : 0,
    elapsed: 0,
    round: 1,
    completedRounds: 0,
    player: {
      x: CONFIG.playerStartX,
      y: CONFIG.playerStartY,
      shield: CONFIG.playerMaxShield,
      lastMove: { x: 0, y: -1 },
    },
    boss: {
      x: CONFIG.bossX,
      y: CONFIG.bossY,
      coreHp: CONFIG.bossMaxCore,
      coreOpen: false,
    },
    memory: [],
    predictedSide: null,
    explore: null,
    lock: null,
    decision: null,
    prematureSide: null,
    pendingOutsmart: false,
    coreHitsThisWindow: 0,
    roundHitsTaken: 0,
    stats: {
      score: 0,
      outsmarts: 0,
      coreHits: 0,
    },
    timers: {
      dashCooldown: 0,
      attackCooldown: 0,
      invulnerable: 0,
    },
    visual: {
      lastDash: null,
      attack: null,
      impact: null,
      banner: null,
      shake: 0,
    },
    death: null,
    gameOverElapsed: 0,
    eventSerial: 0,
    events: [],
  };

  return state;
}

export function startRun(state) {
  if (state.phase !== PHASE.WAITING) return state;
  const next = createGameState({ started: true });
  next.eventSerial = state.eventSerial;
  emit(next, "start");
  return next;
}

export function canRestart(state) {
  return (
    state.phase === PHASE.GAME_OVER &&
    state.gameOverElapsed >= CONFIG.restartDelay
  );
}

export function restartRun(state) {
  if (!canRestart(state)) return state;
  const next = createGameState({ started: true });
  next.eventSerial = state.eventSerial;
  emit(next, "restart");
  setBanner(next, "다시 속이기", "success");
  return next;
}

function clampToArena(point) {
  const xLimit = CONFIG.arenaRadiusX - CONFIG.playerRadius;
  const yLimit = CONFIG.arenaRadiusY - CONFIG.playerRadius;
  const normalizedRadius =
    (point.x * point.x) / (xLimit * xLimit) +
    (point.y * point.y) / (yLimit * yLimit);
  if (normalizedRadius <= 1) return point;
  const scale = 1 / Math.sqrt(normalizedRadius);
  return { x: point.x * scale, y: point.y * scale };
}

function movePlayer(state, dx, dy) {
  const clamped = clampToArena({ x: dx, y: dy });
  const bossDx = clamped.x - CONFIG.bossX;
  const bossDy = clamped.y - CONFIG.bossY;
  const bossDistance = Math.hypot(bossDx, bossDy);
  const minimumBossDistance = CONFIG.bossRadius + CONFIG.playerRadius + 5;
  if (bossDistance < minimumBossDistance) {
    const direction =
      normalize(bossDx, bossDy) || normalize(state.player.x, state.player.y) || {
        x: 0,
        y: 1,
      };
    state.player.x = CONFIG.bossX + direction.x * minimumBossDistance;
    state.player.y = CONFIG.bossY + direction.y * minimumBossDistance;
    return;
  }
  state.player.x = clamped.x;
  state.player.y = clamped.y;
}

function beginExplore(state) {
  state.phase = PHASE.EXPLORE;
  state.phaseTime = timingForRound(state.round).explore;
  state.predictedSide = null;
  state.lock = null;
  state.decision = null;
  state.prematureSide = null;
  state.explore = {
    lineX: state.player.x,
    pendingSide: null,
    pendingLandingX: null,
  };
  emit(state, "explore_warning");
}

function beginExploreRecover(state) {
  state.phase = PHASE.EXPLORE_RECOVER;
  state.phaseTime = CONFIG.exploreRecoverDuration;
  state.explore = null;
}

function beginCombine(state) {
  state.predictedSide = majoritySide(state.memory);
  state.phase = PHASE.COMBINE;
  state.phaseTime = CONFIG.combineDuration;
  state.explore = null;
  state.prematureSide = null;
  setBanner(
    state,
    `${state.predictedSide === SIDE.LEFT ? "왼쪽" : "오른쪽"}을 기억했다`,
    "prediction",
    "세 흔적이 하나의 미래로 결합된다",
  );
  emit(state, "combine", { side: state.predictedSide });
}

function lockZoneFromPlayer(state, side) {
  const direction = side === SIDE.LEFT ? -1 : 1;
  return clampToArena({
    x: state.player.x + direction * CONFIG.dashDistance,
    y: state.player.y,
  });
}

function beginLock(state, { relock = false } = {}) {
  const side = state.predictedSide || majoritySide(state.memory);
  state.predictedSide = side;
  state.phase = relock ? PHASE.RELOCK : PHASE.LOCK;
  state.phaseTime = relock
    ? timingForRound(state.round).relock
    : timingForRound(state.round).lock;
  state.lock = {
    side,
    origin: { x: state.player.x, y: state.player.y },
    zone: lockZoneFromPlayer(state, side),
    createdAt: state.elapsed,
  };
  state.decision = { side: null, landing: null };
  if (relock) state.prematureSide = null;
  setBanner(
    state,
    `LOCK: ${side === SIDE.LEFT ? "왼쪽" : "오른쪽"}`,
    "lock",
    "예측은 이제 움직이지 않는다",
  );
  emit(state, "lock", { side, relock });
}

function beginPrediction(state) {
  state.phase = PHASE.PREDICTION;
  state.phaseTime = timingForRound(state.round).prediction;
  emit(state, "prediction_strike", { side: state.predictedSide });
}

function rememberSafeDash(state, side) {
  state.memory = [...state.memory, side].slice(-3);
  emit(state, "remember", { side, memory: [...state.memory] });
}

function insideLockZone(state) {
  if (!state.lock) return false;
  const dx = (state.player.x - state.lock.zone.x) / CONFIG.lockZoneRadiusX;
  const dy = (state.player.y - state.lock.zone.y) / CONFIG.lockZoneRadiusY;
  return dx * dx + dy * dy <= 1;
}

function tipForDeath(kind, attackName) {
  if (kind === "read") return "다음에는 LOCK 뒤 예측 반대 측면으로 대시";
  if (kind === "greed") return "다음에는 두 번 베고 대시로 이탈";
  if (attackName === "판독 공격") return "다음에는 LOCK 뒤 어느 한 측면으로 대시";
  if (attackName === "장갑 복귀 충격") {
    return "다음에는 코어가 닫히기 전에 대시로 거리 확보";
  }
  return "다음에는 주황 경고가 켜지면 어느 한 측면으로 대시";
}

function enterGameOver(state, kind, attackName, actualSide = null) {
  state.phase = PHASE.GAME_OVER;
  state.phaseTime = 0;
  state.boss.coreOpen = false;
  state.pendingOutsmart = false;
  state.gameOverElapsed = 0;
  state.death = {
    kind,
    attackName,
    memory: [...state.memory],
    predictedSide: state.predictedSide,
    actualSide,
    showMemoryEvidence: kind === "read",
    tip: tipForDeath(kind, attackName),
  };
  setBanner(state, "분석 완료", "danger", state.death.tip);
  emit(state, "game_over", { kind, attackName });
}

function damagePlayer(
  state,
  { kind, attackName, actualSide = null, ignoreInvulnerability = false },
) {
  if (
    (!ignoreInvulnerability && state.timers.invulnerable > 0) ||
    state.phase === PHASE.GAME_OVER
  ) {
    return false;
  }
  state.player.shield = Math.max(0, state.player.shield - 1);
  state.roundHitsTaken += 1;
  state.timers.invulnerable = 0.35;
  state.visual.shake = Math.max(state.visual.shake, 0.34);
  state.visual.impact = {
    x: state.player.x,
    y: state.player.y,
    tone: "danger",
    remaining: 0.38,
  };
  emit(state, "player_hit", { kind, shield: state.player.shield });
  if (state.player.shield <= 0) {
    enterGameOver(state, kind, attackName, actualSide);
  }
  return true;
}

function resolveExplore(state) {
  const lineX = state.explore?.lineX ?? state.player.x;
  const pendingSide = state.explore?.pendingSide ?? null;
  const hit =
    !pendingSide ||
    Math.abs(state.player.x - lineX) <= CONFIG.exploreLaneHalfWidth;

  if (hit) {
    damagePlayer(state, {
      kind: "general",
      attackName: "탐색 베기",
      ignoreInvulnerability: true,
    });
    if (state.phase === PHASE.GAME_OVER) return;
  } else if (pendingSide) {
    rememberSafeDash(state, pendingSide);
  }

  if (state.memory.length >= 3) beginCombine(state);
  else beginExploreRecover(state);
}

function openCoreFromOutsmart(state, actualSide) {
  state.phase = PHASE.CORE_OPEN;
  state.phaseTime = timingForRound(state.round).coreOpen;
  state.boss.coreOpen = true;
  state.memory = [actualSide];
  state.pendingOutsmart = true;
  state.coreHitsThisWindow = 0;
  state.prematureSide = null;
  setBanner(
    state,
    "OUTSMART",
    "success",
    "오판으로 열린 코어를 직접 베어 증명하라",
  );
  emit(state, "outsmart", { side: actualSide });
}

function resolveLockedAttack(state) {
  const actualSide = state.decision?.side ?? null;
  const outcome = resolvePrediction(
    state.predictedSide,
    actualSide,
    insideLockZone(state),
  );

  if (outcome === "outsmart") {
    openCoreFromOutsmart(state, actualSide);
    return;
  }

  if (outcome === "read") {
    setBanner(
      state,
      "READ",
      "danger",
      `AI 예측과 실제가 ${actualSide === SIDE.LEFT ? "왼쪽" : "오른쪽"}으로 일치`,
    );
    emit(state, "read", { side: actualSide });
    damagePlayer(state, {
      kind: "read",
      attackName: "판독 공격",
      actualSide,
      ignoreInvulnerability: true,
    });
    if (state.phase !== PHASE.GAME_OVER) beginLock(state, { relock: true });
    return;
  }

  if (outcome === "execution_hit") {
    const rememberedFailureSide = actualSide || state.prematureSide;
    damagePlayer(state, {
      kind: "general",
      attackName: "판독 공격",
      actualSide: rememberedFailureSide,
      ignoreInvulnerability: true,
    });
    if (state.phase === PHASE.GAME_OVER) return;
    state.memory = rememberedFailureSide ? [rememberedFailureSide] : [];
    state.prematureSide = null;
    beginExploreRecover(state);
    return;
  }

  setBanner(state, "예측 유지", "neutral", "공격 구역을 벗어났다");
  emit(state, "prediction_neutral", { side: state.predictedSide });
  beginLock(state, { relock: true });
}

function finishRound(state) {
  const clearedRound = state.round;
  state.stats.score += 1000 * clearedRound;
  if (state.roundHitsTaken === 0) state.stats.score += 500 * clearedRound;
  state.completedRounds = clearedRound;
  state.phase = PHASE.ROUND_CLEAR;
  state.phaseTime = CONFIG.roundClearDuration;
  state.boss.coreOpen = true;
  state.pendingOutsmart = false;
  setBanner(state, `ROUND ${clearedRound} CLEAR`, "success", "AI가 새 장갑을 재구성한다");
  emit(state, "round_clear", { round: clearedRound });
}

function closeCore(state) {
  state.boss.coreOpen = false;
  state.pendingOutsmart = false;
  emit(state, "core_close", { hits: state.coreHitsThisWindow });

  const playerNearCore =
    distance(state.player, state.boss) <= CONFIG.armorShockRadius;
  if (playerNearCore) {
    const kind =
      state.coreHitsThisWindow >= CONFIG.maxCoreHitsPerWindow
        ? "greed"
        : "general";
    damagePlayer(state, {
      kind,
      attackName: "장갑 복귀 충격",
    });
    if (state.phase === PHASE.GAME_OVER) return;
  }
  state.predictedSide = null;
  state.lock = null;
  state.decision = null;
  state.prematureSide = null;
  beginExploreRecover(state);
}

function beginNextRound(state) {
  state.round += 1;
  state.phase = PHASE.ENGAGE;
  state.phaseTime = CONFIG.engageDuration * 0.75;
  state.player.x = CONFIG.playerStartX;
  state.player.y = CONFIG.playerStartY;
  if (state.roundHitsTaken === 0) {
    state.player.shield = Math.min(
      CONFIG.playerMaxShield,
      state.player.shield + 1,
    );
  }
  state.boss.coreHp = CONFIG.bossMaxCore;
  state.boss.coreOpen = false;
  state.roundHitsTaken = 0;
  state.predictedSide = null;
  state.lock = null;
  state.decision = null;
  state.prematureSide = null;
  state.pendingOutsmart = false;
  state.coreHitsThisWindow = 0;
  emit(state, "round_start", { round: state.round });
}

function performDash(state, moveX, moveY) {
  if (!ACTIVE_PHASES.has(state.phase) || state.timers.dashCooldown > 0) {
    return;
  }
  const direction =
    normalize(moveX, moveY) || normalize(state.player.lastMove.x, state.player.lastMove.y);
  if (!direction) return;

  const from = { x: state.player.x, y: state.player.y };
  const proposed = {
    x: from.x + direction.x * CONFIG.dashDistance,
    y: from.y + direction.y * CONFIG.dashDistance,
  };
  movePlayer(state, proposed.x, proposed.y);
  const to = { x: state.player.x, y: state.player.y };
  // The arena can clamp an intended dash to almost zero displacement at an edge.
  // Learning still uses the player's explicit lateral intent, while collision and
  // landing checks continue to use the real clamped `to` position.
  const side = classifyLateralDash(direction.x, direction.y);
  const isDecisionDash =
    state.phase === PHASE.LOCK ||
    state.phase === PHASE.RELOCK ||
    state.phase === PHASE.PREDICTION;
  const trailDuration = isDecisionDash
    ? CONFIG.decisionDashTrailDuration
    : 0.48;

  state.timers.dashCooldown = CONFIG.dashCooldown;
  state.timers.invulnerable = Math.max(state.timers.invulnerable, 0.17);
  state.visual.lastDash = {
    from,
    to,
    side,
    duration: trailDuration,
    remaining: trailDuration,
  };
  emit(state, "dash", { side, from, to });

  if (state.phase === PHASE.EXPLORE && state.explore && !state.explore.pendingSide) {
    const landingSide =
      Math.abs(to.x - state.explore.lineX) >= 18
        ? to.x < state.explore.lineX
          ? SIDE.LEFT
          : SIDE.RIGHT
        : null;
    if (side && landingSide === side) {
      state.explore.pendingSide = side;
      state.explore.pendingLandingX = to.x;
    }
  }

  if (state.phase === PHASE.COMBINE && side && !state.prematureSide) {
    state.prematureSide = side;
    emit(state, "premature_dash", { side });
  }

  if (
    (state.phase === PHASE.LOCK ||
      state.phase === PHASE.RELOCK ||
      state.phase === PHASE.PREDICTION) &&
    state.decision &&
    !state.decision.side &&
    side
  ) {
    state.decision.side = side;
    state.decision.landing = to;
    state.prematureSide = null;
  }
}

function performAttack(state) {
  if (!ACTIVE_PHASES.has(state.phase) || state.timers.attackCooldown > 0) {
    return;
  }
  state.timers.attackCooldown = CONFIG.attackCooldown;
  const targetDistance = distance(state.player, state.boss);
  const inRange = targetDistance <= CONFIG.attackRange;
  const directCoreHit =
    state.phase === PHASE.CORE_OPEN &&
    inRange &&
    state.coreHitsThisWindow < CONFIG.maxCoreHitsPerWindow;

  state.visual.attack = {
    hit: directCoreHit,
    armor: !state.boss.coreOpen && inRange,
    remaining: 0.24,
  };
  emit(state, "attack", { hit: directCoreHit, inRange });

  if (!directCoreHit) {
    if (inRange && !state.boss.coreOpen) {
      state.visual.impact = {
        x: state.boss.x,
        y: state.boss.y + CONFIG.bossRadius * 0.55,
        tone: "armor",
        remaining: 0.24,
      };
      emit(state, "armor_hit");
    }
    return;
  }

  if (state.pendingOutsmart) {
    state.pendingOutsmart = false;
    state.stats.outsmarts += 1;
    state.stats.score += 250 * state.round;
    emit(state, "outsmart_confirmed", {
      count: state.stats.outsmarts,
      score: state.stats.score,
    });
  }

  state.boss.coreHp = Math.max(0, state.boss.coreHp - 1);
  state.coreHitsThisWindow += 1;
  state.stats.coreHits += 1;
  state.stats.score += 100 * state.round;
  state.visual.shake = Math.max(state.visual.shake, 0.16);
  state.visual.impact = {
    x: state.boss.x,
    y: state.boss.y,
    tone: "core",
    remaining: 0.3,
  };
  emit(state, "core_hit", {
    hp: state.boss.coreHp,
    windowHits: state.coreHitsThisWindow,
  });

  if (
    state.coreHitsThisWindow >= CONFIG.maxCoreHitsPerWindow &&
    state.boss.coreHp > 0
  ) {
    state.phaseTime = Math.min(state.phaseTime, CONFIG.greedyExitDuration);
    emit(state, "greed_window", { remaining: state.phaseTime });
  }

  if (state.boss.coreHp <= 0) finishRound(state);
}

function updateVisualTimers(state, dt) {
  for (const key of ["lastDash", "attack", "impact", "banner"]) {
    const value = state.visual[key];
    if (!value) continue;
    value.remaining -= dt;
    if (value.remaining <= 0) state.visual[key] = null;
  }
  state.visual.shake = Math.max(0, state.visual.shake - dt);
}

function updateCooldowns(state, dt) {
  for (const key of Object.keys(state.timers)) {
    state.timers[key] = Math.max(0, state.timers[key] - dt);
  }
}

function updateActivePhase(state, dt) {
  state.phaseTime -= dt;
  if (state.phaseTime > 0 || state.phase === PHASE.GAME_OVER) return;

  switch (state.phase) {
    case PHASE.ENGAGE:
      beginExplore(state);
      break;
    case PHASE.EXPLORE:
      resolveExplore(state);
      break;
    case PHASE.EXPLORE_RECOVER:
      beginExplore(state);
      break;
    case PHASE.COMBINE:
      beginLock(state);
      break;
    case PHASE.LOCK:
    case PHASE.RELOCK:
      beginPrediction(state);
      break;
    case PHASE.PREDICTION:
      resolveLockedAttack(state);
      break;
    case PHASE.CORE_OPEN:
      closeCore(state);
      break;
    case PHASE.ROUND_CLEAR:
      beginNextRound(state);
      break;
    default:
      break;
  }
}

function processSlice(state, dt, input, oneShot) {
  updateVisualTimers(state, dt);
  updateCooldowns(state, dt);

  if (state.phase === PHASE.GAME_OVER) {
    state.gameOverElapsed += dt;
    return;
  }
  if (!ACTIVE_PHASES.has(state.phase) && state.phase !== PHASE.ROUND_CLEAR) return;

  if (ACTIVE_PHASES.has(state.phase)) {
    const move = normalize(input.moveX || 0, input.moveY || 0);
    if (move) {
      state.player.lastMove = move;
      const speed = CONFIG.playerSpeed * dt;
      movePlayer(
        state,
        state.player.x + move.x * speed,
        state.player.y + move.y * speed,
      );
    }
    if (oneShot && input.dash) performDash(state, input.moveX || 0, input.moveY || 0);
    if (oneShot && input.attack) performAttack(state);
    state.elapsed += dt;
  }

  updateActivePhase(state, dt);
}

export function updateGame(state, dt, input = {}) {
  if (!Number.isFinite(dt) || dt < 0) return state;
  let next = cloneState(state);

  const hasCombatInput =
    Boolean(input.attack || input.dash) ||
    Math.abs(input.moveX || 0) + Math.abs(input.moveY || 0) > 0;
  if (next.phase === PHASE.WAITING && hasCombatInput) next = startRun(next);
  if (input.restart && canRestart(next)) return restartRun(next);
  if (next.phase === PHASE.WAITING) return next;

  let remaining = Math.min(dt, 1);
  let firstSlice = true;
  if (remaining === 0) {
    processSlice(next, 0, input, true);
    return next;
  }
  while (remaining > 0.000001) {
    const slice = Math.min(remaining, 1 / 60);
    processSlice(next, slice, input, firstSlice);
    firstSlice = false;
    remaining -= slice;
  }
  return next;
}

export function getRunSummary(state) {
  return {
    completedRounds: state.completedRounds,
    currentRound: state.round,
    remainingCore: state.boss.coreHp,
    survivalTime: state.elapsed,
    score: state.stats.score,
    outsmarts: state.stats.outsmarts,
    coreHits: state.stats.coreHits,
  };
}
