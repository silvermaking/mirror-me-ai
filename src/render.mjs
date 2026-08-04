import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSET_FILES, REQUIRED_NODES } from "./asset-contract.mjs";
import { CONFIG, PHASE, timingForRound } from "./game-core.mjs";

const ARENA_RADIUS = 7.2;
const ARENA_SURFACE = 0.48;
const WORLD_X = ARENA_RADIUS / CONFIG.arenaRadiusX;
const WORLD_Z = ARENA_RADIUS / CONFIG.arenaRadiusY;
const ASSETS = Object.freeze({
  arena: new URL(`../${ASSET_FILES.arena}`, import.meta.url),
  player: new URL(`../${ASSET_FILES.player}`, import.meta.url),
  boss: new URL(`../${ASSET_FILES.boss}`, import.meta.url),
});
const PLAYER_SHADOW_MESHES = new Set([
  "torso_wrapped_vest", "ivory_chest_guard", "long_coat_tail", "mask_cut_face", "short_sword_blade",
]);
const BOSS_SHADOW_MESHES = new Set([
  "furnace_cast_shell", "furnace_underslung_keel", "rotary_cast_housing", "upper_arm_cast", "forearm_cast",
  "driver_wedge_head", "brace_arm", "left_shutter_plate", "right_shutter_plate",
]);

export const WORLD_MAPPING = Object.freeze({ arenaRadius: ARENA_RADIUS, surface: ARENA_SURFACE, worldX: WORLD_X, worldZ: WORLD_Z });

