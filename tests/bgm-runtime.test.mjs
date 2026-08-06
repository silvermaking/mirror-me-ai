import assert from "node:assert/strict";
import test from "node:test";

import { BGM_DUCKS, BGM_MANIFEST_URL, SFX_MANIFEST_URL, createAudioManager } from "../src/audio.mjs";

class Node { connect() { return this; } }
class Gain extends Node {
  constructor(log) { super(); this.gain = { value: 1, cancelScheduledValues: (time) => log.push(["cancel", time]), setValueAtTime: (value, time) => log.push(["set", value, time]), linearRampToValueAtTime: (value, time) => log.push(["ramp", value, time]) }; }
}
class Source extends Node {
  constructor(log) { super(); this.log = log; this.onended = null; this.buffer = null; }
  start(time, offset) { this.log.push([this.buffer?.kind || "source", time, offset]); }
  stop(time) { this.log.push(["stop", time]); this.onended?.(); }
}
class Context {
  constructor() { this.currentTime = 2; this.state = "suspended"; this.destination = new Node(); this.log = []; this.gains = []; }
  resume() { this.state = "running"; return Promise.resolve(); }
  createGain() { const gain = new Gain(this.log); this.gains.push(gain); return gain; } createDynamicsCompressor() { return { ...new Node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }; }
  createOscillator() { const source = new Source(this.log); source.buffer = { kind: "tone" }; source.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; return source; }
  createBufferSource() { return new Source(this.log); }
  decodeAudioData(bytes) { return Promise.resolve({ kind: bytes.byteLength === 1_152_044 ? "bgm" : "sfx" }); }
}
class FakeDocument { constructor() { this.hidden = false; this.listeners = new Map(); } addEventListener(name, listener) { this.listeners.set(name, listener); } removeEventListener(name) { this.listeners.delete(name); } emit(name) { this.listeners.get(name)?.(); } }
class Clock { constructor() { this.items = []; this.next = 0; } set(fn, delay) { const item = { id: ++this.next, fn, delay, active: true }; this.items.push(item); return item.id; } clear(id) { const item = this.items.find((candidate) => candidate.id === id); if (item) item.active = false; } run() { for (const item of this.items.filter((candidate) => candidate.active)) { item.active = false; item.fn(); } } }

const roles = ["memory-latch-1", "memory-latch-2", "memory-latch-3", "cable-gather", "lock-body", "lock-latch", "driver-load", "blade-air", "blade-edge", "porcelain-armor", "empty-plate", "chassis-collapse", "core-open", "core-contact", "player-hit"];
const sfxBytes = new ArrayBuffer(64); const bgmBytes = new ArrayBuffer(1_152_044); const SFX_SHA = "a".repeat(64); const BGM_SHA = "b".repeat(64);
const sfxManifest = { version: 1, format: { sampleRate: 48000, channels: 1, encoding: "PCM16" }, events: {
  remember: [{ sample: "memory-latch-{memoryCount}", delayMs: 0 }], combine: [{ sample: "cable-gather", delayMs: 160 }], lock: [{ sample: "lock-body", delayMs: 0 }, { sample: "lock-latch", delayMs: 45 }], prediction_strike: [{ sample: "driver-load", delayMs: 0 }], attack: [{ sample: "blade-air", delayMs: 0 }, { sample: "blade-edge", delayMs: 18 }], armor_hit: [{ sample: "porcelain-armor", delayMs: 0 }], outsmart: [{ sample: "empty-plate", delayMs: 0 }, { sample: "chassis-collapse", delayMs: 70 }, { sample: "core-open", delayMs: 130 }], core_hit: [{ sample: "core-contact", delayMs: 0 }], player_hit: [{ sample: "player-hit", delayMs: 0 }], outsmart_confirmed: [],
}, files: Object.fromEntries(roles.map((role) => [role, { file: `${role}.wav`, bytes: 64, frames: 1, sha256: SFX_SHA }])) };
const bgmManifest = { version: 1, license: "CC0-1.0", provenance: "test procedural original", sectionsMs: [[0, 6000, "observe"], [6000, 12000, "pressure"], [12000, 18000, "void"], [18000, 24000, "restart"]], loop: { file: "kiln-breath-loop.wav", bytes: 1_152_044, frames: 576_000, loopStartFrame: 0, loopEndFrame: 576_000, durationMs: 24_000, sampleRate: 24_000, channels: 1, encoding: "PCM16", peakDbfs: -10, sha256: BGM_SHA } };
const flush = async (count = 36) => { for (let index = 0; index < count; index += 1) await Promise.resolve(); };
const fetchFor = ({ badBgm = false, badBgmAsset = false, bgmCandidate = bgmManifest } = {}) => async (url) => {
  if (url === SFX_MANIFEST_URL.href) return { ok: true, json: async () => sfxManifest };
  if (url === BGM_MANIFEST_URL.href) return badBgm ? { ok: false } : { ok: true, json: async () => bgmCandidate };
  if (url.includes("assets/audio/bgm/")) return badBgmAsset ? { ok: false } : { ok: true, arrayBuffer: async () => bgmBytes.slice(0) };
  return { ok: true, arrayBuffer: async () => sfxBytes.slice(0) };
};
const digest = async (bytes) => bytes.byteLength === 1_152_044 ? BGM_SHA : SFX_SHA;

