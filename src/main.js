import {
  CONFIG,
  PHASE,
  canRestart,
  createGameState,
  getRunSummary,
  restartRun,
  startRun,
  updateGame,
} from "./game-core.mjs";
import { createAudioManager } from "./audio.mjs";
import { createRenderer } from "./render-classic.mjs";

const canvas = document.querySelector("canvas#game");
const startButton = document.querySelector("button#start-button");
const muteButton = document.querySelector("button#mute-button");
const statusLive = document.querySelector("div#status-live");
const touchControls = document.querySelector("div#touch-controls");
const startOverlay = document.querySelector("#start-overlay");
const loadingCopy = document.querySelector("#loading-copy");
const gameTitle = document.querySelector("#game-title");
const gameHook = document.querySelector("#game-hook");
const gameOverOverlay = document.querySelector("#game-over-overlay");
const gameOverTitle = document.querySelector("#game-over-title");
const gameOverMemory = document.querySelector("#game-over-memory");
const gameOverComparison = document.querySelector("#game-over-comparison");
const gameOverTip = document.querySelector("#game-over-tip");
const gameOverRun = document.querySelector("#game-over-run");
const gameOverBest = document.querySelector("#game-over-best");
const gameOverRestart = document.querySelector("#game-over-restart");

if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#game canvas is required");
if (!(startButton instanceof HTMLButtonElement)) throw new Error("#start-button is required");
if (!(muteButton instanceof HTMLButtonElement)) throw new Error("#mute-button is required");
if (!(statusLive instanceof HTMLDivElement)) throw new Error("#status-live is required");
if (!(touchControls instanceof HTMLDivElement)) throw new Error("#touch-controls is required");

const renderer = createRenderer(canvas);
const audio = createAudioManager();
const heldKeys = new Set();
const touchPointers = new Map();
const oneShot = { attack: false, dash: false, restart: false };
let dashIntent = null;
const BEST_KEY = "mirror-me-ai.best.v1";

let state = createGameState();
let best = readBest();
let lastFrame = performance.now();

function finiteRecord(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readBest() {
  const empty = {
    completedRounds: 0,
    currentRound: 1,
    survivalTime: 0,
    score: 0,
    outsmarts: 0,
    coreHits: 0,
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(BEST_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      completedRounds: finiteRecord(parsed.completedRounds),
      currentRound: Math.max(1, finiteRecord(parsed.currentRound, 1)),
      survivalTime: finiteRecord(parsed.survivalTime),
      score: finiteRecord(parsed.score),
      outsmarts: finiteRecord(parsed.outsmarts),
      coreHits: finiteRecord(parsed.coreHits),
    };
  } catch {
    return empty;
  }
}

function updateBest(summary) {
  best = {
    completedRounds: Math.max(best.completedRounds, summary.completedRounds),
    currentRound: Math.max(best.currentRound, summary.currentRound),
    survivalTime: Math.max(best.survivalTime, summary.survivalTime),
    score: Math.max(best.score, summary.score),
    outsmarts: Math.max(best.outsmarts, summary.outsmarts),
    coreHits: Math.max(best.coreHits, summary.coreHits),
  };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Private browsing and storage-denied contexts still keep the current session record.
  }
}

function sideLabel(side) {
  return side === "left" ? "왼쪽" : side === "right" ? "오른쪽" : "측면 없음";
}

