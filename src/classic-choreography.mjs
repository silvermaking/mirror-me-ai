// Renderer-only choreography for the classic authored cutout pass.
//
// This module is deliberately independent from game-core. It reads the
// already-resolved visual state and returns poses; it never advances clocks,
// mutates state, or decides whether an attack hit.

export const CLASSIC_ATTACK_TIMING = Object.freeze({
  durationMs: 240,
  contactEndMs: 48,
  cutEndMs: 168,
  recoilEndMs: 240,
});

export const CLASSIC_PLAYER_DRAW_ORDER = Object.freeze([
  "cloak",
  "rearArm",
  "body",
  "swordArm",
  "blade",
]);

const CORE_IMPACT_DURATION = 0.3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function easeOutCubic(value) {
  const amount = clamp(value, 0, 1);
  return 1 - (1 - amount) ** 3;
}

function easeInOutCubic(value) {
  const amount = clamp(value, 0, 1);
  return amount < 0.5
    ? 4 * amount ** 3
    : 1 - ((-2 * amount + 2) ** 3) / 2;
}

function frozenPose(pose) {
  return Object.freeze({
    ...pose,
    rootOffset: Object.freeze({ ...pose.rootOffset }),
  });
}

/**
 * Return the player's grounded, deterministic combat pose.
 *
 * `swingSide` is a screen-space sign supplied by the renderer because the
 * immutable gameplay state intentionally knows nothing about projection. The
 * returned rootOffset is always zero: every secondary part moves around the
 * player's true projected foot instead of moving the gameplay root.
 */
export function classicPlayerPosePlan(state, { swingSide = 1 } = {}) {
  const side = swingSide < 0 ? -1 : 1;
  const attack = state?.visual?.attack;
  if (!attack) {
    return frozenPose({
      active: false,
      phase: "idle",
      elapsedMs: 0,
      progress: 0,
      rootOffset: { x: 0, y: 0 },
      torsoRotation: 0,
      cloakCounterRotation: 0,
      rearArmRotation: side * -0.16,
      swordArmRotation: side * 0.08,
      handReach: 48,
      handAngle: 0.45,
      bladeAngleOffset: 0,
      bodyLean: 0,
      trailAlpha: 0,
      contact: false,
    });
  }

  const durationSeconds = CLASSIC_ATTACK_TIMING.durationMs / 1000;
  const elapsedMs = clamp(
    (durationSeconds - (Number.isFinite(attack.remaining) ? attack.remaining : durationSeconds)) * 1000,
    0,
    CLASSIC_ATTACK_TIMING.recoilEndMs,
  );
  const progress = elapsedMs / CLASSIC_ATTACK_TIMING.durationMs;
  const resultContact = Boolean(attack.hit || attack.armor);

  let phase = "contact";
  let bladeAngleOffset = 0;
  let bodyLean = 0.08;
  let torsoRotation = side * -0.18;
  let cloakCounterRotation = side * 0.14;
  let rearArmRotation = side * -0.48;
  let swordArmRotation = side * -0.24;
  let handReach = 40;
  let handAngle = 0.45;

  if (elapsedMs <= CLASSIC_ATTACK_TIMING.contactEndMs) {
    const amount = easeOutCubic(elapsedMs / CLASSIC_ATTACK_TIMING.contactEndMs);
    bodyLean = mix(0.08, 0.13, amount);
    torsoRotation = side * mix(-0.18, -0.1, amount);
    cloakCounterRotation = side * mix(0.14, 0.1, amount);
    rearArmRotation = side * mix(-0.48, -0.36, amount);
    swordArmRotation = side * mix(-0.24, -0.12, amount);
    handReach = mix(40, 41, amount);
    handAngle = mix(0.45, 0.32, amount);
  } else if (elapsedMs <= CLASSIC_ATTACK_TIMING.cutEndMs) {
    phase = "cut";
    const amount = easeInOutCubic(
      (elapsedMs - CLASSIC_ATTACK_TIMING.contactEndMs)
        / (CLASSIC_ATTACK_TIMING.cutEndMs - CLASSIC_ATTACK_TIMING.contactEndMs),
    );
    bladeAngleOffset = mix(0.16, 1.82, amount);
    bodyLean = mix(0.13, 0.21, amount);
    torsoRotation = side * mix(-0.1, 0.34, amount);
    cloakCounterRotation = side * mix(0.1, -0.19, amount);
    rearArmRotation = side * mix(-0.36, 0.3, amount);
    swordArmRotation = side * mix(-0.12, 0.46, amount);
    handReach = mix(41, 42, amount);
    handAngle = mix(0.32, -0.18, amount);
  } else {
    phase = "recoil";
    const amount = easeOutCubic(
      (elapsedMs - CLASSIC_ATTACK_TIMING.cutEndMs)
        / (CLASSIC_ATTACK_TIMING.recoilEndMs - CLASSIC_ATTACK_TIMING.cutEndMs),
    );
    bladeAngleOffset = mix(1.82, 0.88, amount);
    bodyLean = mix(0.21, 0.04, amount);
    torsoRotation = side * mix(0.34, 0.02, amount);
    cloakCounterRotation = side * mix(-0.19, 0.05, amount);
    rearArmRotation = side * mix(0.3, -0.08, amount);
    swordArmRotation = side * mix(0.46, 0.12, amount);
    handReach = mix(42, 40, amount);
    handAngle = mix(-0.18, 0.5, amount);
  }

  return frozenPose({
    active: true,
    phase,
    elapsedMs,
    progress,
    rootOffset: { x: 0, y: 0 },
    torsoRotation,
    cloakCounterRotation,
    rearArmRotation,
    swordArmRotation,
    handReach,
    handAngle,
    bladeAngleOffset,
    bodyLean,
    trailAlpha: clamp(1 - progress * 0.7, 0.24, 1),
    contact: resultContact && elapsedMs <= CLASSIC_ATTACK_TIMING.contactEndMs,
  });
}

function delayedWave(age, delay, decay, frequency) {
  if (!Number.isFinite(age) || age < delay) return 0;
  const localAge = age - delay;
  return Math.exp(-decay * localAge) * Math.sin(frequency * localAge);
}

/**
 * Causal response for a real sword-to-core result. OUTSMART only sets
 * `coreOpen`; without a core impact this plan stays completely still.
 */
export function classicCoreReactionPlan(state) {
  const impact = state?.visual?.impact;
  const directHit = impact?.tone === "core";
  if (!directHit) {
    return Object.freeze({
      directHit: false,
      hitAge: Infinity,
      faceCompression: 0,
      finsKick: 0,
      shutterKick: 0,
      bodyKick: 0,
    });
  }

  const hitAge = clamp(
    CORE_IMPACT_DURATION - (Number.isFinite(impact.remaining) ? impact.remaining : CORE_IMPACT_DURATION),
    0,
    CORE_IMPACT_DURATION,
  );
  const faceCompression = Math.exp(-18 * hitAge) * Math.cos(34 * hitAge);

  return Object.freeze({
    directHit: true,
    hitAge,
    faceCompression,
    // Physical propagation order: face -> fins -> shutters -> chassis.
    finsKick: delayedWave(hitAge, 0.04, 18, 38),
    shutterKick: delayedWave(hitAge, 0.075, 17, 34),
    bodyKick: delayedWave(hitAge, 0.11, 15, 42),
  });
}
