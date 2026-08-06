import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

const root = new URL("..", import.meta.url);
const directory = new URL("../assets/audio/sfx/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
const expectedEvents = {
  remember: [["memory-latch-{memoryCount}", 0]], combine: [["cable-gather", 160]],
  lock: [["lock-body", 0], ["lock-latch", 45]], prediction_strike: [["driver-load", 0]],
  attack: [["blade-air", 0], ["blade-edge", 18]], armor_hit: [["porcelain-armor", 0]],
  outsmart: [["empty-plate", 0], ["chassis-collapse", 70], ["core-open", 130]],
  core_hit: [["core-contact", 0]], player_hit: [["player-hit", 0]], outsmart_confirmed: [],
};
const expectedPeaks = {
  "memory-latch-1": -12, "memory-latch-2": -11, "memory-latch-3": -10,
  "cable-gather": -12, "lock-body": -7, "lock-latch": -8, "driver-load": -8,
  "blade-air": -13, "blade-edge": -11, "porcelain-armor": -7.5, "empty-plate": -6.5,
  "chassis-collapse": -8, "core-open": -9, "core-contact": -3, "player-hit": -5,
};

function pcm(file) {
  const bytes = readFileSync(new URL(file, directory));
  assert.equal(bytes.subarray(0, 4).toString(), "RIFF"); assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
  assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt32LE(24), 48000); assert.equal(bytes.readUInt16LE(34), 16);
  const dataOffset = bytes.indexOf(Buffer.from("data")) + 8;
  const values = [];
  for (let offset = dataOffset; offset < bytes.length; offset += 2) values.push(bytes.readInt16LE(offset));
  return values;
}

test("SFX manifest is the exact event-to-sample timing truth", () => {
  assert.deepEqual(manifest.format, { channels: 1, encoding: "PCM16", sampleRate: 48000 });
  for (const [event, expected] of Object.entries(expectedEvents)) {
    assert.deepEqual((manifest.events[event] || []).map(({ sample, delayMs }) => [sample, delayMs]), expected);
  }
  assert.equal(manifest.events.outsmart.some(({ sample }) => sample === "core-contact"), false, "OUTSMART never emits the boss-HP contact sound");
  assert.deepEqual(manifest.events.core_hit, [{ sample: "core-contact", delayMs: 0 }], "only direct core hit owns the boss-HP contact cue");
});

test("Pages current variant explicitly archives every local runtime SFX", () => {
  const pages = readFileSync(new URL("../scripts/build-pages-variants.mjs", import.meta.url), "utf8");
  assert.match(pages, /"assets\/audio"/);
  assert.match(pages, /assets\/audio\/sfx\/manifest\.json/);
  for (const { file } of Object.values(manifest.files)) assert.ok(pages.includes(`assets/audio/sfx/${file}`), `${file} missing from Pages contract`);
});

test("generated WAVs are local 48k mono PCM16, immediate, peak-safe and within budget", () => {
  const files = Object.values(manifest.files); const total = files.reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(total <= 1_500_000);
  assert.equal(files.length, 15);
  for (const file of files) {
    const raw = readFileSync(new URL(file.file, directory));
    const values = pcm(file.file); const peak = Math.max(...values.map((value) => Math.abs(value))) / 32767;
    const leading = values.findIndex((value) => Math.abs(value) > 32);
    assert.ok(leading >= 0 && leading <= 96, `${file.file} leading silence`);
    assert.ok(peak <= 10 ** (-1 / 20) + 1e-4, `${file.file} peak`);
    assert.equal(file.frames, values.length);
    assert.equal(file.sha256, createHash("sha256").update(raw).digest("hex"), `${file.file} manifest digest`);
    assert.equal(file.bytes, raw.length, `${file.file} manifest bytes`);
  }
});

test("authored master peaks retain the locked combat hierarchy", () => {
  for (const [role, target] of Object.entries(expectedPeaks)) assert.ok(Math.abs(manifest.files[role].peakDbfs - target) <= .02, `${role} peak ${manifest.files[role].peakDbfs}`);
  assert.ok(manifest.files["memory-latch-1"].peakDbfs < manifest.files["memory-latch-2"].peakDbfs);
  assert.ok(manifest.files["memory-latch-2"].peakDbfs < manifest.files["memory-latch-3"].peakDbfs);
  const energy = (role) => {
    const values = pcm(manifest.files[role].file); return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  };
  const core = energy("core-contact");
  for (const role of ["porcelain-armor", "empty-plate", "player-hit"]) assert.ok(core > energy(role), `core-contact energy must exceed ${role}`);
});

test("OUTSMART bundle stays below digital full scale when its authored delays overlap", () => {
  const plan = manifest.events.outsmart.map(({ sample, delayMs }) => [pcm(manifest.files[sample].file), delayMs * 48]);
  const length = Math.max(...plan.map(([values, offset]) => values.length + offset));
  const mix = new Float64Array(length);
  for (const [values, offset] of plan) for (let index = 0; index < values.length; index += 1) mix[offset + index] += values[index] / 32767;
  assert.ok(Math.max(...mix.map((value) => Math.abs(value))) < 1);
});

test("stdlib SFX builder reproduces every committed runtime byte", () => {
  const temporary = mkdtempSync(join(tmpdir(), "mirror-me-sfx-"));
  try {
    const result = spawnSync("python3", ["tools/build-sfx-masters.py", "--out", temporary], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    for (const file of readdirSync(new URL(".", directory)).sort()) assert.deepEqual(readFileSync(new URL(file, directory)), readFileSync(join(temporary, file)), file);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
