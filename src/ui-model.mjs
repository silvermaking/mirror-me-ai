import { PHASE } from "./game-core.mjs";

export function combatRailPresentation(state) {
  const memory = Array.isArray(state.memory) ? state.memory.slice(0, 3) : [];
  return Object.freeze({
    visible: state.phase !== PHASE.WAITING && state.phase !== PHASE.GAME_OVER,
    round: Math.max(1, Number.isFinite(state.round) ? state.round : 1),
    shields: Math.max(0, Math.min(3, state.player?.shield || 0)),
    coreHp: Math.max(0, Math.min(6, state.boss?.coreHp || 0)),
    memory: Object.freeze([0, 1, 2].map((index) => memory[index] === "left" || memory[index] === "right" ? memory[index] : "none")),
  });
}

export function retryPresentation(state, restartDelay, restartReady) {
  const remaining = Math.max(0, restartDelay - (Number.isFinite(state.gameOverElapsed) ? state.gameOverElapsed : 0));
  return Object.freeze({
    visible: state.phase === PHASE.GAME_OVER,
    disabled: !restartReady,
    remaining,
    label: restartReady ? "재도전" : `재도전 준비 ${remaining.toFixed(1)}초`,
  });
}

export function isReadDeath(state) { return state.death?.kind === "read"; }
