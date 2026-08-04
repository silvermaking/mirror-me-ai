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


def profile_panel(name, outline, depth, mat, parent=None, loc=(0, 0, 0), edge=.035):
    """An extruded irregular X/Z silhouette for authored walls, arches and ducts."""
    verts = [(x, -depth / 2, z) for x, z in outline] + [(x, depth / 2, z) for x, z in outline]
    n = len(outline)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    obj = item(name, verts, faces, mat, parent)
    obj.location = loc
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


def descendants(parent):
    stack = list(parent.children)
    result = []
    while stack:
        current = stack.pop()
        result.append(current)
        stack.extend(current.children)
    return result


def merge_static_by_material(named_nodes):
    """Collapse static arena meshes to one GLB primitive per material/category.

    The four required named nodes remain empties. Their descendant meshes are
    authored separately for clarity, then joined only after all bevel/profile
    work has been applied. This preserves the silhouette while avoiding one
    runtime primitive per brick, rail post, or duct detail.
    """
    for node in named_nodes:
        groups = {}
        for child in descendants(node):
            if child.type != "MESH" or not child.data.materials:
                continue
            groups.setdefault(child.data.materials[0].name, []).append(child)
        for material_name, meshes in groups.items():
            bpy.ops.object.select_all(action="DESELECT")
            for mesh in meshes:
                mesh.select_set(True)
            active = meshes[0]
            bpy.context.view_layer.objects.active = active
            bpy.ops.object.join()
            active.name = f"{node.name}_{material_name}_static"
            world_matrix = active.matrix_world.copy()
            active.parent = node
            active.matrix_world = world_matrix


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    brick_a = material("refractory_brick", (.22, .105, .055), .0, .88)
    brick_b = brick_a  # One brick material keeps the runtime arena at four materials.
    iron = material("sooted_foundry_iron", (.055, .050, .042), .74, .38)
    brass = material("oxidized_brass", (.30, .15, .045), .67, .38)
    # Facility mouths are only dark residual heat.  The boss core owns the
    # scene's brightest white/orange contrast during CORE_OPEN.
    fire = material("kiln_fire", (.22, .012, .002), .02, .68, ((.45, .018, .001), .42))
    ash = iron  # Dark vents use the existing foundry-iron material, not a fifth slot.

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

    # Rear half only: a connected firing wall replaces the old floating stack ring.
    # It deliberately stays below the boss memory silhouette at the center, while
    # the two chimneys rise off to either side rather than directly behind it.
    rear_y = 8.15
    profile_panel(
        "rear_firing_wall",
        [(-4.90, 0.0), (-4.84, .72), (-4.42, 1.04), (-3.60, 1.14), (-3.14, 1.46),
         (-1.28, 1.46), (-.78, 1.25), (.43, 1.30), (1.10, 1.52), (3.45, 1.52),
         (4.02, 1.34), (4.88, 1.20), (4.90, 0.0)],
        .58, brick_a, facility, (0, rear_y, .38), .06,
    )
    # Irregular upper brick courses break the wall silhouette without a repeated arch rhythm.
    for x, width, z, lean in ((-3.85, .76, 1.58, -.10), (-1.95, 1.22, 1.60, .06),
                              (.35, .84, 1.54, -.08), (2.45, 1.08, 1.72, .10)):
        cap = profile_panel(
            "firing_wall_coping",
            [(-width / 2, -.08), (width / 2, -.02), (width / 2 - .10, .13), (-width / 2 + .14, .18)],
            .70, brick_b, facility, (x, rear_y - .02, z), .025,
        )
        cap.rotation_euler.y = lean

    # Three deliberately different fire mouths: their black jambs, small embers and offset crowns
    # read as a single kiln house, not as repeated decorative columns.
    arch_specs = [
        (-2.72, .72, .72, .15),
        (-.18, 1.00, .98, .04),
        (2.55, .82, .82, .22),
    ]
    for index, (x, half_w, height, base) in enumerate(arch_specs, 1):
        frame_outline = [(-half_w - .16, 0), (-half_w - .12, height * .58), (-half_w * .64, height * .93),
                         (0, height + .14), (half_w * .68, height * .86), (half_w + .12, height * .48),
                         (half_w + .08, 0)]
        mouth_outline = [(-half_w, .02), (-half_w * .92, height * .54), (-half_w * .48, height * .83),
                         (0, height), (half_w * .50, height * .78), (half_w * .93, height * .42), (half_w, .02)]
        profile_panel("asym_fire_arch_frame", frame_outline, .18, iron, facility, (x, rear_y - .36, .44 + base), .035)
        profile_panel("furnace_mouth_ember", mouth_outline, .045, fire, facility, (x, rear_y - .47, .44 + base), .012)
        # A skewed brass lintel says the openings are mechanically rebuilt, rather than ornamental.
        profile_panel("arch_lintel_repair", [(-half_w * .62, -.05), (half_w * .60, .03),
                                               (half_w * .48, .13), (-half_w * .55, .10)],
                      .11, brass, facility, (x + (.10 if index == 2 else -.05), rear_y - .53, .44 + base + height + .04), .018)

    # Two non-matching chimneys structurally land on the wall's side buttresses.
    for x, base_z, height, sides in ((-4.04, 1.36, 2.02, 7), (3.78, 1.42, 2.58, 9)):
        stack = empty("wall_bound_chimney", facility, (x, rear_y + .08, base_z))
        lathe("chimney_foot", [(.48, 0), (.67, .12), (.61, .48), (.43, .61)], sides, iron, stack)
        lathe("chimney_brick_taper", [(.37, .55), (.49, .70), (.40, height - .14), (.28, height)], sides, brick_b, stack)
        lathe("chimney_cut_cap", [(.29, height - .02), (.41, height + .06), (.35, height + .19)], sides, brass, stack)
        profile_panel("chimney_wall_buttress", [(-.42, 0), (-.34, .64), (.12, .78), (.46, .48), (.38, 0)],
                      .70, brick_a, stack, (0, -.30, -.02), .035)

    # One stepped, wide duct ties the high right chimney to the firing wall and rail-side vent header.
    profile_panel(
        "connected_draft_duct",
        [(-1.54, -.28), (.54, -.28), (.54, -.13), (1.38, -.13), (1.38, .34),
         (.82, .34), (.82, .13), (-1.54, .13)],
        .62, iron, facility, (1.66, rear_y - .24, 1.48), .055,
    )
    profile_panel("duct_brass_seam", [(-1.22, -.045), (1.06, -.045), (1.02, .075), (-1.18, .075)],
                  .68, brass, facility, (1.66, rear_y - .57, 1.52), .018)
    profile_panel("rail_vent_header", [(-2.30, -.13), (2.06, -.09), (2.24, .13), (-2.14, .18)],
                  .34, iron, facility, (0.0, 7.55, .72), .035)
    # Low return structures close the rear room at each end without creating a
    # foreground wall: one refractory return and one dark iron duct return.
    left_return = profile_panel(
        "left_rear_return_wall",
        [(-1.28, 0), (-1.12, .42), (-.66, .62), (.95, .55), (1.26, .30), (1.18, 0)],
        .46, brick_a, facility, (-6.00, 7.12, .42), .045,
    )
    left_return.rotation_euler.z = math.radians(34)
    right_return = profile_panel(
        "right_rear_duct_return",
        [(-1.18, 0), (-1.03, .26), (-.30, .37), (-.12, .60), (1.22, .50),
         (1.30, .19), (1.14, 0)],
        .48, iron, facility, (6.05, 7.12, .42), .045,
    )
    right_return.rotation_euler.z = math.radians(-34)

    merge_static_by_material((turntable, rail, exhaust, facility))
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
