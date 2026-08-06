const tone = (frequency, endFrequency, duration, wave, volume, delay = 0, role = "tone") =>
  Object.freeze({ frequency, endFrequency, duration, wave, volume, delay, role });

// These voices are used only when the complete local sample set cannot be
// verified and decoded in time. A combat cue is never played by both paths.
const FALLBACK = Object.freeze({
  combine: [tone(246, 180, .24, "sawtooth", .022, .16, "cable-gather")],
  lock: [tone(118, 74, .30, "sine", .035, 0, "lock-body"), tone(980, 610, .075, "triangle", .018, .045, "lock-latch")],
  prediction_strike: [tone(260, 118, .30, "sawtooth", .026, 0, "driver-load")],
  attack: [tone(1260, 420, .14, "triangle", .018, 0, "blade-air"), tone(1760, 980, .06, "triangle", .012, .018, "blade-edge")],
  armor_hit: [tone(1040, 690, .105, "triangle", .022, 0, "porcelain-armor")],
  outsmart: [tone(184, 92, .12, "square", .028, 0, "empty-plate"), tone(112, 58, .24, "sine", .024, .07, "chassis-collapse"), tone(520, 270, .21, "triangle", .028, .13, "core-open")],
  core_hit: [tone(1220, 250, .25, "triangle", .048, 0, "core-contact")],
  player_hit: [tone(96, 54, .18, "sawtooth", .032, 0, "player-hit")],
  outsmart_confirmed: [],
  start: [tone(180, 142, .08, "triangle", .035)], restart: [tone(260, 330, .12, "triangle", .04)],
  round_start: [tone(210, 310, .12, "triangle", .032)], dash: [tone(540, 180, .09, "sawtooth", .022)],
  explore_warning: [tone(190, 118, .18, "sawtooth", .022)], prediction_neutral: [tone(410, 320, .11, "sine", .025)],
  evade_unlearned: [tone(410, 320, .11, "sine", .025)], read: [tone(92, 54, .24, "sawtooth", .05)],
  core_close: [tone(110, 62, .14, "square", .032)], round_clear: [tone(520, 780, .34, "triangle", .045)],
  game_over: [tone(66, 42, .5, "sawtooth", .045)],
});

const SAMPLE_EVENTS = Object.freeze({
  remember: [["memory-latch-{memoryCount}", 0]], combine: [["cable-gather", 160]],
  lock: [["lock-body", 0], ["lock-latch", 45]], prediction_strike: [["driver-load", 0]],
  attack: [["blade-air", 0], ["blade-edge", 18]], armor_hit: [["porcelain-armor", 0]],
  outsmart: [["empty-plate", 0], ["chassis-collapse", 70], ["core-open", 130]],
  core_hit: [["core-contact", 0]], player_hit: [["player-hit", 0]], outsmart_confirmed: [],
});
const SAMPLE_ROLES = Object.freeze([
  "memory-latch-1", "memory-latch-2", "memory-latch-3", "cable-gather", "lock-body", "lock-latch", "driver-load",
  "blade-air", "blade-edge", "porcelain-armor", "empty-plate", "chassis-collapse", "core-open", "core-contact", "player-hit",
]);
const SETTLE_WINDOW_MS = 33;
const BGM_SECONDS = 24;
const BGM_BASE_GAIN = .20;
// The BGM bus is 0.20.  Its duck multiplier is 0.50, yielding the locked
// 0.10 final gain (a 6 dB reduction), not an accidental 20 dB mute.
const BGM_DUCK_GAIN = .50;

export const SFX_MANIFEST_URL = new URL("../assets/audio/sfx/manifest.json", import.meta.url);
export const BGM_MANIFEST_URL = new URL("../assets/audio/bgm/manifest.json", import.meta.url);
export const BGM_DUCKS = Object.freeze({
  lock: Object.freeze({ attackMs: 8, holdMs: 360, releaseMs: 240 }),
  outsmart: Object.freeze({ attackMs: 4, holdMs: 340, releaseMs: 300 }),
  core_hit: Object.freeze({ attackMs: 2, holdMs: 250, releaseMs: 180 }),
});

