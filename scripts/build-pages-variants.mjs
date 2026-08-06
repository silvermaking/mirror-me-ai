import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, ".pages-dist");
// CI uses HEAD.  A named tree lets the same complete variant build verify an
// uncommitted candidate without touching the developer's real index.
const currentRef = process.env.PAGES_CURRENT_REF || "HEAD";

const variants = [
  {
    id: "current",
    label: "최초판 + authored 2D 에셋",
    ref: currentRef,
    target: "",
    paths: ["index.html", "styles.css", "src", "assets/2d", "assets/audio"],
    required: [
      "index.html",
      "src/main.js",
      "src/render-sprite.mjs",
      "src/render-classic.mjs",
      "src/sprite-art-contract.mjs",
      "src/visual-dynamics.mjs",
      "src/classic-art-contract.mjs",
      "assets/2d/strips/sprites.json",
      "assets/2d/strips/player-body.png",
      "assets/2d/strips/player-blade.png",
      "assets/2d/strips/boss-body.png",
      "assets/2d/strips/driver-shaft.png",
      "assets/2d/strips/driver-tip.png",
      "assets/2d/strips/driver-cuff.png",
      "assets/audio/sfx/manifest.json",
      "assets/audio/sfx/memory-latch-1.wav",
      "assets/audio/sfx/memory-latch-2.wav",
      "assets/audio/sfx/memory-latch-3.wav",
      "assets/audio/sfx/cable-gather.wav",
      "assets/audio/sfx/lock-body.wav",
      "assets/audio/sfx/lock-latch.wav",
      "assets/audio/sfx/driver-load.wav",
      "assets/audio/sfx/blade-air.wav",
      "assets/audio/sfx/blade-edge.wav",
      "assets/audio/sfx/porcelain-armor.wav",
      "assets/audio/sfx/empty-plate.wav",
      "assets/audio/sfx/chassis-collapse.wav",
      "assets/audio/sfx/core-open.wav",
      "assets/audio/sfx/core-contact.wav",
      "assets/audio/sfx/player-hit.wav",
      "assets/audio/bgm/manifest.json",
      "assets/audio/bgm/kiln-breath-loop.wav",
      "assets/2d/classic/boss-parts.svg",
      "assets/2d/classic/driver-parts.svg",
      "assets/2d/classic/player-cloak.svg",
      "assets/2d/classic/impact-shards.svg",
      "assets/2d/sprites/relics.svg",
    ],
  },
  {
    id: "first-playable",
    label: "최초 완성판",
    ref: "e63f7a0",
    target: "versions/first-playable",
    paths: ["index.html", "styles.css", "src"],
    required: ["index.html", "src/main.js", "src/render.mjs"],
  },
  {
    id: "3d-runtime",
    label: "보관 3D판",
    ref: "630e0da",
    target: "versions/3d-runtime",
    paths: ["index.html", "styles.css", "src", "assets/3d", "vendor/three-0.180.0"],
    required: [
      "index.html",
      "src/main.js",
      "src/render.mjs",
      "assets/3d/kiln_reliquary.glb",
      "vendor/three-0.180.0/build/three.module.js",
    ],
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    const detail = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function archiveVariant(variant) {
  const destination = join(output, variant.target);
  const archive = join(output, `.${variant.id}.tar`);
  mkdirSync(destination, { recursive: true });

  if (variant.ref === "WORKTREE") {
    // Review builds must see an uncommitted candidate without changing HEAD;
    // CI retains the archive path below and therefore validates its exact ref.
    for (const path of variant.paths) cpSync(join(root, path), join(destination, path), { recursive: true });
  } else {
    const archiveFd = openSync(archive, "w");
    try {
      run(
        "git",
        ["archive", "--format=tar", variant.ref, "--", ...variant.paths],
        { encoding: null, stdio: ["ignore", archiveFd, "pipe"] },
      );
    } finally {
      closeSync(archiveFd);
    }

    try {
      run("tar", ["-xf", archive, "-C", destination]);
    } finally {
      rmSync(archive, { force: true });
    }
  }

  for (const required of variant.required) {
    const requiredPath = join(destination, required);
    if (!existsSync(requiredPath)) {
      throw new Error(`${variant.id} is missing required runtime file: ${required}`);
    }
  }
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const variant of variants) archiveVariant(variant);

const classicMain = readFileSync(join(output, "versions/first-playable/src/main.js"), "utf8");
if (!classicMain.includes('from "./render.mjs"')) {
  throw new Error("first-playable no longer points to its original Canvas renderer");
}

const threeIndex = readFileSync(join(output, "versions/3d-runtime/index.html"), "utf8");
if (!threeIndex.includes('type="importmap"')) {
  throw new Error("3d-runtime is missing its local Three.js import map");
}

const currentMain = readFileSync(join(output, "src/main.js"), "utf8");
if (!currentMain.includes('from "./render-sprite.mjs"')) {
  throw new Error("current build no longer points to the sprite renderer");
}

const manifest = {
  generatedAt: new Date().toISOString(),
  variants: variants.map(({ id, label, ref, target }) => ({
    id,
    label,
    ref,
    path: target ? `/${target}/` : "/",
  })),
};
mkdirSync(join(output, "versions"), { recursive: true });
writeFileSync(join(output, "versions/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(output, ".nojekyll"), "");

for (const variant of manifest.variants) {
  console.log(`PAGES_VARIANT ${variant.id} ${variant.ref} ${variant.path}`);
}
