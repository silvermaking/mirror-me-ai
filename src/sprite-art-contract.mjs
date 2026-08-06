// Runtime contract for approved rig-v5 directional housing alpha sources. The only flexible
// pixels are authored PNG weapon parts; bodies are fixed root/feet cutouts.
export const SPRITE_ART_VERSION = 4;
export const SPRITE_CELL = Object.freeze({ source: [512, 384], runtime: [256, 192] });

export const SPRITE_REQUIRED_FRAMES = Object.freeze([
  "player-idle", "player-contact", "player-blade",
  "boss-idle", "boss-lock-left", "boss-miss-left", "boss-lock-right", "boss-miss-right",
  "driver-shaft", "driver-tip", "driver-cuff-left", "driver-cuff-right",
]);

export const SPRITE_REQUIRED_ANCHORS = Object.freeze({
  "player-idle": Object.freeze(["feet", "sword_grip"]),
  "player-contact": Object.freeze(["feet", "sword_grip"]),
  "player-blade": Object.freeze(["sword_grip", "sword_tip"]),
  "boss-idle": Object.freeze(["root", "driver_joint", "core_center", "brace_contact", "memory_slot_1", "memory_slot_2", "memory_slot_3"]),
  "boss-lock-left": Object.freeze(["root", "driver_joint", "core_center", "brace_contact", "memory_slot_1", "memory_slot_2", "memory_slot_3"]),
  "boss-miss-left": Object.freeze(["root", "core_center", "brace_contact", "memory_slot_1", "memory_slot_2", "memory_slot_3"]),
  "boss-lock-right": Object.freeze(["root", "driver_joint", "core_center", "brace_contact", "memory_slot_1", "memory_slot_2", "memory_slot_3"]),
  "boss-miss-right": Object.freeze(["root", "core_center", "brace_contact", "memory_slot_1", "memory_slot_2", "memory_slot_3"]),
  "driver-shaft": Object.freeze(["shaft_in", "shaft_out"]),
  "driver-tip": Object.freeze(["tip_socket", "driver_tip"]),
  "driver-cuff-left": Object.freeze(["driver_joint", "shaft_in"]),
  "driver-cuff-right": Object.freeze(["driver_joint", "shaft_in"]),
});

function finitePoint(point, width, height) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height;
}

export function validateSpriteManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || manifest.version !== SPRITE_ART_VERSION) return false;
  if (manifest.source !== "approved-imagegen-rig-v5-directional-cuffs" || !manifest.sheets || !manifest.frames || !manifest.sources || !manifest.sourceFrames) return false;
  if (Object.keys(manifest.frames).length !== SPRITE_REQUIRED_FRAMES.length) return false;
  for (const frameId of SPRITE_REQUIRED_FRAMES) {
    const frame = manifest.frames[frameId];
    const sourceFrame = manifest.sourceFrames[frameId];
    const required = SPRITE_REQUIRED_ANCHORS[frameId];
    if (!frame || !sourceFrame || typeof frame.sheet !== "string" || !Array.isArray(frame.rect) || frame.rect.length !== 4) return false;
    const sheet = manifest.sheets[frame.sheet];
    if (!sheet || typeof sheet.file !== "string" || !/\.png$/i.test(sheet.file)) return false;
    const [x, y, width, height] = frame.rect;
    if (![x, y, width, height].every(Number.isFinite) || width !== 256 || height !== 192 || x < 0 || y < 0 || x + width > sheet.width || y + height > sheet.height) return false;
    const bounds = frame.paintBounds;
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] < 0 || bounds[1] < 0 || bounds[2] <= 0 || bounds[3] <= 0 || bounds[0] + bounds[2] > width || bounds[1] + bounds[3] > height) return false;
    if (!required.every((name) => finitePoint(frame.anchors?.[name], width, height))) return false;
    if (frameId.startsWith("driver-cuff-") && (!Number.isFinite(frame.presentationScale) || frame.presentationScale <= 0 || frame.presentationScale > 1)) return false;
    if (!Array.isArray(sourceFrame.sourceRect) || sourceFrame.sourceRect.length !== 4) return false;
    if (!required.every((name) => Array.isArray(sourceFrame.anchors?.[name]) && sourceFrame.anchors[name].length === 2 && sourceFrame.anchors[name].every(Number.isFinite))) return false;
    const source = manifest.sources[sourceFrame.source];
    if (!source || typeof source.file !== "string" || !/^[a-f0-9]{64}$/i.test(source.sha256 || "") || !Number.isFinite(source.width) || !Number.isFinite(source.height)) return false;
  }
  return true;
}
