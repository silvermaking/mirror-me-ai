import assert from "node:assert/strict";
import test from "node:test";
import { PHASE, timingForRound } from "../src/game-core.mjs";
import { BOSS_DRIVER_JOINT_SOURCE } from "../assets/2d/sprites/sprite-contract.mjs";
import { armorAnchor, bossDriverJointAnchor, buildCombatScene, combatDrawPlan, coreAnchor, coreToScreen, drawCombatFrame, driverStampCenter, playerFrameFor } from "../src/render-2d.mjs";

const player = { x: 68, y: 30 };
const boss = { x: 0, y: -120 };
const attackState = ({ remaining, open = true, armor = false, phase = PHASE.CORE_OPEN } = {}) => ({
  player: { ...player, lastMove: { x: 0, y: 0 } }, boss: { ...boss, coreOpen: open }, phase,
  visual: { attack: { hit: !armor, armor, remaining } }, memory: [], lock: null,
});

function canvasSpy() {
  const operations = [];
  let currentPath = [];
  const record = (kind, ...args) => operations.push({ kind, args });
  const ctx = {
    save: () => record("save"), restore: () => record("restore"), translate: (x, y) => record("translate", x, y), scale: (x, y) => record("scale", x, y), rotate: (angle) => record("rotate", angle),
    beginPath: () => { currentPath = []; record("beginPath"); }, closePath: () => record("closePath"),
    moveTo: (x, y) => { currentPath.push({ kind: "moveTo", x, y }); record("moveTo", x, y); },
    lineTo: (x, y) => { currentPath.push({ kind: "lineTo", x, y }); record("lineTo", x, y); },
    arc: (x, y, ...rest) => { currentPath.push({ kind: "arc", x, y }); record("arc", x, y, ...rest); },
    ellipse: (x, y, ...rest) => { currentPath.push({ kind: "ellipse", x, y }); record("ellipse", x, y, ...rest); },
    fill: () => operations.push({ kind: "fill", path: [...currentPath] }), stroke: () => operations.push({ kind: "stroke", path: [...currentPath] }),
    drawImage: (...args) => record("drawImage", ...args), fillText: (...args) => record("fillText", ...args),
    fillRect: (...args) => record("fillRect", ...args), strokeRect: (...args) => record("strokeRect", ...args),
  };
  return { ctx, operations };
}

const pointMatches = (point, target) => point && Math.hypot(point.x - target.x, point.y - target.y) < .001;

test("2D quarter projection is stable and preserves free floor-plane directions", () => {
  const origin = coreToScreen({ x: 0, y: 0 });
  const east = coreToScreen({ x: 100, y: 0 });
  const south = coreToScreen({ x: 0, y: 100 });
  assert.deepEqual(origin, { x: 640, y: 344 });
  assert.ok(east.x > origin.x && east.y < origin.y, "positive core x projects up-right");
  assert.ok(south.x > origin.x && south.y > origin.y, "positive core y projects down-right");
  assert.notEqual(east.x - origin.x, south.x - origin.x, "floor axes stay visually distinct");
});

test("driver stamp center is identical to the immutable LOCK target", () => {
  const target = { x: 743.5, y: 291.25 };
  assert.deepEqual(driverStampCenter(target), target);
});

test("renderer combat plan consumes three distinct authored full-body attack frames", () => {
  const states = [attackState({ remaining: .24 }), attackState({ remaining: .12 }), attackState({ remaining: .02 })];
  const frames = states.map(playerFrameFor);
  assert.deepEqual(frames.map(({ id }) => id), ["player-attack-windup", "player-attack-contact", "player-attack-recoil"]);
  assert.deepEqual(frames.map(({ index }) => index), [3, 4, 5]);
  assert.equal(new Set(frames.map(({ id }) => id)).size, 3, "runtime selector cannot fall back to one fixed attack frame");
});

