// Deterministic, renderer-only secondary motion. This module has no knowledge
// of game state, collision, or gameplay coordinates and never writes to them.

export const VISUAL_DYNAMICS_LIMITS = Object.freeze({
  maxDt: 0.1,
  maxParticles: 12,
  maxSprings: 6,
});

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Exact one-dimensional damped spring step for 0 <= dampingRatio <= 1. */
export function stepDampedSpring(
  value,
  velocity,
  target,
  dt,
  { frequency = 12, dampingRatio = 1 } = {},
) {
  const goal = finite(target);
  let position = finite(value, goal);
  let speed = finite(velocity);
  const delta = finite(dt);
  if (delta <= 0) return { value: position, velocity: speed };
  if (delta > VISUAL_DYNAMICS_LIMITS.maxDt) return { value: 0, velocity: 0 };

  const omega = clamp(finite(frequency, 12), 0.001, 100);
  const damping = clamp(finite(dampingRatio, 1), 0, 1);
  const offset = position - goal;

  if (damping >= 0.9999) {
    const c2 = speed + omega * offset;
    const decay = Math.exp(-omega * delta);
    position = goal + (offset + c2 * delta) * decay;
    speed = (speed - omega * c2 * delta) * decay;
  } else {
    const dampedOmega = omega * Math.sqrt(1 - damping * damping);
    const phase = dampedOmega * delta;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const b = (speed + damping * omega * offset) / dampedOmega;
    const wave = offset * cosine + b * sine;
    const decay = Math.exp(-damping * omega * delta);
    position = goal + wave * decay;
    speed = decay * (
      -damping * omega * wave
      - offset * dampedOmega * sine
      + b * dampedOmega * cosine
    );
  }

  return Number.isFinite(position) && Number.isFinite(speed)
    ? { value: position, velocity: speed }
    : { value: 0, velocity: 0 };
}

function randomUnit(seed, index, salt) {
  let value = (finite(seed) | 0) ^ Math.imul(index + 1, 0x9e3779b1) ^ salt;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function normalizedDirection(x, y) {
  const dx = finite(x, 1);
  const dy = finite(y);
  const length = Math.hypot(dx, dy);
  return length > 0.0001 ? [dx / length, dy / length] : [1, 0];
}

export function createVisualDynamics({ springs = [], reducedMotion = false } = {}) {
  const springConfigs = springs.slice(0, VISUAL_DYNAMICS_LIMITS.maxSprings).map((config = {}) => ({
    frequency: clamp(finite(config.frequency, 12), 0.001, 100),
    dampingRatio: clamp(finite(config.dampingRatio, 1), 0, 1),
  }));
  const springValues = new Float64Array(springConfigs.length);
  const springVelocities = new Float64Array(springConfigs.length);
  const capacity = VISUAL_DYNAMICS_LIMITS.maxParticles;
  const active = new Uint8Array(capacity);
  const originX = new Float64Array(capacity);
  const originY = new Float64Array(capacity);
  const velocityX = new Float64Array(capacity);
  const velocityY = new Float64Array(capacity);
  const rotation = new Float64Array(capacity);
  const spin = new Float64Array(capacity);
  const gravity = new Float64Array(capacity);
  const age = new Float64Array(capacity);
  const life = new Float64Array(capacity);
  const seen = new Array(32).fill(null);
  let seenCursor = 0;
  let particleCursor = 0;
  let motionReduced = Boolean(reducedMotion);

  function clearSecondaryMotion() {
    springValues.fill(0);
    springVelocities.fill(0);
    active.fill(0);
    age.fill(0);
  }

  function reset() {
    clearSecondaryMotion();
    seen.fill(null);
    seenCursor = 0;
    particleCursor = 0;
  }

  function wasSeen(key) {
    const normalized = `${typeof key}:${String(key)}`;
    if (seen.includes(normalized)) return true;
    seen[seenCursor] = normalized;
    seenCursor = (seenCursor + 1) % seen.length;
    return false;
  }

  function spawnOnce(key, {
    seed = 0,
    x = 0,
    y = 0,
    directionX = 1,
    directionY = 0,
    count = 8,
    speed = 130,
    spread = 1.25,
    duration = 0.3,
    gravity: burstGravity = 120,
  } = {}) {
    if (key === undefined || key === null || wasSeen(key)) return 0;
    if (motionReduced) return 0;
    const amount = clamp(Math.trunc(finite(count, 8)), 0, capacity);
    const [dx, dy] = normalizedDirection(directionX, directionY);
    const baseAngle = Math.atan2(dy, dx);
    const safeSpeed = Math.max(0, finite(speed, 130));
    const safeSpread = clamp(finite(spread, 1.25), 0, TAU);
    const safeLife = clamp(finite(duration, 0.3), 0.016, 2);

    for (let index = 0; index < amount; index += 1) {
      const slot = particleCursor;
      particleCursor = (particleCursor + 1) % capacity;
      const angle = baseAngle + (randomUnit(seed, index, 17) - 0.5) * safeSpread;
      const magnitude = safeSpeed * (0.68 + randomUnit(seed, index, 29) * 0.64);
      active[slot] = 1;
      originX[slot] = finite(x);
      originY[slot] = finite(y);
      velocityX[slot] = Math.cos(angle) * magnitude;
      velocityY[slot] = Math.sin(angle) * magnitude;
      rotation[slot] = randomUnit(seed, index, 43) * TAU;
      spin[slot] = (randomUnit(seed, index, 59) - 0.5) * 18;
      gravity[slot] = finite(burstGravity, 120);
      age[slot] = 0;
      life[slot] = safeLife * (0.82 + randomUnit(seed, index, 71) * 0.18);
    }
    return amount;
  }

  function step(dt, springTargets = []) {
    const delta = finite(dt);
    if (motionReduced || delta > VISUAL_DYNAMICS_LIMITS.maxDt) {
      clearSecondaryMotion();
      return false;
    }
    if (delta <= 0) return false;

    for (let index = 0; index < springConfigs.length; index += 1) {
      const next = stepDampedSpring(
        springValues[index],
        springVelocities[index],
        finite(springTargets[index]),
        delta,
        springConfigs[index],
      );
      springValues[index] = next.value;
      springVelocities[index] = next.velocity;
    }
    for (let index = 0; index < capacity; index += 1) {
      if (!active[index]) continue;
      age[index] += delta;
      if (age[index] >= life[index]) active[index] = 0;
    }
    return true;
  }

  function forEachParticle(visitor) {
    if (motionReduced || typeof visitor !== "function") return;
    for (let index = 0; index < capacity; index += 1) {
      if (!active[index]) continue;
      const elapsed = age[index];
      const progress = clamp(elapsed / life[index], 0, 1);
      visitor(
        index,
        originX[index] + velocityX[index] * elapsed,
        originY[index] + velocityY[index] * elapsed + 0.5 * gravity[index] * elapsed * elapsed,
        rotation[index] + spin[index] * elapsed,
        1 - progress,
        progress,
      );
    }
  }

  function setReducedMotion(value) {
    motionReduced = Boolean(value);
    if (motionReduced) clearSecondaryMotion();
  }

  return Object.freeze({
    reset,
    spawnOnce,
    step,
    forEachParticle,
    setReducedMotion,
    springValue: (index) => finite(springValues[index]),
    springVelocity: (index) => finite(springVelocities[index]),
    get particleCount() {
      let count = 0;
      for (const value of active) count += value;
      return count;
    },
    get springCount() { return springConfigs.length; },
    get reducedMotion() { return motionReduced; },
  });
}
