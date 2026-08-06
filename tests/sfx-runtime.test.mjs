import assert from "node:assert/strict";
import test from "node:test";

import { createAudioManager, SFX_MANIFEST_URL, validSfxManifest } from "../src/audio.mjs";

class Node { connect() { return this; } }
class Gain extends Node { constructor() { super(); this.gain = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; } }
class Source extends Node { constructor(log, kind) { super(); this.log = log; this.kind = kind; this.onended = null; } start(at) { this.log.push([this.kind, at]); } stop() { this.onended?.(); } }
class FakeAudioContext {
  constructor() { this.currentTime = 2; this.state = "suspended"; this.destination = new Node(); this.log = []; }
  resume() { this.state = "running"; return Promise.resolve(); }
  createGain() { return new Gain(); } createDynamicsCompressor() { return { ...new Node(), threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }; }
  createOscillator() { const source = new Source(this.log, "tone"); source.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; return source; }
  createBufferSource() { return new Source(this.log, "sample"); } decodeAudioData() { return Promise.resolve({ decoded: true }); }
}
class PendingAudioContext extends FakeAudioContext {
  constructor() { super(); this.decodeResolvers = []; }
  decodeAudioData() { return new Promise((resolve) => this.decodeResolvers.push(resolve)); }
  resolveDecodes() { for (const resolve of this.decodeResolvers.splice(0)) resolve({ decoded: true }); }
}
class FakeDocument { constructor() { this.hidden = false; this.listeners = new Map(); } addEventListener(name, fn) { this.listeners.set(name, fn); } removeEventListener(name) { this.listeners.delete(name); } emit(name) { this.listeners.get(name)?.(); } }
class FakeClock {
  constructor() { this.items = []; this.next = 1; }
  set(fn, delay) { const item = { id: this.next += 1, fn, delay, active: true }; this.items.push(item); return item.id; }
  clear(id) { const item = this.items.find((candidate) => candidate.id === id); if (item) item.active = false; }
  run() { for (const item of this.items.filter((candidate) => candidate.active)) { item.active = false; item.fn(); } }
}

const roles = ["memory-latch-1", "memory-latch-2", "memory-latch-3", "cable-gather", "lock-body", "lock-latch", "driver-load", "blade-air", "blade-edge", "porcelain-armor", "empty-plate", "chassis-collapse", "core-open", "core-contact", "player-hit"];
const SHA = "a".repeat(64); const ASSET_BYTES = new ArrayBuffer(64);
const manifest = { version: 1, format: { sampleRate: 48000, channels: 1, encoding: "PCM16" }, events: {
  remember: [{ sample: "memory-latch-{memoryCount}", delayMs: 0 }], combine: [{ sample: "cable-gather", delayMs: 160 }], lock: [{ sample: "lock-body", delayMs: 0 }, { sample: "lock-latch", delayMs: 45 }], prediction_strike: [{ sample: "driver-load", delayMs: 0 }], attack: [{ sample: "blade-air", delayMs: 0 }, { sample: "blade-edge", delayMs: 18 }], armor_hit: [{ sample: "porcelain-armor", delayMs: 0 }], outsmart: [{ sample: "empty-plate", delayMs: 0 }, { sample: "chassis-collapse", delayMs: 70 }, { sample: "core-open", delayMs: 130 }], core_hit: [{ sample: "core-contact", delayMs: 0 }], player_hit: [{ sample: "player-hit", delayMs: 0 }], outsmart_confirmed: [],
}, files: Object.fromEntries(roles.map((name) => [name, { file: `${name}.wav`, bytes: 64, frames: 10, sha256: SHA }])) };

const flush = async (count = 32) => { for (let index = 0; index < count; index += 1) await Promise.resolve(); };
const readyFetch = (candidate = manifest, bytes = ASSET_BYTES) => (url) => Promise.resolve(url === SFX_MANIFEST_URL.href ? { ok: true, json: async () => candidate } : { ok: true, arrayBuffer: async () => bytes.slice(0) });
const accepted = { digestImpl: async () => SHA };

