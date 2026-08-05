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
  assert.equal(CLASSIC_ART_VERSION, 1);
  assert.equal(Object.keys(CLASSIC_ART_ASSETS).length, CLASSIC_ART_LIMITS.maxAssetFiles);
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
