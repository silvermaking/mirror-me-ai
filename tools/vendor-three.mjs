import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "node_modules", "three");
const TARGET = join(ROOT, "vendor", "three-0.180.0");
const REQUIRED = [
  "build/three.module.js",
  "build/three.core.js",
  "examples/jsm/loaders/GLTFLoader.js",
];
const IMPORT_PATTERN = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyModule(path, visited) {
  const normalized = normalize(path);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  const sourcePath = join(SOURCE, normalized);
  const text = await readFile(sourcePath, "utf8");
  const targetPath = join(TARGET, normalized);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, text);

  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const dependency = normalize(join(dirname(normalized), specifier));
    if (dependency.startsWith("..") || !(await exists(join(SOURCE, dependency)))) {
      throw new Error(`Missing local Three dependency: ${normalized} -> ${specifier}`);
    }
    await copyModule(dependency, visited);
  }
}

if (!(await exists(SOURCE))) {
  throw new Error("three@0.180.0 is not installed. Run pnpm install first.");
}

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
const visited = new Set();
for (const modulePath of REQUIRED) await copyModule(modulePath, visited);
await cp(join(SOURCE, "LICENSE"), join(TARGET, "LICENSE"));

const packageJson = JSON.parse(await readFile(join(SOURCE, "package.json"), "utf8"));
await writeFile(
  join(TARGET, "package.json"),
  `${JSON.stringify({ name: "three-vendor", version: packageJson.version, private: true }, null, 2)}\n`,
);

console.log(`Vendored Three ${packageJson.version}: ${[...visited].sort().join(", ")}`);
