#!/usr/bin/env python3
"""Build and review-render the Kiln Reliquary low-poly boss asset.

Run headlessly from the repository root:
  /opt/homebrew/bin/blender --background --python tools/blender/build_kiln_reliquary.py

The three review renders are poses of one node hierarchy, not separate meshes.
"""

from pathlib import Path
import math
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/3d/source/kiln_reliquary.blend"
GLB = ROOT / "assets/3d/kiln_reliquary.glb"
REVIEW = ROOT / "work/reviews"


def ensure_dirs():
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        # Keep materials made by linked Blender startup files out of the authored scene.
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def mat(name, color, metallic=0.0, roughness=0.5, emission=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return material


CAST_IRON = None
IVORY = None
BRASS = None
FIRE = None
SOOT = None
FLOOR = None


def mesh_object(name, vertices, faces, material, parent=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def bevel(obj, width=0.05, segments=1):
    modifier = obj.modifiers.new("hand_chamfer", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.22
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def lathe(name, profile, segments, material, parent=None, rotation=None):
    """Custom radial mesh; profile entries are (radius, z), never a stock primitive."""
    vertices = []
    for radius, z in profile:
        for i in range(segments):
            angle = math.tau * i / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    faces = []
    rows = len(profile)
    for j in range(rows - 1):
        for i in range(segments):
            nxt = (i + 1) % segments
            faces.append((j * segments + i, j * segments + nxt, (j + 1) * segments + nxt, (j + 1) * segments + i))
    obj = mesh_object(name, vertices, faces, material, parent)
    if rotation:
        obj.rotation_euler = rotation
    return obj


def chamfer_box(name, size, material, parent=None, location=(0, 0, 0), rotation=(0, 0, 0), chamfer=0.05):
    x, y, z = (component / 2 for component in size)
    vertices = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
                (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    obj = mesh_object(name, vertices, faces, material, parent)
    obj.location = location
    obj.rotation_euler = rotation
    bevel(obj, chamfer)
    return obj


def tapered_beam(name, length, r0, r1, material, parent=None, location=(0, 0, 0), rotation=(0, 0, 0), sides=7):
    # A custom two-stage octagonal beam, longitudinally along local X.
    profile = [(r0 * 0.78, 0), (r0, length * 0.09), (r1, length * 0.82), (r1 * 0.73, length)]
    obj = lathe(name, profile, sides, material, parent, rotation=(0, math.pi / 2, 0))
    obj.location = location
    obj.rotation_euler.rotate_axis("Z", rotation[2])
    obj.rotation_euler.rotate_axis("Y", rotation[1])
    obj.rotation_euler.rotate_axis("X", rotation[0])
    return obj


def plate(name, points, depth, material, parent=None, location=(0, 0, 0), rotation=(0, 0, 0), chamfer=0.035):
    """Extruded irregular panel in the local X/Z plane, for non-rectangular armor."""
    vertices = [(x, -depth / 2, z) for x, z in points] + [(x, depth / 2, z) for x, z in points]
    n = len(points)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        faces.append((i, (i + 1) % n, n + (i + 1) % n, n + i))
    obj = mesh_object(name, vertices, faces, material, parent)
    obj.location = location
    obj.rotation_euler = rotation
    bevel(obj, chamfer)
    return obj


def add_rivet_ring(parent, center, radius, count, z_rotation=0):
    for i in range(count):
        a = z_rotation + math.tau * i / count
        rivet = lathe("brass_rivet", [(0.0, -0.035), (0.075, -0.005), (0.07, 0.035), (0.0, 0.055)], 6, BRASS, parent)
        rivet.location = (center[0] + radius * math.cos(a), center[1] + radius * math.sin(a), center[2])


def build_boss():
    root = empty("boss_root")
    root["asset"] = "Kiln Reliquary"
    root["pose_contract"] = "WAITING, LOCK, CORE_OPEN share this rigid named-node hierarchy"

    body = empty("body", root, (0, 0, 0))
    # Low kiln: an irregular radial profile, asymmetric shoulder plating and lower skid.
    lathe("furnace_cast_shell", [(0.9, 0.12), (1.5, 0.22), (1.73, 0.58), (1.66, 1.25), (1.43, 1.75), (0.95, 1.97), (0.68, 1.90)], 12, CAST_IRON, body).scale.y = 0.83
    chamfer_box("furnace_underslung_keel", (2.72, 1.22, 0.34), CAST_IRON, body, (0.05, 0.16, 0.28), (0, 0.09, -0.07), 0.09)
    plate("left_ivory_shoulder", [(-1.05, 0.12), (-1.64, 0.50), (-1.61, 1.28), (-1.28, 1.74), (-0.91, 1.55), (-1.02, 0.88)], 0.18, IVORY, body, (-0.2, 0.57, 0.16), (math.pi / 2, 0.12, 0.1), 0.07)
    plate("right_broken_plate", [(0.93, 0.38), (1.39, 0.51), (1.54, 1.15), (1.23, 1.65), (0.84, 1.47), (1.06, 0.99)], 0.17, IVORY, body, (0.10, 0.72, 0.15), (math.pi / 2, -0.09, -0.09), 0.06)
    # Carbon scoring in the cast shell adds authorship without texture assets.
    for x, z, lean in [(-0.48, 1.52, -0.2), (0.03, 1.65, 0.05), (0.45, 1.47, 0.22)]:
        chamfer_box("cast_score", (0.06, 1.43, 0.055), SOOT, body, (x, -0.11, z), (lean, 0.25, 0.07), 0.01)

    # Front fire box is faceted around a true opening rather than a rectangular panel.
    firebox = chamfer_box("firebox_recess", (1.7, 0.28, 1.12), SOOT, body, (0.02, -1.39, 1.11), (0.05, 0, 0), 0.08)
    core = empty("core", body, (0, -1.56, 1.13))
    core["semantic"] = "damage window only; no automatic damage"
    plate("core_fire", [(-0.52, -0.34), (0.34, -0.40), (0.59, -0.05), (0.46, 0.39), (-0.42, 0.36), (-0.62, 0.04)], 0.06, FIRE, core, (0, 0, 0), (math.pi / 2, 0, 0), 0.025)
    for x in (-0.33, 0.0, 0.33):
        chamfer_box("core_grate", (0.08, 0.09, 0.68), BRASS, core, (x, -0.07, 0.0), (0.0, 0.0, x * 0.35), 0.018)

    shutter_l = empty("shutter_l", body, (-0.53, -1.60, 1.13))
    shutter_r = empty("shutter_r", body, (0.53, -1.60, 1.13))
    left_door = plate("left_shutter_plate", [(-0.52, -0.42), (0.44, -0.35), (0.51, 0.34), (-0.44, 0.44), (-0.59, 0.13)], 0.12, CAST_IRON, shutter_l, (0, 0, 0), (math.pi / 2, 0, 0.13), 0.055)
    right_door = plate("right_shutter_plate", [(-0.43, -0.36), (0.50, -0.45), (0.60, 0.08), (0.37, 0.41), (-0.48, 0.34)], 0.12, CAST_IRON, shutter_r, (0, 0, 0), (math.pi / 2, 0, -0.12), 0.055)
    for door, sign in ((shutter_l, -1), (shutter_r, 1)):
        chamfer_box("shutter_brass_strap", (0.12, 0.15, 0.74), BRASS, door, (0.15 * sign, -0.08, 0), (0, 0, -0.08 * sign), 0.018)

    # Exactly three ceramic memory shards; their slots sit above the silhouette.
    for i, x in enumerate((-0.62, 0.0, 0.62), 1):
        node = empty(f"memory_{i:02d}", body, (x, 0.18, 1.78))
        node["semantic"] = "one learned evade sample"
        chamfer_box("memory_brass_socket", (0.31, 0.34, 0.13), BRASS, node, (0, 0, 0), (0.07, 0.12, 0), 0.035)
        h = 0.80 + (0.12 if i == 2 else 0)
        shard = plate("ceramic_memory_shard", [(-0.19, 0), (-0.13, h * 0.80), (0.02, h), (0.18, h * 0.62), (0.13, 0.08)], 0.14, IVORY, node, (0, 0.02, 0.04), (math.pi / 2, 0, 0), 0.045)
        chamfer_box("memory_cut", (0.05, 0.16, h * 0.53), SOOT, node, (0.02, -0.08, h * 0.50), (0, 0.18, 0.18), 0.012)

    rotary = empty("rotary_mount", body, (1.43, 0.04, 1.68))
    rotary["semantic"] = "long-arm yaw pivot"
    lathe("rotary_cast_housing", [(0.44, -0.22), (0.62, -0.10), (0.64, 0.19), (0.47, 0.31)], 9, CAST_IRON, rotary)
    lathe("rotary_brass_band", [(0.65, -0.035), (0.68, 0.0), (0.65, 0.06)], 9, BRASS, rotary)
    add_rivet_ring(rotary, (0, 0, 0.08), 0.61, 7)

    upper = empty("upper_arm", rotary, (0.26, 0, 0.10))
    upper["semantic"] = "piledriver shoulder segment"
    tapered_beam("upper_arm_cast", 2.15, 0.47, 0.38, CAST_IRON, upper, (0, 0, 0), (0, -0.02, 0.02), 8)
    plate("upper_arm_ivory_slab", [(-0.15, -0.29), (1.80, -0.25), (2.06, 0.08), (1.60, 0.35), (0.12, 0.31)], 0.13, IVORY, upper, (0.0, -0.36, 0.02), (0, 0.11, 0.10), 0.05)
    chamfer_box("upper_arm_brass_girdle", (0.15, 0.93, 0.79), BRASS, upper, (1.20, 0, 0.0), (0, 0.1, 0), 0.03)

    elbow = empty("bellows_elbow", upper, (2.08, 0, 0))
    elbow["semantic"] = "compressed bellows joint"
    for j in range(5):
        tapered_beam("bellows_fold", 0.24, 0.40 - j * 0.018, 0.45 - j * 0.018, CAST_IRON, elbow, (j * 0.19, 0, 0), (0, 0, 0), 8)
    lathe("elbow_brass_collar", [(0.43, -0.10), (0.50, -0.02), (0.50, 0.09), (0.42, 0.15)], 8, BRASS, elbow, rotation=(0, math.pi / 2, 0)).location.x = 0.95

    forearm = empty("forearm", elbow, (0.96, 0, 0.0))
    forearm["semantic"] = "descending driver shaft"
    forearm.rotation_euler = (0, -0.47, 0.0)
    tapered_beam("forearm_cast", 2.86, 0.40, 0.31, CAST_IRON, forearm, (0, 0, 0), (0, 0, 0), 8)
    plate("forearm_ivory_spine", [(-0.08, -0.25), (2.42, -0.17), (2.73, 0.08), (2.48, 0.31), (0.15, 0.29)], 0.13, IVORY, forearm, (0.03, -0.31, 0.0), (0, 0.16, -0.02), 0.05)
    for x in (0.65, 1.50, 2.32):
        chamfer_box("forearm_band", (0.13, 0.78, 0.69), BRASS, forearm, (x, 0, 0), (0, 0.0, 0), 0.03)

    driver = empty("driver", forearm, (2.76, 0, 0))
    driver["semantic"] = "LOCK axis and floor impact point"
    driver.rotation_euler = (0, 0.74, 0)
    plate("driver_wedge_head", [(-0.50, -0.32), (0.40, -0.26), (0.61, -0.02), (0.42, 0.38), (-0.46, 0.42), (-0.66, 0.08)], 0.76, CAST_IRON, driver, (0.28, 0, -0.12), (0, 0, 0.08), 0.08)
    plate("driver_ivory_face", [(-0.28, -0.24), (0.28, -0.16), (0.41, 0.06), (0.17, 0.26), (-0.31, 0.18)], 0.09, IVORY, driver, (0.35, -0.40, -0.08), (math.pi / 2, 0, 0.10), 0.03)
    lathe("driver_brass_eye", [(0.18, -0.08), (0.23, 0), (0.18, 0.10)], 7, BRASS, driver, rotation=(math.pi / 2, 0, 0)).location = (0.15, -0.42, 0.25)

    # The small support claw is purposefully lower and shorter than the driver arm.
    brace = empty("brace", body, (-1.28, -0.12, 0.95))
    brace["semantic"] = "ground-dragging support claw"
    tapered_beam("brace_arm", 1.10, 0.27, 0.20, CAST_IRON, brace, (0, 0, 0), (0, 0.36, -2.58), 7)
    wrist = empty("brace_wrist", brace, (-0.94, -0.28, -0.34))
    lathe("brace_wrist_cast", [(0.25, -0.17), (0.33, -0.08), (0.30, 0.18), (0.20, 0.28)], 7, CAST_IRON, wrist)
    for claw_i, angle in enumerate((-0.72, 0, 0.72)):
        claw = tapered_beam(f"brace_claw_{claw_i+1}", 0.64, 0.13, 0.07, BRASS, wrist, (0.08 * math.sin(angle), 0.04 * math.cos(angle), -0.11), (0, 0.72, angle), 5)

    return root, {"body": body, "rotary_mount": rotary, "upper_arm": upper, "bellows_elbow": elbow,
                  "forearm": forearm, "driver": driver, "brace": brace, "shutter_l": shutter_l,
                  "shutter_r": shutter_r, "core": core,
                  "memory_01": bpy.data.objects["memory_01"], "memory_02": bpy.data.objects["memory_02"], "memory_03": bpy.data.objects["memory_03"]}


def set_pose(nodes, state, frame):
    body = nodes["body"]
    rotary = nodes["rotary_mount"]
    upper = nodes["upper_arm"]
    elbow = nodes["bellows_elbow"]
    forearm = nodes["forearm"]
    driver = nodes["driver"]
    brace = nodes["brace"]
    left = nodes["shutter_l"]
    right = nodes["shutter_r"]
    memory = [nodes[f"memory_{i:02d}"] for i in range(1, 4)]
    body.rotation_euler = (0, 0, 0)
    rotary.rotation_euler = (0, 0, -0.04)
    upper.rotation_euler = (0, 0, 0)
    elbow.rotation_euler = (0, 0.03, 0)
    forearm.rotation_euler = (0, -0.47, 0)
    driver.rotation_euler = (0, 0.74, 0)
    brace.rotation_euler = (0, 0, 0)
    left.location = (-0.53, -1.60, 1.13)
    right.location = (0.53, -1.60, 1.13)
    left.rotation_euler = right.rotation_euler = (0, 0, 0)
    for i, shard in enumerate(memory):
        shard.rotation_euler = (0, 0.0, (-0.18, 0.10, 0.21)[i])

    if state == "LOCK":
        rotary.rotation_euler.z = -0.18
        upper.rotation_euler.z = -0.06
        elbow.rotation_euler.y = 0.12
        forearm.rotation_euler.y = -0.58
        driver.rotation_euler.y = 0.82
        brace.rotation_euler.z = 0.16
        for shard in memory:
            shard.rotation_euler = (0, 0, 0)
    elif state == "CORE_OPEN":
        body.rotation_euler.z = math.radians(-23)
        # Keep the driver planted on the screen-right impact point while the body
        # has over-rotated by 23 degrees around it.
        rotary.rotation_euler.z = 0.16
        upper.rotation_euler.z = 0.02
        elbow.rotation_euler.y = 0.10
        forearm.rotation_euler.y = -0.54
        driver.rotation_euler.y = 0.82
        brace.rotation_euler.z = 0.31
        left.location.x = -1.35
        right.location.x = 1.35
        left.rotation_euler.z = math.radians(-28)
        right.rotation_euler.z = math.radians(28)
        for shard in memory:
            shard.rotation_euler = (0, 0, 0)

    # All render states are one transform-only animation on this hierarchy.
    for node in [body, rotary, upper, elbow, forearm, driver, brace, left, right, *memory]:
        node.keyframe_insert(data_path="location", frame=frame)
        node.keyframe_insert(data_path="rotation_euler", frame=frame)


def point_camera(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def review_environment():
    # A dark kiln floor exists only for review renders and is omitted from the GLB export.
    floor = lathe("review_kiln_floor", [(7.7, -0.14), (7.95, -0.06), (7.95, 0.0), (7.65, 0.07)], 48, FLOOR)
    for r, z in ((6.75, 0.08), (5.4, 0.09), (3.1, 0.10)):
        ring = lathe("review_floor_groove", [(r - 0.035, z), (r + 0.035, z), (r + 0.045, z + 0.025), (r - 0.045, z + 0.025)], 48, BRASS)
    camera_data = bpy.data.cameras.new("review_camera")
    camera = bpy.data.objects.new("review_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (10.2, -14.4, 10.9)
    camera.data.lens = 52
    camera.data.sensor_width = 36
    point_camera(camera, (0.85, 0, 1.25))
    bpy.context.scene.camera = camera
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.016, 0.020, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.42
    def light(name, kind, location, energy, color, size):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        data.shadow_soft_size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        point_camera(obj, (0.5, 0, 1.0))
    light("cold_roof_light", "AREA", (-3.0, -5.0, 12.0), 1900, (0.47, 0.61, 0.78), 6.0)
    light("fire_spill", "POINT", (0, -2.3, 1.3), 540, (1.0, 0.27, 0.045), 1.8)
    light("brass_rim", "AREA", (6.5, 1.5, 5.0), 1050, (1.0, 0.58, 0.25), 3.0)
    light("front_fill", "AREA", (2.0, -9.0, 5.5), 700, (0.85, 0.68, 0.49), 4.0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    return floor


def render_poses(nodes):
    scene = bpy.context.scene
    for state, frame in (("WAITING", 1), ("LOCK", 31), ("CORE_OPEN", 61)):
        scene.frame_set(frame)
        scene.render.filepath = str(REVIEW / f"kiln-reliquary-{state.lower()}.png")
        bpy.ops.render.render(write_still=True)


def export_glb(root):
    bpy.ops.object.select_all(action="DESELECT")
    to_select = [root]
    stack = list(root.children)
    while stack:
        item = stack.pop()
        to_select.append(item)
        stack.extend(item.children)
    for obj in to_select:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True,
                              export_animations=True, export_materials="EXPORT", export_apply=True,
                              export_normals=True, export_yup=True)


def main():
    ensure_dirs()
    clean_scene()
    global CAST_IRON, IVORY, BRASS, FIRE, SOOT, FLOOR
    CAST_IRON = mat("cast_iron_soot", (0.075, 0.061, 0.047), 0.82, 0.34)
    IVORY = mat("cracked_ivory_ceramic", (0.70, 0.60, 0.43), 0.04, 0.68)
    BRASS = mat("aged_brass", (0.38, 0.205, 0.065), 0.77, 0.29)
    FIRE = mat("furnace_fire", (0.95, 0.105, 0.012), 0.02, 0.40, ((1.0, 0.10, 0.005), 4.8))
    # The carbon scoring shares the cast-iron material: the asset deliberately
    # has exactly four runtime materials (iron, ceramic, brass, furnace fire).
    SOOT = CAST_IRON
    FLOOR = mat("review_floor", (0.056, 0.046, 0.037), 0.50, 0.53)
    root, nodes = build_boss()
    set_pose(nodes, "WAITING", 1)
    set_pose(nodes, "LOCK", 31)
    set_pose(nodes, "CORE_OPEN", 61)
    review_environment()
    render_poses(nodes)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    export_glb(root)
    print(f"KILN_RELIQUARY_BUILT {GLB}")


if __name__ == "__main__":
    main()
