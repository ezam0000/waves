import { expect, it, vi } from "vitest";
import { createAnimationLoop } from "../../src/lib/animation";

it("keeps only one frame when many control changes request redraws", () => {
  const queue = new Map();
  let sequence = 0,
    active = true;
  const draw = vi.fn();
  const loop = createAnimationLoop(draw, {
    shouldAnimate: () => active,
    request: (callback) => {
      queue.set(++sequence, callback);
      return sequence;
    },
    cancel: (id) => queue.delete(id),
  });
  for (let i = 0; i < 100; i++) loop.wake();
  expect(queue.size).toBe(1);
  const tick = () => {
    const [id, callback] = queue.entries().next().value;
    queue.delete(id);
    callback(100);
  };
  tick();
  expect(draw).toHaveBeenCalledTimes(1);
  expect(queue.size).toBe(1);
  active = false;
  tick();
  expect(queue.size).toBe(0);
  loop.wake();
  loop.pause();
  expect(queue.size).toBe(0);
  loop.wake();
  loop.dispose();
  loop.wake();
  expect(queue.size).toBe(0);
});

it("does not draw a late frame after unmount", () => {
  let callback;
  const draw = vi.fn();
  const loop = createAnimationLoop(draw, {
    shouldAnimate: () => true,
    request: (cb) => {
      callback = cb;
      return 0;
    },
    cancel: vi.fn(),
  });
  loop.wake();
  loop.dispose();
  callback(100);
  expect(draw).not.toHaveBeenCalled();
});
