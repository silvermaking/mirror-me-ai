import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFIG,
  PHASE,
  SIDE,
  canRestart,
  classifyEscapeSide,
  classifyLateralDash,
  createGameState,
  majoritySide,
  resolvePrediction,
  restartRun,
  startRun,
  updateGame,
} from "../src/game-core.mjs";

function advance(state, seconds, input = {}) {
  let next = state;
  let remaining = seconds;
  while (remaining > 0.0001) {
    const slice = Math.min(0.05, remaining);
    next = updateGame(next, slice, input);
    remaining -= slice;
  }
  return next;
}

function predictionState({
  predicted = SIDE.RIGHT,
  actual = SIDE.LEFT,
  inside = false,
  shield = 3,
} = {}) {
  const state = createGameState({ started: true });
  const zone = { x: 100, y: 80 };
  const outsideX =
    actual === SIDE.LEFT ? -100 : actual === SIDE.RIGHT ? 220 : 0;
  return {
    ...state,
    phase: PHASE.PREDICTION,
    phaseTime: 0.01,
    memory: [predicted, predicted, opposite(predicted)],
    predictedSide: predicted,
    player: {
      ...state.player,
      x: inside ? zone.x : outsideX,
      y: inside ? zone.y : 80,
      shield,
    },
    lock: {
      side: predicted,
      origin: { x: 0, y: 80 },
      zone,
      createdAt: 0,
    },
    decision: {
      side: actual,
      landing: { x: inside ? zone.x : -100, y: 80 },
    },
  };
}

function opposite(side) {
  return side === SIDE.LEFT ? SIDE.RIGHT : SIDE.LEFT;
}

test("최근 세 회피 방향의 2/3가 다음 예측 측면을 결정한다", () => {
  assert.equal(majoritySide([SIDE.RIGHT, SIDE.LEFT]), null);
  assert.equal(
    majoritySide([SIDE.RIGHT, SIDE.LEFT, SIDE.RIGHT]),
    SIDE.RIGHT,
  );
  assert.equal(
    majoritySide([SIDE.RIGHT, SIDE.LEFT, SIDE.LEFT]),
    SIDE.LEFT,
  );
});

test("새 시작과 재시작은 중복 없이 각각 하나의 시작 이벤트만 만든다", () => {
  const waiting = createGameState();
  const started = startRun(waiting);
  assert.deepEqual(
    started.events.map((event) => event.type),
    ["start"],
  );
  assert.equal(new Set(started.events.map((event) => event.id)).size, 1);

  const gameOver = {
    ...started,
    phase: PHASE.GAME_OVER,
    gameOverElapsed: CONFIG.restartDelay,
  };
  const restarted = restartRun(gameOver);
  assert.deepEqual(
    restarted.events.map((event) => event.type),
    ["restart"],
  );
  assert.equal(new Set(restarted.events.map((event) => event.id)).size, 1);
});

test("대시 흔적의 좌우 표시는 횡방향 입력만 분류한다", () => {
  assert.equal(classifyLateralDash(80, 10), SIDE.RIGHT);
  assert.equal(classifyLateralDash(-80, 10), SIDE.LEFT);
  assert.equal(classifyLateralDash(5, -80), null);
});

test("회피 측면은 입력 종류가 아니라 공격 종료 위치로 분류한다", () => {
  assert.equal(classifyEscapeSide(39, 38), SIDE.RIGHT);
  assert.equal(classifyEscapeSide(-39, 38), SIDE.LEFT);
  assert.equal(classifyEscapeSide(38, 38), null);
  assert.equal(classifyEscapeSide(Number.NaN, 38), null);
});

test("탐색 베기는 WASD로 구역 밖에 나가도 안전하고 최종 측면을 기억한다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.EXPLORE,
    phaseTime: 0.2,
    player: { ...base.player, x: 0, y: 100 },
    explore: { lineX: 0, pendingSide: null, pendingLandingX: null },
  };

  state = advance(state, 0.22, { moveX: 1 });
  assert.equal(state.player.shield, 3);
  assert.deepEqual(state.memory, [SIDE.RIGHT]);
});