function rememberFallback(event) {
  const count = Math.max(1, Math.min(3, event.memory?.length || 1));
  return Object.freeze([tone(620 + count * 72, 470 + count * 60, .105, "triangle", .024, 0, `memory-latch-${count}`)]);
}

export function audioCuePlan(eventOrType) {
  const event = typeof eventOrType === "string" ? { type: eventOrType } : eventOrType || {};
  if (event.type === "remember") return rememberFallback(event);
  return FALLBACK[event.type] || Object.freeze([]);
}

const exactKeys = (value, expected) => Object.keys(value || {}).sort().join("|") === [...expected].sort().join("|");
const exactCues = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((cue, index) => cue?.sample === expected[index][0] && cue?.delayMs === expected[index][1]);

export function validSfxManifest(manifest) {
  if (!manifest || manifest.version !== 1 || manifest.format?.sampleRate !== 48000 || manifest.format?.channels !== 1 || manifest.format?.encoding !== "PCM16") return false;
  if (!exactKeys(manifest.events, Object.keys(SAMPLE_EVENTS)) || !exactKeys(manifest.files, SAMPLE_ROLES)) return false;
  if (!Object.entries(SAMPLE_EVENTS).every(([event, cues]) => exactCues(manifest.events[event], cues))) return false;
  return SAMPLE_ROLES.every((role) => {
    const file = manifest.files[role];
    return file?.file === `${role}.wav` && Number.isInteger(file.bytes) && file.bytes >= 44 && Number.isInteger(file.frames) && file.frames > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || "");
  });
}

export function validBgmManifest(manifest) {
  const loop = manifest?.loop;
  const sections = [[0, 6000, "observe"], [6000, 12000, "pressure"], [12000, 18000, "void"], [18000, 24000, "restart"]];
  return manifest?.version === 1 && manifest?.license === "CC0-1.0"
    && typeof manifest?.provenance === "string" && manifest.provenance.length > 0
    && loop?.file === "kiln-breath-loop.wav" && loop?.bytes === 1_152_044 && loop?.frames === 576_000
    && loop?.loopStartFrame === 0 && loop?.loopEndFrame === 576_000 && loop?.durationMs === 24_000
    && loop?.sampleRate === 24_000 && loop?.channels === 1 && loop?.encoding === "PCM16"
    && Number.isFinite(loop?.peakDbfs) && loop.peakDbfs <= -1
    && /^[a-f0-9]{64}$/.test(loop?.sha256 || "")
    && JSON.stringify(manifest?.sectionsMs) === JSON.stringify(sections);
}

function resolveSampleName(sample, event) {
  return sample.replace("{memoryCount}", String(Math.max(1, Math.min(3, event.memory?.length || 1))));
}

function samplePlan(manifest, event) {
  const entries = manifest?.events?.[event.type];
  if (!Array.isArray(entries)) return null;
  return entries.map((entry) => Object.freeze({ role: resolveSampleName(entry.sample, event), delay: entry.delayMs / 1000 }));
}

