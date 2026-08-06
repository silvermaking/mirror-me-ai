#!/usr/bin/env python3
"""Deterministically crop approved alpha source sheets into runtime PNG strips.

This builder never draws, traces, repairs, or generates art.  The five source
rectangles and their named anchors are deliberately authored below; Lanczos
resampling only places those approved pixels into 512×384 master cells and
256×192 runtime cells.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE_DIRS = {
    "v2": ROOT / "assets/2d/master/sprite-rig-v2",
    "v4": ROOT / "assets/2d/master/sprite-rig-v4",
    "v5": ROOT / "assets/2d/master/sprite-rig-v5",
}
OUTPUT_DIR = ROOT / "assets/2d/strips"
MASTER_CELL = (512, 384)
RUNTIME_CELL = (256, 192)

# These are authored image coordinates, never transparent-bound inference.
# Coordinates are measured in the approved source files.  The two long pieces
# deliberately share an authored centreline: their runtime transforms can then
# change only longitudinal length, never body scale, roll, or mirroring.
FRAMES = (
    {"id": "player-idle", "sheet": "player-body", "source": "player-idle-authority-alpha.png", "sourceRect": (100, 160, 600, 560), "anchors": {"feet": (372, 684), "sword_grip": (420, 420)}},
    {"id": "player-contact", "sheet": "player-body", "source": "player-contact-body-alpha.png", "sourceRect": (250, 80, 1100, 745), "anchors": {"feet": (852, 806), "sword_grip": (1142, 320)}},
    {"id": "player-blade", "sheet": "player-blade", "source": "player-blade-only-alpha.png", "sourceRect": (100, 400, 1520, 140), "anchors": {"sword_grip": (151, 468), "sword_tip": (1607, 468)}},
    {"id": "boss-idle", "sheet": "boss-body", "source": "boss-idle-authority-alpha.png", "sourceRect": (20, 245, 540, 480), "anchors": {"root": (302, 675), "driver_joint": (447, 492), "core_center": (305, 500), "brace_contact": (152, 600), "memory_slot_1": (220, 295), "memory_slot_2": (286, 281), "memory_slot_3": (348, 300)}},
    {"id": "boss-lock-left", "sheet": "boss-body", "sourceSet": "v4", "source": "boss-body-left-armfree-alpha.png", "sourceRect": (130, 200, 600, 440), "anchors": {"root": (406, 592), "driver_joint": (440, 478), "core_center": (369, 451), "brace_contact": (222, 557), "memory_slot_1": (307, 260), "memory_slot_2": (375, 245), "memory_slot_3": (443, 249)}},
    {"id": "boss-miss-left", "sheet": "boss-body", "sourceSet": "v4", "source": "boss-body-left-armfree-alpha.png", "sourceRect": (980, 210, 680, 400), "anchors": {"root": (1320, 593), "core_center": (1323, 468), "brace_contact": (1543, 560), "memory_slot_1": (1189, 317), "memory_slot_2": (1254, 281), "memory_slot_3": (1318, 286)}},
    {"id": "boss-lock-right", "sheet": "boss-body", "sourceSet": "v4", "source": "boss-body-right-armfree-alpha.png", "sourceRect": (20, 200, 650, 500), "anchors": {"root": (329, 642), "driver_joint": (580, 520), "core_center": (329, 469), "brace_contact": (126, 598), "memory_slot_1": (240, 281), "memory_slot_2": (309, 260), "memory_slot_3": (385, 263)}},
    {"id": "boss-miss-right", "sheet": "boss-body", "sourceSet": "v4", "source": "boss-body-right-armfree-alpha.png", "sourceRect": (780, 210, 520, 500), "anchors": {"root": (1080, 607), "core_center": (1077, 441), "brace_contact": (824, 589), "memory_slot_1": (920, 288), "memory_slot_2": (981, 267), "memory_slot_3": (1048, 249)}},
    {"id": "driver-shaft", "sheet": "driver-shaft", "source": "boss-shaft-tip-kit-alpha.png", "sourceRect": (250, 230, 1170, 180), "anchors": {"shaft_in": (311, 315), "shaft_out": (1380, 315)}},
    {"id": "driver-tip", "sheet": "driver-tip", "source": "boss-shaft-tip-kit-alpha.png", "sourceRect": (380, 580, 1020, 160), "anchors": {"tip_socket": (411, 636), "driver_tip": (1355, 636)}},
    # Equal cells retain each directional housing's authored paint mass. Their
    # unequal bboxes, not a runtime scale or mirror, create the L/R read.
    {"id": "driver-cuff-left", "sheet": "driver-cuff", "sourceSet": "v5", "source": "boss-joint-housings-v5-alpha.png", "sourceRect": (0, 27, 768, 970), "presentationScale": 1.0, "anchors": {"driver_joint": (224, 511), "shaft_in": (532, 511)}},
    {"id": "driver-cuff-right", "sheet": "driver-cuff", "sourceSet": "v5", "source": "boss-joint-housings-v5-alpha.png", "sourceRect": (768, 27, 768, 970), "presentationScale": 1.0, "anchors": {"driver_joint": (1058, 529), "shaft_in": (1264, 529)}},
)

def read_png(path: pathlib.Path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n": raise ValueError(f"{path}: not PNG")
    offset = 8; data = b""; width = height = color = depth = interlace = None
    while offset < len(raw):
        size = struct.unpack(">I", raw[offset:offset + 4])[0]; kind = raw[offset + 4:offset + 8]; chunk = raw[offset + 8:offset + 8 + size]; offset += 12 + size
        if kind == b"IHDR": width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT": data += chunk
        elif kind == b"IEND": break
    if depth != 8 or color != 6 or interlace != 0: raise ValueError(f"{path}: expected non-interlaced RGBA8")
    scan = zlib.decompress(data); stride = width * 4; pixels = bytearray(width * height * 4); previous = bytearray(stride); at = 0
    for y in range(height):
        filt = scan[at]; at += 1; line = bytearray(scan[at:at + stride]); at += stride
        for x in range(stride):
            left = line[x - 4] if x >= 4 else 0; above = previous[x]; upper_left = previous[x - 4] if x >= 4 else 0
            if filt == 1: line[x] = (line[x] + left) & 255
            elif filt == 2: line[x] = (line[x] + above) & 255
            elif filt == 3: line[x] = (line[x] + ((left + above) >> 1)) & 255
            elif filt == 4:
                p = left + above - upper_left; pa, pb, pc = abs(p - left), abs(p - above), abs(p - upper_left)
                line[x] = (line[x] + (left if pa <= pb and pa <= pc else above if pb <= pc else upper_left)) & 255
            elif filt != 0: raise ValueError(f"{path}: unsupported PNG filter {filt}")
        pixels[y * stride:(y + 1) * stride] = line; previous = line
    return width, height, pixels

def sinc(value): return 1 if value == 0 else math.sin(math.pi * value) / (math.pi * value)
def lanczos(value): return 0 if abs(value) >= 3 else sinc(value) * sinc(value / 3)

def resample(source, width, height, target_width, target_height):
    """Separable Lanczos-3 RGBA resize, preserving alpha for painted edges."""
    def weights(source_size, target_size, index):
        center = (index + .5) * source_size / target_size - .5
        left, right = math.floor(center - 3), math.ceil(center + 3)
        rows = [(max(0, min(source_size - 1, sample)), lanczos(center - sample)) for sample in range(left, right + 1)]
        total = sum(weight for _, weight in rows) or 1
        return [(sample, weight / total) for sample, weight in rows]
    horizontal = [weights(width, target_width, x) for x in range(target_width)]
    vertical = [weights(height, target_height, y) for y in range(target_height)]
    middle = bytearray(target_width * height * 4)
    for y in range(height):
        for x, row in enumerate(horizontal):
            for channel in range(4):
                middle[(y * target_width + x) * 4 + channel] = max(0, min(255, round(sum(source[(y * width + sx) * 4 + channel] * weight for sx, weight in row))))
    out = bytearray(target_width * target_height * 4)
    for y, row in enumerate(vertical):
        for x in range(target_width):
            for channel in range(4):
                out[(y * target_width + x) * 4 + channel] = max(0, min(255, round(sum(middle[(sy * target_width + x) * 4 + channel] * weight for sy, weight in row))))
    return out

def crop(source, source_width, rect):
    x, y, width, height = rect; out = bytearray(width * height * 4)
    for row in range(height): out[row * width * 4:(row + 1) * width * 4] = source[((y + row) * source_width + x) * 4:((y + row) * source_width + x + width) * 4]
    return out

def fit_crop(source, source_width, rect):
    x, y, width, height = rect; scale = min(MASTER_CELL[0] / width, MASTER_CELL[1] / height)
    fit_width, fit_height = round(width * scale), round(height * scale)
    placed_x, placed_y = (MASTER_CELL[0] - fit_width) // 2, (MASTER_CELL[1] - fit_height) // 2
    shrunk = resample(crop(source, source_width, rect), width, height, fit_width, fit_height)
    master = bytearray(MASTER_CELL[0] * MASTER_CELL[1] * 4)
    for row in range(fit_height): master[((placed_y + row) * MASTER_CELL[0] + placed_x) * 4:((placed_y + row) * MASTER_CELL[0] + placed_x + fit_width) * 4] = shrunk[row * fit_width * 4:(row + 1) * fit_width * 4]
    return master, scale, placed_x, placed_y

def half_size(master): return resample(master, MASTER_CELL[0], MASTER_CELL[1], *RUNTIME_CELL)

def alpha_bounds(pixels, width, height):
    hits = [(x, y) for y in range(height) for x in range(width) if pixels[(y * width + x) * 4 + 3] > 8]
    if not hits: raise ValueError("frame has no visible alpha")
    xs, ys = [item[0] for item in hits], [item[1] for item in hits]
    return [min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1]

def png(width, height, pixels):
    def chunk(kind, data): return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    rows = b"".join(b"\0" + pixels[row * width * 4:(row + 1) * width * 4] for row in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")

def pack(cells):
    width = RUNTIME_CELL[0] * len(cells); output = bytearray(width * RUNTIME_CELL[1] * 4)
    for index, cell in enumerate(cells):
        for row in range(RUNTIME_CELL[1]): output[(row * width + index * RUNTIME_CELL[0]) * 4:(row * width + (index + 1) * RUNTIME_CELL[0]) * 4] = cell[row * RUNTIME_CELL[0] * 4:(row + 1) * RUNTIME_CELL[0] * 4]
    return width, output

def source_key(frame): return f"{frame.get('sourceSet', 'v2')}:{frame['source']}"
def source_path(frame): return SOURCE_DIRS[frame.get("sourceSet", "v2")] / frame["source"]
def source_record(frame):
    path = source_path(frame); width, height, _ = read_png(path)
    source_set = frame.get("sourceSet", "v2")
    return {"file": f"assets/2d/master/sprite-rig-{source_set}/{frame['source']}", "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "width": width, "height": height}

def build():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    decoded = {source_key(frame): read_png(source_path(frame)) for frame in FRAMES}
    runtime_cells = {}; frames = {}; source_frames = {}
    for frame in FRAMES:
        source_width, source_height, pixels = decoded[source_key(frame)]
        x, y, width, height = frame["sourceRect"]
        if x < 0 or y < 0 or x + width > source_width or y + height > source_height: raise ValueError(f"{frame['id']}: sourceRect exceeds source")
        if not all(x <= px <= x + width and y <= py <= y + height for px, py in frame["anchors"].values()): raise ValueError(f"{frame['id']}: anchor outside sourceRect")
        master, scale, placed_x, placed_y = fit_crop(pixels, source_width, frame["sourceRect"])
        runtime_cells[frame["id"]] = half_size(master)
        runtime_anchors = {name: [round(((px - x) * scale + placed_x) / 2, 4), round(((py - y) * scale + placed_y) / 2, 4)] for name, (px, py) in frame["anchors"].items()}
        source_frames[frame["id"]] = {"source": source_key(frame), "sourceRect": list(frame["sourceRect"]), "anchors": {name: list(value) for name, value in frame["anchors"].items()}}
        frames[frame["id"]] = {"sheet": frame["sheet"], "rect": None, "anchors": runtime_anchors, "paintBounds": alpha_bounds(runtime_cells[frame["id"]], *RUNTIME_CELL), **({"presentationScale": frame["presentationScale"]} if "presentationScale" in frame else {})}
    sheets = {}
    for name in dict.fromkeys(frame["sheet"] for frame in FRAMES):
        ordered = [frame for frame in FRAMES if frame["sheet"] == name]; width, pixels = pack([runtime_cells[frame["id"]] for frame in ordered])
        (OUTPUT_DIR / f"{name}.png").write_bytes(png(width, RUNTIME_CELL[1], pixels))
        sheets[name] = {"file": f"{name}.png", "width": width, "height": RUNTIME_CELL[1], "frameWidth": RUNTIME_CELL[0], "frameHeight": RUNTIME_CELL[1], "frameCount": len(ordered)}
        for index, frame in enumerate(ordered): frames[frame["id"]]["index"] = index; frames[frame["id"]]["rect"] = [index * RUNTIME_CELL[0], 0, *RUNTIME_CELL]
    manifest = {"version": 4, "source": "approved-imagegen-rig-v5-directional-cuffs", "sources": {source_key(frame): source_record(frame) for frame in FRAMES}, "masterCell": list(MASTER_CELL), "runtimeCell": list(RUNTIME_CELL), "sheets": sheets, "frames": frames, "sourceFrames": source_frames}
    (OUTPUT_DIR / "sprites.json").write_text(json.dumps(manifest, indent=2) + "\n")

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--out": OUTPUT_DIR = pathlib.Path(sys.argv[2]).resolve()
    elif len(sys.argv) != 1: raise SystemExit("usage: build-sprite-strips.py [--out directory]")
    build()