function readyManager(options = {}) {
  const documentRef = options.documentRef || new FakeDocument(); const clock = options.clock || new Clock(); let context;
  const manager = createAudioManager({ documentRef, fetchImpl: fetchFor(options), digestImpl: digest, setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), AudioContextClass: class extends Context { constructor() { super(); context = this; } decodeAudioData(bytes) { return options.failBgmDecode && bytes.byteLength === 1_152_044 ? Promise.reject(new Error("BGM decode failed")) : super.decodeAudioData(bytes); } } });
  return { manager, documentRef, clock, get context() { return context; } };
}

test("start and restart own the BGM loop while round events never restart it", async () => {
  const testbed = readyManager(); testbed.manager.unlock(); await flush(); assert.equal(testbed.manager.status().bgmLoadState, "ready"); assert.deepEqual(testbed.context.gains.slice(0, 4).map((gain) => gain.gain.value), [.72, 1, .2, 1], "legacy SFX master .72 and independent BGM .20 buses are retained");
  testbed.manager.play("start"); assert.deepEqual(testbed.context.log.filter(([kind]) => kind === "bgm"), [["bgm", 2, 0]]);
  testbed.manager.play("round_start"); testbed.manager.play("round_clear"); assert.equal(testbed.context.log.filter(([kind]) => kind === "bgm").length, 1);
  testbed.manager.play("restart"); assert.deepEqual(testbed.context.log.filter(([kind]) => kind === "bgm").at(-1), ["bgm", 2, 0]);
});

test("ducks before the critical SFX, keeps the lower gain through overlap, and game-over cannot revive it", async () => {
  const testbed = readyManager(); testbed.manager.unlock(); await flush(); testbed.manager.play("start"); testbed.context.log.length = 0;
  testbed.manager.play("core_hit"); const duckIndex = testbed.context.log.findIndex(([kind, value]) => kind === "ramp" && value === .5); const sfxIndex = testbed.context.log.findIndex(([kind]) => kind === "sfx");
  assert.ok(duckIndex >= 0 && duckIndex < sfxIndex, "duck precedes core SFX start"); assert.equal(testbed.clock.items.at(-1).delay, BGM_DUCKS.core_hit.attackMs + BGM_DUCKS.core_hit.holdMs);
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === .5 && time === 2.002), "core duck has its authored 2ms attack ramp");
  testbed.manager.play("lock"); assert.equal(testbed.clock.items.filter((item) => item.active).length, 1); assert.equal(testbed.clock.items.at(-1).delay, BGM_DUCKS.lock.attackMs + BGM_DUCKS.lock.holdMs);
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === .5 && time === 2.008), "LOCK duck has its authored 8ms attack ramp");
  testbed.manager.play("outsmart"); assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === .5 && time === 2.004), "OUTSMART duck has its authored 4ms attack ramp");
  assert.equal(testbed.clock.items.filter((item) => item.active).length, 1); assert.equal(testbed.clock.items.at(-1).delay, BGM_DUCKS.lock.attackMs + BGM_DUCKS.lock.holdMs, "overlap cannot release before the later LOCK hold");
  testbed.context.currentTime = 2.368; testbed.clock.run(); assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === 1 && Math.abs(time - 2.644) < 1e-6), "overlap uses its latest release end");
  testbed.manager.play("game_over"); const starts = testbed.context.log.filter(([kind]) => kind === "bgm").length; assert.ok(testbed.context.log.some(([kind, value]) => kind === "set" && value === 1), "stop resets the duck multiplier before a future source"); testbed.context.currentTime += 1; testbed.clock.run();
  assert.equal(testbed.manager.status().bgmActive, false); assert.equal(testbed.manager.status().bgmPlaying, false); assert.equal(testbed.context.log.filter(([kind]) => kind === "bgm").length, starts);
});

