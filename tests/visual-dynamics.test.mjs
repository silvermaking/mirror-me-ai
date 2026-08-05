import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  VISUAL_DYNAMICS_LIMITS,
  createVisualDynamics,
  stepDampedSpring,
} from "../src/visual-dynamics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function particleSnapshot(dynamics) {
  const result = [];
  dynamics.forEachParticle((index, x, y, rotation, alpha, progress) => {
    result.push([index, x, y, rotation, alpha, progress]);
  });
  return result;
}

function configuredDynamics(options = {}) {
  return createVisualDynamics({
    springs: [
      { frequency: 16, dampingRatio: 1 },
      { frequency: 19, dampingRatio: 0.42 },
    ],
    ...options,
  });
}

test("critical and underdamped spring steps stay finite and deterministic", () => {
  let critical = { value: 0, velocity: 0 };
  let underdamped = { value: 0, velocity: 0 };
  let overshot = false;
  for (let index = 0; index < 180; index += 1) {
    const previous = { ...critical };
    critical = stepDampedSpring(critical.value, critical.velocity, 1, 1 / 60, {
      frequency: 14,
      dampingRatio: 1,
    });
    assert.deepEqual(
      critical,
      stepDampedSpring(previous.value, previous.velocity, 1, 1 / 60, {
        frequency: 14,
        dampingRatio: 1,
      }),
    );
    underdamped = stepDampedSpring(underdamped.value, underdamped.velocity, 1, 1 / 60, {
      frequency: 14,
      dampingRatio: 0.35,
    });
    overshot ||= underdamped.value > 1;
    for (const value of [critical.value, critical.velocity, underdamped.value, underdamped.velocity]) {
      assert.ok(Number.isFinite(value));
    }
  }
  assert.ok(Math.abs(critical.value - 1) < 1e-12);
  assert.ok(Math.abs(underdamped.value - 1) < 0.0001);
  assert.equal(overshot, true);
});

test("invalid values and long frames resolve to a finite zero-motion fallback", () => {
  const invalid = stepDampedSpring(NaN, Infinity, NaN, 0.016, {
    frequency: Infinity,
    dampingRatio: NaN,
  });
  assert.ok(Number.isFinite(invalid.value));
  assert.ok(Number.isFinite(invalid.velocity));
  assert.deepEqual(stepDampedSpring(8, -3, 4, VISUAL_DYNAMICS_LIMITS.maxDt + 0.001), {
    value: 0,
    velocity: 0,
  });
});

test("same seed and dt sequence produce identical springs and particles", () => {
  const first = configuredDynamics();
  const second = configuredDynamics();
  const burst = Object.freeze({
    seed: 7401,
    x: 410,
    y: 230,
    directionX: -0.6,
    directionY: -0.3,
    count: 12,
    speed: 155,
    spread: 1.4,
    duration: 0.34,
    gravity: 90,
  });
  assert.equal(first.spawnOnce("event:91", burst), 12);
  assert.equal(second.spawnOnce("event:91", burst), 12);

  for (const dt of [0.016, 0.017, 0.008, 0.024, 0.01]) {
    first.step(dt, [0.18, -0.24]);
    second.step(dt, [0.18, -0.24]);
    assert.equal(first.springValue(0), second.springValue(0));
    assert.equal(first.springVelocity(1), second.springVelocity(1));
    assert.deepEqual(particleSnapshot(first), particleSnapshot(second));
  }
});

test("fixed pool is capped at twelve and spawn keys prevent duplicate events", () => {
  const dynamics = configuredDynamics();
  const input = Object.freeze({
    seed: 12,
    x: 7,
    y: 9,
    directionX: 1,
    directionY: 0,
    count: 8,
  });
  assert.equal(dynamics.spawnOnce(42, input), 8);
  assert.equal(dynamics.spawnOnce(42, input), 0);
  assert.equal(dynamics.particleCount, 8);
  assert.equal(dynamics.spawnOnce("impact:next", { ...input, count: 99 }), 12);
  assert.equal(dynamics.particleCount, VISUAL_DYNAMICS_LIMITS.maxParticles);
  assert.deepEqual(input, {
    seed: 12,
    x: 7,
    y: 9,
    directionX: 1,
    directionY: 0,
    count: 8,
  });
});

test("reset clears secondary state and permits a fresh run to reuse event ids", () => {
  const dynamics = configuredDynamics();
  dynamics.spawnOnce("event:1", { seed: 1, count: 4 });
  dynamics.step(0.05, [1, -1]);
  assert.notEqual(dynamics.springValue(0), 0);
  assert.equal(dynamics.particleCount, 4);

  dynamics.reset();
  assert.equal(dynamics.springValue(0), 0);
  assert.equal(dynamics.springVelocity(1), 0);
  assert.equal(dynamics.particleCount, 0);
  assert.equal(dynamics.spawnOnce("event:1", { seed: 1, count: 4 }), 4);
});

test("dt over 0.1 seconds safely removes stale springs and particles", () => {
  const dynamics = configuredDynamics();
  dynamics.spawnOnce("event:gap", { seed: 2, count: 6, duration: 1 });
  dynamics.step(0.04, [1, 1]);
  assert.notEqual(dynamics.springValue(0), 0);
  assert.equal(dynamics.step(0.101, [1, 1]), false);
  assert.equal(dynamics.springValue(0), 0);
  assert.equal(dynamics.springVelocity(0), 0);
  assert.equal(dynamics.particleCount, 0);
});

test("reduced motion keeps every secondary value at zero", () => {
  const dynamics = configuredDynamics({ reducedMotion: true });
  assert.equal(dynamics.spawnOnce("event:reduced", { seed: 3, count: 12 }), 0);
  assert.equal(dynamics.step(0.016, [2, -2]), false);
  assert.equal(dynamics.springValue(0), 0);
  assert.equal(dynamics.particleCount, 0);

  dynamics.setReducedMotion(false);
  assert.equal(dynamics.spawnOnce("event:reduced", { seed: 3, count: 12 }), 0);
  assert.equal(dynamics.spawnOnce("event:new", { seed: 3, count: 3 }), 3);
  dynamics.step(0.016, [1, -1]);
  assert.notEqual(dynamics.springValue(0), 0);
  dynamics.setReducedMotion(true);
  assert.equal(dynamics.springValue(0), 0);
  assert.equal(dynamics.particleCount, 0);
});

test("module is a small dependency-free renderer helper", async () => {
  const path = resolve(ROOT, "src/visual-dynamics.mjs");
  const [source, metadata] = await Promise.all([readFile(path, "utf8"), stat(path)]);
  assert.ok(metadata.size <= 8 * 1024, `${metadata.size} bytes exceeds the small helper budget`);
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /game-core|matter|rapier|webassembly|fetch\s*\(/i);
  assert.equal(VISUAL_DYNAMICS_LIMITS.maxParticles, 12);
  assert.equal(VISUAL_DYNAMICS_LIMITS.maxSprings, 6);
});