test("one renderer combat plan grounds the body and sends the single blade to core only in contact", () => {
  const prepare = combatDrawPlan(buildCombatScene(attackState({ remaining: .24 })));
  const contact = combatDrawPlan(buildCombatScene(attackState({ remaining: .12 })));
  const recoil = combatDrawPlan(buildCombatScene(attackState({ remaining: .02 })));
  const floor = coreToScreen(player); const core = coreAnchor(boss);
  for (const plan of [prepare, contact, recoil]) {
    assert.ok(Math.hypot(plan.player.at.x - floor.x, plan.player.at.y - floor.y) <= 12, "drawSprite receives the projected player floor point");
    assert.equal(plan.player.flipX, true, "the whole authored body mirrors toward a left-side core");
    assert.equal(plan.blade.hand.x, plan.player.at.x - 20, "drawWeaponContact uses the mirrored hilt on the same body plan as drawSprite");
  }
  assert.equal(prepare.flash, null, "no early core flash during windup");
  assert.equal(contact.flash.kind, "core");
  assert.ok(Math.hypot(contact.blade.tip.x - core.x, contact.blade.tip.y - core.y) <= 2, "blade tip reaches true core anchor");
  assert.ok(Math.hypot(contact.flash.target.x - core.x, contact.flash.target.y - core.y) <= 2, "core flash uses the blade contact point");
  assert.equal(recoil.flash, null, "flash ends before recoil");
  assert.notDeepEqual(prepare.blade.tip, contact.blade.tip, "blade commits into contact");
  assert.notDeepEqual(recoil.blade.tip, contact.blade.tip, "blade and body return into recoil");
});

test("closed armor uses that same renderer plan for contact and flash", () => {
  const prepare = combatDrawPlan(buildCombatScene(attackState({ remaining: .24, open: false, armor: true, phase: PHASE.EXPLORE })));
  const contact = combatDrawPlan(buildCombatScene(attackState({ remaining: .12, open: false, armor: true, phase: PHASE.EXPLORE })));
  const shell = armorAnchor(boss);
  assert.equal(prepare.flash, null, "armor has no windup flash");
  assert.equal(contact.flash.kind, "armor");
  assert.ok(Math.hypot(contact.blade.tip.x - shell.x, contact.blade.tip.y - shell.y) <= 2, "blade strikes the drawn armor anchor");
  assert.ok(Math.hypot(contact.flash.target.x - shell.x, contact.flash.target.y - shell.y) <= 2, "armor flash is co-located with blade contact");
});

test("renderer combat plan routes the drawn compass stamp to the same LOCK target", () => {
  const state = attackState({ remaining: 0 });
  state.phase = PHASE.LOCK; state.lock = { zone: { x: 52, y: -61 } };
  const plan = combatDrawPlan(buildCombatScene(state));
  assert.deepEqual(plan.driver.target, coreToScreen(state.lock.zone));
  assert.ok(Math.hypot(plan.driver.origin.x - bossDriverJointAnchor(plan.boss.at).x, plan.driver.origin.y - bossDriverJointAnchor(plan.boss.at).y) < .001);
  assert.ok(Math.hypot(plan.driver.origin.x - (plan.boss.at.x + 133.3125), plan.driver.origin.y - (plan.boss.at.y - 137)) <= .05, "driver joint is the authored LOCK compass anchor after the exact boss draw scale");
  assert.deepEqual(driverStampCenter(plan.driver.target), plan.driver.target);
});

test("core opening exposes a visible 180ms collapse transition without moving gameplay truth", () => {
  const duration = timingForRound(1).coreOpen;
  const atImpact = attackState({ remaining: 0, phase: PHASE.CORE_OPEN });
  atImpact.phaseTime = duration;
  const midway = attackState({ remaining: 0, phase: PHASE.CORE_OPEN });
  midway.phaseTime = duration - .09;
  const settled = attackState({ remaining: 0, phase: PHASE.CORE_OPEN });
  settled.phaseTime = duration - .2;

  const impactScene = buildCombatScene(atImpact);
  const midwayScene = buildCombatScene(midway);
  const settledScene = buildCombatScene(settled);
  assert.equal(impactScene.collapseProgress, 0);
  assert.ok(midwayScene.collapseProgress > 0 && midwayScene.collapseProgress < 1);
  assert.equal(settledScene.collapseProgress, 1);
  assert.deepEqual(impactScene.boss, midwayScene.boss, "recoil is presentation-only and never shifts the boss floor point");
  assert.deepEqual(midwayScene.player, settledScene.player, "opening art never shifts the player floor point");
});

