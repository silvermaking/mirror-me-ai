#!/usr/bin/env python3
"""Pack Blender-authored transparent frames into browser-native WebP atlases.

This helper is invoked by build_map_challenger_art.py after Blender has rendered
the source PNGs.  Pillow is a build-time dependency only; the committed game
continues to load static repository-relative images on GitHub Pages.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def pack_frames(raw_dir: Path, output: Path, frame_ids: list[str], cell: tuple[int, int], columns: int) -> None:
    width, height = cell
    rows = (len(frame_ids) + columns - 1) // columns
    atlas = Image.new("RGBA", (width * columns, height * rows), (0, 0, 0, 0))
    for index, frame_id in enumerate(frame_ids):
        frame = Image.open(raw_dir / f"{frame_id}.png").convert("RGBA")
        if frame.size != cell:
            raise ValueError(f"{frame_id} is {frame.size}, expected {cell}")
        atlas.alpha_composite(frame, ((index % columns) * width, (index // columns) * height))
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, "WEBP", lossless=True, method=6, exact=True)


def transform_to_canvas(
    source: Image.Image,
    canvas_size: tuple[int, int],
    source_a: tuple[float, float],
    source_b: tuple[float, float],
    target_a: tuple[float, float],
    target_b: tuple[float, float],
) -> Image.Image:
    """Affine a two-anchor authored layer into a review canvas."""
    import math

    sax, say = source_a
    sbx, sby = source_b
    tax, tay = target_a
    tbx, tby = target_b
    source_length = max(0.001, math.hypot(sbx - sax, sby - say))
    target_length = max(0.001, math.hypot(tbx - tax, tby - tay))
    scale = target_length / source_length
    source_angle = math.atan2(sby - say, sbx - sax)
    target_angle = math.atan2(tby - tay, tbx - tax)
    angle = target_angle - source_angle
    cosine = math.cos(angle) / scale
    sine = math.sin(angle) / scale
    # Pillow expects inverse output->input coefficients.
    coefficients = (
        cosine,
        sine,
        sax - cosine * tax - sine * tay,
        -sine,
        cosine,
        say + sine * tax - cosine * tay,
    )
    return source.transform(canvas_size, Image.Transform.AFFINE, coefficients, Image.Resampling.BICUBIC)


def atlas_frame(atlas: Image.Image, frame: dict) -> Image.Image:
    x, y, width, height = frame["rect"]
    return atlas.crop((x, y, x + width, y + height))


def paste_frame(canvas: Image.Image, frame: Image.Image, xy: tuple[int, int]) -> None:
    canvas.alpha_composite(frame, xy)


def make_review(output_dir: Path, contract_path: Path, review_dir: Path) -> None:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    frames = contract["frames"]
    atlases = {
        name: Image.open(output_dir / spec["file"]).convert("RGBA")
        for name, spec in contract["atlases"].items()
        if name != "arena"
    }
    arena = Image.open(output_dir / contract["atlases"]["arena"]["file"]).convert("RGBA")
    arena = arena.resize((1280, 720), Image.Resampling.LANCZOS)
    review_dir.mkdir(parents=True, exist_ok=True)

    def frame_image(frame_id: str) -> Image.Image:
        frame = frames[frame_id]
        return atlas_frame(atlases[frame["atlas"]], frame)

    def compose(
        scene_name: str,
        boss_id: str,
        player_id: str,
        contact_core: bool,
        show_driver: bool = True,
        memory_count: int = 3,
    ) -> None:
        canvas = arena.copy()
        boss_spec = frames[boss_id]
        boss = frame_image(boss_id)
        boss_xy = (320, 38)
        paste_frame(canvas, boss, boss_xy)

        def boss_anchor(name: str) -> tuple[float, float]:
            x, y = boss_spec["anchors"][name]
            return boss_xy[0] + x, boss_xy[1] + y

        target = (965.0, 515.0)
        if show_driver:
            shoulder = boss_anchor("shoulder")
            elbow = (shoulder[0] + (target[0] - shoulder[0]) * 0.47, shoulder[1] + 6)
            wrist = (target[0] - 78, target[1] - 72)

            seal_spec = frames["lock-seal"]
            seal = frame_image("lock-seal")
            sx, sy = seal_spec["anchors"]["root"]
            paste_frame(canvas, seal, (round(target[0] - sx), round(target[1] - sy)))

            for frame_id, source_a_name, source_b_name, target_a, target_b in (
                ("driver-upper", "shoulder", "elbow", shoulder, elbow),
                ("driver-forearm", "elbow", "wrist", elbow, wrist),
                ("driver-stamp", "wrist", "stampCenter", wrist, target),
            ):
                spec = frames[frame_id]
                transformed = transform_to_canvas(
                    frame_image(frame_id),
                    canvas.size,
                    tuple(spec["anchors"][source_a_name]),
                    tuple(spec["anchors"][source_b_name]),
                    target_a,
                    target_b,
                )
                canvas.alpha_composite(transformed)

        plaque = frame_image("memory-plaque")
        plaque_size = (72, 72)
        plaque_small = plaque.resize(plaque_size, Image.Resampling.LANCZOS)
        plaque_root = frames["memory-plaque"]["anchors"]["root"]
        scaled_root = (plaque_root[0] * plaque_size[0] / plaque.width, plaque_root[1] * plaque_size[1] / plaque.height)
        for anchor_name in ("memory1", "memory2", "memory3")[:memory_count]:
            socket = boss_anchor(anchor_name)
            paste_frame(canvas, plaque_small, (round(socket[0] - scaled_root[0]), round(socket[1] - scaled_root[1])))

        player = frame_image(player_id)
        # Direct-contact review places the player at the boss's physical base;
        # LOCK keeps the wider decision spacing.
        player_xy = (470, 370) if contact_core else (380, 454)
        paste_frame(canvas, player, player_xy)
        if contact_core:
            blade_spec = frames["boundary-blade"]
            blade = frame_image("boundary-blade")
            hand_local = frames[player_id]["anchors"]["hand"]
            hand = (player_xy[0] + hand_local[0], player_xy[1] + hand_local[1])
            core = boss_anchor("core")
            transformed = transform_to_canvas(
                blade,
                canvas.size,
                tuple(blade_spec["anchors"]["hand"]),
                tuple(blade_spec["anchors"]["swordTip"]),
                hand,
                core,
            )
            canvas.alpha_composite(transformed)

        desktop_path = review_dir / f"c-art-{scene_name}-1280.png"
        mobile_path = review_dir / f"c-art-{scene_name}-320.png"
        canvas.convert("RGB").save(desktop_path, "PNG", optimize=True)
        canvas.resize((320, 180), Image.Resampling.LANCZOS).convert("RGB").save(mobile_path, "PNG", optimize=True)

    compose("waiting", "boss-closed", "player-idle", False, show_driver=False, memory_count=0)
    compose("lock", "boss-lock", "player-dash", False)
    compose("open", "boss-collapse-open", "player-attack-contact", True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    args = parser.parse_args()
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)

    for atlas_name in ("boss", "driver", "player", "relics"):
        spec = contract["atlases"][atlas_name]
        frame_ids = [frame_id for frame_id, frame in contract["frames"].items() if frame["atlas"] == atlas_name]
        frame_ids.sort(key=lambda frame_id: contract["frames"][frame_id]["order"])
        pack_frames(
            args.raw,
            args.output / spec["file"],
            frame_ids,
            (spec["frameWidth"], spec["frameHeight"]),
            spec["columns"],
        )

    arena = Image.open(args.raw / "arena-plate.png").convert("RGB")
    arena.save(args.output / contract["atlases"]["arena"]["file"], "WEBP", quality=93, method=6)
    make_review(args.output, args.contract, args.review)


if __name__ == "__main__":
    main()
