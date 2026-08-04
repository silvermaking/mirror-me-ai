import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  MAP_ART_ATLASES,
  MAP_ART_FRAMES,
  MAP_ART_RENDER_CONTRACT,
  MAP_ART_REQUIRED_ANCHORS,
  MAP_ART_VERSION,
} from "../src/art-contract.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function uint24(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (kind === "VP8X") {
      return { width: uint24(buffer, data + 4) + 1, height: uint24(buffer, data + 7) + 1 };
    }
    if (kind === "VP8L") {
      assert.equal(buffer[data], 0x2f, "VP8L signature");
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8 ") {
      assert.equal(buffer.toString("hex", data + 3, data + 6), "9d012a", "VP8 start code");
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    offset = data + size + (size % 2);
  }
  throw new Error("WebP dimensions not found");
}

test("authored map atlases preserve dimensions, WebP encoding, and the 8MB budget", async () => {
  let total = 0;
  for (const [name, spec] of Object.entries(MAP_ART_ATLASES)) {
    if (name === "manifest") continue;
    const bytes = await readFile(resolve(ROOT, spec.file));
    total += bytes.byteLength;
    assert.deepEqual(webpDimensions(bytes), { width: spec.width, height: spec.height }, `${name} dimensions`);
  }
  assert.ok(total <= MAP_ART_RENDER_CONTRACT.maxCompressedAtlasBytes, `${total} authored atlas bytes stay under 8MB`);
});

test("atlas manifest contains every integration frame and finite local anchors", async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, MAP_ART_ATLASES.manifest.file), "utf8"));
  assert.equal(manifest.version, MAP_ART_VERSION);
  assert.deepEqual(manifest.logicalSize, [MAP_ART_RENDER_CONTRACT.logicalWidth, MAP_ART_RENDER_CONTRACT.logicalHeight]);
  assert.equal(manifest.projection.kind, MAP_ART_RENDER_CONTRACT.projection);
  assert.equal(manifest.projection.cameraControls, false);

  for (const [kind, frameIds] of Object.entries(MAP_ART_FRAMES)) {
    const spec = MAP_ART_ATLASES[kind];
    for (const frameId of frameIds) {
      const frame = manifest.frames[frameId];
      assert.ok(frame, `${frameId} exists`);
      const [, , width, height] = frame.rect;
      assert.equal(width, spec.frameWidth);
      assert.equal(height, spec.frameHeight);
      const anchorKind = frameId.startsWith("boss-") ? "boss" : frameId.startsWith("player-") ? "player" : frameId;
      for (const anchorName of MAP_ART_REQUIRED_ANCHORS[anchorKind] || ["root"]) {
        const anchor = frame.anchors[anchorName];
        assert.ok(Array.isArray(anchor) && anchor.length === 2, `${frameId}.${anchorName} exists`);
        assert.ok(anchor.every(Number.isFinite), `${frameId}.${anchorName} is finite`);
        assert.ok(anchor[0] >= 0 && anchor[0] <= width && anchor[1] >= 0 && anchor[1] <= height, `${frameId}.${anchorName} remains inside its cell`);
      }
    }
  }
});

test("Blender sources are committed, reproducible, orthographic, and free of stock final primitives", async () => {
  for (const file of [
    "assets/2d/source/map_challenger_characters.blend",
    "assets/2d/source/map_challenger_arena.blend",
  ]) {
    const bytes = await readFile(resolve(ROOT, file));
    assert.equal(bytes.toString("ascii", 0, 7), "BLENDER", `${file} is an editable Blender source`);
    assert.ok((await stat(resolve(ROOT, file))).size > 32 * 1024, `${file} is non-empty authored source`);
  }
  const [builder, packer] = await Promise.all([
    readFile(resolve(ROOT, "tools/blender/build_map_challenger_art.py"), "utf8"),
    readFile(resolve(ROOT, "tools/blender/pack_map_challenger_atlas.py"), "utf8"),
  ]);
  assert.match(builder, /camera_data\.type = "ORTHO"/);
  assert.match(builder, /def cloth_shell\(/);
  assert.match(builder, /def loft_[xz]\(/);
  assert.match(builder, /bpy\.ops\.wm\.save_as_mainfile/);
  assert.doesNotMatch(builder, /bpy\.ops\.mesh\.primitive_/);
  assert.doesNotMatch(`${builder}\n${packer}`, /https?:\/\//);
});