export function coreToWorld(point, height = 0) {
  return new THREE.Vector3(point.x * WORLD_X, ARENA_SURFACE + height, point.y * WORLD_Z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function phaseProgress(state, duration) {
  return clamp(1 - state.phaseTime / duration, 0, 1);
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function snapshotNode(node) {
  return {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
    visible: node.visible,
  };
}

function restoreNode(node, snapshot) {
  node.position.copy(snapshot.position);
  node.quaternion.copy(snapshot.quaternion);
  node.scale.copy(snapshot.scale);
  node.visible = snapshot.visible;
}

function swordTipFromBlade(sword, blade) {
  const positions = blade.geometry?.getAttribute("position");
  if (!positions) throw new Error("short_sword_blade geometry has no positions");
  sword.updateWorldMatrix(true, false);
  blade.updateWorldMatrix(true, false);
  const candidate = new THREE.Vector3();
  const best = new THREE.Vector3();
  let greatestDistance = -1;
  for (let index = 0; index < positions.count; index += 1) {
    candidate.fromBufferAttribute(positions, index);
    blade.localToWorld(candidate);
    sword.worldToLocal(candidate);
    const distance = candidate.lengthSq();
    if (distance > greatestDistance) {
      greatestDistance = distance;
      best.copy(candidate);
    }
  }
  return best;
}

function disposeObject(root) {
  root?.traverse((item) => {
    if (item.geometry) item.geometry.dispose();
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function assertNodes(kind, root) {
  const missing = REQUIRED_NODES[kind].filter((name) => !root.getObjectByName(name));
  if (missing.length) throw new Error(`${kind} GLB missing named nodes: ${missing.join(", ")}`);
}

function makeMarkerLayer() {
  const root = new THREE.Group();
  root.name = "combat_markers";
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x20110b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const rustEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0xd16a31, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ivoryEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0xe2c58b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const tealMaterial = new THREE.MeshBasicMaterial({ color: 0x56b8ae, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xffc36c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  const explore = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMaterial);
  explore.rotation.x = -Math.PI / 2;
  explore.position.y = ARENA_SURFACE + 0.014;
  root.add(explore);

  // The warning remains a physical scorch lane: charcoal heat damage bounded by kiln-orange and kiln-ivory seams.
  const exploreRustEdges = [-1, 1].map(() => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rustEdgeMaterial.clone());
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = ARENA_SURFACE + 0.018;
    root.add(edge);
    return edge;
  });
  const exploreIvoryEdges = [-1, 1].map(() => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ivoryEdgeMaterial.clone());
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = ARENA_SURFACE + 0.02;
    root.add(edge);
    return edge;
  });

  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.96, -0.52);
  plateShape.lineTo(-0.48, -0.91);
  plateShape.lineTo(0.24, -0.82);
  plateShape.lineTo(0.96, -0.31);
  plateShape.lineTo(0.73, 0.58);
  plateShape.lineTo(0.10, 0.94);
  plateShape.lineTo(-0.77, 0.71);
  plateShape.lineTo(-1.0, 0.08);
  plateShape.closePath();
  const lockPlate = new THREE.Mesh(
    new THREE.ShapeGeometry(plateShape),
    new THREE.MeshStandardMaterial({ color: 0x4a2616, roughness: 0.96, metalness: 0.12, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  lockPlate.rotation.x = -Math.PI / 2;
  lockPlate.position.y = ARENA_SURFACE + 0.018;
  root.add(lockPlate);
  const lockCut = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xe2c58b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  lockCut.rotation.set(-Math.PI / 2, 0, -0.28);
  lockCut.position.y = ARENA_SURFACE + 0.023;
  root.add(lockCut);
  const lockCracks = new THREE.Group();
  lockCracks.rotation.x = -Math.PI / 2;
  lockCracks.position.y = ARENA_SURFACE + 0.021;
  // Spent prediction is a scarred plate, not a HUD ring: fired seams radiate from the missed driver point.
  for (const [angle, length, offset] of [
    [-2.72, 0.50, 0.37], [-1.88, 0.62, 0.34], [-1.10, 0.45, 0.42], [-0.30, 0.60, 0.35],
    [0.52, 0.48, 0.39], [1.32, 0.64, 0.33], [2.20, 0.46, 0.40],
  ]) {
    const crack = new THREE.Mesh(
      new THREE.PlaneGeometry(length, 0.075),
      new THREE.MeshBasicMaterial({ color: 0x9a6840, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    crack.rotation.z = angle;
    crack.position.set(Math.cos(angle) * offset, Math.sin(angle) * offset, 0);
    lockCracks.add(crack);
  }
  root.add(lockCracks);

  const trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tealMaterial);
  trail.rotation.x = -Math.PI / 2;
  trail.position.y = ARENA_SURFACE + 0.024;
  root.add(trail);

  const attack = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 24), impactMaterial);
  attack.rotation.x = -Math.PI / 2;
  attack.position.y = ARENA_SURFACE + 0.028;
  root.add(attack);
  return { root, explore, exploreRustEdges, exploreIvoryEdges, exploreKey: null, lockPlate, lockCut, lockCracks, trail, attack };
}

function makeCoreContact() {
  const root = new THREE.Group();
  root.name = "core_contact_feedback";
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xfff5d2, transparent: true, opacity: 0.96, depthTest: false }),
  );
  root.add(flash);
  const spokeVertices = new Float32Array([
    -0.26, 0, 0, 0.26, 0, 0,
    0, -0.21, 0, 0, 0.21, 0,
    -0.17, -0.14, 0, 0.17, 0.14, 0,
    -0.17, 0.14, 0, 0.17, -0.14, 0,
  ]);
  const spokesGeometry = new THREE.BufferGeometry();
  spokesGeometry.setAttribute("position", new THREE.BufferAttribute(spokeVertices, 3));
  const spokes = new THREE.LineSegments(spokesGeometry, new THREE.LineBasicMaterial({ color: 0xd8d2c2, transparent: true, opacity: 0.86, depthTest: false }));
  root.add(spokes);
  root.visible = false;
  return { root, flash, spokes };
}

function setTrail(marker, dash) {
  if (!dash || dash.remaining <= 0) {
    marker.trail.visible = false;
    return;
  }
  const from = coreToWorld(dash.from);
  const to = coreToWorld(dash.to);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  marker.trail.visible = length > 0.001;
  marker.trail.position.set((from.x + to.x) / 2, ARENA_SURFACE + 0.024, (from.z + to.z) / 2);
  marker.trail.scale.set(length, 0.105, 1);
  marker.trail.rotation.z = -Math.atan2(dz, dx);
  marker.trail.material.opacity = clamp(dash.remaining / dash.duration, 0, 1) * 0.8;
}

function replaceExploreGeometry(marker, centerX, halfWidth) {
  const key = `${centerX.toFixed(5)}:${halfWidth.toFixed(5)}`;
  if (marker.exploreKey === key) return;
  const minX = Math.max(-ARENA_RADIUS, centerX - halfWidth);
  const maxX = Math.min(ARENA_RADIUS, centerX + halfWidth);
  const steps = 32;
  const upper = [];
  const lower = [];
  for (let index = 0; index <= steps; index += 1) {
    const x = minX + ((maxX - minX) * index) / steps;
    const reach = Math.sqrt(Math.max(0, ARENA_RADIUS ** 2 - x ** 2));
    upper.push(new THREE.Vector2(x, reach));
    lower.push(new THREE.Vector2(x, -reach));
  }
  const shape = new THREE.Shape([...upper, ...lower.reverse()]);
  const nextGeometry = new THREE.ShapeGeometry(shape);
  marker.explore.geometry.dispose();
  marker.explore.geometry = nextGeometry;
  marker.exploreKey = key;
}

function updateMarkers(marker, state) {
  const isExplore = Boolean(state.explore) && (state.phase === PHASE.EXPLORE || state.phase === PHASE.GAME_OVER);
  marker.explore.visible = Boolean(isExplore);
  for (const edge of [...marker.exploreRustEdges, ...marker.exploreIvoryEdges]) edge.visible = Boolean(isExplore);
  if (isExplore) {
    const centerX = state.explore.lineX * WORLD_X;
    const halfWidth = CONFIG.exploreLaneHalfWidth * WORLD_X;
    const urgency = phaseProgress(state, 0.55);
    replaceExploreGeometry(marker, centerX, halfWidth);
    marker.explore.position.set(0, ARENA_SURFACE + 0.014, 0);
    marker.explore.scale.set(1, 1, 1);
    marker.explore.material.opacity = 0.58 + urgency * 0.16;
    for (const [index, side] of [-1, 1].entries()) {
      const edgeX = centerX + side * halfWidth;
      const edgeVisible = Math.abs(edgeX) < ARENA_RADIUS;
      marker.exploreRustEdges[index].visible = edgeVisible;
      marker.exploreIvoryEdges[index].visible = edgeVisible;
      if (!edgeVisible) continue;
      const edgeLength = Math.sqrt(Math.max(0, ARENA_RADIUS ** 2 - edgeX ** 2)) * 2;
      marker.exploreRustEdges[index].position.set(edgeX, ARENA_SURFACE + 0.018, 0);
      marker.exploreRustEdges[index].scale.set(0.075, edgeLength, 1);
      marker.exploreRustEdges[index].material.opacity = 0.84 + urgency * 0.12;
      marker.exploreIvoryEdges[index].position.set(edgeX - side * 0.11, ARENA_SURFACE + 0.02, 0);
      marker.exploreIvoryEdges[index].scale.set(0.042, edgeLength, 1);
      marker.exploreIvoryEdges[index].material.opacity = 0.82 + urgency * 0.14;
    }
  }

  const hasLock = Boolean(state.lock);
  marker.lockPlate.visible = hasLock;
  marker.lockCut.visible = hasLock;
  marker.lockCracks.visible = false;
  if (hasLock) {
    const target = coreToWorld(state.lock.zone);
    const locked = state.phase === PHASE.LOCK || state.phase === PHASE.RELOCK || state.phase === PHASE.PREDICTION;
    const used = state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR || state.phase === PHASE.GAME_OVER;
    marker.lockPlate.position.set(target.x, ARENA_SURFACE + 0.018, target.z);
    marker.lockPlate.scale.set(CONFIG.lockZoneRadiusX * WORLD_X, CONFIG.lockZoneRadiusY * WORLD_Z, 1);
    marker.lockPlate.material.color.setHex(used ? 0x3a1c10 : 0x4a2616);
    marker.lockPlate.material.opacity = locked ? 0.88 : used ? 0.78 : 0.42;
    marker.lockCut.position.set(target.x, ARENA_SURFACE + 0.023, target.z);
    marker.lockCut.scale.set(CONFIG.lockZoneRadiusX * WORLD_X * 1.22, 0.035, 1);
    marker.lockCut.material.opacity = locked ? 0.76 : used ? 0.44 : 0.38;
    marker.lockCracks.visible = used;
    marker.lockCracks.position.set(target.x, ARENA_SURFACE + 0.021, target.z);
    marker.lockCracks.scale.set(CONFIG.lockZoneRadiusX * WORLD_X, CONFIG.lockZoneRadiusY * WORLD_Z, 1);
    for (const crack of marker.lockCracks.children) crack.material.opacity = used ? 0.84 : 0;
  }

  setTrail(marker, state.visual?.lastDash);
  const attack = state.visual?.impact;
  // Direct core contact is drawn at the furnace itself, never as a second floor AOE.
  marker.attack.visible = Boolean(attack?.remaining > 0 && attack.tone !== "core");
  if (attack?.remaining > 0 && attack.tone !== "core") {
    const hit = coreToWorld(attack);
    marker.attack.position.set(hit.x, ARENA_SURFACE + 0.028, hit.z);
    const scale = (attack.tone === "core" ? 0.7 : 0.46) + (1 - attack.remaining / 0.3) * 0.8;
    marker.attack.scale.set(scale, scale, 1);
    marker.attack.material.color.setHex(attack.tone === "core" ? 0xffc36c : 0x59bcb3);
    marker.attack.material.opacity = clamp(attack.remaining / 0.3, 0, 1);
  }
}

function applyPlayerRig(player, state, now, previousPosition, directCoreWorld = null) {
  const root = player.root;
  const next = coreToWorld(state.player);
  root.position.copy(next);
  const move = state.player.lastMove || { x: 0, y: -1 };
  const boss = coreToWorld(state.boss);
  // The duelist always presents the blade to the boss; locomotion is carried by hips and feet.
  root.rotation.y = Math.atan2(boss.x - next.x, boss.z - next.z);
  const moved = previousPosition.distanceTo(next) > 0.002;
  const bob = moved ? Math.sin(now * 17) * 0.045 : Math.sin(now * 2.1) * 0.012;
  player.nodes.hips.position.y += bob;
  player.nodes.hips.rotation.x += moved ? move.y * 0.12 : 0;
  player.nodes.hips.rotation.z += moved ? -move.x * 0.10 : 0;
  player.nodes.feet.rotation.z += moved ? Math.sin(now * 17) * 0.12 : 0;
  if (state.visual?.lastDash?.remaining > 0) {
    player.nodes.torso.rotation.x -= 0.24;
    player.nodes.feet.position.z -= 0.10;
  }
  if (state.visual?.attack?.remaining > 0) {
    const swing = 1 - state.visual.attack.remaining / 0.24;
    const lunge = Math.sin(swing * Math.PI);
    // Preserve the authoritative root/ground point: only the upper rigid chain reaches for the open furnace.
    player.nodes.torso.position.z += lunge * 0.34;
    player.nodes.torso.rotation.x -= lunge * 0.25;
    player.nodes.arm_weapon.position.z += lunge * 0.48;
    player.nodes.arm_weapon.position.y += lunge * 0.075;
    player.nodes.sword.position.z += lunge * 0.66;
    player.nodes.arm_weapon.rotation.z -= lunge * 0.95;
    player.nodes.sword.rotation.y -= lunge * 0.36;
  }
  if (directCoreWorld) {
    // Keep the gameplay root fixed. Only the authored upper chain is translated in its parent space to put the real blade tip on the core.
    player.root.updateWorldMatrix(true, false);
    const upperRoot = player.nodes.torso;
    const currentTip = player.swordTipLocal.clone();
    player.nodes.sword.localToWorld(currentTip);
    const upperParent = upperRoot.parent;
    const from = upperParent.worldToLocal(currentTip.clone());
    const to = upperParent.worldToLocal(directCoreWorld.clone());
    upperRoot.position.add(to.sub(from));
    player.root.updateWorldMatrix(true, false);
    const correctedTip = player.swordTipLocal.clone();
    player.nodes.sword.localToWorld(correctedTip);
    player.tipCoreError = correctedTip.distanceTo(directCoreWorld);
  } else {
    player.tipCoreError = null;
  }
  if (state.phase === PHASE.GAME_OVER) {
    player.nodes.hips.position.y -= 0.14;
    player.nodes.hips.rotation.x += 0.38;
    player.nodes.torso.rotation.x += 0.64;
    player.nodes.feet.rotation.z -= 0.22;
    player.nodes.arm_weapon.rotation.z += 0.72;
    player.nodes.sword.rotation.x += 0.48;
  }
  if (state.timers?.invulnerable > 0) player.nodes.torso.rotation.z += Math.sin(now * 36) * 0.08;
}

function applyBossRig(boss, state, now) {
  const root = boss.root;
  root.position.copy(coreToWorld(state.boss));
  const nodes = boss.nodes;
  const lockTarget = state.lock ? coreToWorld(state.lock.zone) : null;
  // The authored piledriver rests along local +X, so aim that axis—not Three's default +Z—at the locked floor point.
  const yaw = lockTarget
    ? Math.atan2(root.position.z - lockTarget.z, lockTarget.x - root.position.x)
    : 0;
  const resting = Math.sin(now * 1.8) * 0.018;
  nodes.body.position.y += resting;

  for (let index = 0; index < 3; index += 1) {
    const memory = nodes[`memory_0${index + 1}`];
    memory.visible = index < state.memory.length;
    if (state.memory.length >= 3 && state.predictedSide) memory.rotation.z = 0;
  }

  if (state.phase === PHASE.COMBINE || state.phase === PHASE.LOCK || state.phase === PHASE.RELOCK) {
    const weight = state.phase === PHASE.COMBINE ? easeOutCubic(phaseProgress(state, CONFIG.combineDuration)) : 1;
    nodes.rotary_mount.rotation.y += yaw * weight;
    nodes.upper_arm.rotation.z -= 0.10 * weight;
    nodes.bellows_elbow.rotation.y += 0.14 * weight;
    nodes.forearm.rotation.y -= 0.12 * weight;
    nodes.brace.rotation.z += 0.17 * weight;
  }

  if (state.phase === PHASE.PREDICTION) {
    const strike = easeOutCubic(phaseProgress(state, 0.78));
    nodes.rotary_mount.rotation.y += yaw;
    nodes.upper_arm.rotation.z -= 0.12 + strike * 0.32;
    nodes.bellows_elbow.rotation.y += 0.15;
    nodes.forearm.rotation.y -= 0.16 + strike * 0.28;
    nodes.brace.rotation.z += 0.22;
  }

  if (state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR) {
    const coreElapsed = timingForRound(state.round).coreOpen - state.phaseTime;
    const opening = state.phase === PHASE.ROUND_CLEAR ? 1 : easeOutCubic(clamp(coreElapsed / 0.24, 0, 1));
    nodes.body.rotation.z -= 0.40 * opening;
    nodes.rotary_mount.rotation.y += state.lock ? yaw : 0.18;
    nodes.upper_arm.rotation.z -= 0.27;
    nodes.forearm.rotation.y -= 0.22;
    nodes.brace.rotation.z += 0.34;
    nodes.shutter_l.position.x -= 0.82 * opening;
    nodes.shutter_r.position.x += 0.82 * opening;
    nodes.shutter_l.rotation.z -= 0.48 * opening;
    nodes.shutter_r.rotation.z += 0.48 * opening;
    nodes.core.scale.setScalar(1 + Math.sin(now * 18) * 0.04);
  }

  const driverProgress = state.phase === PHASE.PREDICTION
    ? easeOutCubic(phaseProgress(state, 0.78))
    : state.phase === PHASE.CORE_OPEN || state.phase === PHASE.ROUND_CLEAR ? 1 : 0;
  if (state.lock && driverProgress > 0) {
    const target = coreToWorld(state.lock.zone);
    nodes.driver.parent.updateWorldMatrix(true, false);
    const targetLocal = nodes.driver.parent.worldToLocal(target.clone());
    nodes.driver.position.lerpVectors(boss.snapshots.driver.position, targetLocal, driverProgress);
    nodes.driver.updateWorldMatrix(true, false);
    const driverWorld = nodes.driver.getWorldPosition(new THREE.Vector3());
    boss.driverContactError = driverWorld.distanceTo(target);
  } else {
    boss.driverContactError = null;
  }
}

function makeRig(kind, root) {
  assertNodes(kind, root);
  const nodes = Object.fromEntries(REQUIRED_NODES[kind].map((name) => [name, root.getObjectByName(name)]));
  const snapshots = Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, snapshotNode(node)]));
  const blade = kind === "player" ? root.getObjectByName("short_sword_blade") : null;
  if (kind === "player" && (!blade?.isMesh || !nodes.sword)) throw new Error("player GLB missing short_sword_blade mesh");
  return { root, nodes, snapshots, blade, swordTipLocal: blade ? swordTipFromBlade(nodes.sword, blade) : null, tipCoreError: null, driverContactError: null };
}