function sideMark(side) {
  return side === "left" ? "←" : side === "right" ? "→" : "·";
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function deathTitleFor(death) {
  if (!death) return "분석 완료";
  if (death.kind === "read") return "당신의 습관을 읽혔다";
  if (death.kind === "greed") return "한 번 더가 패배가 됐다";
  return `${death.attackName || "공격"}에 쓰러졌다`;
}

function eventAnnouncement(event) {
  switch (event.type) {
    case "start":
    case "restart":
      return "전투 시작. WASD나 대시로 주황 위험 구역 밖으로 피하세요.";
    case "remember":
      return `AI 기억 ${event.memory?.length || 0}/3. ${sideLabel(event.side)} 회피.`;
    case "combine":
      return `AI가 ${sideLabel(event.side)} 습관을 결합했습니다.`;
    case "lock":
      return `LOCK ${sideLabel(event.side)}. 예측은 이제 움직이지 않습니다.`;
    case "outsmart":
      return "OUTSMART. 보스가 빗나가 코어가 열렸습니다. 직접 공격하세요.";
    case "outsmart_confirmed":
      return `속임 확정. 총 ${event.count}회.`;
    case "read":
      return `READ. ${sideLabel(event.side)} 습관을 읽혔습니다.`;
    case "prediction_neutral":
      return "EVADE. 위험 구역 밖으로 피했지만 AI의 측면 예측은 완전히 속이지 못했습니다.";
    case "evade_unlearned":
      return "EVADE. 가장자리에서 강제된 회피라 AI는 이 방향을 기억하지 않습니다.";
    case "armor_hit":
      return "닫힌 장갑. 보스 체력은 줄지 않았습니다.";
    case "core_hit":
      return `코어 직접 타격. 남은 체력 ${event.hp}/6.`;
    case "player_hit":
      return `피격. 남은 보호막 ${event.shield}/3.`;
    case "core_close":
      return "코어가 닫혔습니다.";
    case "round_clear":
      return `${event.round} 라운드 돌파.`;
    case "game_over":
      return `게임 오버. ${state.death?.tip || "다음 행동을 바꿔 보세요."}`;
    default:
      return "";
  }
}

function eventAnnouncementPriority(type) {
  switch (type) {
    case "game_over":
      return 100;
    case "read":
    case "outsmart":
    case "outsmart_confirmed":
      return 90;
    case "round_clear":
    case "core_hit":
    case "player_hit":
      return 70;
    case "lock":
    case "remember":
    case "prediction_neutral":
    case "evade_unlearned":
      return 40;
    default:
      return 20;
  }
}

function processEvents(events) {
  const seen = new Set();
  let announcement = "";
  let announcementPriority = -1;
  for (const event of events) {
    const key = `${event.id}:${event.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    audio.play(event.type);
    const nextAnnouncement = eventAnnouncement(event);
    const priority = eventAnnouncementPriority(event.type);
    if (nextAnnouncement && priority > announcementPriority) {
      announcement = nextAnnouncement;
      announcementPriority = priority;
    }
    if (event.type === "game_over") updateBest(getRunSummary(state));
  }
  if (announcement) statusLive.textContent = announcement;
}

function updateOverlay() {
  if (!(startOverlay instanceof HTMLElement)) return;
  const ready = renderer.isReady;
  const error = renderer.status === "error";
  touchControls.hidden = state.phase === PHASE.WAITING;
  startOverlay.hidden = ready && state.phase !== PHASE.WAITING;
  startOverlay.dataset.status = error ? "error" : ready ? "ready" : "loading";
  if (loadingCopy instanceof HTMLElement) {
    loadingCopy.hidden = ready;
    loadingCopy.textContent = error
      ? "전장 아트를 불러오지 못했습니다. 최초판 표현으로 계속합니다."
      : renderer.status === "context-lost"
        ? "그래픽 장치를 복구하는 중…"
        : "전장을 준비하는 중…";
  }
  if (gameTitle instanceof HTMLElement) gameTitle.hidden = !ready;
  if (gameHook instanceof HTMLElement) gameHook.hidden = !ready;
  startButton.hidden = !ready && !error;
  const startButtonTitle = startButton.querySelector("span");
  const startButtonDetail = startButton.querySelector("small");
  if (startButtonTitle) {
    startButtonTitle.textContent = error ? "아트 다시 불러오기" : "전투 시작";
  }
  if (startButtonDetail) {
    startButtonDetail.textContent = error
      ? "로컬 전장 자산을 다시 확인합니다"
      : "이동 · 대시 · 공격 입력으로 즉시 시작";
  }
  if (gameOverOverlay instanceof HTMLElement) {
    gameOverOverlay.hidden = state.phase !== PHASE.GAME_OVER;
  }
  if (state.phase === PHASE.GAME_OVER) {
    if (gameOverTitle instanceof HTMLElement) {
      gameOverTitle.textContent = deathTitleFor(state.death);
    }
    if (gameOverMemory instanceof HTMLOListElement) {
      const remembered = state.death?.memory || [];
      [...gameOverMemory.children].forEach((cell, index) => {
        if (!(cell instanceof HTMLElement)) return;
        const side = remembered[index] || "none";
        cell.dataset.side = side;
        cell.textContent = sideMark(side);
        cell.setAttribute("aria-label", side === "none" ? `${index + 1}번째 기억 없음` : `${index + 1}번째 ${sideLabel(side)} 회피`);
      });
    }
    if (gameOverComparison instanceof HTMLElement) {
      gameOverComparison.textContent = state.death?.kind === "read"
        ? `예측 ${sideLabel(state.death.predictedSide)} · 실제 ${sideLabel(state.death.actualSide)}`
        : `치명타 · ${state.death?.attackName || "전장 공격"}`;
    }
    if (gameOverTip instanceof HTMLElement) {
      gameOverTip.textContent = state.death?.tip || "다음에는 위험 구역 밖으로 이동";
    }
    if (gameOverRun instanceof HTMLElement) {
      gameOverRun.textContent = `ROUND ${state.round} · ${state.stats.score} PTS · ${formatTime(state.elapsed)} · OUTSMART ${state.stats.outsmarts}`;
    }
    if (gameOverBest instanceof HTMLElement) {
      gameOverBest.textContent = `최고 기록 R${best.currentRound || 1} · ${best.score || 0}점 · 속임 ${best.outsmarts || 0}회`;
    }
    if (gameOverRestart instanceof HTMLElement) {
      const remaining = Math.max(0, CONFIG.restartDelay - state.gameOverElapsed);
      gameOverRestart.textContent = canRestart(state)
        ? "ENTER / SPACE · 방금 읽힌 한 가지를 바꿔 다시 도전"
        : `재도전 준비 ${remaining.toFixed(1)}초`;
    }
  }
}

function startNow() {
  audio.unlock();
  if (renderer.status === "error") {
    renderer.retry();
    updateOverlay();
    return;
  }
  if (!renderer.isReady) return;
  if (state.phase !== PHASE.WAITING) return;
  state = startRun(state);
  processEvents(state.events);
  updateOverlay();
  canvas.focus({ preventScroll: true });
}

function requestRestart() {
  if (!canRestart(state)) return false;
  audio.unlock();
  state = restartRun(state);
  processEvents(state.events);
  oneShot.restart = false;
  dashIntent = null;
  updateOverlay();
  canvas.focus({ preventScroll: true });
  return true;
}

function isGameKey(code) {
  return [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyJ",
    "KeyZ",
    "KeyX",
    "Space",
    "ShiftLeft",
    "ShiftRight",
    "Enter",
    "KeyM",
  ].includes(code);
}

function controlForCode(code) {
  if (code === "KeyJ" || code === "KeyZ") return "attack";
  if (code === "Space" || code === "ShiftLeft" || code === "ShiftRight" || code === "KeyX") {
    return "dash";
  }
  return null;
}

function shouldIgnoreKeyboard(event) {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLButtonElement && target !== startButton)
  );
}

window.addEventListener("keydown", (event) => {
  if (!isGameKey(event.code)) return;
  if (event.code === "KeyM") {
    const target = event.target;
    const isTextEntry =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (!isTextEntry) {
      event.preventDefault();
      if (!event.repeat) toggleMute();
    }
    return;
  }
  if (shouldIgnoreKeyboard(event)) return;
  if (!renderer.isReady) return;
  if (state.phase === PHASE.WAITING) startNow();
  if (event.code === "Enter" && state.phase !== PHASE.GAME_OVER) return;
  event.preventDefault();
  audio.unlock();

  if (state.phase === PHASE.GAME_OVER && (event.code === "Enter" || event.code === "Space")) {
    if (!event.repeat) requestRestart();
    return;
  }

  heldKeys.add(event.code);
  const control = controlForCode(event.code);
  if (control && !event.repeat) {
    oneShot[control] = true;
    if (control === "dash") dashIntent = readMovement();
  }
});

window.addEventListener("keyup", (event) => {
  heldKeys.delete(event.code);
});

function releaseTouchPointer(pointerId) {
  const entry = touchPointers.get(pointerId);
  if (!entry) return;
  touchPointers.delete(pointerId);
  const stillHeld = [...touchPointers.values()].some((value) => value.control === entry.control);
  if (!stillHeld) entry.button.classList.remove("is-active");
}

touchControls.addEventListener("pointerdown", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest('button[data-control="up"], button[data-control="down"], button[data-control="left"], button[data-control="right"], button[data-control="attack"], button[data-control="dash"]')
    : null;
  if (!(button instanceof HTMLButtonElement)) return;
  if (!renderer.isReady) return;
  event.preventDefault();
  audio.unlock();

  releaseTouchPointer(event.pointerId);
  const control = button.dataset.control;
  touchPointers.set(event.pointerId, { control, button });
  button.classList.add("is-active");
  try {
    button.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is an enhancement; the window-level release is the fallback.
  }

  if (state.phase === PHASE.WAITING) {
    startNow();
  }
  if (state.phase === PHASE.GAME_OVER) {
    requestRestart();
  } else if (control === "attack" || control === "dash") {
    oneShot[control] = true;
    if (control === "dash") dashIntent = readMovement();
  }
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  touchControls.addEventListener(eventName, (event) => releaseTouchPointer(event.pointerId));
}
window.addEventListener("pointerup", (event) => releaseTouchPointer(event.pointerId));
window.addEventListener("pointercancel", (event) => releaseTouchPointer(event.pointerId));

function clearInput() {
  heldKeys.clear();
  oneShot.attack = false;
  oneShot.dash = false;
  oneShot.restart = false;
  dashIntent = null;
  for (const pointerId of [...touchPointers.keys()]) releaseTouchPointer(pointerId);
}

window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInput();
});

function touchHeld(control) {
  return [...touchPointers.values()].some((entry) => entry.control === control);
}

function readMovement() {
  const left = heldKeys.has("ArrowLeft") || heldKeys.has("KeyA") || touchHeld("left");
  const right = heldKeys.has("ArrowRight") || heldKeys.has("KeyD") || touchHeld("right");
  const up = heldKeys.has("ArrowUp") || heldKeys.has("KeyW") || touchHeld("up");
  const down = heldKeys.has("ArrowDown") || heldKeys.has("KeyS") || touchHeld("down");
  return {
    moveX: Number(right) - Number(left),
    moveY: Number(down) - Number(up),
  };
}

startButton.addEventListener("click", startNow);

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  if (!renderer.isReady) return;
  event.preventDefault();
  audio.unlock();
  canvas.focus({ preventScroll: true });
  if (state.phase === PHASE.WAITING) {
    startNow();
    oneShot.attack = true;
  } else if (state.phase === PHASE.GAME_OVER) {
    requestRestart();
  } else {
    oneShot.attack = true;
  }
});

function toggleMute() {
  const muted = audio.toggle();
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
  const copy = muteButton.querySelector(".mute-copy");
  if (copy) copy.textContent = muted ? "소리 꺼짐" : "소리 켬";
}

muteButton.addEventListener("click", toggleMute);

function frame(timestamp) {
  const dt = Math.min(0.1, Math.max(0, (timestamp - lastFrame) / 1000));
  lastFrame = timestamp;
  if (renderer.isReady) {
    const movement = readMovement();
    const input = {
      ...movement,
      dashX: oneShot.dash && dashIntent ? dashIntent.moveX : movement.moveX,
      dashY: oneShot.dash && dashIntent ? dashIntent.moveY : movement.moveY,
      attack: oneShot.attack,
      dash: oneShot.dash,
      restart: oneShot.restart,
    };
    oneShot.attack = false;
    oneShot.dash = false;
    oneShot.restart = false;
    dashIntent = null;
    state = updateGame(state, dt, input);
    processEvents(state.events);
    updateOverlay();
  } else {
    clearInput();
  }
  renderer.render(state, { now: timestamp / 1000, best });
  canvas.dataset.renderInfo = JSON.stringify(renderer.info);
  requestAnimationFrame(frame);
}

updateOverlay();
renderer.render(state, { now: performance.now() / 1000, best });
canvas.dataset.renderInfo = JSON.stringify(renderer.info);
requestAnimationFrame(frame);

renderer.onStatusChange = () => {
  clearInput();
  lastFrame = performance.now();
  updateOverlay();
};

// Referencing the configuration here also keeps the restart contract visible to assistive UI.
statusLive.dataset.restartDelay = String(CONFIG.restartDelay);
