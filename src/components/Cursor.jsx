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
import "./Cursor.css";

// Anything that acts on a click grows the ring (DSG-21 hover state).
export const CLICKABLE =
  'a, button, [role="button"], input, select, textarea, label, summary, [data-cursor-hover]';

// Share of the remaining distance the ring covers in one frame.
const EASE = 0.25;
// Below this distance (|dx| + |dy| in px) the ring snaps and the loop stops.
const SETTLE = 0.1;

const isMouse = (event) => event.pointerType === "mouse";

export default function Cursor() {
  const ringRef = useRef(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return undefined;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    let visible = false;

    const draw = () => {
      ring.style.translate = `${current.x}px ${current.y}px`;
    };

    const tick = () => {
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      if (Math.abs(dx) + Math.abs(dy) < SETTLE) {
        current.x = target.x;
        current.y = target.y;
        frame = 0;
      } else {
        current.x += dx * EASE;
        current.y += dy * EASE;
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
      if (event.target.closest?.(CLICKABLE)) ring.dataset.hover = "";
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

  return <div ref={ringRef} className="cursor-ring" aria-hidden="true" />;
}