test("탐색 베기는 같은 종료 위치라면 대시와 대각선 대시도 동일하게 판정한다", () => {
  const base = createGameState({ started: true });
  const makeExplore = () => ({
    ...base,
    phase: PHASE.EXPLORE,
    phaseTime: 0.08,
    player: { ...base.player, x: 0, y: 100 },
    explore: { lineX: 0, pendingSide: null, pendingLandingX: null },
  });

  let lateral = updateGame(makeExplore(), 0.01, {
    moveX: 1,
    dashX: 1,
    dashY: 0,
    dash: true,
  });
  lateral = advance(lateral, 0.1);
  assert.equal(lateral.player.shield, 3);
  assert.deepEqual(lateral.memory, [SIDE.RIGHT]);

  let diagonal = updateGame(makeExplore(), 0.01, {
    moveX: 0,
    moveY: 0,
    dashX: 0.5,
    dashY: -1,
    dash: true,
  });
  assert.equal(classifyLateralDash(0.5, -1), null);
  diagonal = advance(diagonal, 0.1);
  assert.equal(diagonal.player.shield, 3);
  assert.deepEqual(diagonal.memory, [SIDE.RIGHT]);
});

test("탐색 베기 종료점이 주황 구역 안이면 걷기나 수직 대시 모두 피격된다", () => {
  const base = createGameState({ started: true });
  let walking = {
    ...base,
    phase: PHASE.EXPLORE,
    phaseTime: 0.08,
    player: { ...base.player, x: 0, y: 100 },
    explore: { lineX: 0, pendingSide: null, pendingLandingX: null },
  };
  walking = advance(walking, 0.1, { moveX: 0.1 });
  assert.equal(walking.player.shield, 2);
  assert.deepEqual(walking.memory, []);

  let vertical = {
    ...base,
    phase: PHASE.EXPLORE,
    phaseTime: 0.08,
    player: { ...base.player, x: 0, y: 100 },
    explore: { lineX: 0, pendingSide: null, pendingLandingX: null },
  };
  vertical = updateGame(vertical, 0.01, {
    dashX: 0,
    dashY: -1,
    dash: true,
  });
  vertical = advance(vertical, 0.1);
  assert.equal(vertical.player.shield, 2);
  assert.deepEqual(vertical.memory, []);
});

test("LOCK 결과는 고정 구역과 공격 종료 위치만 사용한다", () => {
  assert.equal(
    resolvePrediction(SIDE.RIGHT, SIDE.LEFT, false),
    "outsmart",
  );
  assert.equal(resolvePrediction(SIDE.RIGHT, SIDE.RIGHT, true), "read");
  assert.equal(resolvePrediction(SIDE.RIGHT, SIDE.RIGHT, false), "neutral");
  assert.equal(resolvePrediction(SIDE.RIGHT, null, true), "execution_hit");
  assert.equal(resolvePrediction(SIDE.RIGHT, null, false), "neutral");
});

test("판독 동안 대시하지 않아도 고정 구역 밖이면 EVADE로 무피격이다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: null,
    inside: false,
  });
  state = advance(state, 0.03);
  assert.equal(state.player.shield, 3);
  assert.equal(state.phase, PHASE.EXPLORE_RECOVER);
  assert.equal(state.stats.outsmarts, 0);
  assert.ok(state.events.some((event) => event.type === "prediction_neutral"));
});

test("LOCK 반대편으로 WASD 이동해 구역을 벗어나면 OUTSMART가 된다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.PREDICTION,
    phaseTime: 0.3,
    predictedSide: SIDE.RIGHT,
    memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.RIGHT],
    player: { ...base.player, x: 0, y: 80 },
    lock: {
      side: SIDE.RIGHT,
      origin: { x: 0, y: 80 },
      zone: { x: CONFIG.dashDistance, y: 80 },
      createdAt: 0,
    },
    decision: { side: null, landing: null },
  };

  state = advance(state, 0.32, { moveX: -1 });
  assert.equal(state.player.shield, 3);
  assert.equal(state.phase, PHASE.CORE_OPEN);
  assert.equal(state.pendingOutsmart, true);
  assert.deepEqual(state.memory, [SIDE.LEFT]);
});

test("예측과 같은 쪽이어도 고정 구역을 완전히 지나치면 안전한 EVADE다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: SIDE.RIGHT,
    inside: false,
  });
  state = advance(state, 0.03);

  assert.equal(state.player.shield, 3);
  assert.equal(state.phase, PHASE.EXPLORE_RECOVER);
  assert.equal(state.stats.outsmarts, 0);
  assert.deepEqual(state.memory, [SIDE.RIGHT]);
});