test("every driver-visible boss frame uses the one authored joint in the final Canvas path", () => {
  const images = {
    player: { complete: true, naturalWidth: 384, naturalHeight: 64 },
    boss: { complete: true, naturalWidth: 256, naturalHeight: 64 },
  };
  const cases = [
    { phase: PHASE.LOCK, frame: 1 },
    { phase: PHASE.PREDICTION, frame: 2 },
    { phase: PHASE.CORE_OPEN, frame: 3 },
  ];
  for (const { phase, frame } of cases) {
    const state = attackState({ remaining: 0, open: phase === PHASE.CORE_OPEN, phase });
    state.lock = { zone: { x: 52, y: -61 } };
    const scene = buildCombatScene(state); const plan = combatDrawPlan(scene);
    const authoredJoint = {
      x: plan.boss.at.x - 158 + BOSS_DRIVER_JOINT_SOURCE.x * 316 / 64,
      y: plan.boss.at.y - 274 + BOSS_DRIVER_JOINT_SOURCE.y * 274 / 64,
    };
    assert.equal(plan.boss.frame, frame);
    assert.ok(Math.hypot(plan.driver.origin.x - authoredJoint.x, plan.driver.origin.y - authoredJoint.y) < .001, `${phase} driver start is the authored joint`);
    const { ctx, operations } = canvasSpy(); drawCombatFrame(ctx, state, scene, images);
    const driverStroke = operations.find((op) => op.kind === "stroke" && op.path.some((point) => point.kind === "moveTo" && pointMatches(point, authoredJoint)) && op.path.some((point) => point.kind === "lineTo" && pointMatches(point, plan.driver.target)));
    assert.ok(driverStroke, `${phase} final Canvas driver starts from that authored joint`);
  }
});

test("final Canvas calls consume the combat draw plan without a second coordinate path", () => {
  const state = attackState({ remaining: .12 });
  state.phase = PHASE.LOCK;
  state.lock = { zone: { x: 52, y: -61 } };
  state.visual.impact = { remaining: .2, tone: "core" };
  const scene = buildCombatScene(state);
  const plan = combatDrawPlan(scene);
  const { ctx, operations } = canvasSpy();
  const images = {
    player: { complete: true, naturalWidth: 384, naturalHeight: 64 },
    boss: { complete: true, naturalWidth: 256, naturalHeight: 64 },
  };
  drawCombatFrame(ctx, state, scene, images);

  const playerDraw = operations.find((op) => op.kind === "drawImage" && op.args[0] === images.player);
  assert.deepEqual(playerDraw.args.slice(1), [64 * plan.player.frame.index, 0, 64, 64, plan.player.at.x - 52, plan.player.at.y - 120, 104, 120], "drawSprite consumes the exact plan body anchor and frame");
  assert.ok(operations.some((op) => op.kind === "translate" && op.args[0] === plan.player.at.x * 2 && op.args[1] === 0), "drawSprite consumes the exact plan x before flip; an injected +20px must fail here");
  assert.ok(operations.some((op) => op.kind === "scale" && op.args[0] === -1 && op.args[1] === 1), "drawSprite consumes the plan flip");

  const bladeFill = operations.find((op) => {
    if (op.kind !== "fill" || !op.path.some((point) => pointMatches(point, plan.blade.tip))) return false;
    const first = op.path[0]; const last = op.path.at(-1);
    return first && last && pointMatches({ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }, plan.blade.hand);
  });
  assert.ok(bladeFill, "the final tapered blade path consumes plan hand and tip");
  const flashArcs = operations.filter((op) => op.kind === "arc" && pointMatches({ x: op.args[0], y: op.args[1] }, plan.flash.target));
  assert.ok(flashArcs.length >= 2, "weapon contact and feedback flash both consume the plan flash target");

  const driverStroke = operations.find((op) => op.kind === "stroke" && op.path.some((point) => point.kind === "moveTo" && pointMatches(point, plan.driver.origin)) && op.path.some((point) => point.kind === "lineTo" && pointMatches(point, plan.driver.target)));
  assert.ok(driverStroke, "the final driver path consumes the authored joint and immutable LOCK target");
});