test("raw local prefetch never constructs an AudioContext before the first gesture", async () => {
  let instance; const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(), ...accepted });
  await flush(); assert.equal(instance, undefined); assert.equal(manager.status().loadState, "prefetching");
  manager.unlock(); await flush(); assert.equal(manager.status().ready, true);
});

test("first gesture decodes verified local samples and uses each sample once at locked delays", async () => {
  const documentRef = new FakeDocument(); let instance;
  const manager = createAudioManager({ documentRef, AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, fetchImpl: readyFetch(), ...accepted });
  manager.unlock(); await flush(); assert.equal(manager.status().ready, true);
  manager.play("outsmart"); assert.deepEqual(instance.log, [["sample", 2], ["sample", 2.07], ["sample", 2.13]]);
  manager.play("outsmart_confirmed"); assert.equal(instance.log.length, 3);
});

test("cold-start fast local load holds one attack for at most 33ms then emits samples, never tones", async () => {
  const clock = new FakeClock(); let instance;
  const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(), setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), ...accepted });
  manager.unlock(); manager.play("attack"); await flush();
  assert.equal(manager.status().ready, true); assert.equal(manager.status().deferred, 0);
  assert.deepEqual(instance.log, [["sample", 2], ["sample", 2.018]]);
  clock.run(); assert.equal(instance.log.filter(([kind]) => kind === "tone").length, 0);
});

test("slow local load reaches its one fallback deadline and never replays after later success", async () => {
  const clock = new FakeClock(); let resolveManifest; let instance;
  const laterManifest = new Promise((resolve) => { resolveManifest = resolve; });
  const fetchImpl = (url) => url === SFX_MANIFEST_URL.href ? laterManifest : Promise.resolve({ ok: true, arrayBuffer: async () => ASSET_BYTES.slice(0) });
  const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl, setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), ...accepted });
  manager.unlock(); manager.play("attack"); clock.run();
  assert.deepEqual(instance.log.map(([kind]) => kind), ["tone", "tone"]);
  resolveManifest({ ok: true, json: async () => manifest }); await flush(); assert.equal(manager.status().ready, true);
  assert.deepEqual(instance.log.map(([kind]) => kind), ["tone", "tone"]);
});

test("invalid event semantics, missing roles, or integrity mismatch reject the entire sample set and audibly fall back", async () => {
  const invalids = [
    structuredClone(manifest), structuredClone(manifest), structuredClone(manifest), structuredClone(manifest),
  ];
  invalids[0].events.core_hit = [];
  invalids[1].events.outsmart.push({ sample: "core-contact", delayMs: 200 });
  delete invalids[2].files["blade-edge"];
  invalids[3].files["blade-air"].sha256 = "b".repeat(64);
  assert.equal(validSfxManifest(invalids[0]), false); assert.equal(validSfxManifest(invalids[1]), false); assert.equal(validSfxManifest(invalids[2]), false);
  for (const candidate of invalids) {
    let instance; const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(candidate), ...accepted });
    manager.unlock(); await flush(); manager.play("attack");
    assert.equal(manager.status().loadState, "fallback"); assert.deepEqual(instance.log.map(([kind]) => kind), ["tone", "tone"]);
  }
  let mismatchInstance; const byteMismatch = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); mismatchInstance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(manifest, new ArrayBuffer(63)), ...accepted });
  byteMismatch.unlock(); await flush(); byteMismatch.play("attack"); assert.equal(byteMismatch.status().loadState, "fallback"); assert.deepEqual(mismatchInstance.log.map(([kind]) => kind), ["tone", "tone"]);
  let changedBytesInstance; const changedBytes = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); changedBytesInstance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(), digestImpl: async () => "c".repeat(64) });
  changedBytes.unlock(); await flush(); changedBytes.play("attack"); assert.equal(changedBytes.status().loadState, "fallback"); assert.deepEqual(changedBytesInstance.log.map(([kind]) => kind), ["tone", "tone"]);
});

test("mute during raw prefetch defers context decode until the unmute gesture", async () => {
  let instance; const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(), ...accepted });
  assert.equal(manager.toggle(), true); manager.unlock(); await flush(); assert.equal(instance, undefined); assert.equal(manager.status().loadState, "prefetching");
  assert.equal(manager.toggle(), false); await flush(); assert.equal(manager.status().ready, true); manager.play("core_hit"); assert.deepEqual(instance.log, [["sample", 2]]);
});

