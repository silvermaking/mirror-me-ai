import assert from "node:assert/strict";
import test from "node:test";

import { audioCuePlan } from "../src/audio.mjs";

test("boss causal beats have distinct layered audio cues", () => {
  for (const type of [
    "explore_warning",
    "combine",
    "lock",
    "prediction_strike",
    "outsmart",
    "core_hit",
    "core_close",
  ]) {
    assert.ok(audioCuePlan(type).length >= 2, `${type} should have a layered cue`);
  }
});

test("three remembered samples rise in pitch without adding a new event", () => {
  const pitches = [1, 2, 3].map((count) => audioCuePlan({
    type: "remember",
    memory: Array(count).fill("right"),
  })[0].frequency);
  assert.ok(pitches[0] < pitches[1]);
  assert.ok(pitches[1] < pitches[2]);
  assert.ok(audioCuePlan("combine").every((voice) => voice.delay >= 0.08));
});

test("sword whoosh and core contact are separate cues", () => {
  const attack = audioCuePlan("attack");
  const hit = audioCuePlan("core_hit");
  assert.equal(attack.length, 2);
  assert.equal(hit.length, 3);
  assert.deepEqual(attack.map((voice) => voice.role), ["blade-whoosh", "blade-edge"]);
  assert.deepEqual(hit.map((voice) => voice.role), [
    "sword-contact",
    "core-compression",
    "shell-recoil",
  ]);
  assert.ok(attack[0].frequency > attack[0].endFrequency);
  assert.ok(hit[0].delay < hit[1].delay && hit[1].delay < hit[2].delay);
});

test("prediction and outsmart cues make tension, empty impact and opening causal", () => {
  const prediction = audioCuePlan("prediction_strike");
  const outsmart = audioCuePlan("outsmart");
  assert.deepEqual(prediction.map((voice) => voice.role), [
    "driver-tension",
    "counterweight-load",
    "lock-latch",
  ]);
  assert.deepEqual(outsmart.map((voice) => voice.role), [
    "empty-plate",
    "core-open",
    "chassis-collapse",
  ]);
  assert.equal(outsmart[0].delay, 0);
  assert.ok(outsmart[1].delay > outsmart[0].delay);
});

test("procedural voices stay inside the short web-game sound budget", () => {
  const types = [
    "start", "restart", "round_start", "dash", "explore_warning", "combine",
    "lock", "prediction_strike", "outsmart", "outsmart_confirmed", "read",
    "attack", "armor_hit", "core_hit", "player_hit", "core_close",
    "round_clear", "game_over",
  ];
  for (const type of types) {
    for (const voice of audioCuePlan(type)) {
      assert.ok(Number.isFinite(voice.frequency) && voice.frequency >= 40);
      assert.ok(Number.isFinite(voice.endFrequency) && voice.endFrequency >= 40);
      assert.ok(voice.duration > 0 && voice.duration <= 0.5);
      assert.ok(voice.volume > 0 && voice.volume <= 0.06);
      assert.ok(voice.delay >= 0 && voice.delay <= 0.3);
      assert.ok(["sine", "triangle", "square", "sawtooth"].includes(voice.wave));
      assert.equal(typeof voice.role, "string");
    }
  }
});
