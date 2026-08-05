// Runtime contract for the component-level SVG cutouts layered over the
// original continuous Canvas renderer. Coordinates in `sourceRect` are sheet
// coordinates; every named anchor is local to that source rectangle.

const frozenPoint = (point) => Object.freeze([...point]);

function part(id, sourceRect, anchors) {
  return Object.freeze({
    id,
    sourceRect: Object.freeze([...sourceRect]),
    anchors: Object.freeze(Object.fromEntries(
      Object.entries(anchors).map(([name, point]) => [name, frozenPoint(point)]),
    )),
  });
}

export const CLASSIC_ART_VERSION = 2;

export const CLASSIC_ART_ASSETS = Object.freeze({
  boss: Object.freeze({ file: "assets/2d/classic/boss-parts.svg", width: 640, height: 192 }),
  driver: Object.freeze({ file: "assets/2d/classic/driver-parts.svg", width: 768, height: 192 }),
  player: Object.freeze({ file: "assets/2d/classic/player-cloak.svg", width: 512, height: 128 }),
  impact: Object.freeze({ file: "assets/2d/classic/impact-shards.svg", width: 320, height: 64 }),
  relics: Object.freeze({ file: "assets/2d/sprites/relics.svg", width: 240, height: 48, reused: true }),
});

export const CLASSIC_ART_PARTS = Object.freeze({
  boss: Object.freeze({
    back: part("boss-back", [0, 0, 160, 192], { root: [80, 164], core: [84, 101] }),
    shellLeft: part("shell-left", [160, 0, 120, 192], { hinge: [98, 142] }),
    shellRight: part("shell-right", [280, 0, 120, 192], { hinge: [22, 142] }),
    shutterLeft: part("shutter-left", [400, 0, 80, 96], { hinge: [67, 50] }),
    shutterRight: part("shutter-right", [480, 0, 80, 96], { hinge: [13, 50] }),
    sightCrown: part("sight-crown", [560, 0, 80, 96], { root: [40, 84] }),
    coreRim: part("core-rim", [400, 96, 80, 96], { root: [40, 48] }),
    coreFace: part("core-face", [480, 96, 80, 96], { root: [40, 48] }),
    coreFins: part("core-fins", [560, 96, 80, 96], { root: [40, 48] }),
  }),
  driver: Object.freeze({
    shoulder: part("driver-shoulder", [0, 0, 128, 128], { axis: [64, 64] }),
    rail: part("driver-rail", [128, 0, 160, 64], { start: [12, 32], end: [148, 32] }),
    collar: part("driver-collar", [288, 0, 96, 96], { axis: [48, 48] }),
    head: part("driver-head", [384, 0, 128, 128], { axis: [18, 64], contact: [112, 64] }),
    braceUpper: part("brace-upper", [512, 0, 128, 96], { shoulder: [16, 48], elbow: [112, 52] }),
    braceLower: part("brace-lower", [640, 0, 128, 96], { elbow: [16, 44], ground: [111, 80] }),
  }),
  player: Object.freeze({
    cloak: part("player-cloak", [0, 0, 128, 128], { hip: [66, 48], foot: [66, 113] }),
    body: part("player-body", [128, 0, 96, 128], { foot: [48, 116], shoulder: [48, 43], hip: [48, 76] }),
    rearArm: part("player-rear-arm", [224, 0, 80, 96], { shoulder: [15, 24], hand: [67, 76] }),
    swordArm: part("player-sword-arm", [304, 0, 96, 96], { shoulder: [14, 27], grip: [82, 64] }),
    blade: part("player-blade", [400, 0, 112, 64], { grip: [10, 32], tip: [105, 26] }),
  }),
  impact: Object.freeze({
    shard1: part("impact-shard-1", [0, 0, 64, 64], { root: [32, 32] }),
    shard2: part("impact-shard-2", [64, 0, 64, 64], { root: [32, 32] }),
    shard3: part("impact-shard-3", [128, 0, 64, 64], { root: [32, 32] }),
    shard4: part("impact-shard-4", [192, 0, 64, 64], { root: [32, 32] }),
    shard5: part("impact-shard-5", [256, 0, 64, 64], { root: [32, 32] }),
  }),
});

export const CLASSIC_RELIC_PARTS = Object.freeze({
  memory: part("memory-plaque", [0, 0, 48, 48], { root: [24, 24] }),
  lock: part("lock-seal", [48, 0, 48, 48], { root: [24, 24] }),
});

export const CLASSIC_ART_LIMITS = Object.freeze({
  maxAssetFiles: 5,
  maxRawBytes: 160 * 1024,
  maxDevicePixelRatio: 1.5,
  maxSteadyDrawImages: 24,
  maxImpactDrawImages: 32,
  maxAnchorErrorPixels: 1,
});
