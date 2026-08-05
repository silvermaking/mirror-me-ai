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

export const CLASSIC_ART_VERSION = 1;

export const CLASSIC_ART_ASSETS = Object.freeze({
  boss: Object.freeze({ file: "assets/2d/classic/boss-parts.svg", width: 640, height: 192 }),
  driver: Object.freeze({ file: "assets/2d/classic/driver-parts.svg", width: 512, height: 128 }),
  player: Object.freeze({ file: "assets/2d/classic/player-cloak.svg", width: 128, height: 128 }),
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
  }),
  driver: Object.freeze({
    shoulder: part("driver-shoulder", [0, 0, 128, 128], { axis: [64, 64] }),
    rail: part("driver-rail", [128, 0, 160, 64], { start: [12, 32], end: [148, 32] }),
    collar: part("driver-collar", [288, 0, 96, 96], { axis: [48, 48] }),
    head: part("driver-head", [384, 0, 128, 128], { axis: [18, 64], contact: [112, 64] }),
  }),
  player: Object.freeze({
    cloak: part("player-cloak", [0, 0, 128, 128], { hip: [66, 48], foot: [66, 113] }),
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
  maxRawBytes: 100 * 1024,
  maxDevicePixelRatio: 1.5,
  maxSteadyDrawImages: 14,
  maxImpactDrawImages: 19,
  maxAnchorErrorPixels: 1,
});