async function browserDigest(bytes) {
  const digest = await globalThis.crypto?.subtle?.digest("SHA-256", bytes);
  if (!digest) throw new Error("SHA-256 unavailable");
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setGain(param, value, time) {
  param?.setValueAtTime?.(value, time);
}
function rampGain(param, value, time) {
  if (param?.linearRampToValueAtTime) param.linearRampToValueAtTime(value, time);
  else param?.setValueAtTime?.(value, time);
}

export function createAudioManager({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  documentRef = globalThis.document,
  digestImpl = browserDigest,
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  let context = null;
  let output = null;
  let bgmBus = null;
  let bgmDuck = null;
  let muted = false;
  let hidden = Boolean(documentRef?.hidden);
  let destroyed = false;
  let gestureSeen = false;
  let manifest = null;
  let prefetched = null;
  let loadState = "idle";
  let prefetchPromise = null;
  let decodePromise = null;
  let bgmManifest = null;
  let bgmPrefetched = null;
  let bgmBuffer = null;
  let bgmLoadState = "idle";
  let bgmPrefetchPromise = null;
  let bgmDecodePromise = null;
  let bgmSource = null;
  let bgmSourceGain = null;
  let bgmOffset = 0;
  let bgmStartedAt = 0;
  let bgmActive = false;
  let bgmRequestedFade = .12;
  let bgmGeneration = 0;
  let duckTimer = null;
  let duckReleaseAt = 0;
  let duckReleaseEnd = 0;
  let duckReleaseStart = 0;
  let duckReleaseFrom = 1;
  let duckLevel = 1;
  const buffers = new Map();
  const active = new Set();
  const deferred = new Set();

  const usable = () => !destroyed && !muted && !hidden;
  const stopActive = () => { for (const source of [...active]) { try { source.stop?.(); } catch { /* already stopped */ } active.delete(source); } };
  const clearDeferred = () => { for (const entry of deferred) { entry.active = false; if (entry.timer !== undefined) clearTimeoutFn?.(entry.timer); } deferred.clear(); };
  const clearDuck = () => {
    if (duckTimer !== null) clearTimeoutFn?.(duckTimer);
    duckTimer = null; duckReleaseAt = 0; duckReleaseEnd = 0; duckReleaseStart = 0; duckReleaseFrom = 1; duckLevel = 1;
    if (context && bgmDuck) { bgmDuck.gain.cancelScheduledValues?.(context.currentTime); setGain(bgmDuck.gain, 1, context.currentTime); }
  };
  const ensureContext = () => {
    if (!AudioContextClass || !usable()) return null;
    if (!context) {
      context = new AudioContextClass();
      const master = context.createGain(); const sfxBus = context.createGain(); const compressor = context.createDynamicsCompressor();
      bgmBus = context.createGain(); bgmDuck = context.createGain();
      // Keep the established SFX master/compressor output exactly intact.
      master.gain.value = .72; sfxBus.gain.value = 1; bgmBus.gain.value = BGM_BASE_GAIN; bgmDuck.gain.value = 1;
      compressor.threshold.value = -18; compressor.knee.value = 16; compressor.ratio.value = 6; compressor.attack.value = .004; compressor.release.value = .12;
      sfxBus.connect(compressor).connect(master); bgmDuck.connect(bgmBus).connect(master); master.connect(context.destination); output = sfxBus;
    }
    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  };
  const playTone = (voice) => {
    const audio = ensureContext(); if (!audio || !usable()) return;
    const startAt = audio.currentTime + voice.delay; const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = voice.wave; oscillator.frequency.setValueAtTime(voice.frequency, startAt); oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, voice.endFrequency), startAt + voice.duration);
    setGain(gain.gain, .0001, startAt); rampGain(gain.gain, voice.volume, startAt + .008); rampGain(gain.gain, .0001, startAt + voice.duration);
    oscillator.connect(gain).connect(output || audio.destination); oscillator.onended = () => active.delete(oscillator); active.add(oscillator); oscillator.start(startAt); oscillator.stop(startAt + voice.duration + .02);
  };
  const playFallback = (event) => { for (const voice of audioCuePlan(event)) playTone(voice); };
  const playSamples = (event) => {
    const audio = ensureContext(); const plan = samplePlan(manifest, event);
    if (!audio || !plan || !usable() || !plan.every((cue) => buffers.has(cue.role))) return false;
    for (const cue of plan) {
      const source = audio.createBufferSource(); source.buffer = buffers.get(cue.role); source.connect(output || audio.destination);
      source.onended = () => active.delete(source); active.add(source); source.start(audio.currentTime + cue.delay);
    }
    return true;
  };
  const flushDeferredSamples = () => {
    if (loadState !== "ready" || !usable()) return;
    for (const entry of [...deferred]) { deferred.delete(entry); entry.active = false; clearTimeoutFn?.(entry.timer); playSamples(entry.event); }
  };
  const beginDecode = () => {
    if (!gestureSeen) return decodePromise;
    const audio = ensureContext();
    if (!audio || !prefetched || decodePromise || loadState === "ready" || loadState === "fallback") return decodePromise;
    loadState = "decoding";
    decodePromise = (async () => {
      try {
        const decoded = await Promise.all([...prefetched.assets].map(async ([role, bytes]) => [role, await audio.decodeAudioData(bytes.slice(0))]));
        if (destroyed) return;
        for (const [role, buffer] of decoded) buffers.set(role, buffer);
        manifest = prefetched.manifest; loadState = "ready"; if (usable()) flushDeferredSamples();
      } catch { buffers.clear(); manifest = null; loadState = "fallback"; }
    })();
    return decodePromise;
  };
  const beginPrefetch = () => {
    if (prefetchPromise || !fetchImpl || destroyed) return prefetchPromise;
    loadState = "prefetching";
    prefetchPromise = (async () => {
      try {
        const response = await fetchImpl(SFX_MANIFEST_URL.href); if (!response?.ok) throw new Error("SFX manifest unavailable");
        const candidate = await response.json(); if (!validSfxManifest(candidate)) throw new Error("Invalid SFX manifest");
        const assets = await Promise.all(SAMPLE_ROLES.map(async (role) => {
          const file = candidate.files[role]; const asset = await fetchImpl(new URL(`../assets/audio/sfx/${file.file}`, import.meta.url).href);
          if (!asset?.ok) throw new Error(`SFX asset unavailable ${role}`); const bytes = await asset.arrayBuffer();
          if (bytes.byteLength !== file.bytes || await digestImpl(bytes) !== file.sha256) throw new Error(`SFX integrity failure ${role}`);
          return [role, bytes];
        }));
        if (destroyed) return; prefetched = { manifest: candidate, assets }; beginDecode();
      } catch { if (!destroyed) { prefetched = null; buffers.clear(); manifest = null; loadState = "fallback"; } }
    })();
    return prefetchPromise;
  };
  const captureBgmOffset = () => {
    if (bgmSource && context) bgmOffset = (bgmOffset + Math.max(0, context.currentTime - bgmStartedAt)) % BGM_SECONDS;
    return bgmOffset;
  };
  const stopBgm = (fadeSeconds = 0, preserveOffset = false) => {
    clearDuck();
    if (!bgmSource || !context) return;
    if (preserveOffset) captureBgmOffset();
    const source = bgmSource; const gain = bgmSourceGain; const now = context.currentTime; const generation = ++bgmGeneration;
    bgmSource = null; bgmSourceGain = null;
    try {
      gain?.gain?.cancelScheduledValues?.(now);
      if (fadeSeconds > 0 && usable()) { setGain(gain?.gain, 1, now); rampGain(gain?.gain, .0001, now + fadeSeconds); source.stop(now + fadeSeconds + .006); }
      else source.stop(now);
    } catch { /* stopped sources are intentionally harmless */ }
    source.onended = () => { if (generation === bgmGeneration) { /* no delayed resurrection */ } };
  };
  const duckGainAt = (now) => {
    if (duckReleaseStart > 0 && duckReleaseEnd > duckReleaseStart && now >= duckReleaseStart) {
      if (now >= duckReleaseEnd) return 1;
      const progress = (now - duckReleaseStart) / (duckReleaseEnd - duckReleaseStart);
      return duckReleaseFrom + (1 - duckReleaseFrom) * Math.max(0, Math.min(1, progress));
    }
    return duckLevel;
  };
  const holdDuckAt = (now, level = duckGainAt(now)) => {
    if (bgmDuck?.gain?.cancelAndHoldAtTime) bgmDuck.gain.cancelAndHoldAtTime(now);
    else { bgmDuck?.gain?.cancelScheduledValues?.(now); setGain(bgmDuck?.gain, level, now); }
    return level;
  };
  const releaseDuck = (generation) => {
    if (generation !== bgmGeneration || !bgmSource || !context || !usable() || !bgmDuck) return;
    const now = context.currentTime;
    if (now + .001 < duckReleaseAt) return;
    const level = holdDuckAt(now);
    duckReleaseStart = now; duckReleaseFrom = level;
    rampGain(bgmDuck.gain, 1, Math.max(now, duckReleaseEnd));
    // The ramp is still in flight, but subsequent fallback queries past its
    // endpoint must start from unity rather than the release's initial .5.
    duckLevel = 1; duckTimer = null; duckReleaseAt = 0;
  };
  const duckBgm = (type) => {
    const profile = BGM_DUCKS[type]; const audio = ensureContext();
    if (!profile || !audio || !bgmSource || !bgmDuck || !usable()) return;
    const now = audio.currentTime; const heldLevel = duckGainAt(now); const holdAt = now + (profile.attackMs + profile.holdMs) / 1000; const endAt = holdAt + profile.releaseMs / 1000;
    duckReleaseAt = Math.max(duckReleaseAt, holdAt); duckReleaseEnd = Math.max(duckReleaseEnd, endAt);
    holdDuckAt(now, heldLevel); duckReleaseStart = 0; duckReleaseFrom = BGM_DUCK_GAIN;
    rampGain(bgmDuck.gain, BGM_DUCK_GAIN, now + profile.attackMs / 1000); duckLevel = BGM_DUCK_GAIN;
    if (duckTimer !== null) clearTimeoutFn?.(duckTimer);
    const generation = bgmGeneration; duckTimer = setTimeoutFn?.(() => releaseDuck(generation), Math.ceil(Math.max(0, duckReleaseAt - now) * 1000)) ?? null;
  };
  const startBgm = (offset = bgmOffset, fadeSeconds = .06) => {
    const audio = ensureContext();
    if (!audio || !usable() || !bgmActive || bgmLoadState !== "ready" || !bgmBuffer || !bgmDuck) return false;
    stopBgm(0, false); const source = audio.createBufferSource(); const gain = audio.createGain(); const now = audio.currentTime;
    source.buffer = bgmBuffer; source.loop = true; source.loopStart = 0; source.loopEnd = BGM_SECONDS; source.connect(gain).connect(bgmDuck);
    setGain(gain.gain, .0001, now); rampGain(gain.gain, 1, now + fadeSeconds);
    bgmOffset = ((offset % BGM_SECONDS) + BGM_SECONDS) % BGM_SECONDS; bgmStartedAt = now; bgmSource = source; bgmSourceGain = gain; const generation = ++bgmGeneration;
    source.onended = () => { if (generation === bgmGeneration && bgmSource === source) { bgmSource = null; bgmSourceGain = null; } };
    source.start(now, bgmOffset); return true;
  };
  const beginBgmDecode = () => {
    if (!gestureSeen) return bgmDecodePromise;
    const audio = ensureContext();
    if (!audio || !bgmPrefetched || bgmDecodePromise || bgmLoadState === "ready" || bgmLoadState === "silent") return bgmDecodePromise;
    bgmLoadState = "decoding";
    bgmDecodePromise = (async () => {
      try {
        const buffer = await audio.decodeAudioData(bgmPrefetched.bytes.slice(0));
        if (destroyed) return; bgmManifest = bgmPrefetched.manifest; bgmBuffer = buffer; bgmLoadState = "ready";
        if (usable() && bgmActive) startBgm(bgmOffset, bgmRequestedFade);
      } catch { if (!destroyed) { bgmManifest = null; bgmBuffer = null; bgmLoadState = "silent"; } }
    })();
    return bgmDecodePromise;
  };
  const beginBgmPrefetch = () => {
    if (bgmPrefetchPromise || !fetchImpl || destroyed) return bgmPrefetchPromise;
    bgmLoadState = "prefetching";
    bgmPrefetchPromise = (async () => {
      try {
        const response = await fetchImpl(BGM_MANIFEST_URL.href); if (!response?.ok) throw new Error("BGM manifest unavailable");
        const candidate = await response.json(); if (!validBgmManifest(candidate)) throw new Error("Invalid BGM manifest");
        const loop = candidate.loop; const asset = await fetchImpl(new URL(`../assets/audio/bgm/${loop.file}`, import.meta.url).href);
        if (!asset?.ok) throw new Error("BGM asset unavailable"); const bytes = await asset.arrayBuffer();
        if (bytes.byteLength !== loop.bytes || await digestImpl(bytes) !== loop.sha256) throw new Error("BGM integrity failure");
        if (destroyed) return; bgmPrefetched = { manifest: candidate, bytes }; beginBgmDecode();
      } catch { if (!destroyed) { bgmPrefetched = null; bgmManifest = null; bgmBuffer = null; bgmLoadState = "silent"; } }
    })();
    return bgmPrefetchPromise;
  };
  const defer = (event) => {
    if (!setTimeoutFn) { playFallback(event); return; }
    const entry = { event, active: true, timer: undefined }; deferred.add(entry);
    entry.timer = setTimeoutFn(() => {
      if (!entry.active) return; deferred.delete(entry); entry.active = false;
      if (!usable()) return; if (loadState === "ready" && playSamples(event)) return; playFallback(event);
    }, SETTLE_WINDOW_MS);
  };
  const onVisibility = () => {
    hidden = Boolean(documentRef?.hidden);
    if (hidden) { stopActive(); clearDeferred(); stopBgm(0, true); }
    else if (gestureSeen) { bgmRequestedFade = .06; if (prefetched) { ensureContext(); beginDecode(); } if (bgmPrefetched) { ensureContext(); beginBgmDecode(); } if (bgmActive) startBgm(bgmOffset, .06); }
  };
  const applyBgmEvent = (event) => {
    if (event.type === "start" || event.type === "restart") { bgmActive = true; bgmOffset = 0; bgmRequestedFade = .12; startBgm(0, .12); }
    else if (event.type === "game_over") { bgmActive = false; stopBgm(usable() ? .18 : 0, false); }
    else if (Object.hasOwn(BGM_DUCKS, event.type)) duckBgm(event.type);
  };
  documentRef?.addEventListener?.("visibilitychange", onVisibility);
  beginPrefetch(); beginBgmPrefetch();

  return Object.freeze({
    unlock() { if (destroyed) return; gestureSeen = true; beginPrefetch(); beginBgmPrefetch(); if (usable()) { ensureContext(); beginDecode(); beginBgmDecode(); } },
    play(eventOrType) {
      const event = typeof eventOrType === "string" ? { type: eventOrType } : eventOrType || {};
      applyBgmEvent(event);
      if (event.type === "outsmart_confirmed" || !usable()) return;
      if (loadState === "ready" && playSamples(event)) return;
      if (gestureSeen && Object.hasOwn(SAMPLE_EVENTS, event.type) && loadState !== "fallback") { defer(event); return; }
      playFallback(event);
    },
    toggle() {
      muted = !muted;
      if (muted) { stopActive(); clearDeferred(); stopBgm(0, true); }
      else if (gestureSeen && !hidden) { bgmRequestedFade = .06; ensureContext(); beginPrefetch(); beginDecode(); beginBgmPrefetch(); beginBgmDecode(); if (bgmActive) startBgm(bgmOffset, .06); }
      return muted;
    },
    isMuted() { return muted; },
    status() { return Object.freeze({ loadState, muted, hidden, ready: loadState === "ready", activeSources: active.size, deferred: deferred.size, bgmLoadState, bgmActive, bgmOffset, bgmPlaying: Boolean(bgmSource) }); },
    destroy() { destroyed = true; bgmActive = false; stopActive(); clearDeferred(); stopBgm(0, false); documentRef?.removeEventListener?.("visibilitychange", onVisibility); },
  });
}
