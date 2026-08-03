const TONES = Object.freeze({
  start: [180, 0.08, "triangle", 0.035],
  restart: [260, 0.12, "triangle", 0.04],
  dash: [420, 0.06, "sawtooth", 0.022],
  remember: [560, 0.08, "sine", 0.03],
  combine: [310, 0.2, "triangle", 0.03],
  lock: [125, 0.2, "square", 0.035],
  outsmart: [740, 0.22, "triangle", 0.04],
  outsmart_confirmed: [920, 0.13, "sine", 0.035],
  read: [92, 0.24, "sawtooth", 0.05],
  armor_hit: [145, 0.07, "square", 0.025],
  core_hit: [860, 0.08, "triangle", 0.055],
  player_hit: [72, 0.18, "sawtooth", 0.055],
  core_close: [110, 0.12, "square", 0.025],
  round_clear: [520, 0.34, "triangle", 0.045],
  game_over: [66, 0.5, "sawtooth", 0.045],
});

export function createAudioManager() {
  let context = null;
  let muted = false;

  const ensureContext = () => {
    if (muted) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context) context = new AudioContextClass();
    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  };

  const playTone = (frequency, duration, wave, volume, delay = 0) => {
    const audio = ensureContext();
    if (!audio || muted) return;
    const startAt = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.78),
      startAt + duration,
    );
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  };

  return {
    unlock() {
      ensureContext();
    },
    play(type) {
      const tone = TONES[type];
      if (!tone) return;
      playTone(...tone);
      if (type === "outsmart") playTone(1100, 0.11, "sine", 0.025, 0.08);
      if (type === "round_clear") playTone(780, 0.25, "sine", 0.03, 0.13);
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
