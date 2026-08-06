import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { CONFIG, PHASE, canRestart, createGameState } from "../src/game-core.mjs";
import { combatRailPresentation, isReadDeath, retryPresentation } from "../src/ui-model.mjs";

const ROOT = resolve(import.meta.dirname, "..");

async function runtimeSources() {
  const [html, main, sprite, classic, oldRenderer, css] = await Promise.all([
    readFile(resolve(ROOT, "index.html"), "utf8"),
    readFile(resolve(ROOT, "src/main.js"), "utf8"),
    readFile(resolve(ROOT, "src/render-sprite.mjs"), "utf8"),
    readFile(resolve(ROOT, "src/render-classic.mjs"), "utf8"),
    readFile(resolve(ROOT, "src/render-2d.mjs"), "utf8"),
    readFile(resolve(ROOT, "styles.css"), "utf8"),
  ]);
  return { html, main, sprite, classic, oldRenderer, css };
}

test("the shipped main → sprite → classic import path owns the HUD, not the archived renderer", async () => {
  const { html, main, sprite, classic, oldRenderer } = await runtimeSources();
  assert.match(main, /from "\.\/render-sprite\.mjs"/);
  assert.match(sprite, /from "\.\/render-classic\.mjs"/);
  assert.doesNotMatch(main, /render-2d\.mjs/);
  assert.match(main, /from "\.\/ui-model\.mjs"/);
  assert.match(classic, /consumeClassicTutorialCueEvents/);
  assert.match(html, /id="combat-rail"/);
  assert.doesNotMatch(oldRenderer, /id="combat-rail"/, "unused render-2d text cannot certify the shipped HUD");
});

test("combat rail uses real state, hides outside combat, and carries all physical marks", () => {
  const waiting = createGameState();
  assert.equal(combatRailPresentation(waiting).visible, false);
  const active = createGameState({ started: true });
  active.round = 3; active.player.shield = 2; active.boss.coreHp = 4; active.memory = ["left", "right"];
  assert.deepEqual(combatRailPresentation(active), { visible: true, round: 3, shields: 2, coreHp: 4, memory: ["left", "right", "none"] });
  active.phase = PHASE.GAME_OVER;
  assert.equal(combatRailPresentation(active).visible, false);
});

test("the actual retry truth uses game-core canRestart for disabled text and READ-only evidence", () => {
  const state = createGameState({ started: true });
  state.phase = PHASE.GAME_OVER; state.gameOverElapsed = CONFIG.restartDelay - .1;
  let retry = retryPresentation(state, CONFIG.restartDelay, canRestart(state));
  assert.equal(retry.disabled, true); assert.match(retry.label, /0\.1초/);
  state.gameOverElapsed = CONFIG.restartDelay;
  retry = retryPresentation(state, CONFIG.restartDelay, canRestart(state));
  assert.equal(retry.disabled, false); assert.equal(retry.label, "재도전");
  state.death = { kind: "read" }; assert.equal(isReadDeath(state), true);
  state.death = { kind: "attack" }; assert.equal(isReadDeath(state), false);
});

test("DOM keeps one visual retry source, a valid start name, and mobile-sized interactive controls", async () => {
  const { html, css } = await runtimeSources();
  assert.match(html, /id="start-overlay"[\s\S]*?aria-label="Mirror Me 전투 시작"/);
  assert.doesNotMatch(html, /aria-labelledby="game-title"/);
  assert.match(html, /id="retry-button"[^>]*disabled/);
  assert.match(html, /id="game-over-restart" class="death-restart visually-hidden"/);
  assert.match(css, /\.combat-rail\s*\{[\s\S]*?height:\s*40px;/);
  assert.match(css, /\.retry-button\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.start-overlay\s*\{\s*top:\s*auto;\s*height:\s*44px;/);
  assert.match(css, /\.death-reading:not\(\[hidden\]\)\s*\{\s*display:\s*flex;/, "READ evidence must recover from the older mobile hide rule");
  assert.match(css, /\.death-reading\[hidden\]\s*\{\s*display:\s*none;/, "non-READ deaths must stay actually hidden");
  assert.match(css, /#start-overlay:not\(\[hidden\]\) ~ \.mute-button,[\s\S]*?#game-over-overlay:not\(\[hidden\]\) ~ \.mute-button\s*\{\s*visibility:\s*hidden;\s*pointer-events:\s*none;/, "opening and retry must remove mute's hit target");
  assert.match(css, /\.mute-button\s*\{\s*top:\s*auto;\s*right:\s*10px;\s*bottom:\s*10px;/, "combat mute must stay below the rail");
  assert.doesNotMatch(css, /\.combat-rail\s*\{[^}]*background:/s, "rail cannot become a long panel or pill");
});

test("classic stage invokes the arena exactly once per render", async () => {
  const { classic } = await runtimeSources();
  const renderGame = classic.slice(classic.indexOf("export function renderGame"), classic.indexOf("export function createRenderer"));
  assert.equal((renderGame.match(/drawArena\(ctx, now\)/g) ?? []).length, 1);
  assert.match(renderGame, /onArenaDraw\?\.\(\)/);
});

test("rail visual primitives stay separate from a card background", async () => {
  const { html, css } = await runtimeSources();
  assert.match(html, /id="hud-shields"[\s\S]*?<li[^>]*><\/li><li[^>]*><\/li><li[^>]*><\/li>/);
  assert.match(html, /id="hud-boss-hp"[\s\S]*?<li><\/li><li><\/li><li><\/li><li><\/li><li><\/li><li><\/li>/);
  assert.match(css, /\.hud-shields li\s*\{[\s\S]*?clip-path:/);
  assert.match(css, /\.hud-boss-hp li\s*\{[\s\S]*?clip-path:/);
  assert.match(css, /\.hud-memory li\[data-side="left"\]::after[\s\S]*?content:\s*"←"/);
  assert.match(css, /\.hud-memory li\[data-side="right"\]::after[\s\S]*?content:\s*"→"/);
});

test("retired persistent tutorial sentences are absent from the active Canvas renderer", async () => {
  const { classic } = await runtimeSources();
  for (const retired of ["추적 중", "LOCK · 반대로", "접근 · J", "2타 · 이탈 준비", "3타 · 즉시 이탈"]) {
    assert.doesNotMatch(classic, new RegExp(retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the real retry button owns clicks while game-over touch controls are removed", async () => {
  const { main } = await runtimeSources();
  assert.match(main, /retryButton\.addEventListener\("click", requestRestart\)/);
  assert.match(main, /retryButton\.disabled = retry\.disabled/);
  assert.match(main, /touchControls\.hidden = state\.phase === PHASE\.WAITING \|\| gameOver/);
  assert.match(main, /if \(state\.phase === PHASE\.GAME_OVER && \(event\.code === "Enter" \|\| event\.code === "Space"\)\)/);
});

test("touch taps use the isolated latch while desktop keyboard remains hold-only", async () => {
  const { main } = await runtimeSources();
  assert.match(main, /from "\.\/touch-movement-latch\.mjs"/);
  assert.match(main, /touchMovementLatch\.press\(control, performance\.now\(\) \/ 1000\)/);
  assert.match(main, /touchMovementLatch\.movement\(/);
  assert.match(main, /function clearInput\(\)[\s\S]*?touchMovementLatch\.reset\(\)/);
  assert.match(main, /function startNow\(\)[\s\S]*?clearInput\(\)/);
  assert.match(main, /function requestRestart\(\)[\s\S]*?clearInput\(\)/);
  assert.doesNotMatch(main, /heldKeys\.set|keyboardLatch|stickyKey/);
});
