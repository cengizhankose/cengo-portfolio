// Test stand-in for the build's dist/server/entry-server.js (PERF-03): the
// real server render, straight from source (Bun compiles the JSX and ignores
// the stylesheet imports), so the site-handler tests that read a page's raw
// HTML exercise the page components themselves.
export { render } from "../../../../../src/entry-server.jsx";
