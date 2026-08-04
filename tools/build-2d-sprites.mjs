/**
 * Deterministic authored-art build step. No network, canvas, rasterization, or
 * generative artwork. Each runtime cell references exactly one local-space key
 * pose, is clipped to its own 64×64 bounds, and carries source-id metadata.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets/2d/source');
const output = resolve(root, 'assets/2d/sprites');
const FRAME = 64;

function makeManifest(driverJoint) {
  return {
  version: 3,
  sheets: {
    player: { file: 'player-sheet.svg', width: 384, height: 64, frameWidth: FRAME, frameHeight: FRAME, frameCount: 6 },
    boss: { file: 'boss-sheet.svg', width: 256, height: 64, frameWidth: FRAME, frameHeight: FRAME, frameCount: 4 },
    relics: { file: 'relics.svg', width: 240, height: 48, frameWidth: 48, frameHeight: 48, frameCount: 5 },
  },
  frames: {
    'player-idle': [0, 0], 'player-move': [64, 0], 'player-dash': [128, 0],
    'player-attack-windup': [192, 0], 'player-attack-contact': [256, 0], 'player-attack-recoil': [320, 0],
    'boss-idle': [0, 0], 'boss-lock': [64, 0], 'boss-stamp': [128, 0], 'boss-open': [192, 0],
    'memory-plaque': [0, 0], 'lock-seal': [48, 0], 'blank-core': [96, 0],
    danger: [144, 0], 'compass-driver': [192, 0],
  },
  sourceFrames: {
    'player-idle': { id: 'player-idle', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [31, 60] } },
    'player-move': { id: 'player-move', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [29, 60] } },
    'player-dash': { id: 'player-dash', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [34, 60] } },
    'player-attack-windup': { id: 'player-attack-windup', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [31, 60], hand: [41, 33] } },
    'player-attack-contact': { id: 'player-attack-contact', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [30, 60], hand: [42, 32] } },
    'player-attack-recoil': { id: 'player-attack-recoil', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [31, 60], hand: [42, 35] } },
    'boss-idle': { id: 'boss-idle', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [32, 60] } },
    'boss-lock': { id: 'boss-lock', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [32, 60], driver: [driverJoint.x, driverJoint.y] } },
    'boss-stamp': { id: 'boss-stamp', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [32, 60], driver: [driverJoint.x, driverJoint.y] } },
    'boss-open': { id: 'boss-open', bounds: [0, 0, FRAME, FRAME], anchors: { feet: [32, 60], driver: [driverJoint.x, driverJoint.y], core: [34, 44] } },
  },
  };
}

function driverJointFromSource(sourceSvg) {
  const joints = ["boss-lock", "boss-stamp", "boss-open"].map((id) => {
    const match = sourceSvg.match(new RegExp(`<g id="${id}"[^>]*data-driver-joint="(\\d+),(\\d+)"`));
    if (!match) throw new Error(`${id} must declare an authored data-driver-joint`);
    return { x: Number(match[1]), y: Number(match[2]) };
  });
  const [joint] = joints;
  if (!joints.every(({ x, y }) => x === joint.x && y === joint.y)) throw new Error("Every driver-visible boss pose must share one authored driver joint");
  return joint;
}

function runtimeContract(driverJoint) {
  return `// Generated from assets/2d/source/characters.svg. Do not hand-edit.\nexport const BOSS_DRIVER_JOINT_SOURCE = Object.freeze({ x: ${driverJoint.x}, y: ${driverJoint.y} });\n`;
}

function sourceDefinitions(sourceSvg) {
  const defs = sourceSvg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
  if (!defs) throw new Error('characters.svg must contain an authored <defs> block');
  return defs;
}

function verifyPose(sourceSvg, id) {
  if (!new RegExp(`<g id="${id}"(?:\\s|>)`).test(sourceSvg)) throw new Error(`Missing authored key pose: ${id}`);
}

function authoredSheet(sourceSvg, frames, label, frame = FRAME) {
  frames.forEach(({ id }) => verifyPose(sourceSvg, id));
  const width = frames.length * frame;
  const clips = frames.map((_, index) => `<clipPath id="frame-${index}"><rect x="${index * frame}" y="0" width="${frame}" height="${frame}"/></clipPath>`).join('');
  const cells = frames.map(({ id }, index) => {
    const x = index * frame;
    return `<g data-frame-id="${id}" data-frame-order="${index}" clip-path="url(#frame-${index})"><use href="#${id}" transform="translate(${x} 0)"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${frame}" width="${width}" height="${frame}">\n` +
    `<title>${label} — generated authored runtime sprite sheet</title><defs>${sourceDefinitions(sourceSvg)}${clips}</defs>${cells}</svg>\n`;
}

export async function buildSprites({ sourceDir = source, outputDir = output, frameSize = FRAME } = {}) {
  if (frameSize !== FRAME) throw new Error(`Runtime sprite contract requires ${FRAME}px cells; got ${frameSize}`);
  await mkdir(outputDir, { recursive: true });
  const characters = await readFile(resolve(sourceDir, 'characters.svg'), 'utf8');
  const driverJoint = driverJointFromSource(characters);
  await writeFile(resolve(outputDir, 'player-sheet.svg'), authoredSheet(characters, [
    { id: 'player-idle' }, { id: 'player-move' }, { id: 'player-dash' },
    { id: 'player-attack-windup' }, { id: 'player-attack-contact' }, { id: 'player-attack-recoil' },
  ], 'Boundary runner', frameSize));
  await writeFile(resolve(outputDir, 'boss-sheet.svg'), authoredSheet(characters, [
    { id: 'boss-idle' }, { id: 'boss-lock' }, { id: 'boss-stamp' }, { id: 'boss-open' },
  ], 'Unmapped Cartographer', frameSize));
  await cp(resolve(sourceDir, 'relics.svg'), resolve(outputDir, 'relics.svg'));
  await writeFile(resolve(outputDir, 'sprites.json'), `${JSON.stringify(makeManifest(driverJoint), null, 2)}\n`);
  await writeFile(resolve(outputDir, 'sprite-contract.mjs'), runtimeContract(driverJoint));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSprites();
