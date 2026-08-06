#!/usr/bin/env python3
"""Build the deterministic 24-second Kiln Breath loop with Python stdlib only."""
from __future__ import annotations

import argparse
import array
import hashlib
import json
import math
import pathlib
import random
import struct
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "assets/audio/bgm"
RATE = 24_000
SECONDS = 24
FRAMES = RATE * SECONDS
BYTES = 44 + FRAMES * 2
SEED = "mirror-me-kiln-breath-v1"
PEAK_DBFS = -10

def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)

def section_level(time: float, levels: tuple[float, float, float, float]) -> float:
    """Four six-second sections crossfade over a short, click-free boundary."""
    section = min(3, int(time // 6))
    level = levels[section]
    margin = .14
    # The 24s boundary is a real musical transition too: tail section four
    # reaches the normal section-one level with a zero-slope terminal curve.
    if section == 3 and time > SECONDS - margin:
        return levels[3] + (levels[0] - levels[3]) * smoothstep((time - (SECONDS - margin)) / margin)
    boundary = (section + 1) * 6
    if section < 3 and time > boundary - margin:
        return level + (levels[section + 1] - level) * smoothstep((time - (boundary - margin)) / margin)
    if section > 0 and time < section * 6 + margin:
        return levels[section - 1] + (level - levels[section - 1]) * smoothstep((time - section * 6) / margin)
    return level

def periodic_noise(time: float, modes: list[tuple[int, float, float]]) -> float:
    return sum(gain * math.sin(math.tau * cycles * time / SECONDS + phase) for cycles, gain, phase in modes)

def pulse(time: float, frequency: float, phase: float = 0.0) -> float:
    position = (time * frequency + phase) % 1.0
    return math.exp(-position * 17.0) * min(1.0, position / .012)

def synth() -> list[float]:
    rng = random.Random(hashlib.sha256(SEED.encode()).digest())
    # Integer cycles over 24 seconds make the noisy materials inherently loop-safe.
    low_wind_modes = [(rng.randrange(1_500, 8_500), rng.uniform(.006, .021), rng.random() * math.tau) for _ in range(22)]
    # These are deliberately sparse, phase-scrambled integer-cycle partials:
    # texture, not a pitched phrase, kick, hiss bed, or independent impact.
    air_modes = [(rng.randrange(19_200, 38_400), rng.uniform(.0008, .0018), rng.random() * math.tau) for _ in range(22)]
    brass_modes = [(rng.randrange(33_600, 60_000), rng.uniform(.0007, .0015), rng.random() * math.tau) for _ in range(15)]
    porcelain_modes = [(rng.randrange(62_400, 96_000), rng.uniform(.0004, .0010), rng.random() * math.tau) for _ in range(11)]
    iron_phases = [rng.random() * math.tau for _ in range(4)]
    samples: list[float] = []
    for index in range(FRAMES):
        time = index / RATE
        wind = periodic_noise(time, low_wind_modes) * section_level(time, (.78, 1.0, .38, .88))
        air = periodic_noise(time, air_modes) * section_level(time, (.55, .82, .17, .67))
        brass = periodic_noise(time, brass_modes) * section_level(time, (.10, .45, .28, .38))
        porcelain = periodic_noise(time, porcelain_modes) * section_level(time, (.04, .14, .36, .09))
        iron_strength = section_level(time, (.22, .62, .08, .54))
        iron = 0.0
        for frequency, phase in zip((73, 109, 167, 241), iron_phases):
            iron += math.sin(math.tau * frequency * time + phase) * math.exp(-((frequency - 73) / 280))
        # 160 BPM is felt as damped foundry pressure, never a kick drum.
        pressure = pulse(time, 160 / 60, .11) * iron_strength
        rub = math.sin(math.tau * 317 * time + iron_phases[0]) * .012 * section_level(time, (.12, .34, .46, .28))
        samples.append(wind + air + brass + porcelain + iron * pressure * .12 + rub)
    mean = sum(samples) / len(samples)
    samples = [sample - mean for sample in samples]
    peak = max(abs(sample) for sample in samples) or 1.0
    target = 10 ** (PEAK_DBFS / 20)
    return [max(-.891, min(.891, sample * target / peak)) for sample in samples]

def write_wav(path: pathlib.Path, samples: list[float]) -> dict:
    pcm = array.array("h", (int(round(sample * 32767)) for sample in samples))
    if struct.pack("=h", 1) != struct.pack("<h", 1): pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(RATE); output.writeframes(pcm.tobytes())
    assert path.stat().st_size == BYTES
    peak = max(abs(sample) for sample in pcm) / 32767
    return {
        "file": path.name, "bytes": path.stat().st_size, "frames": len(pcm), "durationMs": SECONDS * 1000,
        "sampleRate": RATE, "channels": 1, "encoding": "PCM16", "peakDbfs": round(20 * math.log10(max(peak, 1e-9)), 3),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }

def build(output: pathlib.Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    details = write_wav(output / "kiln-breath-loop.wav", synth())
    manifest = {
        "version": 1,
        "loop": {**details, "loopStartFrame": 0, "loopEndFrame": FRAMES},
        "license": "CC0-1.0",
        "provenance": "Deterministic original procedural synthesis; no sampled third-party audio.",
        "sectionsMs": [[0, 6000, "observe"], [6000, 12000, "pressure"], [12000, 18000, "void"], [18000, 24000, "restart"]],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT); parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        build(args.out); return
    with tempfile.TemporaryDirectory() as temporary:
        candidate = pathlib.Path(temporary); build(candidate)
        for name in ("kiln-breath-loop.wav", "manifest.json"):
            if not (args.out / name).exists() or (args.out / name).read_bytes() != (candidate / name).read_bytes():
                raise SystemExit("BGM assets are not deterministic or are stale")

if __name__ == "__main__":
    main()
