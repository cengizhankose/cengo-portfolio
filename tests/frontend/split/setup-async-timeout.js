// Vitest setup (registered in vite.config.js, after tests/frontend/setup.js).
//
// Testing Library waits 1 s for findBy* and waitFor by default. Since PERF-04
// the blog pages are lazy chunks: the first render of /blog or /blog/<slug>
// in a test worker waits for a dynamic import of the page and of the markdown
// chain behind it, loaded cold. On a busy machine or a small CI runner that can
// pass a second without anything being wrong. 5 s only lengthens the wait of an
// assertion that is going to fail anyway.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });
