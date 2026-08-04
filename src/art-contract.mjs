// Runtime-facing contract for the Blender-authored C-direction 2.5D atlases.
// The detailed per-frame pixel anchors live in assets/2d/atlases/atlas.json.

export const MAP_ART_VERSION = 1;

export const MAP_ART_ATLASES = Object.freeze({
  arena: Object.freeze({ file: "assets/2d/atlases/arena-plate.webp", width: 2560, height: 1440 }),
  boss: Object.freeze({ file: "assets/2d/atlases/boss-body.webp", width: 2560, height: 512, frameWidth: 640, frameHeight: 512 }),
  driver: Object.freeze({ file: "assets/2d/atlases/boss-driver.webp", width: 1920, height: 320, frameWidth: 640, frameHeight: 320 }),
  player: Object.freeze({ file: "assets/2d/atlases/player.webp", width: 1024, height: 512, frameWidth: 256, frameHeight: 256 }),
  relics: Object.freeze({ file: "assets/2d/atlases/relics.webp", width: 768, height: 256, frameWidth: 256, frameHeight: 256 }),
  manifest: Object.freeze({ file: "assets/2d/atlases/atlas.json" }),
});

export const MAP_ART_FRAMES = Object.freeze({
  boss: Object.freeze(["boss-closed", "boss-lock", "boss-collapse-open", "boss-core-hit"]),
  driver: Object.freeze(["driver-upper", "driver-forearm", "driver-stamp"]),
  player: Object.freeze([
    "player-idle",
    "player-run",
    "player-dash",
    "player-attack-windup",
    "player-attack-contact",
    "player-attack-recoil",
    "player-hurt",
  ]),
  relics: Object.freeze(["memory-plaque", "lock-seal", "boundary-blade"]),
});

export const MAP_ART_REQUIRED_ANCHORS = Object.freeze({
  boss: Object.freeze(["feet", "root", "core", "shoulder", "memory1", "memory2", "memory3"]),
  "driver-upper": Object.freeze(["shoulder", "elbow"]),
  "driver-forearm": Object.freeze(["elbow", "wrist"]),
  "driver-stamp": Object.freeze(["wrist", "stampCenter"]),
  player: Object.freeze(["feet", "root", "hand", "swordTip"]),
  "boundary-blade": Object.freeze(["root", "hand", "swordTip"]),
});

export const MAP_ART_RENDER_CONTRACT = Object.freeze({
  logicalWidth: 1280,
  logicalHeight: 720,
  projection: "fixed-quarter",
  camera: "orthographic",
  maxCompressedAtlasBytes: 8 * 1024 * 1024,
  maxAnchorErrorPixels: 1,
});