test("대시 방향과 현재 WASD 이동은 분리되고 대시는 무적을 부여하지 않는다", () => {
  const base = createGameState({ started: true });
  const captured = updateGame(base, 0.01, {
    moveX: -1,
    moveY: 0,
    dashX: 1,
    dashY: 0,
    dash: true,
  });

  assert.ok(captured.player.x > 80);
  assert.equal(captured.timers.invulnerable, 0);

  const sameFrameDirection = updateGame(base, 0.01, {
    moveX: 1,
    moveY: 0,
    dashX: 0,
    dashY: 0,
    dash: true,
  });
  assert.ok(sameFrameDirection.player.x > 80);
});

test("피격이 난 update의 남은 이동을 중단해 화면 위치와 판정 위치를 맞춘다", () => {
  const base = createGameState({ started: true });
  const state = updateGame(
    {
      ...base,
      phase: PHASE.EXPLORE,
      phaseTime: 0.01,
      player: { ...base.player, x: 20, y: 100 },
      explore: { lineX: 0, pendingSide: null, pendingLandingX: null },
    },
    0.1,
    { moveX: 1 },
  );

  assert.equal(state.player.shield, 2);
  assert.ok(state.player.x <= CONFIG.exploreLaneHalfWidth);
  assert.ok(state.events.some((event) => event.type === "player_hit"));
});

test("LOCK 뒤 플레이어가 움직여도 예측 착지 구역은 바뀌지 않는다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.LOCK,
    phaseTime: 0.5,
    memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.LEFT],
    predictedSide: SIDE.RIGHT,
    lock: {
      side: SIDE.RIGHT,
      origin: { x: 0, y: 100 },
      zone: { x: CONFIG.dashDistance, y: 100 },
      createdAt: 0,
    },
    decision: { side: null, landing: null },
  };
  const lockedZone = { ...state.lock.zone };

  state = advance(state, 0.3, { moveX: -1, moveY: -1 });
  assert.notEqual(state.player.x, CONFIG.playerStartX);
  assert.deepEqual(state.lock.zone, lockedZone);
});

test("OUTSMART는 코어만 열고 직접 타격 전에는 HP와 기록을 바꾸지 않는다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: SIDE.LEFT,
    inside: false,
  });
  state = advance(state, 0.03);

  assert.equal(state.phase, PHASE.CORE_OPEN);
  assert.equal(state.boss.coreOpen, true);
  assert.equal(state.boss.coreHp, CONFIG.bossMaxCore);
  assert.equal(state.pendingOutsmart, true);
  assert.equal(state.stats.outsmarts, 0);
  assert.equal(state.stats.score, 0);
  assert.deepEqual(state.memory, [SIDE.LEFT]);
});

test("코어를 공격하지 않은 OUTSMART 반복으로 점수와 횟수를 파밍할 수 없다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: SIDE.LEFT,
    inside: false,
  });
  state = advance(state, 0.03);
  state = {
    ...state,
    player: { ...state.player, x: 390, y: 0 },
  };
  state = advance(state, 2.3);

  assert.notEqual(state.phase, PHASE.CORE_OPEN);
  assert.equal(state.boss.coreHp, CONFIG.bossMaxCore);
  assert.equal(state.pendingOutsmart, false);
  assert.equal(state.stats.outsmarts, 0);
  assert.equal(state.stats.score, 0);
});

test("첫 직접 코어 타격만 OUTSMART를 확정하고 후속 타격은 중복 집계하지 않는다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: SIDE.LEFT,
    inside: false,
  });
  state = advance(state, 0.03);
  state = {
    ...state,
    player: { ...state.player, x: 0, y: 0 },
  };

  state = updateGame(state, 0.01, { attack: true });
  assert.equal(state.boss.coreHp, 5);
  assert.equal(state.stats.outsmarts, 1);
  assert.equal(state.stats.coreHits, 1);
  assert.equal(state.stats.score, 350);

  state = advance(state, CONFIG.attackCooldown + 0.02);
  state = updateGame(state, 0.01, { attack: true });
  assert.equal(state.boss.coreHp, 4);
  assert.equal(state.stats.outsmarts, 1);
  assert.equal(state.stats.coreHits, 2);
  assert.equal(state.stats.score, 450);
});