test("a critical event during duck release holds the interpolated gain before its new attack", async () => {
  const testbed = readyManager(); testbed.manager.unlock(); await flush(); testbed.manager.play("start"); testbed.context.log.length = 0;
  testbed.manager.play("outsmart");
  testbed.context.currentTime = 2.344; testbed.clock.run();
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === 1 && Math.abs(time - 2.644) < 1e-6), "OUTSMART begins its authored release");
  testbed.context.log.length = 0; testbed.context.currentTime = 2.460; testbed.manager.play("core_hit");
  const expected = .5 + .5 * ((2.460 - 2.344) / .300);
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "set" && Math.abs(value - expected) < 1e-9 && Math.abs(time - 2.460) < 1e-6), "fallback automation holds its actual release interpolation");
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === .5 && Math.abs(time - 2.462) < 1e-6), "CORE re-enters the authored 2ms attack without a unity spike");
  assert.ok(!testbed.context.log.some(([kind, value, time]) => kind === "set" && value === 1 && Math.abs(time - 2.460) < 1e-6), "mid-release overlap never jumps back to unity");
});

test("a critical event after duck release has settled starts its new attack from unity", async () => {
  const testbed = readyManager(); testbed.manager.unlock(); await flush(); testbed.manager.play("start"); testbed.context.log.length = 0;
  testbed.manager.play("outsmart"); testbed.context.currentTime = 2.344; testbed.clock.run();
  testbed.context.log.length = 0; testbed.context.currentTime = 2.800; testbed.manager.play("core_hit");
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "set" && value === 1 && Math.abs(time - 2.800) < 1e-6), "post-release fallback holds the settled unity gain");
  assert.ok(testbed.context.log.some(([kind, value, time]) => kind === "ramp" && value === .5 && Math.abs(time - 2.802) < 1e-6), "CORE then performs its authored 2ms duck attack");
});

test("mute and hidden stop immediately, preserve loop offset, and resume only combat with 60ms fade", async () => {
  const testbed = readyManager(); testbed.manager.unlock(); await flush(); testbed.manager.play("start"); testbed.context.currentTime = 7;
  testbed.manager.toggle(); assert.equal(testbed.manager.status().bgmPlaying, false); assert.equal(testbed.manager.status().bgmOffset, 5);
  testbed.manager.toggle(); assert.deepEqual(testbed.context.log.filter(([kind]) => kind === "bgm").at(-1), ["bgm", 7, 5]);
  testbed.context.currentTime = 10; testbed.documentRef.hidden = true; testbed.documentRef.emit("visibilitychange"); assert.equal(testbed.manager.status().bgmOffset, 8);
  testbed.documentRef.hidden = false; testbed.documentRef.emit("visibilitychange"); assert.deepEqual(testbed.context.log.filter(([kind]) => kind === "bgm").at(-1), ["bgm", 10, 8]);
  testbed.manager.play("game_over"); testbed.documentRef.hidden = true; testbed.documentRef.emit("visibilitychange"); testbed.documentRef.hidden = false; testbed.documentRef.emit("visibilitychange");
  assert.equal(testbed.manager.status().bgmPlaying, false);
});

test("every BGM manifest, asset, and decode failure is silent and cannot contaminate independent ready SFX", async () => {
  const wrongSection = structuredClone(bgmManifest); wrongSection.sectionsMs[2][2] = "wrong";
  const wrongBytes = structuredClone(bgmManifest); wrongBytes.loop.bytes = 1_152_042;
  const wrongSha = structuredClone(bgmManifest); wrongSha.loop.sha256 = "c".repeat(64);
  for (const options of [{ badBgm: true }, { bgmCandidate: wrongSection }, { bgmCandidate: wrongBytes }, { bgmCandidate: wrongSha }, { badBgmAsset: true }, { failBgmDecode: true }]) {
    const testbed = readyManager(options); testbed.manager.unlock(); await flush();
    assert.equal(testbed.manager.status().bgmLoadState, "silent"); assert.equal(testbed.manager.status().loadState, "ready");
    testbed.manager.play("attack"); assert.deepEqual(testbed.context.log.filter(([kind]) => kind === "sfx"), [["sfx", 2, undefined], ["sfx", 2.018, undefined]]);
    testbed.manager.play("start"); assert.equal(testbed.manager.status().bgmPlaying, false);
  }
});
