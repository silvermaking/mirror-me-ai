export const THREE_VERSION = "0.180.0";

export const ASSET_FILES = Object.freeze({
  arena: "assets/3d/kiln_reliquary_arena.glb",
  player: "assets/3d/kiln_duelist.glb",
  boss: "assets/3d/kiln_reliquary.glb",
});

export const REQUIRED_NODES = Object.freeze({
  arena: ["arena_root", "turntable", "perimeter_rail", "exhaust_array", "kiln_facility"],
  player: ["root", "hips", "torso", "head", "feet", "arm_weapon", "hand_weapon", "sword"],
  boss: [
    "boss_root", "body", "rotary_mount", "upper_arm", "bellows_elbow", "forearm", "driver",
    "brace", "shutter_l", "shutter_r", "core", "memory_01", "memory_02", "memory_03",
  ],
});
