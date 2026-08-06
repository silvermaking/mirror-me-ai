export const TOUCH_TAP_LATCH_SECONDS = .18;

const DIRECTION = Object.freeze({
  left: Object.freeze({ axis: "x", value: -1, opposite: "right" }),
  right: Object.freeze({ axis: "x", value: 1, opposite: "left" }),
  up: Object.freeze({ axis: "y", value: -1, opposite: "down" }),
  down: Object.freeze({ axis: "y", value: 1, opposite: "up" }),
});

function finiteNow(now) {
  return Number.isFinite(now) ? now : 0;
}

export function createTouchMovementLatch() {
  const expiresAt = new Map();

  function expire(now) {
    for (const [control, until] of expiresAt) {
      if (until <= now) expiresAt.delete(control);
    }
  }

  return Object.freeze({
    press(control, now) {
      const direction = DIRECTION[control];
      if (!direction) return;
      const at = finiteNow(now);
      expiresAt.delete(direction.opposite);
      expiresAt.set(control, at + TOUCH_TAP_LATCH_SECONDS);
    },
    movement(now, heldControls = []) {
      const at = finiteNow(now);
      expire(at);
      const held = new Set(heldControls);
      const active = new Set([...expiresAt.keys(), ...held]);
      const has = (control) => active.has(control);
      return Object.freeze({
        moveX: Number(has("right")) - Number(has("left")),
        moveY: Number(has("down")) - Number(has("up")),
      });
    },
    reset() {
      expiresAt.clear();
    },
  });
}