test("visibility return retries decode after hidden prefetch completion and only samples a new event", async () => {
  const clock = new FakeClock(); const documentRef = new FakeDocument(); let resolveManifest; let instance;
  const laterManifest = new Promise((resolve) => { resolveManifest = resolve; });
  const fetchImpl = (url) => url === SFX_MANIFEST_URL.href ? laterManifest : Promise.resolve({ ok: true, arrayBuffer: async () => ASSET_BYTES.slice(0) });
  const manager = createAudioManager({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, documentRef, fetchImpl, setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), ...accepted });
  manager.unlock(); documentRef.hidden = true; documentRef.emit("visibilitychange");
  resolveManifest({ ok: true, json: async () => manifest }); await flush(); assert.equal(manager.status().loadState, "prefetching");
  documentRef.hidden = false; documentRef.emit("visibilitychange"); await flush(); assert.equal(manager.status().ready, true);
  manager.play("core_hit"); assert.deepEqual(instance.log, [["sample", 2]]); clock.run(); assert.equal(instance.log.filter(([kind]) => kind === "tone").length, 0);
});

test("decode completing while muted becomes ready, discards the held cue, and samples only a new event", async () => {
  const clock = new FakeClock(); let instance;
  const manager = createAudioManager({ AudioContextClass: class extends PendingAudioContext { constructor() { super(); instance = this; } }, documentRef: new FakeDocument(), fetchImpl: readyFetch(), setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), ...accepted });
  manager.unlock(); manager.play("attack"); await flush(); assert.equal(manager.status().loadState, "decoding"); assert.equal(instance.decodeResolvers.length, 15);
  manager.toggle(); assert.equal(manager.status().deferred, 0); instance.resolveDecodes(); await flush();
  assert.equal(manager.status().ready, true); assert.equal(instance.log.length, 0);
  manager.toggle(); manager.play("attack"); assert.deepEqual(instance.log, [["sample", 2], ["sample", 2.018]]);
  clock.run(); assert.equal(instance.log.filter(([kind]) => kind === "tone").length, 0);
});

test("decode completing while hidden becomes ready without replay and samples the next visible event", async () => {
  const clock = new FakeClock(); const documentRef = new FakeDocument(); let instance;
  const manager = createAudioManager({ AudioContextClass: class extends PendingAudioContext { constructor() { super(); instance = this; } }, documentRef, fetchImpl: readyFetch(), setTimeoutFn: clock.set.bind(clock), clearTimeoutFn: clock.clear.bind(clock), ...accepted });
  manager.unlock(); manager.play("core_hit"); await flush(); assert.equal(manager.status().loadState, "decoding");
  documentRef.hidden = true; documentRef.emit("visibilitychange"); assert.equal(manager.status().deferred, 0); instance.resolveDecodes(); await flush();
  assert.equal(manager.status().ready, true); assert.equal(instance.log.length, 0);
  documentRef.hidden = false; documentRef.emit("visibilitychange"); assert.equal(instance.log.length, 0); manager.play("core_hit");
  assert.deepEqual(instance.log, [["sample", 2]]); clock.run(); assert.equal(instance.log.filter(([kind]) => kind === "tone").length, 0);
});

test("mute and hidden immediately stop active audio without visibility replay", async () => {
  const documentRef = new FakeDocument(); let instance;
  const manager = createAudioManager({ documentRef, AudioContextClass: class extends FakeAudioContext { constructor() { super(); instance = this; } }, fetchImpl: readyFetch(), ...accepted });
  manager.unlock(); await flush(); manager.play("core_hit"); assert.equal(manager.status().activeSources, 1);
  manager.toggle(); assert.equal(manager.status().activeSources, 0); manager.toggle(); manager.play("player_hit");
  documentRef.hidden = true; documentRef.emit("visibilitychange"); assert.equal(manager.status().activeSources, 0);
  documentRef.hidden = false; documentRef.emit("visibilitychange"); assert.equal(manager.status().activeSources, 0); assert.equal(instance.log.filter(([kind]) => kind === "sample").length, 2);
  manager.destroy();
});
