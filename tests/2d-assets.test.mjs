import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { buildSprites } from "../tools/build-2d-sprites.mjs";
import { BOSS_DRIVER_JOINT_SOURCE } from "../assets/2d/sprites/sprite-contract.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const PLAYER_IDS = ["player-idle", "player-move", "player-dash", "player-attack-windup", "player-attack-contact", "player-attack-recoil"];
const BOSS_IDS = ["boss-idle", "boss-lock", "boss-stamp", "boss-open"];

const sheetFrames = (sheet) => [...sheet.matchAll(/data-frame-id="([^"]+)" data-frame-order="(\d+)" clip-path="url\(#frame-(\d+)\)"/g)]
  .map((match) => ({ id: match[1], order: Number(match[2]), clip: Number(match[3]) }));

test("authored 2D sheets have exact clipped key-pose order and manifest bounds", async () => {
  const files = [
    "assets/2d/source/characters.svg", "assets/2d/source/relics.svg",
    "assets/2d/sprites/player-sheet.svg", "assets/2d/sprites/boss-sheet.svg", "assets/2d/sprites/relics.svg",
    "assets/2d/sprites/sprites.json", "assets/2d/sprites/sprite-contract.mjs", "tools/build-2d-sprites.mjs",
  ];
  for (const file of files) assert.ok((await stat(resolve(ROOT, file))).size > 0, `${file} exists`);

  const [player, boss, manifestText] = await Promise.all([
    readFile(resolve(ROOT, "assets/2d/sprites/player-sheet.svg"), "utf8"),
    readFile(resolve(ROOT, "assets/2d/sprites/boss-sheet.svg"), "utf8"),
    readFile(resolve(ROOT, "assets/2d/sprites/sprites.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const checks = [
    { name: "player", sheet: player, ids: PLAYER_IDS, width: 384 },
    { name: "boss", sheet: boss, ids: BOSS_IDS, width: 256 },
  ];
  for (const { name, sheet, ids, width } of checks) {
    assert.match(sheet, new RegExp(`viewBox="0 0 ${width} 64"`));
    assert.equal(manifest.sheets[name].width, width);
    assert.equal(manifest.sheets[name].frameWidth, 64);
    assert.equal(manifest.sheets[name].frameHeight, 64);
    assert.equal(manifest.sheets[name].frameCount, ids.length);
    assert.equal(width, manifest.sheets[name].frameWidth * manifest.sheets[name].frameCount, `${name} sheet width matches frame count`);
    assert.deepEqual(sheetFrames(sheet), ids.map((id, index) => ({ id, order: index, clip: index })), `${name} runtime order is exact`);
    assert.equal((sheet.match(/<clipPath id="frame-/g) || []).length, ids.length, `${name} has one clip per cell`);
    assert.equal((sheet.match(/<rect x="\d+" y="0" width="64" height="64"/g) || []).length, ids.length, `${name} clips every cell to 64px`);
    assert.equal((sheet.match(/<use href=/g) || []).length, ids.length, `${name} cannot cross-contaminate frames`);
    assert.doesNotMatch(sheet, /<(?:image|use)[^>]+https?:\/\//, "sprite has no external source");
    assert.doesNotMatch(sheet, /source-art/, "a complete source sheet cannot leak into a runtime frame");
    for (const [index, id] of ids.entries()) assert.deepEqual(manifest.frames[id], [index * 64, 0], `${id} manifest coordinate matches its clipped cell`);
  }
  assert.notEqual(player.match(/<use href="#player-attack-windup"[^>]*>/)?.[0], player.match(/<use href="#player-attack-contact"[^>]*>/)?.[0], "contact is a separate source pose");
  const driverFrames = ["boss-lock", "boss-stamp", "boss-open"];
  for (const id of driverFrames) assert.deepEqual(manifest.sourceFrames[id].anchors.driver, [BOSS_DRIVER_JOINT_SOURCE.x, BOSS_DRIVER_JOINT_SOURCE.y], `${id} consumes the generated shared driver joint`);
  const source = await readFile(resolve(ROOT, "assets/2d/source/characters.svg"), "utf8");
  for (const id of driverFrames) assert.match(source, new RegExp(`<g id="${id}"[^>]*data-driver-joint="${BOSS_DRIVER_JOINT_SOURCE.x},${BOSS_DRIVER_JOINT_SOURCE.y}"`), `${id} authors the same driver joint`);
});

test("pure sprite build reproduces committed runtime bytes and rejects non-64px cells", async () => {
  const generated = await mkdtemp(resolve(tmpdir(), "mirror-me-2d-assets-"));
  const invalid = await mkdtemp(resolve(tmpdir(), "mirror-me-2d-invalid-"));
  try {
    await buildSprites({ outputDir: generated });
    for (const file of ["player-sheet.svg", "boss-sheet.svg", "relics.svg", "sprites.json", "sprite-contract.mjs"]) {
      assert.deepEqual(await readFile(resolve(generated, file)), await readFile(resolve(ROOT, "assets/2d/sprites", file)), `${file} is byte-reproducible from authored source`);
    }
    await assert.rejects(() => buildSprites({ outputDir: invalid, frameSize: 63 }), /requires 64px cells/, "a FRAME=63 generator mutation cannot produce a valid sheet");
  } finally {
    await rm(generated, { recursive: true, force: true });
    await rm(invalid, { recursive: true, force: true });
  }
});
