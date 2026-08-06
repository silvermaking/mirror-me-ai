#!/usr/bin/env python3
"""Build deterministic local Foley WAV assets for Mirror Me AI.

Only Python's standard library is used.  Each source is a seeded mixture of
filtered transients and inharmonic modal resonators, not an oscillator melody.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import json
import math
import pathlib
import random
import shutil
import struct
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "assets/audio/sfx"
RATE = 48_000
PEAK_LIMIT = 10 ** (-1 / 20)

# Relative impact hierarchy is authored at the master, not repaired by a
# runtime normalizer.  The compressor remains a safety net for real bundles.
PEAK_TARGETS_DBFS = {
    "memory-latch-1": -12, "memory-latch-2": -11, "memory-latch-3": -10,
    "cable-gather": -12, "lock-body": -7, "lock-latch": -8,
    "driver-load": -8, "blade-air": -13, "blade-edge": -11,
    "porcelain-armor": -7.5, "empty-plate": -6.5, "chassis-collapse": -8,
    "core-open": -9, "core-contact": -3, "player-hit": -5,
}

SPECS = {
    "memory-latch-1": .105, "memory-latch-2": .105, "memory-latch-3": .105,
    "cable-gather": .240, "lock-body": .300, "lock-latch": .075,
    "driver-load": .300, "blade-air": .140, "blade-edge": .060,
    "porcelain-armor": .105, "empty-plate": .120, "chassis-collapse": .240,
    "core-open": .210, "core-contact": .250, "player-hit": .180,
}

EVENTS = {
    "remember": [{"sample": "memory-latch-{memoryCount}", "delayMs": 0}],
    "combine": [{"sample": "cable-gather", "delayMs": 160}],
    "lock": [{"sample": "lock-body", "delayMs": 0}, {"sample": "lock-latch", "delayMs": 45}],
    "prediction_strike": [{"sample": "driver-load", "delayMs": 0}],
    "attack": [{"sample": "blade-air", "delayMs": 0}, {"sample": "blade-edge", "delayMs": 18}],
    "armor_hit": [{"sample": "porcelain-armor", "delayMs": 0}],
    "outsmart": [{"sample": "empty-plate", "delayMs": 0}, {"sample": "chassis-collapse", "delayMs": 70}, {"sample": "core-open", "delayMs": 130}],
    "core_hit": [{"sample": "core-contact", "delayMs": 0}],
    "player_hit": [{"sample": "player-hit", "delayMs": 0}],
    "outsmart_confirmed": [],
}

def envelope(t: float, attack: float, decay: float) -> float:
    return min(1.0, t / max(attack, 1e-5)) * math.exp(-t / max(decay, 1e-5))

def synth(name: str) -> list[float]:
    size = int(SPECS[name] * RATE)
    rng = random.Random(hashlib.sha256(name.encode()).digest())
    samples = [0.0] * size
    # Independent random phases preserve a physical but repeatable material.
    phases = [rng.random() * math.tau for _ in range(8)]
    lp = 0.0
    for i in range(size):
        t = i / RATE
        white = rng.uniform(-1.0, 1.0)
        lp += .075 * (white - lp)
        high = white - lp
        value = 0.0
        def modes(freqs, decay, gain, start=0.0):
            nonlocal value
            local = t - start
            if local < 0: return
            for index, frequency in enumerate(freqs):
                value += gain * envelope(local, .0007, decay * (1 + index * .11)) * math.sin(math.tau * frequency * local + phases[index])
        def burst(gain, decay, bright=True, start=0.0):
            nonlocal value
            local = t - start
            if local >= 0:
                value += gain * envelope(local, .00015, decay) * (high if bright else lp)
        if name.startswith("memory-latch"):
            count = int(name[-1]); base = 620 + count * 72
            burst(.46, .008); modes([base, base * 1.53, base * 2.17, base * 2.81], .052, .22)
        elif name == "cable-gather":
            rising = .38 + .62 * (t / SPECS[name]); burst(.20 * rising, .090)
            modes([164 + 62 * (t / SPECS[name]), 267 + 90 * (t / SPECS[name])], .115, .075)
        elif name == "lock-body":
            burst(.35, .030, False); modes([74, 116, 173, 287, 409], .135, .24)
        elif name == "lock-latch":
            burst(.42, .009); modes([770, 1183, 1745], .036, .20)
        elif name == "driver-load":
            falling = 1 - t / SPECS[name]; burst(.28 * falling, .115)
            modes([338 - 100 * (t / SPECS[name]), 504 - 130 * (t / SPECS[name]), 811 - 190 * (t / SPECS[name])], .120, .12)
        elif name == "blade-air":
            burst(.25 * (1 - .35 * t / SPECS[name]), .060); modes([1180, 1770, 2420], .038, .055)
        elif name == "blade-edge":
            burst(.34, .005); modes([1320, 2140, 3490], .025, .15)
        elif name == "porcelain-armor":
            burst(.31, .008); modes([840, 1330, 2110, 2870], .035, .13)
        elif name == "empty-plate":
            burst(.31, .012, False); modes([190, 316, 514, 742], .050, .16)
        elif name == "chassis-collapse":
            for start, gain in [(0, .24), (.065, .18), (.130, .12)]:
                burst(gain, .018, False, start); modes([92, 151, 233, 361], .050, gain * .58, start)
        elif name == "core-open":
            burst(.30, .017); modes([270, 436, 721, 1039], .085, .15)
        elif name == "core-contact":
            burst(.48, .018); modes([188, 307, 521, 877, 1436, 2189], .105, .24)
        elif name == "player-hit":
            burst(.22, .020, False); modes([78, 126, 205, 322], .090, .17)
        samples[i] = value
    # Remove DC, then place each authored physical cue in its fixed hierarchy.
    mean = sum(samples) / len(samples)
    samples = [sample - mean for sample in samples]
    peak = max(abs(sample) for sample in samples) or 1.0
    target = 10 ** (PEAK_TARGETS_DBFS[name] / 20)
    scale = min(PEAK_LIMIT / peak, target / peak)
    return [max(-PEAK_LIMIT, min(PEAK_LIMIT, sample * scale)) for sample in samples]

def write_wav(path: pathlib.Path, samples: list[float]) -> dict:
    pcm = array.array("h", (int(round(sample * 32767)) for sample in samples))
    if struct.pack("=h", 1) != struct.pack("<h", 1): pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    threshold = 32
    leading = next((index for index, sample in enumerate(pcm) if abs(sample) > threshold), len(pcm))
    peak = max(abs(sample) for sample in pcm) / 32767
    return {
        "file": path.name, "bytes": path.stat().st_size, "frames": len(pcm),
        "durationMs": round(len(pcm) * 1000 / RATE), "peakDbfs": round(20 * math.log10(max(peak, 1e-9)), 3),
        "leadingSamples": leading, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }

def build(output: pathlib.Path):
    output.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in SPECS:
        files[name] = write_wav(output / f"{name}.wav", synth(name))
    manifest = {"version": 1, "format": {"sampleRate": RATE, "channels": 1, "encoding": "PCM16"}, "events": EVENTS, "files": files}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

def same_bytes(left: pathlib.Path, right: pathlib.Path) -> bool:
    return left.exists() and right.exists() and left.read_bytes() == right.read_bytes()

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT); parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        build(args.out); return
    with tempfile.TemporaryDirectory() as temporary:
        candidate = pathlib.Path(temporary); build(candidate)
        expected = ["manifest.json", *[f"{name}.wav" for name in SPECS]]
        if not all(same_bytes(args.out / name, candidate / name) for name in expected):
            raise SystemExit("SFX assets are not deterministic or are stale")

if __name__ == "__main__": main()
