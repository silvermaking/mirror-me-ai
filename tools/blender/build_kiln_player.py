#!/usr/bin/env python3
"""Build the authored low-poly kiln duelist player asset.

/opt/homebrew/bin/blender --background --factory-startup --python tools/blender/build_kiln_player.py
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
BLEND = ROOT / "assets/3d/source/kiln_duelist.blend"
GLB = ROOT / "assets/3d/kiln_duelist.glb"


def obj(name, verts, faces, material, parent=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    item = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(item)
    item.parent = parent
    return item


def empty(name, parent=None, loc=(0, 0, 0)):
    item = bpy.data.objects.new(name, None)
    item.empty_display_type = "PLAIN_AXES"
    item.empty_display_size = .14
    bpy.context.collection.objects.link(item)
    item.parent = parent
    item.location = loc
    return item


def bevel(item, amount=.035):
    mod = item.modifiers.new("cut_edge", "BEVEL")
    mod.width = amount
    mod.segments = 1
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = item
    bpy.ops.object.modifier_apply(modifier=mod.name)


def box(name, size, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), edge=.035):
    x, y, z = (n / 2 for n in size)
    verts = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
             (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    item = obj(name, verts, faces, material, parent)
    item.location, item.rotation_euler = loc, rot
    bevel(item, edge)
    return item


def plate(name, outline, depth, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), edge=.025):
    # extruded irregular X/Z profile, never a stock cube or cone
    verts = [(x, -depth / 2, z) for x, z in outline] + [(x, depth / 2, z) for x, z in outline]
    n = len(outline)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    item = obj(name, verts, faces, material, parent)
    item.location, item.rotation_euler = loc, rot
    bevel(item, edge)
    return item


def lathe(name, profile, sides, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    verts = []
    for radius, z in profile:
        for i in range(sides):
            a = math.tau * i / sides
            verts.append((radius * math.cos(a), radius * math.sin(a), z))
    faces = []
    for row in range(len(profile) - 1):
        for i in range(sides):
            faces.append((row * sides + i, row * sides + (i + 1) % sides,
                          (row + 1) * sides + (i + 1) % sides, (row + 1) * sides + i))
    item = obj(name, verts, faces, material, parent)
    item.location, item.rotation_euler = loc, rot
    return item


def material(name, color, metallic=0, rough=.5):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    bsdf = item.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    return item


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    canvas = material("oil_canvas_coat", (.085, .11, .105), .03, .74)
    teal = material("turquoise_glaze", (.025, .42, .38), .16, .28)
    ivory = material("ceramic_mask", (.58, .50, .36), .02, .67)
    steel = material("quenched_sword_steel", (.24, .27, .28), .78, .27)
    brass = material("small_aged_brass", (.38, .20, .06), .72, .31)

    root = empty("root")
    root["asset"] = "Kiln Duelist"
    root["foot_origin"] = "2D combat-plane projection"
    hips = empty("hips", root, (0, 0, .58))
    torso = empty("torso", hips, (0.03, 0.04, .40))
    head = empty("head", torso, (.03, -.03, .48))
    feet = empty("feet", hips, (0, 0, -.46))
    arm_weapon = empty("arm_weapon", torso, (.25, -.10, .20))
    hand_weapon = empty("hand_weapon", arm_weapon, (.40, -.18, -.12))
    sword = empty("sword", hand_weapon, (.18, -.10, -.06))

    # Low offset stance: the readable silhouette is an angled coat wedge over two wide feet.
    box("left_foot_heel", (.28, .53, .13), steel, feet, (-.19, -.17, .02), (0, -.10, -.14), .045)
    box("right_foot_heel", (.31, .50, .13), steel, feet, (.22, .14, .00), (0, .08, .18), .045)
    plate("left_greave", [(-.14, -.03), (-.12, .36), (.08, .46), (.17, .05), (.07, -.13)], .24, canvas, feet, (-.18, -.13, .17), (0, .15, -.12), .035)
    plate("right_greave", [(-.13, -.06), (-.06, .39), (.16, .43), (.12, .05), (.00, -.14)], .23, canvas, feet, (.20, .14, .15), (0, -.12, .15), .035)
    plate("hip_skirt", [(-.37, -.20), (-.28, .31), (.20, .42), (.42, .12), (.28, -.28), (-.15, -.33)], .37, canvas, hips, (0, 0, .0), (0, 0, -.08), .045)
    box("brass_belt_offset", (.64, .18, .10), brass, hips, (.02, -.22, .14), (0, .08, -.08), .02)

    # Asymmetric coat tail makes the stance read even at 320x180.
    plate("long_coat_tail", [(-.24, -.30), (-.31, .32), (-.03, .54), (.16, .42), (.20, -.34), (-.02, -.54)], .18, canvas, torso, (-.17, .19, -.16), (0, -.14, -.23), .04)
    plate("torso_wrapped_vest", [(-.30, -.21), (-.22, .34), (.02, .46), (.30, .23), (.25, -.28), (-.05, -.40)], .31, canvas, torso, (0, -.02, .06), (0, 0, -.04), .05)
    plate("ivory_chest_guard", [(-.13, -.15), (-.10, .26), (.12, .33), (.20, .02), (.08, -.25)], .08, ivory, torso, (.12, -.18, .10), (math.pi / 2, .10, -.17), .02)
    box("shoulder_ceramic", (.35, .34, .18), ivory, torso, (-.26, .01, .32), (0, -.12, .22), .045)

    # Hooded, faceted head: a custom lathe crown and a biased ceramic faceplate.
    lathe("hood_crown", [(0.17, -.16), (.25, -.03), (.23, .22), (.13, .34)], 7, canvas, head, (0, 0, 0))
    plate("mask_cut_face", [(-.13, -.11), (-.08, .18), (.11, .22), (.16, .02), (.04, -.14)], .08, ivory, head, (.03, -.20, .03), (math.pi / 2, 0, -.08), .025)
    box("single_teal_visor", (.17, .05, .055), teal, head, (.065, -.255, .075), (0, 0, -.10), .012)

    # Weapon arm leans forward, leaving the teal off-hand clear against the coat.
    plate("weapon_sleeve", [(-.10, -.14), (-.09, .18), (.42, .11), (.48, -.06), (.09, -.23)], .24, canvas, arm_weapon, (0, 0, 0), (0, -.18, -.39), .035)
    lathe("weapon_brass_cuff", [(0.10, -.10), (.15, -.04), (.14, .10), (.10, .15)], 6, brass, arm_weapon, (.39, -.13, -.08), (0, math.pi / 2, 0))
    box("weapon_hand", (.18, .20, .16), ivory, hand_weapon, (0, 0, 0), (0, .12, -.22), .035)
    plate("short_sword_blade", [(-.07, -.10), (-.05, .67), (.06, .85), (.13, .62), (.07, -.10)], .07, steel, sword, (.02, -.01, 0), (0, -.66, .06), .018)
    box("sword_guard", (.38, .10, .07), brass, sword, (0, -.02, .01), (0, -.55, .08), .018)
    box("sword_grip", (.10, .12, .30), canvas, sword, (-.10, .03, -.13), (0, -.55, .08), .018)

    # The turquoise glaze hand is held opposite the sword and protrudes into the silhouette.
    plate("offhand_sleeve", [(-.12, -.14), (-.06, .19), (.36, .12), (.42, -.08), (.07, -.22)], .22, canvas, torso, (-.30, -.03, .10), (0, .20, 2.45), .035)
    box("glaze_offhand", (.20, .18, .16), teal, torso, (-.55, -.20, .01), (0, .15, -.24), .04)
    lathe("glaze_knuckle", [(0.04, -.12), (.11, -.06), (.12, .08), (.05, .13)], 6, teal, torso, (-.66, -.23, .0), (0, math.pi / 2, 0))

    for node in (root, hips, torso, head, arm_weapon, hand_weapon, sword, feet):
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
    for item in selected:
        item.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True,
                              export_materials="EXPORT", export_apply=True, export_yup=True)
    print(f"KILN_DUELIST_BUILT {GLB}")


if __name__ == "__main__":
    build()
