const cue = (frequency, endFrequency, duration, wave, volume, delay = 0, role = "tone") =>
  Object.freeze({ frequency, endFrequency, duration, wave, volume, delay, role });

const CUES = Object.freeze({
  start: [cue(180, 142, 0.08, "triangle", 0.035)],
  restart: [cue(260, 330, 0.12, "triangle", 0.04)],
  round_start: [cue(210, 310, 0.12, "triangle", 0.032)],
  dash: [cue(540, 180, 0.09, "sawtooth", 0.022)],
  explore_warning: [
    cue(190, 118, 0.18, "sawtooth", 0.022),
    cue(620, 480, 0.045, "triangle", 0.014, 0.02),
  ],
  combine: [
    cue(230, 440, 0.24, "triangle", 0.028, 0.16),
    cue(116, 96, 0.24, "sine", 0.018, 0.16),
  ],
  lock: [
    cue(118, 76, 0.22, "square", 0.038),
    cue(920, 650, 0.055, "triangle", 0.025, 0.045),
  ],
  prediction_strike: [
    cue(210, 118, 0.28, "sawtooth", 0.032, 0, "driver-tension"),
    cue(58, 46, 0.24, "sine", 0.024, 0.055, "counterweight-load"),
    cue(1180, 690, 0.05, "triangle", 0.025, 0.17, "lock-latch"),
  ],
  outsmart: [
    cue(112, 54, 0.12, "square", 0.05, 0, "empty-plate"),
    cue(390, 1040, 0.24, "triangle", 0.038, 0.065, "core-open"),
    cue(72, 48, 0.2, "sine", 0.025, 0.09, "chassis-collapse"),
  ],
  outsmart_confirmed: [cue(920, 1180, 0.13, "sine", 0.035)],
  prediction_neutral: [cue(410, 320, 0.11, "sine", 0.025)],
  evade_unlearned: [cue(410, 320, 0.11, "sine", 0.025)],
  read: [cue(92, 54, 0.24, "sawtooth", 0.05)],
  attack: [
    cue(920, 180, 0.14, "sawtooth", 0.023, 0, "blade-whoosh"),
    cue(1480, 620, 0.07, "triangle", 0.012, 0.018, "blade-edge"),
  ],
  armor_hit: [
    cue(145, 92, 0.09, "square", 0.032),
    cue(1260, 720, 0.045, "triangle", 0.022),
  ],
  core_hit: [
    cue(1260, 820, 0.055, "triangle", 0.052, 0, "sword-contact"),
    cue(96, 44, 0.2, "square", 0.044, 0.028, "core-compression"),
    cue(420, 190, 0.11, "sine", 0.025, 0.085, "shell-recoil"),
  ],
  player_hit: [cue(72, 46, 0.18, "sawtooth", 0.055)],
  core_close: [
    cue(110, 62, 0.14, "square", 0.032),
    cue(680, 270, 0.06, "triangle", 0.018, 0.035),
  ],
  round_clear: [
    cue(520, 780, 0.34, "triangle", 0.045),
    cue(780, 1040, 0.25, "sine", 0.03, 0.13),
  ],
  game_over: [cue(66, 42, 0.5, "sawtooth", 0.045)],
});

export function audioCuePlan(eventOrType) {
  const event = typeof eventOrType === "string" ? { type: eventOrType } : eventOrType || {};
  if (event.type === "remember") {
    const count = Math.max(1, Math.min(3, event.memory?.length || 1));
    return Object.freeze([
      cue(420 + count * 105, 360 + count * 120, 0.085, "triangle", 0.032),
      cue(168, 118, 0.055, "square", 0.018),
    ]);
  }
  return CUES[event.type] || Object.freeze([]);
}

export function createAudioManager() {
  let context = null;
  let output = null;
  let muted = false;

  const ensureContext = () => {
    if (muted) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = 0.72;
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.12;
      master.connect(compressor).connect(context.destination);
      output = master;
    }
    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  };

  const playTone = ({ frequency, endFrequency, duration, wave, volume, delay = 0 }) => {
    const audio = ensureContext();
    if (!audio || muted) return;
    const startAt = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain).connect(output || audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  };

  return {
    unlock() {
      ensureContext();
    },
    play(eventOrType) {
      for (const voice of audioCuePlan(eventOrType)) playTone(voice);
    },
    toggle() {
      muted = !muted;
      if (!muted) ensureContext();
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