test("한 코어 노출은 최대 세 타격이며 세 번째 뒤에만 0.38초 이탈 압박이 시작된다", () => {
  const base = createGameState({ started: true });
  const exposed = {
    ...base,
    phase: PHASE.CORE_OPEN,
    phaseTime: 2,
    player: { ...base.player, x: 0, y: 0 },
    boss: { ...base.boss, coreOpen: true, coreHp: 6 },
    pendingOutsmart: false,
    coreHitsThisWindow: 0,
  };

  let safe = updateGame(exposed, 0.01, { attack: true });
  safe = { ...safe, timers: { ...safe.timers, attackCooldown: 0 } };
  safe = updateGame(safe, 0.01, { attack: true });
  assert.equal(safe.coreHitsThisWindow, 2);
  assert.ok(safe.phaseTime > 1.9, "two hits must preserve the normal escape window");

  let greedy = { ...safe, timers: { ...safe.timers, attackCooldown: 0 } };
  greedy = updateGame(greedy, 0.01, { attack: true });
  assert.equal(greedy.coreHitsThisWindow, 3);
  assert.equal(greedy.boss.coreHp, 3);
  assert.ok(greedy.phaseTime <= CONFIG.greedyExitDuration);
  assert.ok(greedy.phaseTime > 0.35);

  const scoreAfterThree = greedy.stats.score;
  greedy = { ...greedy, timers: { ...greedy.timers, attackCooldown: 0 } };
  greedy = updateGame(greedy, 0.01, { attack: true });
  assert.equal(greedy.coreHitsThisWindow, 3);
  assert.equal(greedy.boss.coreHp, 3);
  assert.equal(greedy.stats.score, scoreAfterThree);

  greedy = advance(greedy, CONFIG.greedyExitDuration + 0.02);
  assert.equal(greedy.player.shield, 2);
  assert.notEqual(greedy.phase, PHASE.CORE_OPEN);
});

test("LOCK 판독 대시 흔적은 결과와 함께 보이도록 최소 2.2초 유지된다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.PREDICTION,
    phaseTime: 2,
    predictedSide: SIDE.RIGHT,
    lock: {
      side: SIDE.RIGHT,
      origin: { x: 0, y: 100 },
      zone: { x: CONFIG.dashDistance, y: 100 },
      createdAt: 0,
    },
    decision: { side: null, landing: null },
  };
  state = updateGame(state, 0.01, { moveX: -1, dash: true });
  assert.equal(state.visual.lastDash.duration, CONFIG.decisionDashTrailDuration);
  assert.ok(state.visual.lastDash.remaining > 2.1);
  state = advance(state, 1);
  assert.ok(state.visual.lastDash?.remaining > 1);
});

test("COMBINE 중 이동은 처벌하지 않고 LOCK 순간의 위치를 새 원점으로 삼는다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.COMBINE,
    phaseTime: 0.04,
    memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.RIGHT],
    predictedSide: SIDE.RIGHT,
    prematureSide: null,
  };

  state = updateGame(state, 0.01, {
    moveX: 0,
    dashX: -1,
    dashY: 0,
    dash: true,
  });
  const movedX = state.player.x;
  assert.equal(state.prematureSide, null);
  state = advance(state, 0.04);

  assert.equal(state.phase, PHASE.LOCK);
  assert.equal(state.player.shield, 3);
  assert.equal(state.stats.outsmarts, 0);
  assert.equal(state.boss.coreOpen, false);
  assert.ok(Math.abs(state.lock.origin.x - movedX) < 0.001);
});

test("일반 사망 조언은 마지막 실제 공격 원인마다 다르다", () => {
  const base = createGameState({ started: true });

  let predictionDeath = predictionState({
    predicted: SIDE.RIGHT,
    actual: null,
    inside: true,
    shield: 1,
  });
  predictionDeath = {
    ...predictionDeath,
    lock: {
      ...predictionDeath.lock,
      origin: { ...predictionDeath.lock.zone },
    },
  };
  predictionDeath = advance(predictionDeath, 0.03);
  assert.equal(predictionDeath.death.attackName, "판독 공격");
  assert.match(predictionDeath.death.tip, /자홍 위험 구역/);
  assert.equal(predictionDeath.death.showMemoryEvidence, false);

  let exploreDeath = {
    ...base,
    phase: PHASE.EXPLORE,
    phaseTime: 0.01,
    player: { ...base.player, shield: 1 },
    explore: { lineX: base.player.x, pendingSide: null, pendingLandingX: null },
  };
  exploreDeath = advance(exploreDeath, 0.03);
  assert.equal(exploreDeath.death.attackName, "탐색 베기");
  assert.match(exploreDeath.death.tip, /주황 위험 구역/);
  assert.equal(exploreDeath.death.showMemoryEvidence, false);

  let armorDeath = {
    ...base,
    phase: PHASE.CORE_OPEN,
    phaseTime: 0.01,
    player: { ...base.player, x: 0, y: 0, shield: 1 },
    boss: { ...base.boss, coreOpen: true },
    coreHitsThisWindow: 2,
  };
  armorDeath = advance(armorDeath, 0.03);
  assert.equal(armorDeath.death.attackName, "장갑 복귀 충격");
  assert.match(armorDeath.death.tip, /복귀 충격 밖/);
});

