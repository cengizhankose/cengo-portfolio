import { lazy, Suspense } from "react";
import "../styles/bootstrap-subset.scss";
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./routes";
import Headermain from "../header";
import { useMediaQuery } from "../lib/useMediaQuery";
import "./App.css";

// T-14 (K-06a): the cursor ring exists only for a mouse-like pointer with
// "reduce motion" off. Touch/coarse pointers and reduced-motion users never
// download its chunk; if the answer changes in the session the ring mounts
// or unmounts (Cursor.jsx removes all of its listeners on unmount).
export const CURSOR_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

const Cursor = lazy(() => import("../components/Cursor"));

// Its own component, so a media change re-renders only the gate. It stays
// outside <main> and the routes: nothing on the page depends on it.
function CursorGate() {
  const enabled = useMediaQuery(CURSOR_QUERY);
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <Cursor />
    </Suspense>
  );
}

export default function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      {/* Scroll to top, focus and the page view on a page change all live in
          the route shell (routes.jsx): one place, one commit. */}
      <Headermain />
      <AppRoutes />
      <CursorGate />
    </Router>
  );
}
