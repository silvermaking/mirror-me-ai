#!/usr/bin/env python3
"""Render unlabelled local SFX listening evidence from the committed manifest."""
from __future__ import annotations

import argparse
import array
import json
import pathlib
import random
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
SFX = ROOT / "assets/audio/sfx"
RATE = 48_000

def read(name):
    with wave.open(str(SFX / f"{name}.wav"), "rb") as source:
        assert source.getframerate() == RATE and source.getnchannels() == 1 and source.getsampwidth() == 2
        values = array.array("h"); values.frombytes(source.readframes(source.getnframes()))
        return values

def render(output, entries):
    sources = [(offset, read(name)) for name, offset in entries]
    length = max(offset + len(source) for offset, source in sources) + int(.15 * RATE)
    mix = [0.0] * length
    for offset, source in sources:
        for index, value in enumerate(source): mix[offset + index] += value / 32767
    peak = max(max(abs(value) for value in mix), 1)
    pcm = array.array("h", (int(max(-.84, min(.84, value / peak * .84)) * 32767) for value in mix))
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(RATE); target.writeframes(pcm.tobytes())

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--out", type=pathlib.Path, required=True); args = parser.parse_args(); args.out.mkdir(parents=True, exist_ok=True)
    cases = {
        "memory-1-2-3.wav": [("memory-latch-1", 0), ("memory-latch-2", int(.25 * RATE)), ("memory-latch-3", int(.50 * RATE))],
        "memory3-vs-lock.wav": [("memory-latch-3", 0), ("lock-body", int(.32 * RATE)), ("lock-latch", int(.365 * RATE))],
        "outsmart-causal-sequence.wav": [("empty-plate", 0), ("chassis-collapse", int(.07 * RATE)), ("core-open", int(.13 * RATE))],
        "armor-vs-core.wav": [("porcelain-armor", 0), ("core-contact", int(.32 * RATE))],
        "core-vs-player.wav": [("core-contact", 0), ("player-hit", int(.38 * RATE))],
    }
    for name, entries in cases.items(): render(args.out / name, entries)
    labels = ["memory-latch-1", "lock-body", "empty-plate", "core-contact", "player-hit"]
    random.Random(53823).shuffle(labels)
    spacing = int(.42 * RATE)
    render(args.out / "blind-listen.wav", [(label, index * spacing) for index, label in enumerate(labels)])
    (args.out / "answer-key.json").write_text(json.dumps({"order": labels}, indent=2) + "\n")

if __name__ == "__main__": main()
