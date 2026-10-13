// At most one scheduled frame, including when controls request a redraw mid-animation.
export function createAnimationLoop(
  draw,
  {
    shouldAnimate,
    request = requestAnimationFrame,
    cancel = cancelAnimationFrame,
  },
) {
  let frame = null;
  let disposed = false;
  function wake() {
    if (!disposed && frame === null) frame = request(tick);
  }
  function tick(time) {
    frame = null;
    if (disposed) return;
    draw(time);
    if (shouldAnimate()) wake();
  }
  function pause() {
    if (frame !== null) cancel(frame);
    frame = null;
  }
  function dispose() {
    disposed = true;
    pause();
  }
  return { wake, pause, dispose };
}