test("닫힌 장갑 공격은 직접 맞아도 보스 코어 HP를 줄이지 않는다", () => {
  const base = createGameState({ started: true });
  const state = updateGame(
    {
      ...base,
      player: { ...base.player, x: 0, y: 0 },
    },
    0.01,
    { attack: true },
  );
  assert.equal(state.boss.coreHp, CONFIG.bossMaxCore);
  assert.equal(state.stats.coreHits, 0);
});

test("라운드 완료 점수와 무피격 보너스는 마지막 직접 타격 뒤에 계산된다", () => {
  const base = createGameState({ started: true });
  const almostClear = {
    ...base,
    phase: PHASE.CORE_OPEN,
    phaseTime: 1,
    round: 2,
    player: { ...base.player, x: 0, y: 0 },
    boss: { ...base.boss, coreOpen: true, coreHp: 1 },
    pendingOutsmart: false,
    roundHitsTaken: 0,
  };
  const state = updateGame(almostClear, 0.01, { attack: true });

  assert.equal(state.phase, PHASE.ROUND_CLEAR);
  assert.equal(state.completedRounds, 2);
  assert.equal(state.stats.coreHits, 1);
  assert.equal(state.stats.score, 3200); // 직접 타격 200 + 완료 2000 + 무피격 1000
});

test("라운드 종료 보호막은 무피격 클리어에서만 한 칸 회복한다", () => {
  const base = createGameState({ started: true });
  const roundClear = {
    ...base,
    phase: PHASE.ROUND_CLEAR,
    phaseTime: 0.01,
    player: { ...base.player, shield: 1 },
  };

  const hitClear = advance({ ...roundClear, roundHitsTaken: 1 }, 0.03);
  assert.equal(hitClear.player.shield, 1);

  const flawlessClear = advance({ ...roundClear, roundHitsTaken: 0 }, 0.03);
  assert.equal(flawlessClear.player.shield, 2);
});

test("같은 예측 측면에 세 번 읽히면 보호막 세 칸이 사라져 게임 오버가 된다", () => {
  let state = predictionState({
    predicted: SIDE.RIGHT,
    actual: SIDE.RIGHT,
    inside: true,
  });
  state = advance(state, 0.03);
  assert.equal(state.player.shield, 2);
  assert.equal(state.phase, PHASE.RELOCK);
  assert.deepEqual(state.memory, [SIDE.RIGHT, SIDE.RIGHT, SIDE.LEFT]);

  for (const expectedShield of [1, 0]) {
    state = advance(state, 0.6);
    assert.equal(state.phase, PHASE.PREDICTION);
    state = updateGame(state, 0.01, {
      moveX: 1,
      moveY: 0,
      dash: true,
    });
    state = advance(state, 1.1);
    assert.equal(state.player.shield, expectedShield);
  }

  assert.equal(state.phase, PHASE.GAME_OVER);
  assert.equal(state.death.kind, "read");
  assert.match(state.death.tip, /예측 반대편/);
});

test("전장 가장자리의 LOCK 구역은 보이는 전장 안에 고정되고 반대편으로 피할 수 있다", () => {
  const base = createGameState({ started: true });
  const edgeX = CONFIG.arenaRadiusX - CONFIG.playerRadius;
  let state = {
    ...base,
    phase: PHASE.COMBINE,
    phaseTime: 0.01,
    memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.RIGHT],
    predictedSide: SIDE.RIGHT,
    player: {
      ...base.player,
      x: edgeX,
      y: 0,
      lastMove: { x: 1, y: 0 },
    },
  };

  state = advance(state, 0.02);
  assert.equal(state.phase, PHASE.LOCK);
  assert.equal(state.lock.origin.x, edgeX);
  assert.ok(state.lock.zone.x <= edgeX);

  state = advance(state, 1.8, { moveX: -1, moveY: 0 });
  assert.equal(state.player.shield, 3);
  assert.equal(state.phase, PHASE.CORE_OPEN);
  assert.equal(state.pendingOutsmart, true);
  assert.equal(state.stats.outsmarts, 0);
});