function resetRig(rig) {
  for (const [name, node] of Object.entries(rig.nodes)) restoreNode(node, rig.snapshots[name]);
}

export function createRenderer(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("Canvas element is required");
  const webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.BasicShadowMap;
  webgl.setPixelRatio(Math.min(1.5, Math.max(1, globalThis.devicePixelRatio || 1)));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b09);
  scene.fog = new THREE.Fog(0x0d0b09, 22, 34);
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 60);
  // Same 35° quarter view; shortened uniformly so the full kiln occupies ~90% of a 320px-wide frame.
  camera.position.set(7.54, 9.43, 10.89);
  camera.lookAt(0, ARENA_SURFACE, 0.85);
  const ambient = new THREE.HemisphereLight(0x73869a, 0x4a2b16, 2.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xaecbe0, 4.2);
  key.position.set(-7, 13, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -11;
  key.shadow.camera.right = 11;
  key.shadow.camera.top = 11;
  key.shadow.camera.bottom = -11;
  scene.add(key);
  const furnaceLight = new THREE.PointLight(0xff5727, 0, 6.5, 2);
  scene.add(furnaceLight);
  const markers = makeMarkerLayer();
  scene.add(markers.root);
  const contact = makeCoreContact();
  scene.add(contact.root);

  const loader = new GLTFLoader();
  let status = "loading";
  let error = null;
  let arena = null;
  let player = null;
  let boss = null;
  let disposed = false;
  let lost = false;
  let previousPlayer = new THREE.Vector3();
  const coreWorld = new THREE.Vector3();
  let renderedWidth = 0;
  let renderedHeight = 0;
  let renderedRatio = 0;
  let notifyStatus = () => {};
  let resolveReady;
  let driverContactError = null;
  let swordTipError = null;
  let priorDirectAttackRemaining = null;
  let contactLatchRemaining = 0;
  let previousRenderNow = null;
  let ready = new Promise((resolve) => { resolveReady = resolve; });

  function setStatus(next, nextError = null) {
    status = next;
    error = nextError;
    notifyStatus({ status, error });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 1280));
    const height = Math.max(1, Math.round(rect.height || 720));
    const ratio = Math.min(1.5, Math.max(1, globalThis.devicePixelRatio || 1));
    if (width === renderedWidth && height === renderedHeight && ratio === renderedRatio) return;
    renderedWidth = width;
    renderedHeight = height;
    renderedRatio = ratio;
    webgl.setPixelRatio(ratio);
    webgl.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function clearAssets() {
    for (const item of [arena?.root, player?.root, boss?.root]) {
      if (!item) continue;
      scene.remove(item);
      disposeObject(item);
    }
    arena = null;
    player = null;
    boss = null;
  }

  async function loadAssets() {
    if (disposed || lost) return;
    clearAssets();
    setStatus("loading");
    try {
      const [arenaAsset, playerAsset, bossAsset] = await Promise.all([
        loader.loadAsync(ASSETS.arena.href), loader.loadAsync(ASSETS.player.href), loader.loadAsync(ASSETS.boss.href),
      ]);
      if (disposed || lost) return;
      arena = makeRig("arena", arenaAsset.scene);
      player = makeRig("player", playerAsset.scene);
      boss = makeRig("boss", bossAsset.scene);
      arena.root.traverse((item) => { if (item.isMesh) { item.receiveShadow = true; item.castShadow = false; } });
      player.root.traverse((item) => { if (item.isMesh) { item.castShadow = PLAYER_SHADOW_MESHES.has(item.name); item.receiveShadow = true; } });
      boss.root.traverse((item) => { if (item.isMesh) { item.castShadow = BOSS_SHADOW_MESHES.has(item.name); item.receiveShadow = true; } });
      scene.add(arena.root, player.root, boss.root);
      previousPlayer.copy(player.root.position);
      setStatus("ready");
      resolveReady?.();
      resolveReady = null;
    } catch (loadError) {
      clearAssets();
      setStatus("error", loadError instanceof Error ? loadError : new Error(String(loadError)));
    }
  }

  function retry() {
    if (status !== "error") return ready;
    ready = new Promise((resolve) => { resolveReady = resolve; });
    void loadAssets();
    return ready;
  }

  function render(state, { now = 0 } = {}) {
    if (disposed || lost) return;
    const elapsedSinceRender = previousRenderNow === null ? 0 : Math.max(0, now - previousRenderNow);
    previousRenderNow = now;
    contactLatchRemaining = Math.max(0, contactLatchRemaining - elapsedSinceRender);
    resize();
    if (status === "ready" && arena && player && boss) {
      resetRig(arena);
      resetRig(player);
      resetRig(boss);
      updateMarkers(markers, state);
      applyBossRig(boss, state, now);
      boss.root.updateWorldMatrix(true, false);
      boss.nodes.core.getWorldPosition(coreWorld);
      const attack = state.visual?.attack;
      const directCoreAttack = Boolean(state.boss.coreOpen && attack?.hit && !attack.armor && attack.remaining > 0);
      const crossesImpactPeak = directCoreAttack && (
        (priorDirectAttackRemaining === null && attack.remaining <= 0.12)
        || (priorDirectAttackRemaining !== null && priorDirectAttackRemaining >= 0.12 && attack.remaining <= 0.12)
      );
      const atImpactPeak = directCoreAttack && attack.remaining >= 0.105 && attack.remaining <= 0.135;
      if (crossesImpactPeak || atImpactPeak) contactLatchRemaining = 0.09;
      const directCoreImpact = directCoreAttack && contactLatchRemaining > 0;
      applyPlayerRig(player, state, now, previousPlayer, directCoreImpact ? coreWorld : null);
      furnaceLight.position.copy(coreWorld);
      const contactFrame = directCoreImpact;
      contact.root.visible = contactFrame;
      if (contactFrame) {
        contact.root.position.copy(coreWorld);
        contact.root.quaternion.copy(camera.quaternion);
        const peak = clamp(1 - Math.abs(attack.remaining - 0.12) / 0.12, 0, 1);
        const flare = 0.88 + peak * 0.62;
        contact.root.scale.setScalar(flare);
      }
      furnaceLight.intensity = contactFrame ? 8.2 : state.boss.coreOpen ? 5.2 : 0.38;
      driverContactError = boss.driverContactError;
      swordTipError = player.tipCoreError;
      priorDirectAttackRemaining = directCoreAttack ? attack.remaining : null;
      previousPlayer.copy(player.root.position);
    }
    webgl.render(scene, camera);
  }

  function dispose() {
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    clearAssets();
    markers.root.traverse((item) => { item.geometry?.dispose(); item.material?.dispose(); });
    contact.root.traverse((item) => { item.geometry?.dispose(); item.material?.dispose(); });
    webgl.dispose();
  }

  function onContextLost(event) {
    event.preventDefault();
    lost = true;
    setStatus("context-lost");
  }
  function onContextRestored() {
    if (disposed) return;
    lost = false;
    renderedWidth = 0;
    renderedHeight = 0;
    renderedRatio = 0;
    ready = new Promise((resolve) => { resolveReady = resolve; });
    void loadAssets();
  }

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  void loadAssets();
  return {
    render,
    resize,
    retry,
    dispose,
    get status() { return status; },
    get error() { return error; },
    get ready() { return ready; },
    get info() {
      return {
        ...webgl.info.render,
        textures: webgl.info.memory.textures,
        geometries: webgl.info.memory.geometries,
        driverContactError,
        swordTipError,
      };
    },
    get isReady() { return status === "ready"; },
    set onStatusChange(callback) { notifyStatus = typeof callback === "function" ? callback : () => {}; },
  };
}
