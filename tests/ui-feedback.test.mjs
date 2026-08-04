import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PHASE } from "../src/game-core.mjs";
import { playerFrameFor } from "../src/render-2d.mjs";

const ROOT = resolve(import.meta.dirname, "..");

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

  for (const copy of ["CARTOGRAPHER · WARD", "THE UNMAPPED KING · CORE SEALED", "OUTSMART", "CORE −1", "ROUND"] ) {
    assert.ok(renderer.includes(copy), `runtime feedback keeps ${copy}`);
  }
});

test("320×180 keeps the full combat canvas instead of reserving a control strip", async () => {
  const css = await readFile(resolve(ROOT, "styles.css"), "utf8");
  assert.match(css, /\.game-stage\s*\{\s*width:\s*min\(100vw,\s*calc\(100dvh \* 16 \/ 9\)\)/s);
  assert.doesNotMatch(css, /100dvh\s*-\s*2\.7rem/, "mobile controls must overlay rather than shrink the stage");
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
