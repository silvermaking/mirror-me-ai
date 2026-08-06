import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url);
const directory = new URL("../assets/audio/bgm/", import.meta.url);
const sfxDirectory = new URL("../assets/audio/sfx/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
const sfxManifest = JSON.parse(readFileSync(new URL("manifest.json", sfxDirectory), "utf8"));
const wav = readFileSync(new URL("kiln-breath-loop.wav", directory));

function pcm() {
  assert.equal(wav.subarray(0, 4).toString(), "RIFF"); assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 24_000); assert.equal(wav.readUInt16LE(34), 16);
  const offset = wav.indexOf(Buffer.from("data")) + 8; const values = new Int16Array((wav.length - offset) / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = wav.readInt16LE(offset + index * 2);
  return values;
}

function rms(values) { return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length); }
function goertzel(values, hz) {
  let cosine = 0; let sine = 0;
  for (let index = 0; index < values.length; index += 1) { const phase = Math.PI * 2 * hz * index / 24_000; cosine += values[index] * Math.cos(phase); sine += values[index] * Math.sin(phase); }
  return Math.hypot(cosine, sine) / values.length;
}
function bandEnergy(values, fromHz, toHz) {
  // Four 100ms windows make this a stable, inexpensive spectral contract rather
  // than a subjective listening assertion.  Ten-Hz bins are exact at 24kHz.
  const rate = 24_000; const frames = 2400; let total = 0;
  for (const start of [0, 144_000, 288_000, 432_000]) {
    for (let hz = Math.ceil(fromHz / 10) * 10; hz <= toHz; hz += 10) {
      let cosine = 0; let sine = 0;
      for (let index = 0; index < frames; index += 1) {
        const phase = Math.PI * 2 * hz * index / rate; const value = values[start + index];
        cosine += value * Math.cos(phase); sine += value * Math.sin(phase);
      }
      total += cosine * cosine + sine * sine;
    }
  }
  return total;
}
function sfxPcm(file) {
  const bytes = readFileSync(new URL(file, sfxDirectory)); const data = bytes.indexOf(Buffer.from("data")) + 8; const values = new Int16Array((bytes.length - data) / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = bytes.readInt16LE(data + index * 2);
  return values;
}

test("Kiln Breath is the exact local 24-second PCM16 loop with provenance", () => {
  const loop = manifest.loop; const values = pcm();
  assert.equal(manifest.version, 1); assert.equal(manifest.license, "CC0-1.0"); assert.match(manifest.provenance, /procedural/i);
  assert.deepEqual(manifest.sectionsMs, [[0, 6000, "observe"], [6000, 12000, "pressure"], [12000, 18000, "void"], [18000, 24000, "restart"]]);
  assert.equal(loop.bytes, 1_152_044); assert.equal(wav.length, loop.bytes); assert.equal(loop.frames, 576_000); assert.equal(values.length, 576_000);
  assert.equal(loop.loopStartFrame, 0); assert.equal(loop.loopEndFrame, 576_000); assert.equal(loop.durationMs, 24_000);
  assert.equal(loop.sha256, createHash("sha256").update(wav).digest("hex")); assert.ok(loop.peakDbfs <= -1);
});

test("Pages current variant requires the BGM while archived variants keep their own asset truth", () => {
  const pages = readFileSync(new URL("../scripts/build-pages-variants.mjs", import.meta.url), "utf8");
  assert.match(pages, /assets\/audio\/bgm\/manifest\.json/); assert.match(pages, /assets\/audio\/bgm\/kiln-breath-loop\.wav/);
  const archived = pages.slice(pages.indexOf('id: "first-playable"'));
  assert.doesNotMatch(archived, /assets\/audio\/bgm/);
});

test("loop boundary has no PCM click or derivative spike across its 24-second seam", () => {
  const values = pcm(); const derivatives = [];
  for (let index = 1; index < values.length; index += 1) derivatives.push(values[index] - values[index - 1]);
  const ordinary = rms(derivatives); const cross = [values[0] - values.at(-1), values[1] - values.at(-1), values[0] - values.at(-2)];
  const edgeWindow = 480;
  const firstDerivative = []; const lastDerivative = [];
  for (let index = 1; index <= edgeWindow; index += 1) firstDerivative.push(values[index] - values[index - 1]);
  for (let index = values.length - edgeWindow; index < values.length; index += 1) lastDerivative.push(values[index] - values[index - 1]);
  const p99 = [...derivatives].map((value) => Math.abs(value)).sort((left, right) => left - right)[Math.floor(derivatives.length * .99)];
  assert.ok(Math.max(...cross.map((value) => Math.abs(value))) < p99, "wrap derivative stays inside the 99th-percentile internal material distribution");
  const beforeTail = derivatives.slice(-edgeWindow * 2, -edgeWindow); const afterHead = derivatives.slice(edgeWindow, edgeWindow * 2);
  assert.ok(Math.abs(rms(firstDerivative) - rms(afterHead)) < ordinary * .3 && Math.abs(rms(lastDerivative) - rms(beforeTail)) < ordinary * .3, "both 20ms boundary windows match their adjacent material energy");
  const window = 192; const boundaryEnergy = rms([...values.slice(-window), ...values.slice(0, window)]);
  assert.ok(boundaryEnergy > 100 && boundaryEnergy < 5000, "boundary window contains material, not a silent or clipped splice");
});

test("section energy follows observe-pressure-void-restart without sub-bass or a drum peak", () => {
  const values = pcm(); const section = 144_000; const levels = [0, 1, 2, 3].map((index) => rms(values.slice(index * section, (index + 1) * section)));
  assert.ok(levels[1] > levels[0] * 1.12); assert.ok(levels[2] < levels[0] * .7); assert.ok(levels[3] > levels[2] * 1.7);
  const low = Math.max(...[20, 30, 40, 50, 55].map((hz) => goertzel(values, hz))); const iron = Math.max(goertzel(values, 73), goertzel(values, 109));
  assert.ok(low < iron * .08, "no <60Hz sub-bass is present"); let peak = 0; for (const value of values) peak = Math.max(peak, Math.abs(value)); assert.ok(peak < 32767, "master cannot clip");
});

test("quiet wrap-safe air, brass, and porcelain texture occupies 0.8–4kHz without taking over the kiln bed", () => {
  const values = pcm(); const low = bandEnergy(values, 60, 490); const texture = bandEnergy(values, 800, 4000);
  const percentage = texture / (low + texture) * 100;
  assert.ok(percentage >= .5 && percentage <= 5, `0.8–4kHz texture is ${percentage.toFixed(3)}% of the 60Hz–4kHz material energy`);
});

test("automatic mix evidence keeps BGM at least 8dB below the weakest key SFX and under the -1dBFS master ceiling", () => {
  const bgmValues = pcm(); let bgmPeak = 0; for (const value of bgmValues) bgmPeak = Math.max(bgmPeak, Math.abs(value) / 32767);
  const sfxPeak = (role) => { const values = sfxPcm(sfxManifest.files[role].file); let peak = 0; for (const value of values) peak = Math.max(peak, Math.abs(value) / 32767); return peak; };
  const weakestKeySfx = Math.min(...["memory-latch-1", "blade-air", "blade-edge", "porcelain-armor", "player-hit"].map(sfxPeak));
  const separationDb = 20 * Math.log10(weakestKeySfx / (bgmPeak * .20));
  assert.ok(separationDb >= 8, `weakest key SFX leads normal BGM by ${separationDb.toFixed(2)} dB`);
  const plans = Object.values(sfxManifest.events).filter((entries) => entries.length);
  for (const plan of plans) {
    const sources = plan.map((cue) => [sfxPcm(sfxManifest.files[cue.sample.replace("{memoryCount}", "1")].file), cue.delayMs * 48]);
    const mix = new Float64Array(Math.max(...sources.map(([values, offset]) => values.length + offset)));
    for (const [values, offset] of sources) for (let index = 0; index < values.length; index += 1) mix[offset + index] += values[index] / 32767;
    let peak = 0; for (const value of mix) peak = Math.max(peak, Math.abs(value));
    const masterPeak = .72 * (peak + bgmPeak * .20);
    assert.ok(masterPeak <= 10 ** (-1 / 20), `BGM plus ${plan.map((cue) => cue.sample).join("+")} stays under -1dBFS`);
  }
});

test("stdlib BGM builder reproduces the exact committed loop and manifest", () => {
  const temporary = mkdtempSync(join(tmpdir(), "mirror-me-bgm-"));
  try {
    const result = spawnSync("python3", ["tools/build-bgm-master.py", "--out", temporary], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["kiln-breath-loop.wav", "manifest.json"]) assert.deepEqual(readFileSync(new URL(name, directory)), readFileSync(join(temporary, name)), name);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
