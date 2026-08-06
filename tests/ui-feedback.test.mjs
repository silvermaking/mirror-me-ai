import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PHASE } from "../src/game-core.mjs";
import { playerFrameFor } from "../src/render-2d.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test("release entrypoints share one fixed challenger cache revision", async () => {
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  const stylesheetRevision = html.match(/href="\.\/styles\.css\?v=([^"]+)"/)?.[1];
  const moduleRevision = html.match(/src="\.\/src\/main\.js\?v=([^"]+)"/)?.[1];

  assert.equal(stylesheetRevision, "classic-asset-2");
  assert.equal(moduleRevision, stylesheetRevision, "CSS and module entrypoint cannot mix releases");
});

test("start and retry surfaces preserve the complete player-facing information set", async () => {
  const [html, main, renderer] = await Promise.all([
    readFile(resolve(ROOT, "index.html"), "utf8"),
    readFile(resolve(ROOT, "src/main.js"), "utf8"),
    readFile(resolve(ROOT, "src/render-2d.mjs"), "utf8"),
  ]);

  for (const copy of [
    "첫 세 번의 회피가 보스의 다음 공격이 된다",
    "WASD",
    "SPACE",
    "무적 아님",
    "열린 코어 직접 공격",
  ]) {
    assert.match(html, new RegExp(copy), `opening communicates ${copy}`);
  }

  for (const id of [
    "game-over-title",
    "game-over-memory",
    "game-over-comparison",
    "game-over-tip",
    "game-over-run",
    "game-over-best",
    "game-over-restart",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is rendered, not discarded in hidden state`);
    assert.match(main, new RegExp(id.replaceAll("-", ""), "i"), `${id} is populated from the finished run`);
  }
  assert.match(
    main,
    /주홍선이 고정된 뒤, 옆으로 한 번 이동/,
    "explore deaths teach the fixed-lane timing without mutating core death data",
  );

  for (const copy of ["CARTOGRAPHER · WARD", "THE UNMAPPED KING · CORE SEALED", "OUTSMART", "CORE −1", "ROUND"] ) {
    assert.ok(renderer.includes(copy), `runtime feedback keeps ${copy}`);
  }
});

test("320×180 keeps the full combat canvas instead of reserving a control strip", async () => {
  const css = await readFile(resolve(ROOT, "styles.css"), "utf8");
  assert.match(css, /\.game-stage\s*\{\s*width:\s*min\(100vw,\s*calc\(100dvh \* 16 \/ 9\)\)/s);
  assert.doesNotMatch(css, /100dvh\s*-\s*2\.7rem/, "mobile controls must overlay rather than shrink the stage");
});

test("game-over presentation keeps the latest completed three-sample pattern", async () => {
  const main = await readFile(resolve(ROOT, "src/main.js"), "utf8");

  assert.match(main, /let lastCompletedMemory = \[\]/);
  assert.match(main, /event\.type === "remember"[\s\S]*?completedMemoryPattern\(event\.memory\)/);
  assert.match(main, /event\.type === "start" \|\| event\.type === "restart"[\s\S]*?lastCompletedMemory = \[\]/);
  assert.match(
    main,
    /const remembered = memoryForGameOver\(state\.death\)/,
    "game over reads presentation evidence instead of only the core's current memory",
  );
});

test("short touch layout keeps 44px combat targets and exposes one retry action", async () => {
  const [html, main, css] = await Promise.all([
    readFile(resolve(ROOT, "index.html"), "utf8"),
    readFile(resolve(ROOT, "src/main.js"), "utf8"),
    readFile(resolve(ROOT, "styles.css"), "utf8"),
  ]);

  assert.match(html, /aria-label="대시 \(Space\)"/);
  assert.match(html, /aria-keyshortcuts="Space"/);
  assert.match(css, /\.touch-button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.touch-dpad\s*\{\s*grid-template:\s*44px\s*\/\s*repeat\(4,\s*44px\)/);
  assert.match(css, /\.touch-controls\[data-mode="retry"\][\s\S]*?min-width:\s*60px;/);
  assert.match(main, /touchDpad\.hidden = gameOver/);
  assert.match(main, /touchAttack\.hidden = gameOver/);
  assert.match(main, /touchDash\.textContent = gameOver \? "재도전" : "대시"/);
});

test("320×180 opening and death analysis retain only readable priority copy", async () => {
  const css = await readFile(resolve(ROOT, "styles.css"), "utf8");

  assert.match(css, /\.start-rule\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.start-button\s*\{[^}]*min-height:\s*44px;/);
  assert.match(css, /\.death-analysis\s*\{[^}]*width:\s*calc\(100% - 72px\)/);
  assert.match(css, /\.next-attempt strong\s*\{[^}]*font-size:\s*11px;/);
  assert.match(css, /\.death-restart\s*\{\s*display:\s*none;\s*\}/);
});

test("renderer-observed movement can return the player to idle without changing core lastMove", () => {
  const state = {
    phase: PHASE.EXPLORE,
    player: { lastMove: { x: 1, y: 0 } },
    visual: { attack: null, lastDash: null },
  };
  assert.equal(playerFrameFor(state, true).id, "player-move");
  assert.equal(playerFrameFor(state, false).id, "player-idle");
});
