// Custom cursor ring (K-06a, T-14; PERF-11, PERF-12, FE-07, DSG-21).
//
// Loaded lazily and mounted by src/app/App.jsx only on a fine, hovering
// pointer with "reduce motion" off, so touch devices and reduced-motion
// users never download or run it. The system cursor is never hidden: this
// only draws a ring that follows it (pointer-events: none, aria-hidden).
//
// No React state: the pointer position lives in the effect's closure and is
// written to the DOM as the `translate` property (compositor-only, like a
// transform), so moving the mouse never re-renders. Not `transform`: the
// hover growth is the separate `scale` property, which applies on top of
// `transform` and would scale the position too, while `translate` applies
// after `scale` (CSS Transforms 2 order: translate, rotate, scale, transform).
// Three listeners are added once on mount and removed on unmount:
//   window   pointermove  target position; starts the frame loop if idle
//   document pointerover  delegated hover check for anything clickable
//   document pointerout   leaving a clickable, or leaving the window
// The frame loop runs only while the ring is catching up with the pointer
// and stops once it has settled (no idle requestAnimationFrame).
import { useEffect, useRef } from "react";
import styles from "./Cursor.module.css";

// Anything that acts on a click grows the ring (DSG-21 hover state).
export const CLICKABLE =
  'a, button, [role="button"], input, select, textarea, label, summary, [data-cursor-hover]';

// Share of the remaining distance the ring covers per 60 Hz frame, and the
// distance (|dx| + |dy| in px) under which it snaps to the pointer and the
// loop stops. The easing is scaled by the real frame time, so the ring
// feels the same at 30, 60 or 144 Hz and a jump across a 4K screen settles
// in under 0.5 s (PERF-12) with no visible snap.
const EASE = 0.32;
const FRAME_MS = 1000 / 60;
const SETTLE = 0.5;

const isMouse = (event) => event.pointerType === "mouse";

export default function Cursor() {
  const ringRef = useRef(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return undefined;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    let lastTime = 0;
    let visible = false;

    const draw = () => {
      ring.style.translate = `${current.x}px ${current.y}px`;
    };

    const tick = (time) => {
      // The first frame of a run counts as one 60 Hz frame; a long gap (a
      // background tab) is capped so the ring still glides instead of
      // jumping to the pointer.
      const elapsed = lastTime ? Math.min(time - lastTime, 100) : FRAME_MS;
      lastTime = time;
      const ease = 1 - (1 - EASE) ** (elapsed / FRAME_MS);
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      if (Math.abs(dx) + Math.abs(dy) < SETTLE) {
        current.x = target.x;
        current.y = target.y;
        frame = 0;
        lastTime = 0;
      } else {
        current.x += dx * ease;
        current.y += dy * ease;
        frame = requestAnimationFrame(tick);
      }
      draw();
    };

    // Touch and pen input do not move the ring (touchscreen laptops).
    const onPointerMove = (event) => {
      if (!isMouse(event)) return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (!visible) {
        // First move, or back in the window: start on the pointer instead
        // of flying in from the last position.
        visible = true;
        current.x = target.x;
        current.y = target.y;
        draw();
        ring.dataset.visible = "";
        return;
      }
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointerOver = (event) => {
      if (!isMouse(event)) return;
      // Clears a stale hover too: after an SPA navigation the hovered link is
      // removed without a pointerout, so every pointerover re-evaluates.
      if (event.target.closest?.(CLICKABLE)) ring.dataset.hover = "";
      else delete ring.dataset.hover;
    };

    const onPointerOut = (event) => {
      if (!isMouse(event)) return;
      const next = event.relatedTarget;
      if (!next) {
        // The pointer left the window: hide until it comes back.
        visible = false;
        delete ring.dataset.visible;
        delete ring.dataset.hover;
        return;
      }
      if (!next.closest?.(CLICKABLE)) delete ring.dataset.hover;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
  }, []);

  return <div ref={ringRef} className={styles.cursorRing} aria-hidden="true" />;
}