test("가장자리에서 한쪽으로 강제된 탐색 회피는 안전하지만 AI 표본이 되지 않는다", () => {
  const base = createGameState({ started: true });
  const edgeX = CONFIG.arenaRadiusX - CONFIG.playerRadius;
  const state = advance(
    {
      ...base,
      phase: PHASE.EXPLORE,
      phaseTime: 0.01,
      player: {
        ...base.player,
        x: edgeX - CONFIG.exploreLaneHalfWidth - 20,
        y: 0,
      },
      explore: {
        lineX: edgeX,
        sampleEligible: false,
      },
    },
    0.02,
  );

  assert.equal(state.player.shield, 3);
  assert.deepEqual(state.memory, []);
  assert.equal(state.phase, PHASE.EXPLORE_RECOVER);
  assert.ok(state.events.some((event) => event.type === "evade_unlearned"));
  assert.equal(state.visual.escapeMarker.side, SIDE.LEFT);
});

test("첫 10초 안에 세 기억, LOCK, 반대 대시, 실제 접근과 세 코어 타격이 가능하다", () => {
  let state = createGameState({ started: true });
  let guard = 0;
  const hitTimes = [];
  let previousHits = 0;

  while (state.elapsed < 9.9 && state.stats.coreHits < 3 && guard < 1000) {
    const input = {};
    if (
      state.phase === PHASE.EXPLORE &&
      Math.abs(state.player.x - state.explore.lineX) <=
        CONFIG.exploreLaneHalfWidth &&
      state.timers.dashCooldown === 0
    ) {
      input.dashX = 1;
      input.dashY = 0;
      input.dash = true;
    } else if (
      (state.phase === PHASE.LOCK || state.phase === PHASE.PREDICTION) &&
      Math.abs(state.player.x - state.lock.origin.x) <= CONFIG.playerRadius &&
      state.timers.dashCooldown === 0
    ) {
      input.dashX = -1;
      input.dashY = 0;
      input.dash = true;
    } else if (state.phase === PHASE.CORE_OPEN) {
      input.moveX = state.boss.x - state.player.x;
      input.moveY = state.boss.y - state.player.y;
      input.attack = true;
    }
    state = updateGame(state, 0.02, input);
    if (state.stats.coreHits > previousHits) {
      hitTimes.push(state.elapsed);
      previousHits = state.stats.coreHits;
    }
    guard += 1;
  }

  assert.ok(state.elapsed < 10, `third core hit took ${state.elapsed.toFixed(2)}s`);
  assert.equal(hitTimes.length, 3);
  assert.ok(hitTimes[1] < 10, "safe two-hit route must fit in the first hook");
  assert.ok(hitTimes[2] < 10, "greedy third hit must remain possible");
  assert.equal(state.stats.coreHits, 3);
  assert.equal(state.stats.outsmarts, 1);
  assert.equal(state.boss.coreHp, 3);
});

test("게임 오버 1.25초 전에는 재시작할 수 없고 이후에는 완전히 초기화된다", () => {
  const base = createGameState({ started: true });
  let state = {
    ...base,
    phase: PHASE.GAME_OVER,
    gameOverElapsed: 0,
    round: 4,
    memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.LEFT],
    boss: { ...base.boss, coreHp: 2 },
    player: { ...base.player, shield: 0 },
    stats: { score: 4200, outsmarts: 5, coreHits: 12 },
    death: {
      kind: "read",
      attackName: "판독 공격",
      memory: [SIDE.RIGHT, SIDE.RIGHT, SIDE.LEFT],
      predictedSide: SIDE.RIGHT,
      actualSide: SIDE.RIGHT,
      tip: "다음에는 반대로",
    },
  };

  state = advance(state, 1.2);
  assert.equal(canRestart(state), false);
  assert.equal(restartRun(state), state);

  state = advance(state, 0.06);
  assert.equal(canRestart(state), true);
  state = restartRun(state);
  assert.equal(state.phase, PHASE.ENGAGE);
  assert.equal(state.round, 1);
  assert.equal(state.player.shield, 3);
  assert.equal(state.boss.coreHp, 6);
  assert.deepEqual(state.memory, []);
  assert.deepEqual(state.stats, { score: 0, outsmarts: 0, coreHits: 0 });
});
