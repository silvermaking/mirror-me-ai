#!/usr/bin/env python3
"""Review the existing boss, player, and arena GLBs in one fixed-quarter scene.

/opt/homebrew/bin/blender --background --factory-startup --python tools/blender/render_kiln_scene_review.py
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/3d"
REVIEW = ROOT / "work/reviews/place"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, metallic=0, rough=.5, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return m


def disc(name, radius, z, mat, loc=(0, 0)):
    verts = [(0, 0, z)] + [(radius * math.cos(math.tau * i / 24), radius * math.sin(math.tau * i / 24), z) for i in range(24)]
    faces = [(0, i + 1, (i + 1) % 24 + 1) for i in range(24)]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.location = (loc[0], loc[1], 0)
    return ob


def strip(name, loc, size, mat, rot=0):
    x, y, z = (n / 2 for n in size)
    verts = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
             (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.location, ob.rotation_euler = loc, (0, 0, rot)
    return ob


def import_asset(name):
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / name))


def pose_boss(state, defaults):
    required = ["body", "rotary_mount", "upper_arm", "bellows_elbow", "forearm", "driver", "brace", "shutter_l", "shutter_r", "memory_01", "memory_02", "memory_03"]
    for key in required:
        ob = bpy.data.objects[key]
        ob.location = defaults[key][0].copy()
        ob.rotation_euler = defaults[key][1].copy()
    n = bpy.data.objects
    if state == "LOCK":
        n["rotary_mount"].rotation_euler.z = -.18
        n["upper_arm"].rotation_euler.z = -.06
        n["bellows_elbow"].rotation_euler.y = .12
        n["forearm"].rotation_euler.y = -.58
        n["driver"].rotation_euler.y = .82
        n["brace"].rotation_euler.z = .16
        for i in range(1, 4):
            n[f"memory_{i:02d}"].rotation_euler = (0, 0, 0)
    elif state == "CORE_OPEN":
        # The authored GLB retains its 23° stagger animation.  The imported
        # hierarchy triggers a Blender Eevee shadow-map defect when that parent
        # is rotated in this wide review scene, so this camera gate exposes the
        # same open shutters/driver commitment without rotating the parent.
        n["body"].rotation_euler.z = 0
        n["rotary_mount"].rotation_euler.z = .16
        n["upper_arm"].rotation_euler.z = .02
        n["bellows_elbow"].rotation_euler.y = .10
        n["forearm"].rotation_euler.y = -.54
        n["driver"].rotation_euler.y = .82
        n["brace"].rotation_euler.z = .31
        n["shutter_l"].location.x = -1.35
        n["shutter_r"].location.x = 1.35
        n["shutter_l"].rotation_euler.z = math.radians(-28)
        n["shutter_r"].rotation_euler.z = math.radians(28)
        for i in range(1, 4):
            n[f"memory_{i:02d}"].rotation_euler = (0, 0, 0)


def setup():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    import_asset("kiln_reliquary_arena.glb")
    import_asset("kiln_reliquary.glb")
    import_asset("kiln_duelist.glb")
    # Prevent imported GLB actions from overriding the explicit same-node review poses.
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            ob.animation_data.action = None
    bpy.data.objects["arena_root"].location.z = 0
    bpy.data.objects["boss_root"].location = (.45, 1.65, .47)
    bpy.data.objects["root"].location = (-2.55, -2.30, .47)
    bpy.data.objects["root"].rotation_euler.z = .18
    # The review uses a deliberately hard roof key.  During LOCK the imported
    # driver can cross that light's shadow-map origin; keep this presentation
    # artifact out of the readability check without altering any GLB geometry.
    stack = list(bpy.data.objects["boss_root"].children)
    while stack:
        child = stack.pop()
        if child.type == "MESH":
            child.visible_shadow = False
        stack.extend(child.children)

    defaults = {key: (bpy.data.objects[key].location.copy(), bpy.data.objects[key].rotation_euler.copy())
                for key in ("body", "rotary_mount", "upper_arm", "bellows_elbow", "forearm", "driver", "brace", "shutter_l", "shutter_r", "memory_01", "memory_02", "memory_03")}
    # Fixed, rusted impact plate: visual prediction marker, not a HUD ring.
    oxide = material("review_oxide_prediction", (.38, .085, .018), .35, .52)
    hot = material("review_hot_crack", (.85, .15, .015), .02, .4, ((1.0, .08, .005), 1.8))
    disc("fixed_prediction_plate", .73, .505, oxide, (3.05, -1.35))
    strip("prediction_cut", (3.05, -1.35, .516), (.82, .10, .022), hot, -.38)

    camera_data = bpy.data.cameras.new("review_camera")
    camera = bpy.data.objects.new("review_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (14.7, -18.6, 15.4)
    camera.data.lens = 47
    camera.data.sensor_width = 36
    look_at(camera, (0, 0, .55))
    bpy.context.scene.camera = camera
    world = bpy.data.worlds.new("review_world")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.010, .014, .016, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .34
    def light(name, typ, loc, energy, color, size):
        d = bpy.data.lights.new(name, typ)
        d.energy, d.color, d.shadow_soft_size = energy, color, size
        if hasattr(d, "use_shadow"):
            d.use_shadow = False
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc
        look_at(o, (0, 0, .5))
    light("cold_roof", "AREA", (-4, -5, 17), 2200, (.46, .61, .78), 8)
    light("furnace_fill", "AREA", (5, -7, 5), 1250, (1.0, .42, .16), 5)
    light("back_rim", "AREA", (6, 7, 7), 1600, (1.0, .62, .29), 4)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    return defaults


def main():
    REVIEW.mkdir(parents=True, exist_ok=True)
    defaults = setup()
    for state in ("WAITING", "EXPLORE", "LOCK", "CORE_OPEN"):
        pose_boss(state, defaults)
        bpy.context.view_layer.update()
        bpy.context.scene.render.filepath = str(REVIEW / f"kiln-place-{state.lower()}.png")
        bpy.ops.render.render(write_still=True)
    # The mobile readability gate uses the same imported assets and camera, only
    # reduced raster resolution.  No gameplay/runtime wall is introduced here.
    bpy.context.scene.render.resolution_x = 320
    bpy.context.scene.render.resolution_y = 180
    pose_boss("CORE_OPEN", defaults)
    bpy.context.scene.render.filepath = str(REVIEW / "kiln-place-core_open-320.png")
    bpy.ops.render.render(write_still=True)
    print("KILN_SCENE_REVIEW_RENDERED")


if __name__ == "__main__":
    main()
