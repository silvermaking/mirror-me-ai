import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CLASSIC_ART_ASSETS,
  CLASSIC_ART_LIMITS,
  CLASSIC_ART_PARTS,
  CLASSIC_ART_VERSION,
  CLASSIC_RELIC_PARTS,
} from "../src/classic-art-contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function numericTuple(value) {
  return value?.trim().split(/\s+/).map(Number) ?? [];
}

function newArtEntries() {
  return Object.entries(CLASSIC_ART_ASSETS).filter(([, asset]) => !asset.reused);
}

function allParts() {
  return Object.entries(CLASSIC_ART_PARTS).flatMap(([assetName, parts]) =>
    Object.values(parts).map((value) => ({ assetName, value })),
  );
}

test("classic cutout contract uses five local SVG assets and reuses relics", () => {
  assert.equal(CLASSIC_ART_VERSION, 2);
  assert.equal(Object.keys(CLASSIC_ART_ASSETS).length, CLASSIC_ART_LIMITS.maxAssetFiles);
  assert.deepEqual(CLASSIC_ART_ASSETS.player, {
    file: "assets/2d/classic/player-cloak.svg",
    width: 512,
    height: 128,
  });
  assert.deepEqual(CLASSIC_ART_ASSETS.driver, {
    file: "assets/2d/classic/driver-parts.svg",
    width: 768,
    height: 192,
  });
  assert.deepEqual(CLASSIC_ART_ASSETS.relics, {
    file: "assets/2d/sprites/relics.svg",
    width: 240,
    height: 48,
    reused: true,
  });
  for (const asset of Object.values(CLASSIC_ART_ASSETS)) {
    assert.match(asset.file, /^assets\/2d\//);
    assert.match(asset.file, /\.svg$/);
    assert.doesNotMatch(asset.file, /(?:\.webp|\.png|\.blend)$/i);
  }
});

test("animation identity sheets expose the locked articulated components", () => {
  assert.deepEqual(CLASSIC_ART_PARTS.player.cloak, {
    id: "player-cloak",
    sourceRect: [0, 0, 128, 128],
    anchors: { hip: [66, 48], foot: [66, 113] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.player.body, {
    id: "player-body",
    sourceRect: [128, 0, 96, 128],
    anchors: { foot: [48, 116], shoulder: [48, 43], hip: [48, 76] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.player.rearArm, {
    id: "player-rear-arm",
    sourceRect: [224, 0, 80, 96],
    anchors: { shoulder: [15, 24], hand: [67, 76] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.player.swordArm, {
    id: "player-sword-arm",
    sourceRect: [304, 0, 96, 96],
    anchors: { shoulder: [14, 27], grip: [82, 64] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.player.blade, {
    id: "player-blade",
    sourceRect: [400, 0, 112, 64],
    anchors: { grip: [10, 32], tip: [105, 26] },
  });

  assert.deepEqual(CLASSIC_ART_PARTS.driver.braceUpper, {
    id: "brace-upper",
    sourceRect: [512, 0, 128, 96],
    anchors: { shoulder: [16, 48], elbow: [112, 52] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.driver.braceLower, {
    id: "brace-lower",
    sourceRect: [640, 0, 128, 96],
    anchors: { elbow: [16, 44], ground: [111, 80] },
  });

  assert.deepEqual(CLASSIC_ART_PARTS.boss.coreRim, {
    id: "core-rim",
    sourceRect: [400, 96, 80, 96],
    anchors: { root: [40, 48] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.boss.coreFace, {
    id: "core-face",
    sourceRect: [480, 96, 80, 96],
    anchors: { root: [40, 48] },
  });
  assert.deepEqual(CLASSIC_ART_PARTS.boss.coreFins, {
    id: "core-fins",
    sourceRect: [560, 96, 80, 96],
    anchors: { root: [40, 48] },
  });

  assert.equal(CLASSIC_ART_LIMITS.maxRawBytes, 160 * 1024);
  assert.equal(CLASSIC_ART_LIMITS.maxSteadyDrawImages, 24);
  assert.equal(CLASSIC_ART_LIMITS.maxImpactDrawImages, 32);
});

test("authored SVGs are compact editable paths with no external or executable content", async () => {
  let totalBytes = 0;
  for (const [name, asset] of Object.entries(CLASSIC_ART_ASSETS)) {
    const file = resolve(ROOT, asset.file);
    const [source, metadata] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    totalBytes += metadata.size;

    assert.match(source, /<svg\b/);
    assert.match(source, /<path\b/, `${name} must contain authored paths`);
    assert.doesNotMatch(source, /<(?:image|script|filter|foreignObject|text)\b/i);
    assert.doesNotMatch(source, /(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/i);
    assert.doesNotMatch(source, /(?:@font-face|font-family|\.webp|\.png|\.blend)/i);

    const svgTag = source.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(svgTag, `${name} must have an svg root`);
    assert.deepEqual(numericTuple(attribute(svgTag, "viewBox")), [0, 0, asset.width, asset.height]);
  }
  assert.ok(totalBytes <= CLASSIC_ART_LIMITS.maxRawBytes, `${totalBytes} raw art bytes exceed budget`);
});

test("every component source rect and pivot is explicit in both SVG and contract", async () => {
  const sources = Object.fromEntries(await Promise.all(
    newArtEntries().map(async ([name, asset]) => [name, await readFile(resolve(ROOT, asset.file), "utf8")]),
  ));

  for (const { assetName, value: component } of allParts()) {
    const asset = CLASSIC_ART_ASSETS[assetName];
    const [x, y, width, height] = component.sourceRect;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= asset.width && y + height <= asset.height, `${component.id} rect exceeds sheet`);

    const groupTag = sources[assetName].match(new RegExp(`<g\\s+id="${component.id}"[^>]*>`))?.[0];
    assert.ok(groupTag, `${component.id} group is missing`);
    assert.deepEqual(numericTuple(attribute(groupTag, "data-source-rect")), component.sourceRect);

    for (const [anchorName, point] of Object.entries(component.anchors)) {
      assert.ok(point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height);
      assert.deepEqual(
        numericTuple(attribute(groupTag, `data-pivot-${anchorName}`)),
        point,
        `${component.id}.${anchorName} metadata differs from runtime contract`,
      );
    }
  }
});

test("cutouts are rigid components rather than full-body animation frames", () => {
  const ids = allParts().map(({ value }) => value.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.doesNotMatch(id, /(?:idle|move|dash|attack|windup|contact|recoil|lock|open)/i);
  }
  assert.deepEqual(CLASSIC_RELIC_PARTS.memory.sourceRect, [0, 0, 48, 48]);
  assert.deepEqual(CLASSIC_RELIC_PARTS.lock.sourceRect, [48, 0, 48, 48]);
});
