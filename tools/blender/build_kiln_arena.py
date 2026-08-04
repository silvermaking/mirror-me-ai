#!/usr/bin/env python3
"""Build the Kiln Reliquary circular refractory-turntable arena.

/opt/homebrew/bin/blender --background --factory-startup --python tools/blender/build_kiln_arena.py
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
BLEND = ROOT / "assets/3d/source/kiln_reliquary_arena.blend"
GLB = ROOT / "assets/3d/kiln_reliquary_arena.glb"


def material(name, color, metallic=0.0, rough=.5, emission=None):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    bsdf = item.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return item


def item(name, verts, faces, mat, parent=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .22
    bpy.context.collection.objects.link(obj)
    obj.parent, obj.location = parent, loc
    return obj


def bevel(obj, width=.04):
    mod = obj.modifiers.new("worn_edge", "BEVEL")
    mod.width, mod.segments, mod.limit_method = width, 1, "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def box(name, size, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), edge=.04):
    x, y, z = (v / 2 for v in size)
    verts = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
             (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    obj = item(name, verts, faces, mat, parent)
    obj.location, obj.rotation_euler = loc, rot
    bevel(obj, edge)
    return obj


def lathe(name, profile, sides, mat, parent=None, loc=(0, 0, 0)):
    verts = []
    for r, z in profile:
        for i in range(sides):
            a = math.tau * i / sides
            verts.append((r * math.cos(a), r * math.sin(a), z))
    faces = []
    for row in range(len(profile) - 1):
        for i in range(sides):
            faces.append((row * sides + i, row * sides + (i + 1) % sides,
                          (row + 1) * sides + (i + 1) % sides, (row + 1) * sides + i))
    return item(name, verts, faces, mat, parent)


def wedge(name, r0, r1, start, end, z0, z1, mat, parent):
    pts = []
    for z in (z0, z1):
        pts.extend([(r0 * math.cos(start), r0 * math.sin(start), z),
                    (r1 * math.cos(start), r1 * math.sin(start), z),
                    (r1 * math.cos(end), r1 * math.sin(end), z),
                    (r0 * math.cos(end), r0 * math.sin(end), z)])
    return item(name, pts, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat, parent)


def beam_between(name, a, b, thickness, mat, parent, edge=.025):
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    # authored chamfered beam along local X
    obj = box(name, (length, thickness, thickness), mat, parent, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), (0, 0, math.atan2(dy, dx)), edge)
    return obj


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    brick_a = material("refractory_brick_umber", (.22, .105, .055), .0, .88)
    brick_b = material("refractory_brick_ash", (.34, .19, .105), .0, .84)
    iron = material("sooted_foundry_iron", (.055, .050, .042), .74, .38)
    brass = material("oxidized_brass", (.30, .15, .045), .67, .38)
    fire = material("kiln_fire", (.94, .105, .012), .02, .44, ((1.0, .08, .004), 3.6))
    ash = material("ash_vent_recess", (.011, .009, .007), .0, .96)

    root = empty("arena_root")
    root["asset"] = "Kiln Reliquary refractory turntable"
    turntable = empty("turntable", root)
    turntable["combat_plane"] = "top surface z=0.16; visual masonry never changes collision"
    rail = empty("perimeter_rail", root)
    exhaust = empty("exhaust_array", root)
    facility = empty("kiln_facility", root)

    # A real thick rotary kiln slab: twelve-sided lower skirt, a raised lip and brick-covered top.
    lathe("turntable_thick_skirt", [(6.90, -.55), (7.40, -.42), (7.58, -.12), (7.54, .14), (7.23, .30), (6.94, .38), (0, .38)], 48, iron, turntable)
    lathe("turntable_brass_bearing", [(6.76, .30), (6.92, .36), (6.95, .43), (6.74, .47)], 48, brass, turntable)

    # Refractory bricks are radial wedges with real joints, never a neon grid.
    ring_specs = [(0.05, 2.25, 12, .00), (2.29, 4.45, 18, .13), (4.49, 6.82, 24, .04)]
    for ring_i, (r0, r1, count, offset) in enumerate(ring_specs):
        for i in range(count):
            gap = .015 if ring_i == 0 else .010
            a = offset + math.tau * i / count + gap
            b = offset + math.tau * (i + 1) / count - gap
            tile = wedge(f"refractory_brick_{ring_i+1}_{i+1}", r0, r1, a, b, .385, .46,
                         brick_a if (i + ring_i) % 3 else brick_b, turntable)
            bevel(tile, .018)
    # Faint cold expansion seams break the rings without creating an obstructive target graphic.
    for r in (2.26, 4.47, 6.84):
        lathe("expansion_seam", [(r - .025, .465), (r + .025, .465), (r + .028, .482), (r - .028, .482)], 48, ash, turntable)

    # Outer vents are below the combat surface, with grilles and pipe mouths beyond the guard rail.
    for i in range(8):
        a = math.tau * i / 8 + .18
        x, y = 6.25 * math.cos(a), 6.25 * math.sin(a)
        vent = box("sunken_exhaust_grate", (.65, .30, .07), ash, exhaust, (x, y, .475), (0, 0, a + math.pi / 2), .02)
        for j in (-.18, 0, .18):
            px = x + j * math.cos(a + math.pi / 2)
            py = y + j * math.sin(a + math.pi / 2)
            box("exhaust_grate_bar", (.045, .34, .075), brass, exhaust, (px, py, .50), (0, 0, a + math.pi / 2), .012)

    # Rail segments deliberately stay outside the outer brick ring and below camera sightlines.
    rail_r = 7.45
    posts = 16
    for i in range(posts):
        a = math.tau * i / posts
        x, y = rail_r * math.cos(a), rail_r * math.sin(a)
        box("rail_stanchion", (.16, .16, .74), iron, rail, (x, y, .80), (0, 0, a), .03)
        box("rail_brass_cap", (.23, .23, .10), brass, rail, (x, y, 1.19), (0, 0, a), .025)
        nxt = math.tau * (i + 1) / posts
        b = (rail_r * math.cos(nxt), rail_r * math.sin(nxt), .93)
        beam_between("low_guardrail", (x, y, .93), b, .10, iron, rail, .02)

    # Only outer/background kiln machinery; it frames the duel without encroaching on the plate.
    for i, a in enumerate((.60, 1.55, 2.35, 3.70, 4.58, 5.55)):
        radius = 9.0 if i % 2 else 8.6
        x, y = radius * math.cos(a), radius * math.sin(a)
        stack = empty("outer_kiln_stack", facility, (x, y, 0))
        lathe("facility_kiln_base", [(0.58, 0), (.78, .10), (.76, .62), (.54, .74)], 8, iron, stack)
        lathe("facility_brick_chimney", [(.43, .70), (.55, .82), (.49, 1.85), (.32, 2.08)], 8, brick_b, stack)
        box("facility_fire_slot", (.30, .075, .18), fire, stack, (0, -.57, .64), (0, 0, a), .015)
        box("facility_side_pipe", (.22, .54, .18), brass, stack, (.57, .10, .70), (0, .25, .30), .04)

    for node in (root, turntable, rail, exhaust, facility):
        node["named_node"] = True
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.object.select_all(action="DESELECT")
    stack, selected = list(root.children), [root]
    while stack:
        child = stack.pop()
        selected.append(child)
        stack.extend(child.children)
    for ob in selected:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True,
                              export_materials="EXPORT", export_apply=True, export_yup=True)
    print(f"KILN_ARENA_BUILT {GLB}")


if __name__ == "__main__":
    build()
