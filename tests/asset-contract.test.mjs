import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { ASSET_FILES, REQUIRED_NODES, THREE_VERSION } from "../src/asset-contract.mjs";

const ROOT = resolve(import.meta.dirname, "..");

async function readGlb(relativePath) {
  const bytes = await readFile(resolve(ROOT, relativePath));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${relativePath} has GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${relativePath} uses GLB v2`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${relativePath} has JSON chunk`);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim()) };
}

test("GLB assets preserve their named-node and size contract", async () => {
  let total = 0;
  for (const [kind, relativePath] of Object.entries(ASSET_FILES)) {
    const requiredNodes = REQUIRED_NODES[kind];
    const { bytes, json } = await readGlb(relativePath);
    total += bytes.byteLength;
    const names = new Set((json.nodes || []).map((node) => node.name));
    for (const node of requiredNodes) assert.ok(names.has(node), `${relativePath} contains ${node}`);
  }
  assert.ok(total <= 8 * 1024 * 1024, `GLB total ${total} bytes is at most 8MB`);
});

test("Three 0.180.0 is entirely served from local relative vendor paths", async () => {
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies.three, THREE_VERSION);
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  assert.match(html, /"three": "\.\/vendor\/three-0\.180\.0\/build\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/": "\.\/vendor\/three-0\.180\.0\/examples\/jsm\/"/);
  const renderer = await readFile(resolve(ROOT, "src/render.mjs"), "utf8");
  assert.match(renderer, /from "\.\/asset-contract\.mjs"/);
  assert.match(renderer, /from "three"/);
  assert.match(renderer, /from "three\/addons\/loaders\/GLTFLoader\.js"/);
  assert.doesNotMatch(renderer, /https?:\/\//);
  for (const relativePath of [
    "vendor/three-0.180.0/build/three.module.js",
    "vendor/three-0.180.0/build/three.core.js",
    "vendor/three-0.180.0/examples/jsm/loaders/GLTFLoader.js",
    "vendor/three-0.180.0/examples/jsm/utils/BufferGeometryUtils.js",
    "vendor/three-0.180.0/LICENSE",
  ]) {
    assert.ok((await stat(resolve(ROOT, relativePath))).size > 0, `${relativePath} is vendored`);
  }
  const loader = await readFile(resolve(ROOT, "vendor/three-0.180.0/examples/jsm/loaders/GLTFLoader.js"), "utf8");
  assert.match(loader, /\.\.\/utils\/BufferGeometryUtils\.js/);
});
