#!/usr/bin/env python3
"""Build the C-direction authored 2.5D vertical-slice art.

Run from the repository root:

  /opt/homebrew/bin/blender --background --factory-startup \
    --python tools/blender/build_map_challenger_art.py

Blender is strictly an offline art renderer here.  The generated browser assets
are fixed-camera WebP atlases; gameplay remains on game-core's 2D floor plane.
No generated reference pixels are read or copied by this script.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets/2d/source"
ATLAS_DIR = ROOT / "assets/2d/atlases"
CHARACTERS_BLEND = SOURCE_DIR / "map_challenger_characters.blend"
ARENA_BLEND = SOURCE_DIR / "map_challenger_arena.blend"
CONTRACT = ATLAS_DIR / "atlas.json"
PACKER = ROOT / "tools/blender/pack_map_challenger_atlas.py"
REVIEW_DIR = ROOT / "work/reviews/c-art-c1-c2"
# One higher, fixed orthographic quarter view is shared by arena and sprites.
# The higher elevation preserves both floor axes while avoiding the archived
# runtime's low, perspective-like diagonal read.
CAMERA_OFFSET = Vector((7.5, -10.5, 13.0))


@dataclass
class FrameSource:
    frame_id: str
    atlas: str
    collection: bpy.types.Collection
    width: int
    height: int
    ortho_scale: float
    target: tuple[float, float, float]
    anchors: dict[str, bpy.types.Object]


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def new_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    collection["authored_layer"] = True
    return collection


def material(name: str, color: tuple[float, float, float], roughness: float = 0.8,
             metallic: float = 0.0, emission: tuple[tuple[float, float, float], float] | None = None):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1.0)
    item.use_nodes = True
    bsdf = item.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    elif roughness >= 0.76 and metallic < 0.1:
        # Large, low-frequency value variation survives sprite downsampling and
        # avoids the default smooth-plastic PBR read without using image filters.
        nodes = item.node_tree.nodes
        links = item.node_tree.links
        coordinates = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.4
        noise.inputs["Detail"].default_value = 2.2
        noise.inputs["Roughness"].default_value = 0.72
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.28
        ramp.color_ramp.elements[0].color = (*(max(0.0, value * 0.62) for value in color), 1.0)
        ramp.color_ramp.elements[1].position = 0.76
        ramp.color_ramp.elements[1].color = (*(min(1.0, value * 1.18 + 0.025) for value in color), 1.0)
        links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return item


def mesh_object(name: str, vertices, faces, mat, collection: bpy.types.Collection,
                parent: bpy.types.Object | None = None, smooth: bool = False) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    item = bpy.data.objects.new(name, mesh)
    collection.objects.link(item)
    if parent:
        item.parent = parent
    item["authored_geometry"] = "custom_mesh"
    return item


def soften_edges(item: bpy.types.Object, width: float, segments: int = 3) -> bpy.types.Object:
    modifier = item.modifiers.new("authored_soft_edge", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    return item


def empty(name: str, collection: bpy.types.Collection, parent: bpy.types.Object | None = None,
          location=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    item = bpy.data.objects.new(name, None)
    item.empty_display_type = "PLAIN_AXES"
    item.empty_display_size = 0.16
    item.location = location
    collection.objects.link(item)
    if parent:
        item.parent = parent
    return item


def extruded_profile(name: str, points: list[tuple[float, float]], depth: float, mat,
                     collection: bpy.types.Collection, parent=None, location=(0, 0, 0),
                     rotation=(0, 0, 0), smooth=False) -> bpy.types.Object:
    """Extrude an authored X/Z outline; no stock box, cone, capsule or sphere."""
    vertices = [(x, -depth / 2, z) for x, z in points] + [(x, depth / 2, z) for x, z in points]
    count = len(points)
    faces = [tuple(range(count)), tuple(range(count * 2 - 1, count - 1, -1))]
    faces.extend((index, (index + 1) % count, count + (index + 1) % count, count + index) for index in range(count))
    item = mesh_object(name, vertices, faces, mat, collection, parent, smooth)
    item.location = location
    item.rotation_euler = rotation
    return item


def cloth_shell(name: str, points: list[tuple[float, float]], depth: float, bulge: float, mat,
                collection: bpy.types.Collection, parent=None, location=(0, 0, 0),
                rotation=(0, 0, 0)) -> bpy.types.Object:
    """A shallow two-ring cloth volume with a hand-authored outer silhouette."""
    count = len(points)
    center_x = sum(point[0] for point in points) / count
    center_z = sum(point[1] for point in points) / count
    mid = [((x + center_x) * 0.5, (z + center_z) * 0.5) for x, z in points]
    vertices = []
    # Front outer/mid/center, then back outer/mid/center.
    vertices.extend((x, -depth / 2, z) for x, z in points)
    vertices.extend((x, -depth / 2 - bulge, z) for x, z in mid)
    vertices.append((center_x, -depth / 2 - bulge * 1.25, center_z))
    back_start = len(vertices)
    vertices.extend((x, depth / 2, z) for x, z in points)
    vertices.extend((x, depth / 2 + bulge * 0.22, z) for x, z in mid)
    vertices.append((center_x, depth / 2 + bulge * 0.28, center_z))
    front_center = count * 2
    back_center = back_start + count * 2
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
        faces.append((front_center, count + index, count + nxt))
        faces.append((back_start + index, back_start + count + index, back_start + count + nxt, back_start + nxt))
        faces.append((back_center, back_start + count + nxt, back_start + count + index))
        faces.append((index, back_start + index, back_start + nxt, nxt))
    item = mesh_object(name, vertices, faces, mat, collection, parent, smooth=True)
    item.location = location
    item.rotation_euler = rotation
    item["construction"] = "two-ring authored cloth shell"
    return item


def loft_z(name: str, sections: list[tuple[float, float, float, float, float, float]], sides: int,
           mat, collection: bpy.types.Collection, parent=None, smooth=True) -> bpy.types.Object:
    """Irregular sculptural loft; sections are z, rx, ry, cx, cy, twist."""
    vertices = []
    for z, radius_x, radius_y, center_x, center_y, twist in sections:
        for index in range(sides):
            angle = math.tau * index / sides + twist
            warp = 1.0 + 0.035 * math.sin(angle * 3 + z * 1.7)
            vertices.append((center_x + radius_x * warp * math.cos(angle), center_y + radius_y * math.sin(angle), z))
    faces = []
    for row in range(len(sections) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((row * sides + index, row * sides + nxt, (row + 1) * sides + nxt, (row + 1) * sides + index))
    faces.append(tuple(reversed(range(sides))))
    last = (len(sections) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return mesh_object(name, vertices, faces, mat, collection, parent, smooth)


def loft_x(name: str, sections: list[tuple[float, float, float, float, float, float]], sides: int,
           mat, collection: bpy.types.Collection, parent=None, smooth=True) -> bpy.types.Object:
    """Authored arm loft; sections are x, ry, rz, cy, cz, twist."""
    vertices = []
    for x, radius_y, radius_z, center_y, center_z, twist in sections:
        for index in range(sides):
            angle = math.tau * index / sides + twist
            warp = 1.0 + 0.04 * math.sin(angle * 3 + x * 1.3)
            vertices.append((x, center_y + radius_y * warp * math.cos(angle), center_z + radius_z * math.sin(angle)))
    faces = []
    for row in range(len(sections) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((row * sides + index, row * sides + nxt, (row + 1) * sides + nxt, (row + 1) * sides + index))
    faces.append(tuple(reversed(range(sides))))
    last = (len(sections) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return mesh_object(name, vertices, faces, mat, collection, parent, smooth)


def ribbon_profile(name: str, path: list[tuple[float, float]], widths: list[float], depth: float,
                   mat, collection: bpy.types.Collection, parent=None, location=(0, 0, 0),
                   rotation=(0, 0, 0)) -> bpy.types.Object:
    """Build a bent cloth/limb strip around a hand-authored center line."""
    left, right = [], []
    for index, ((x, z), width) in enumerate(zip(path, widths)):
        previous = path[max(0, index - 1)]
        following = path[min(len(path) - 1, index + 1)]
        tangent_x, tangent_z = following[0] - previous[0], following[1] - previous[1]
        length = max(0.0001, math.hypot(tangent_x, tangent_z))
        normal_x, normal_z = -tangent_z / length, tangent_x / length
        left.append((x + normal_x * width, z + normal_z * width))
        right.append((x - normal_x * width, z - normal_z * width))
    outline = left + list(reversed(right))
    item = extruded_profile(name, outline, depth, mat, collection, parent, location, rotation)
    item["construction"] = "authored_centerline_ribbon"
    return item


def radial_plate(name: str, outer: list[float], inner: list[float] | None, depth: float, mat,
                 collection: bpy.types.Collection, parent=None, location=(0, 0, 0),
                 rotation=(0, 0, 0)) -> bpy.types.Object:
    """Custom radial ring/disc in local X/Y, including irregular silhouettes."""
    count = len(outer)
    inner = inner or [0.0] * count
    vertices = []
    for z in (-depth / 2, depth / 2):
        for radii in (outer, inner):
            for index, radius in enumerate(radii):
                angle = math.tau * index / count
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    outer_bottom = 0
    inner_bottom = count
    outer_top = count * 2
    inner_top = count * 3
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        faces.extend([
            (outer_bottom + index, outer_bottom + nxt, outer_top + nxt, outer_top + index),
            (inner_bottom + nxt, inner_bottom + index, inner_top + index, inner_top + nxt),
            (outer_top + index, outer_top + nxt, inner_top + nxt, inner_top + index),
            (outer_bottom + nxt, outer_bottom + index, inner_bottom + index, inner_bottom + nxt),
        ])
    item = mesh_object(name, vertices, faces, mat, collection, parent, False)
    item.location = location
    item.rotation_euler = rotation
    return item


def star_plate(name: str, points: int, outer_radius: float, inner_radius: float, depth: float,
               mat, collection, parent=None, location=(0, 0, 0), rotation=(0, 0, 0)):
    outline = []
    for index in range(points * 2):
        angle = math.tau * index / (points * 2) + math.pi / 2
        radius = outer_radius if index % 2 == 0 else inner_radius
        outline.append((radius * math.cos(angle), radius * math.sin(angle)))
    item = extruded_profile(name, outline, depth, mat, collection, parent, location, rotation)
    item["construction"] = "compass_star"
    return item


def horizontal_strip(name: str, points: list[tuple[float, float]], widths: list[float], z: float,
                     mat, collection: bpy.types.Collection) -> bpy.types.Object:
    left, right = [], []
    for index, ((x, y), width) in enumerate(zip(points, widths)):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        tx, ty = following[0] - previous[0], following[1] - previous[1]
        length = max(0.0001, math.hypot(tx, ty))
        nx, ny = -ty / length, tx / length
        left.append((x + nx * width, y + ny * width, z))
        right.append((x - nx * width, y - ny * width, z))
    vertices = left + list(reversed(right))
    return mesh_object(name, vertices, [tuple(range(len(vertices)))], mat, collection, smooth=False)


def look_at(item: bpy.types.Object, target: tuple[float, float, float]) -> None:
    item.rotation_euler = (Vector(target) - item.location).to_track_quat("-Z", "Y").to_euler()


def make_anchor(name: str, collection: bpy.types.Collection, location, parent=None) -> bpy.types.Object:
    anchor = empty(name, collection, parent, location)
    anchor["sprite_anchor"] = True
    return anchor


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "ink": material("map_ink_black", (0.016, 0.022, 0.027), 0.86),
        "ink_high": material("ink_edge_highlight", (0.065, 0.082, 0.088), 0.78),
        "ivory": material("sealed_ivory_cloth", (0.79, 0.71, 0.56), 0.94),
        "ivory_light": material("ivory_map_face", (0.96, 0.89, 0.72), 0.91),
        "ivory_dark": material("ivory_fold_shadow", (0.31, 0.27, 0.21), 0.98),
        "gold": material("worn_coordinate_gold", (0.65, 0.39, 0.09), 0.52, 0.42),
        "silver": material("survey_needle_silver", (0.47, 0.52, 0.52), 0.50, 0.55),
        "wax": material("royal_vermilion_wax", (0.48, 0.045, 0.028), 0.66),
        "wax_hot": material("wax_rim_light", (0.88, 0.13, 0.055), 0.55, emission=((0.8, 0.035, 0.01), 0.35)),
        "cobalt": material("cobalt_map_cloak", (0.018, 0.075, 0.24), 0.90),
        "cobalt_high": material("cobalt_folding_edge", (0.055, 0.19, 0.48), 0.78),
        "mask": material("blank_porcelain_face", (0.93, 0.94, 0.87), 0.86),
        "core": material("unwritten_white_core", (1.0, 1.0, 0.94), 0.35, emission=((1.0, 0.98, 0.82), 4.8)),
        "core_edge": material("core_gold_edge", (0.82, 0.59, 0.19), 0.38, 0.28, emission=((0.9, 0.42, 0.08), 1.2)),
        "river": material("single_map_river", (0.13, 0.17, 0.17), 0.96),
        "stone": material("unmapped_dark_stone", (0.025, 0.029, 0.032), 0.97),
        "ground": material("world_map_ivory", (0.53, 0.47, 0.35), 0.96),
        "ground_light": material("world_map_highland", (0.67, 0.59, 0.43), 0.94),
    }


def add_compass_crown(collection, mats, parent, location, tilt=(0, 0, 0), scale=1.0):
    crown = empty("compass_crown", collection, parent, location)
    crown.rotation_euler = tilt
    outer = [1.0 + 0.055 * math.sin(index * 2.1) for index in range(16)]
    inner = [0.72 + 0.025 * math.cos(index * 1.7) for index in range(16)]
    ring = radial_plate("compass_crown_ring", outer, inner, 0.12, mats["gold"], collection, crown)
    ring.scale = (scale, scale, scale)
    star = star_plate("compass_rose", 8, 0.84 * scale, 0.25 * scale, 0.09, mats["ivory_light"], collection, crown, (0, 0, 0.035), (math.pi / 2, 0, 0))
    for index in range(8):
        angle = math.tau * index / 8
        spike = ribbon_profile(
            f"crown_spike_{index+1}",
            [(0.65 * scale, 0), (1.05 * scale, 0.08 * scale), (1.30 * scale, 0)],
            [0.11 * scale, 0.16 * scale, 0.01],
            0.08,
            mats["gold"],
            collection,
            crown,
            rotation=(0, angle, 0),
        )
        spike.rotation_euler.z = angle
    return crown


def add_memory_slots(collection, mats, parent, open_pose: bool):
    slots = []
    for index, z in enumerate((3.27, 2.67, 2.07), 1):
        x = -1.44 + (index - 2) * 0.08
        slot = empty(f"memory_slot_{index}", collection, parent, (x, -0.90, z))
        slots.append(slot)
        radial_plate(
            f"memory_socket_{index}",
            [0.28 + 0.025 * math.sin(i * 2.4 + index) for i in range(12)],
            [0.19] * 12,
            0.09,
            mats["gold"],
            collection,
            slot,
            rotation=(math.pi / 2, 0, 0),
        )
    return slots


def add_core(collection, mats, parent, location, intensity="open"):
    core = empty("blank_core", collection, parent, location)
    points = [(-0.58, -0.04), (-0.35, 0.53), (0.12, 0.72), (0.52, 0.39), (0.62, -0.18), (0.13, -0.62), (-0.42, -0.47)]
    extruded_profile("unwritten_core_face", points, 0.12, mats["core"], collection, core)
    for index, angle in enumerate((-0.62, -0.18, 0.33, 0.77)):
        ribbon_profile(
            f"core_edge_ray_{index+1}",
            [(0, 0), (0.64, 0.04), (0.92, 0)],
            [0.035, 0.055, 0.005],
            0.055,
            mats["core_edge"],
            collection,
            core,
            rotation=(0, 0, angle),
        )
    if intensity == "hit":
        for index in range(5):
            angle = math.tau * index / 5 + 0.3
            ribbon_profile(
                f"core_contact_break_{index+1}",
                [(0.38, 0), (0.78, 0.12), (1.17, 0)],
                [0.06, 0.035, 0.006],
                0.04,
                mats["core"],
                collection,
                core,
                rotation=(0, 0, angle),
            )
    return core


def boss_pose(frame_id: str, mode: str, mats) -> FrameSource:
    collection = new_collection(frame_id)
    root = empty(f"{frame_id}_root", collection)
    root["pose"] = mode
    root["silhouette_contract"] = "large asymmetric mantle, compass crown, long driver shoulder"

    collapse = mode in {"collapse_open", "core_hit"}
    hit = mode == "core_hit"
    upper_shift = 0.58 if collapse else (0.18 if mode == "lock" else 0.0)
    body = loft_z(
        f"{frame_id}_ink_body",
        [
            (0.12, 1.38, 0.78, 0.16, 0.12, 0.03),
            (0.72, 1.58, 0.86, 0.05, 0.02, -0.02),
            (1.62, 1.36, 0.76, 0.10 + upper_shift * 0.25, 0.0, 0.04),
            (2.60, 1.22, 0.71, 0.18 + upper_shift * 0.55, 0.0, -0.03),
            (3.52, 0.82, 0.56, 0.23 + upper_shift, 0.01, 0.05),
            (4.05, 0.48, 0.42, 0.18 + upper_shift, 0.02, 0.0),
        ],
        13,
        mats["ink"],
        collection,
        root,
    )
    body["mass"] = "ink interior"

    # The mantle is built from long, deliberately non-rectangular cloth shells.
    if not collapse:
        left_outline = [(-2.58, 0.10), (-2.76, 0.58), (-2.84, 1.28), (-2.79, 2.02), (-2.61, 2.72), (-2.27, 3.40), (-1.92, 3.84), (-1.40, 4.10), (-0.72, 4.20), (-0.24, 3.92), (0.08, 3.58), (-0.03, 2.40), (-0.15, 1.14), (-0.38, 0.56), (-0.62, 0.26), (-1.18, 0.06), (-1.74, -0.02)]
        right_outline = [(0.04, 0.46), (-0.02, 1.38), (0.01, 2.54), (-0.02, 3.40), (0.31, 3.84), (0.66, 4.12), (1.08, 4.08), (1.46, 3.92), (1.81, 3.58), (2.05, 3.16), (2.20, 2.66), (2.22, 2.16), (2.08, 1.56), (1.92, 1.08), (1.61, 0.65), (1.26, 0.42), (0.58, 0.32)]
        left_rot = (0, 0, math.radians(-2 if mode == "closed" else -6))
        right_rot = (0, 0, math.radians(3 if mode == "closed" else 8))
    else:
        left_outline = [(-3.18, 0.02), (-3.27, 0.46), (-3.25, 0.94), (-3.03, 1.82), (-2.70, 2.80), (-2.24, 3.52), (-1.50, 4.05), (-0.95, 3.96), (-0.55, 3.64), (-0.42, 2.52), (-0.42, 1.18), (-0.67, 0.62), (-1.05, 0.28), (-1.48, 0.02), (-2.12, -0.12)]
        right_outline = [(0.15, 0.12), (0.28, 1.08), (0.44, 2.20), (0.79, 3.28), (1.26, 4.05), (1.82, 4.27), (2.42, 4.26), (2.86, 3.94), (3.25, 3.44), (3.48, 2.76), (3.52, 2.08), (3.41, 1.32), (3.20, 0.72), (2.71, 0.25), (2.04, -0.02), (1.30, 0.04), (0.75, 0.28)]
        left_rot = (0.02, -0.14, math.radians(-18 if not hit else -23))
        right_rot = (-0.04, 0.11, math.radians(17 if not hit else 25))
    left_mantle = soften_edges(cloth_shell("left_sealed_map_mantle", left_outline, 0.30, 0.22, mats["ivory"], collection, root, (0, -0.48, 0), left_rot), 0.075)
    right_mantle = soften_edges(cloth_shell("right_sealed_map_mantle", right_outline, 0.32, 0.25, mats["ivory_light"], collection, root, (0, -0.40, 0), right_rot), 0.08)
    # Thin physical brass hems reinforce the long curves without becoming HUD outlines.
    ribbon_profile("left_mantle_brass_hem", left_outline[: max(6, len(left_outline) // 2 + 1)], [0.025] * max(6, len(left_outline) // 2 + 1), 0.045, mats["gold"], collection, left_mantle, (0, -0.22, 0))
    ribbon_profile("right_mantle_brass_hem", right_outline[3: max(9, len(right_outline) // 2 + 3)], [0.022] * len(right_outline[3: max(9, len(right_outline) // 2 + 3)]), 0.045, mats["gold"], collection, right_mantle, (0, -0.23, 0))
    left_mantle["material_story"] = "smooth sealed map cloth, not torn paper"
    right_mantle["material_story"] = "outer shell displaced by committed miss"

    # Broad fold shadows keep the mantle sculptural after downsampling.
    for index, (x, z, lean) in enumerate(((-1.95, 1.10, -0.17), (-1.52, 2.08, 0.10), (1.08, 1.15, -0.09), (1.62, 2.30, 0.13))):
        ribbon_profile(
            f"mantle_major_fold_{index+1}",
            [(0, -0.48), (0.05, 0.05), (0.19, 0.72)],
            [0.055, 0.10, 0.025],
            0.055,
            mats["ivory_dark"],
            collection,
            root,
            (x, -0.67, z),
            (0, 0, lean),
        )

    # Deep black face void; the crown reads as the boss's intent, not an icon.
    face = extruded_profile(
        "ink_face_void",
        [(-0.58, -0.24), (-0.66, 0.06), (-0.55, 0.36), (-0.26, 0.57), (0.08, 0.62), (0.42, 0.49), (0.62, 0.22), (0.64, -0.12), (0.43, -0.39), (0.05, -0.53), (-0.34, -0.45)],
        0.14,
        mats["ink"],
        collection,
        root,
        (upper_shift * 0.72, -0.90, 3.30),
        (0, 0, math.radians(-7 if collapse else 0)),
    )
    face["expression"] = "confidence through alignment, no facial UI"

    crown = add_compass_crown(
        collection,
        mats,
        root,
        (0.12 + upper_shift, -0.10, 4.34 if not collapse else 4.14),
        (math.radians(7), math.radians(5), math.radians(-15 if collapse else (5 if mode == "lock" else 0))),
        0.92,
    )
    crown["state_read"] = "orientation commits with the body"

    # The authored shoulder is the only runtime entry point for the separated long arm.
    shoulder_location = (1.80 + upper_shift * 0.75, -0.18, 3.45 if not collapse else 3.05)
    shoulder = make_anchor(f"{frame_id}_shoulder", collection, shoulder_location, root)
    loft_x(
        "driver_shoulder_socket",
        [(0.0, 0.50, 0.58, 0, 0, 0), (0.34, 0.62, 0.67, 0, 0.02, 0.08), (0.74, 0.46, 0.52, 0, -0.03, -0.04)],
        11,
        mats["ink_high"],
        collection,
        shoulder,
    )
    radial_plate("shoulder_coordinate_girdle", [0.66] * 12, [0.53] * 12, 0.10, mats["gold"], collection, shoulder, (0.31, 0, 0), (0, math.pi / 2, 0))

    # A small opposite brace prevents a symmetric robe silhouette.
    brace_path = [(-1.20, 1.20), (-1.72, 0.62), (-2.04, 0.10)] if not collapse else [(-1.0, 1.25), (-1.58, 0.52), (-1.92, -0.05)]
    ribbon_profile("left_ground_brace", brace_path, [0.24, 0.18, 0.08], 0.31, mats["ink_high"], collection, root, (0, -0.22, 0))
    for offset in (-0.16, 0.0, 0.16):
        ribbon_profile("brace_claw", [(0, 0), (-0.16 + offset, -0.32), (-0.33 + offset, -0.42)], [0.075, 0.055, 0.01], 0.08, mats["gold"], collection, root, (-1.96, -0.48, 0.14))

    memory_slots = add_memory_slots(collection, mats, root, collapse)
    core_location = (0.18 + upper_shift * 0.40, -1.02, 2.10 if not hit else 2.20)
    if collapse:
        add_core(collection, mats, root, core_location, "hit" if hit else "open")
    else:
        # A sealed dark inset preserves the future core location without leaking white.
        extruded_profile("sealed_core_inset", [(-0.42, -0.35), (-0.48, 0.25), (0.0, 0.51), (0.45, 0.24), (0.37, -0.39)], 0.08, mats["ink"], collection, root, core_location)

    if hit:
        for index, angle in enumerate((-0.85, -0.30, 0.26, 0.72)):
            ribbon_profile(
                f"impact_recoil_line_{index+1}",
                [(0, 0), (-0.22, 0.28), (-0.50, 0.52)],
                [0.055, 0.035, 0.004],
                0.035,
                mats["core_edge"],
                collection,
                root,
                (core_location[0], -1.15, core_location[2]),
                (0, 0, angle),
            )

    root_anchor = make_anchor(f"{frame_id}_root_anchor", collection, (0, 0, 0), root)
    feet = make_anchor(f"{frame_id}_feet", collection, (0, 0, 0.05), root)
    core_anchor = make_anchor(f"{frame_id}_core_anchor", collection, core_location, root)
    return FrameSource(
        frame_id,
        "boss",
        collection,
        640,
        512,
        6.90,
        (0.15, 0.0, 2.34),
        {
            "feet": feet,
            "root": root_anchor,
            "core": core_anchor,
            "shoulder": shoulder,
            "memory1": memory_slots[0],
            "memory2": memory_slots[1],
            "memory3": memory_slots[2],
        },
    )


def driver_upper(mats) -> FrameSource:
    collection = new_collection("driver-upper")
    root = empty("driver_upper_root", collection)
    loft_x(
        "upper_arm_ink_muscle",
        [
            (0.05, 0.57, 0.66, 0, 0.02, 0),
            (0.42, 0.69, 0.78, 0, 0.04, 0.08),
            (1.05, 0.58, 0.65, 0.02, 0.08, -0.04),
            (1.78, 0.48, 0.56, -0.02, 0.02, 0.06),
            (2.55, 0.39, 0.47, 0.0, -0.04, -0.02),
            (3.08, 0.43, 0.50, 0.0, 0.0, 0.04),
        ],
        12,
        mats["ink"],
        collection,
        root,
    )
    # Dark overlapping tendon plates hide the IK joint without turning the arm
    # into a beige block chain; ivory is reserved for the boss mantle.
    for index, x in enumerate((0.45, 0.92, 1.39, 1.86, 2.33)):
        extruded_profile(
            f"upper_arm_tendon_plate_{index+1}",
            [(-0.27, -0.36), (-0.21, 0.40), (0.03, 0.51), (0.31, 0.30), (0.25, -0.33), (0.01, -0.44)],
            0.11,
            mats["ink_high"],
            collection,
            root,
            (x, -0.53, 0.02 + 0.03 * math.sin(index)),
            (0, 0, math.radians((-6, 5, -3, 7, -4)[index])),
        )
    for index, x in enumerate((0.28, 1.12, 2.04, 2.82)):
        radial_plate(
            f"upper_coordinate_band_{index+1}",
            [0.62 - index * 0.035] * 12,
            [0.54 - index * 0.035] * 12,
            0.09,
            mats["gold"],
            collection,
            root,
            (x, 0, 0),
            (0, math.pi / 2, 0),
        )
    shoulder = make_anchor("driver_upper_shoulder", collection, (0.05, 0, 0), root)
    elbow = make_anchor("driver_upper_elbow", collection, (3.08, 0, 0), root)
    return FrameSource("driver-upper", "driver", collection, 640, 320, 3.35, (1.55, 0, 0), {"shoulder": shoulder, "elbow": elbow})


def driver_forearm(mats) -> FrameSource:
    collection = new_collection("driver-forearm")
    root = empty("driver_forearm_root", collection)
    loft_x(
        "forearm_ink_chain",
        [
            (0.02, 0.46, 0.52, 0, 0, 0),
            (0.55, 0.55, 0.61, 0.02, 0.06, -0.04),
            (1.25, 0.44, 0.53, -0.02, 0.12, 0.07),
            (2.05, 0.38, 0.46, 0.02, 0.02, -0.06),
            (2.86, 0.32, 0.39, -0.02, -0.08, 0.03),
            (3.52, 0.36, 0.43, 0, -0.03, 0),
        ],
        11,
        mats["ink"],
        collection,
        root,
    )
    # Compression rings preserve a continuous black muscle mass; only three
    # thin brass rings catch the light.
    for index, x in enumerate((0.40, 0.88, 1.36, 1.84, 2.32, 2.80, 3.24)):
        radius = 0.49 - index * 0.018
        radial_plate(
            f"forearm_compression_ring_{index+1}",
            [radius] * 12,
            [radius - (0.045 if index in {1, 3, 5} else 0.025)] * 12,
            0.08,
            mats["gold" if index in {1, 3, 5} else "ink_high"],
            collection,
            root,
            (x, 0, 0),
            (0, math.pi / 2, 0),
        )
    elbow = make_anchor("driver_forearm_elbow", collection, (0.02, 0, 0), root)
    wrist = make_anchor("driver_forearm_wrist", collection, (3.52, 0, -0.03), root)
    return FrameSource("driver-forearm", "driver", collection, 640, 320, 3.40, (1.78, 0, 0), {"elbow": elbow, "wrist": wrist})


def driver_stamp(mats) -> FrameSource:
    collection = new_collection("driver-stamp")
    root = empty("driver_stamp_root", collection)
    loft_x(
        "stamp_wrist_bellows",
        [(0.0, 0.35, 0.40, 0, 0, 0), (0.36, 0.46, 0.48, 0, 0.02, 0.09), (0.78, 0.31, 0.34, 0, -0.03, -0.04)],
        10,
        mats["ink"],
        collection,
        root,
    )
    for index, x in enumerate((0.14, 0.36, 0.58)):
        radial_plate(
            f"wrist_bellows_ring_{index+1}",
            [0.43 - index * 0.035] * 12,
            [0.34 - index * 0.035] * 12,
            0.08,
            mats["gold" if index == 1 else "ink_high"],
            collection,
            root,
            (x, 0, 0),
            (0, math.pi / 2, 0),
        )
    stamp_center = (1.42, -0.05, -0.05)
    stamp = empty("stamp_face_root", collection, root, stamp_center)
    radial_plate(
        "royal_compass_stamp_body",
        [0.83 + 0.05 * math.sin(index * 1.9) for index in range(16)],
        [0.0] * 16,
        0.28,
        mats["ink_high"],
        collection,
        stamp,
        rotation=(math.pi / 2, 0, 0),
    )
    radial_plate(
        "stamp_brass_coordinate_ring",
        [0.72] * 16,
        [0.57] * 16,
        0.08,
        mats["gold"],
        collection,
        stamp,
        (0, -0.18, 0),
        (math.pi / 2, 0, 0),
    )
    star_plate("stamp_compass_rose", 8, 0.55, 0.16, 0.08, mats["ivory_light"], collection, stamp, (0, -0.23, 0), (math.pi / 2, 0, 0))
    wrist = make_anchor("driver_stamp_wrist", collection, (0.0, 0, 0), root)
    center = make_anchor("driver_stamp_center", collection, stamp_center, root)
    return FrameSource("driver-stamp", "driver", collection, 640, 320, 3.10, (0.75, 0, 0), {"wrist": wrist, "stampCenter": center})


PLAYER_POSES = {
    "player-idle": {
        "hip": (0.0, 0.72), "head": (0.02, 1.72), "hand": (0.42, 1.13), "tip": (1.02, 1.47),
        "left_foot": (-0.22, 0.02), "right_foot": (0.23, 0.03), "cloak": [(-0.50, 0.20), (-0.58, 0.94), (-0.30, 1.55), (0.17, 1.58), (0.52, 0.94), (0.31, 0.18), (0.0, 0.42)],
    },
    "player-run": {
        "hip": (0.10, 0.67), "head": (0.21, 1.64), "hand": (0.64, 1.06), "tip": (1.20, 1.20),
        "left_foot": (-0.35, 0.02), "right_foot": (0.42, 0.03), "cloak": [(-0.72, 0.26), (-0.66, 1.03), (-0.28, 1.55), (0.25, 1.49), (0.54, 0.89), (0.27, 0.24), (-0.14, 0.45)],
    },
    "player-dash": {
        "hip": (0.16, 0.53), "head": (0.39, 1.43), "hand": (0.79, 0.88), "tip": (1.43, 0.95),
        "left_foot": (-0.16, 0.02), "right_foot": (0.53, 0.03), "cloak": [(-1.05, 0.30), (-0.90, 0.94), (-0.28, 1.45), (0.42, 1.34), (0.69, 0.75), (0.33, 0.20), (-0.27, 0.42)],
    },
    "player-attack-windup": {
        "hip": (-0.07, 0.66), "head": (-0.15, 1.63), "hand": (-0.58, 1.42), "tip": (-1.12, 1.94),
        "left_foot": (-0.35, 0.02), "right_foot": (0.30, 0.03), "cloak": [(-0.69, 0.23), (-0.75, 1.05), (-0.36, 1.61), (0.16, 1.55), (0.43, 0.83), (0.20, 0.17), (-0.18, 0.40)],
    },
    "player-attack-contact": {
        "hip": (0.10, 0.58), "head": (0.35, 1.52), "hand": (0.82, 1.11), "tip": (1.66, 1.20),
        "left_foot": (-0.32, 0.02), "right_foot": (0.48, 0.03), "cloak": [(-0.73, 0.19), (-0.65, 0.93), (-0.18, 1.52), (0.48, 1.38), (0.70, 0.70), (0.35, 0.16), (-0.12, 0.40)],
    },
    "player-attack-recoil": {
        "hip": (-0.10, 0.64), "head": (-0.26, 1.57), "hand": (0.18, 1.04), "tip": (0.78, 0.74),
        "left_foot": (-0.40, 0.02), "right_foot": (0.30, 0.03), "cloak": [(-0.62, 0.18), (-0.72, 0.93), (-0.42, 1.56), (0.08, 1.56), (0.43, 0.89), (0.22, 0.18), (-0.18, 0.37)],
    },
    "player-hurt": {
        "hip": (-0.16, 0.55), "head": (-0.42, 1.36), "hand": (0.07, 0.82), "tip": (0.61, 0.44),
        "left_foot": (-0.48, 0.02), "right_foot": (0.25, 0.03), "cloak": [(-0.61, 0.12), (-0.84, 0.80), (-0.53, 1.42), (-0.05, 1.46), (0.36, 0.70), (0.17, 0.12), (-0.20, 0.29)],
    },
}


def add_player_sword(collection, mats, root, hand, tip, frame_id):
    hx, hz = hand
    tx, tz = tip
    dx, dz = tx - hx, tz - hz
    length = max(0.01, math.hypot(dx, dz))
    angle = math.atan2(dz, dx)
    sword = empty(f"{frame_id}_sword_root", collection, root, (hx, -0.42, hz))
    sword.rotation_euler.z = angle
    blade_outline = [(0.0, -0.055), (length * 0.67, -0.08), (length, 0.0), (length * 0.70, 0.10), (0.0, 0.065)]
    extruded_profile("broken_boundary_blade", blade_outline, 0.075, mats["silver"], collection, sword)
    ribbon_profile("gold_boundary_break", [(length * 0.54, -0.06), (length * 0.70, 0.07), (length * 0.83, -0.015)], [0.025, 0.035, 0.005], 0.085, mats["gold"], collection, sword)
    extruded_profile("sword_crossguard", [(-0.08, -0.22), (0.04, -0.26), (0.11, 0.25), (-0.02, 0.28)], 0.10, mats["gold"], collection, sword, (0.02, 0, 0))


def player_pose(frame_id: str, mats) -> FrameSource:
    pose = PLAYER_POSES[frame_id]
    collection = new_collection(frame_id)
    root = empty(f"{frame_id}_root", collection)
    root["pose_contract"] = "whole-body authored key pose, floor root unchanged"
    hip_x, hip_z = pose["hip"]
    head_x, head_z = pose["head"]
    left_foot = pose["left_foot"]
    right_foot = pose["right_foot"]

    # Feet and legs are bent authored ribbons rather than capsules.
    ribbon_profile("left_leg", [left_foot, ((left_foot[0] + hip_x) * 0.55 - 0.05, 0.33), (hip_x - 0.16, hip_z)], [0.09, 0.13, 0.17], 0.20, mats["ink"], collection, root, (0, -0.02, 0))
    ribbon_profile("right_leg", [right_foot, ((right_foot[0] + hip_x) * 0.52 + 0.04, 0.34), (hip_x + 0.16, hip_z)], [0.09, 0.13, 0.17], 0.20, mats["ink_high"], collection, root, (0, 0.06, 0))
    left_boot = extruded_profile("left_boot", [(-0.22, 0.01), (-0.14, -0.07), (0.10, -0.06), (0.28, -0.01), (0.33, 0.06), (0.18, 0.14), (-0.13, 0.13)], 0.20, mats["ink"], collection, root, (left_foot[0], -0.08, 0.04))
    right_boot = extruded_profile("right_boot", [(-0.19, 0.00), (-0.11, -0.07), (0.15, -0.05), (0.33, 0.01), (0.35, 0.07), (0.19, 0.14), (-0.10, 0.13)], 0.21, mats["ink"], collection, root, (right_foot[0], 0.03, 0.04))
    soften_edges(left_boot, 0.035, 2)
    soften_edges(right_boot, 0.035, 2)

    cloak = soften_edges(cloth_shell("cobalt_map_mantle", pose["cloak"], 0.24, 0.10, mats["cobalt"], collection, root, (0, 0.05, 0)), 0.045, 2)
    cloak["silhouette"] = "single asymmetric cobalt sweep"
    # One broad highlight follows the body action line and survives 320px reduction.
    ribbon_profile("cobalt_major_fold", [(hip_x - 0.18, hip_z - 0.30), (hip_x + 0.03, 1.05), (head_x - 0.08, head_z - 0.14)], [0.035, 0.07, 0.02], 0.06, mats["cobalt_high"], collection, root, (0, -0.18, 0))

    # Blank face and compass-needle collar distinguish the player from the ink boss.
    loft_z(
        "blank_face",
        [(head_z - 0.20, 0.17, 0.14, head_x, -0.20, 0.02), (head_z + 0.04, 0.19, 0.15, head_x + 0.01, -0.20, -0.03), (head_z + 0.24, 0.12, 0.12, head_x - 0.01, -0.20, 0.04)],
        9,
        mats["mask"],
        collection,
        root,
    )
    ribbon_profile("cobalt_hood", [(head_x - 0.25, head_z - 0.20), (head_x - 0.08, head_z + 0.23), (head_x + 0.22, head_z - 0.18)], [0.08, 0.12, 0.07], 0.19, mats["cobalt_high"], collection, root, (0, 0.02, 0))
    ribbon_profile("gold_collar_needle", [(head_x - 0.18, head_z - 0.28), (head_x + 0.02, head_z - 0.38), (head_x + 0.22, head_z - 0.25)], [0.025, 0.035, 0.015], 0.08, mats["gold"], collection, root, (0, -0.25, 0))

    hand = pose["hand"]
    shoulder = (hip_x + 0.10, 1.27)
    elbow = ((shoulder[0] + hand[0]) * 0.5, (shoulder[1] + hand[1]) * 0.5 + (0.14 if "windup" in frame_id else -0.07))
    ribbon_profile("sword_arm", [shoulder, elbow, hand], [0.15, 0.12, 0.08], 0.19, mats["cobalt_high"], collection, root, (0, -0.20, 0))
    loft_z("ivory_sword_hand", [(hand[1] - 0.09, 0.08, 0.07, hand[0], -0.28, 0), (hand[1] + 0.09, 0.10, 0.08, hand[0], -0.28, 0.06)], 7, mats["mask"], collection, root)

    add_player_sword(collection, mats, root, hand, pose["tip"], frame_id)
    feet_anchor = make_anchor(f"{frame_id}_feet", collection, (0, 0, 0.04), root)
    root_anchor = make_anchor(f"{frame_id}_root_anchor", collection, (0, 0, 0.04), root)
    hand_anchor = make_anchor(f"{frame_id}_hand", collection, (hand[0], -0.42, hand[1]), root)
    tip_anchor = make_anchor(f"{frame_id}_sword_tip", collection, (pose["tip"][0], -0.42, pose["tip"][1]), root)
    return FrameSource(frame_id, "player", collection, 256, 256, 2.55, (0.0, 0.0, 1.05), {"feet": feet_anchor, "root": root_anchor, "hand": hand_anchor, "swordTip": tip_anchor})


def relic_frame(frame_id: str, mats) -> FrameSource:
    collection = new_collection(frame_id)
    root = empty(f"{frame_id}_root", collection)
    anchors = {"root": make_anchor(f"{frame_id}_root_anchor", collection, (0, 0, 0), root)}
    if frame_id == "memory-plaque":
        outline = [(-0.76, -0.55), (-0.84, 0.25), (-0.42, 0.72), (0.28, 0.78), (0.72, 0.36), (0.78, -0.42), (0.16, -0.72)]
        extruded_profile("smooth_memory_map_plaque", outline, 0.16, mats["ivory_light"], collection, root)
        radial_plate("memory_silver_socket", [0.30] * 12, [0.22] * 12, 0.09, mats["silver"], collection, root, (0, -0.17, 0), (math.pi / 2, 0, 0))
        ribbon_profile("memory_survey_needle", [(0, -0.28), (0.03, 0.03), (-0.10, 0.36)], [0.025, 0.045, 0.004], 0.05, mats["silver"], collection, root, (0, -0.25, 0))
        ribbon_profile("plaque_coordinate", [(-0.57, 0.44), (-0.04, 0.54), (0.54, 0.31)], [0.018, 0.026, 0.012], 0.035, mats["gold"], collection, root, (0, -0.22, 0))
        ortho = 2.10
    elif frame_id == "lock-seal":
        radii = [0.70 + 0.10 * math.sin(index * 2.35) + 0.035 * math.cos(index * 4.1) for index in range(18)]
        radial_plate("fixed_vermilion_wax_seal", radii, [0.0] * 18, 0.12, mats["wax"], collection, root, rotation=(math.pi / 2, 0, 0))
        radial_plate("seal_hot_rim", [0.52] * 16, [0.46] * 16, 0.055, mats["wax_hot"], collection, root, (0, -0.12, 0), (math.pi / 2, 0, 0))
        star_plate("seal_coordinate_impression", 8, 0.38, 0.12, 0.055, mats["gold"], collection, root, (0, -0.16, 0), (math.pi / 2, 0, 0))
        ortho = 2.00
    else:
        hand = make_anchor("boundary_blade_hand", collection, (-1.28, 0, 0), root)
        tip = make_anchor("boundary_blade_tip", collection, (1.28, 0, 0), root)
        anchors.update({"hand": hand, "swordTip": tip})
        extruded_profile("authored_boundary_blade", [(-1.28, -0.055), (0.54, -0.085), (1.28, 0), (0.58, 0.10), (-1.28, 0.055)], 0.075, mats["silver"], collection, root)
        ribbon_profile("blade_gold_break", [(0.15, -0.06), (0.43, 0.09), (0.69, -0.015)], [0.018, 0.028, 0.004], 0.085, mats["gold"], collection, root)
        extruded_profile("blade_hand_guard", [(-1.35, -0.19), (-1.22, -0.21), (-1.14, 0.19), (-1.29, 0.21)], 0.11, mats["gold"], collection, root)
        ortho = 3.20
    return FrameSource(frame_id, "relics", collection, 256, 256, ortho, (0, 0, 0), anchors)


def setup_scene(transparent: bool) -> tuple[bpy.types.Object, bpy.types.Collection]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 80
    scene.render.film_transparent = transparent
    scene.render.use_file_extension = True
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 512
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1.0
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25

    world = bpy.data.worlds.get("Map Art World") or bpy.data.worlds.new("Map Art World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.008, 0.010, 1)
    background.inputs["Strength"].default_value = 0.34

    support = new_collection("render-support")
    camera_data = bpy.data.cameras.new("fixed_orthographic_camera")
    camera_data.type = "ORTHO"
    camera_data.lens = 50
    camera = bpy.data.objects.new("fixed_orthographic_camera", camera_data)
    support.objects.link(camera)
    scene.camera = camera
    camera["camera_contract"] = "fixed orthographic; orientation never changes between sprite layers"

    def area_light(name, location, energy, color, size, target=(0, 0, 1.5)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        item = bpy.data.objects.new(name, data)
        support.objects.link(item)
        item.location = location
        look_at(item, target)
        return item

    area_light("ivory_skylight", (-5.5, -6.0, 11.0), 1850, (0.76, 0.82, 0.88), 6.0)
    area_light("warm_map_bounce", (6.0, -4.0, 5.0), 680, (1.0, 0.50, 0.20), 4.5)
    area_light("ink_rim", (4.5, 6.0, 7.5), 1550, (0.34, 0.48, 0.62), 3.8)
    return camera, support


def render_frame(scene, camera, all_collections: list[bpy.types.Collection], source: FrameSource,
                 raw_dir: Path) -> dict[str, list[float]]:
    for collection in all_collections:
        collection.hide_render = collection != source.collection
    source.collection.hide_render = False
    scene.render.resolution_x = source.width
    scene.render.resolution_y = source.height
    camera.data.ortho_scale = source.ortho_scale
    target = Vector(source.target)
    camera.location = target + CAMERA_OFFSET
    look_at(camera, source.target)
    bpy.context.view_layer.update()
    projected = {}
    for name, anchor in source.anchors.items():
        coordinate = world_to_camera_view(scene, camera, anchor.matrix_world.translation)
        projected[name] = [round(coordinate.x * source.width, 3), round((1.0 - coordinate.y) * source.height, 3)]
    scene.render.filepath = str(raw_dir / f"{source.frame_id}.png")
    bpy.ops.render.render(write_still=True)
    return projected


def build_characters(raw_dir: Path) -> tuple[list[FrameSource], dict[str, dict[str, list[float]]]]:
    clean_scene()
    mats = create_materials()
    camera, support = setup_scene(transparent=True)
    frames = [
        boss_pose("boss-closed", "closed", mats),
        boss_pose("boss-lock", "lock", mats),
        boss_pose("boss-collapse-open", "collapse_open", mats),
        boss_pose("boss-core-hit", "core_hit", mats),
        driver_upper(mats),
        driver_forearm(mats),
        driver_stamp(mats),
        *[player_pose(frame_id, mats) for frame_id in PLAYER_POSES],
        relic_frame("memory-plaque", mats),
        relic_frame("lock-seal", mats),
        relic_frame("boundary-blade", mats),
    ]
    scene = bpy.context.scene
    scene["asset_pipeline"] = "authored Blender forms -> fixed orthographic transparent atlas"
    scene["runtime_contract"] = "game-core immutable; only 2D anchors are consumed"
    for source in frames:
        source.collection.hide_viewport = source.frame_id != "boss-closed"
        source.collection.hide_render = source.frame_id != "boss-closed"
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(CHARACTERS_BLEND), compress=False)
    for source in frames:
        source.collection.hide_viewport = False
    anchors = {}
    art_collections = [source.collection for source in frames]
    for source in frames:
        anchors[source.frame_id] = render_frame(scene, camera, art_collections, source, raw_dir)
    return frames, anchors


def radial_slab(name: str, rx: float, ry: float, height: float, mat, collection, count=64):
    outer = []
    for index in range(count):
        angle = math.tau * index / count
        irregular = 1.0 + 0.025 * math.sin(angle * 5 + 0.7) + 0.014 * math.cos(angle * 9)
        outer.append((rx * irregular * math.cos(angle), ry * irregular * math.sin(angle)))
    vertices = [(x, y, 0) for x, y in outer] + [(x, y, height) for x, y in outer]
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    faces.extend((index, (index + 1) % count, count + (index + 1) % count, count + index) for index in range(count))
    return mesh_object(name, vertices, faces, mat, collection, smooth=False)


def build_arena(raw_dir: Path) -> None:
    clean_scene()
    mats = create_materials()
    camera, support = setup_scene(transparent=False)
    scene = bpy.context.scene
    arena = new_collection("arena-plate")
    support.hide_render = False
    platform = radial_slab("sealed_world_map_platform", 8.75, 5.35, 0.30, mats["ground"], arena, 72)
    platform["arena_role"] = "visual plate only; no collision geometry"
    # A second authored inset ring creates a thick map-table edge without a primitive disc.
    radial_slab("world_map_inset", 8.40, 5.02, 0.34, mats["ground_light"], arena, 72)

    # Large contour lines and one river are deliberately sparse at mobile size.
    for ring_index, radius in enumerate((0.28, 0.46, 0.66, 0.84), 1):
        points = []
        widths = []
        for index in range(49):
            angle = math.tau * index / 48
            warp = 1.0 + 0.08 * math.sin(angle * (2 + ring_index) + ring_index)
            points.append((8.0 * radius * warp * math.cos(angle), 4.55 * radius * (1 + 0.05 * math.cos(angle * 3)) * math.sin(angle)))
            widths.append(0.018 + ring_index * 0.003)
        horizontal_strip(f"major_contour_{ring_index}", points, widths, 0.365 + ring_index * 0.001, mats["ivory_dark"], arena)

    river_points = [(-7.4, -1.15), (-5.4, -0.82), (-3.2, -1.16), (-0.8, -0.52), (1.4, -0.72), (3.2, -0.05), (5.7, -0.20), (7.6, 0.42)]
    horizontal_strip("single_engraved_river", river_points, [0.035, 0.055, 0.042, 0.06, 0.045, 0.055, 0.04, 0.025], 0.375, mats["river"], arena)
    coordinate_points = [(-6.5, 2.15), (-3.8, 2.38), (-0.8, 2.15), (2.2, 2.46), (6.3, 1.95)]
    horizontal_strip("gold_coordinate_axis", coordinate_points, [0.035] * len(coordinate_points), 0.395, mats["gold"], arena)

    # Compass coordinate seal in the lower-left balances the upper boss mass.
    compass = empty("arena_compass_coordinate", arena, location=(-5.75, -2.75, 0.41))
    radial_plate("arena_compass_ring", [0.76] * 20, [0.69] * 20, 0.04, mats["gold"], arena, compass)
    star_plate("arena_compass_rose", 8, 0.63, 0.18, 0.045, mats["gold"], arena, compass, rotation=(math.pi / 2, 0, 0))

    # Custom lofted ruins frame a place, but stay below the combat silhouettes.
    pillar_specs = [(-6.0, 6.0, 2.8), (0.0, 7.0, 3.2), (6.0, 6.0, 2.6)]
    for index, (x, y, height) in enumerate(pillar_specs, 1):
        pillar = loft_z(
            f"unmapped_ruin_{index}",
            [(0.0, 0.68, 0.54, 0, 0, 0.03), (height * 0.45, 0.58, 0.49, 0.06, 0, -0.04), (height, 0.46, 0.42, -0.04, 0, 0.08)],
            7,
            mats["stone"],
            arena,
        )
        pillar.location = (x, y, 0)

    camera.data.ortho_scale = 18.6
    target = (0, 0, 0.58)
    camera.location = Vector(target) + CAMERA_OFFSET
    look_at(camera, target)
    scene.render.resolution_x = 2560
    scene.render.resolution_y = 1440
    scene.render.film_transparent = False
    scene["camera_contract"] = "fixed 35-degree-like orthographic quarter view"
    scene["gameplay_contract"] = "decorative height never affects game-core collision"
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ARENA_BLEND), compress=False)
    scene.render.filepath = str(raw_dir / "arena-plate.png")
    bpy.ops.render.render(write_still=True)


def contract_for(frames: list[FrameSource], anchors: dict[str, dict[str, list[float]]]) -> dict:
    atlas_specs = {
        "arena": {"file": "arena-plate.webp", "width": 2560, "height": 1440, "frameWidth": 2560, "frameHeight": 1440, "columns": 1},
        "boss": {"file": "boss-body.webp", "width": 2560, "height": 512, "frameWidth": 640, "frameHeight": 512, "columns": 4},
        "driver": {"file": "boss-driver.webp", "width": 1920, "height": 320, "frameWidth": 640, "frameHeight": 320, "columns": 3},
        "player": {"file": "player.webp", "width": 1024, "height": 512, "frameWidth": 256, "frameHeight": 256, "columns": 4},
        "relics": {"file": "relics.webp", "width": 768, "height": 256, "frameWidth": 256, "frameHeight": 256, "columns": 3},
    }
    order_by_atlas = {name: 0 for name in atlas_specs}
    frame_contract = {}
    for source in frames:
        spec = atlas_specs[source.atlas]
        order = order_by_atlas[source.atlas]
        order_by_atlas[source.atlas] += 1
        column = order % spec["columns"]
        row = order // spec["columns"]
        frame_contract[source.frame_id] = {
            "atlas": source.atlas,
            "order": order,
            "rect": [column * source.width, row * source.height, source.width, source.height],
            "anchors": anchors[source.frame_id],
        }
    return {
        "version": 1,
        "pipeline": "Blender 5.2 authored meshes, fixed orthographic camera, transparent WebP atlas",
        "logicalSize": [1280, 720],
        "projection": {"kind": "fixed-quarter", "runtimeTruth": "src/game-core.mjs 2D plane", "cameraControls": False},
        "sources": [
            "assets/2d/source/map_challenger_characters.blend",
            "assets/2d/source/map_challenger_arena.blend",
        ],
        "atlases": atlas_specs,
        "requiredAnchors": {
            "boss": ["feet", "root", "core", "shoulder"],
            "driver-upper": ["shoulder", "elbow"],
            "driver-forearm": ["elbow", "wrist"],
            "driver-stamp": ["wrist", "stampCenter"],
            "player": ["feet", "root", "hand", "swordTip"],
            "boundary-blade": ["root", "hand", "swordTip"],
        },
        "frames": frame_contract,
        "runtimeRules": {
            "driver": "stampCenter equals immutable coreToScreen(lock.zone), then remains frozen",
            "player": "feet/root/shadow share coreToScreen(player); swordTip reaches core only on direct contact",
            "memory": "exactly three identical authored plaques occupy three boss sockets",
        },
    }


def pillow_python() -> str:
    """Find a build-time Python with Pillow without adding a runtime dependency."""
    candidates = []
    configured = os.environ.get("MIRROR_ME_ART_PYTHON")
    if configured:
        candidates.append(Path(configured))
    system_python = shutil.which("python3")
    if system_python:
        candidates.append(Path(system_python))
    runtime_root = Path.home() / ".cache/codex-runtimes"
    if runtime_root.exists():
        candidates.extend(runtime_root.glob("*/dependencies/python/bin/python"))
    checked = set()
    for candidate in candidates:
        resolved = str(candidate.resolve())
        if resolved in checked or not candidate.exists():
            continue
        checked.add(resolved)
        probe = subprocess.run([resolved, "-c", "import PIL"], capture_output=True)
        if probe.returncode == 0:
            return resolved
    raise RuntimeError("Pillow build Python not found; set MIRROR_ME_ART_PYTHON to a Python with Pillow")


def main() -> None:
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    raw_dir = Path(tempfile.mkdtemp(prefix="mirror-me-map-art-"))
    try:
        frames, anchors = build_characters(raw_dir)
        build_arena(raw_dir)
        contract = contract_for(frames, anchors)
        CONTRACT.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        subprocess.run(
            [
                pillow_python(),
                str(PACKER),
                "--raw", str(raw_dir),
                "--output", str(ATLAS_DIR),
                "--contract", str(CONTRACT),
                "--review", str(REVIEW_DIR),
            ],
            check=True,
        )
        total = sum(path.stat().st_size for path in ATLAS_DIR.glob("*.webp"))
        print(f"MAP_CHALLENGER_ART_BUILT frames={len(frames)} atlas_bytes={total} review={REVIEW_DIR}")
    finally:
        shutil.rmtree(raw_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
