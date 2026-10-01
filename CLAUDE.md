# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

cengizhankose.com is a bilingual (EN, TR) portfolio and blog. **One Bun process (`server.ts`) serves everything**:
the prerendered pages, the server-rendered blog, the read-only JSON API (`/api/posts`), the sitemap and the RSS feeds.
Posts live in Postgres and are published from git with a CLI. Cloudflare sits in front; Out Plane runs the container.

## Development Commands

**Runtime: Bun** (package manager, test runner for the server layer, script runner). Vitest runs the component tests.

```bash
bun install --frozen-lockfile  # exact lockfile install (CI, Docker)
bun run dev          # dev API on 127.0.0.1:3001 (--watch) + Vite on :3000; Vite proxies /api (no CORS in dev)
bun run dev:vite     # Vite only (the API must already run)
bun run api          # the dev API alone: PORT=3001 bun --watch src/api/index.ts
bun run build        # client bundle -> dist/, server bundle -> dist/server/, prerendered static pages
bun run preview      # Vite preview of dist/ (port 4173; no API, no per-request blog render)
bun run lint         # eslint src --max-warnings=0 (includes react/jsx-no-literals, see Languages)
bun run format       # prettier --write . ; `bun run format:check` is what CI runs
bun run typecheck    # tsc --noEmit (TypeScript 7) over the server, scripts and server tests
bun run test         # bun test tests/server  +  vitest run (tests/frontend/** and tests/server/ssr/*.vitest.jsx)
bun run check        # typecheck + test: the gate the image build runs (NODE_ENV=test)
```

Test layout (T-02): server and API tests are `tests/server/**` (Bun's runner, scope set in `bunfig.toml`);
component tests are `tests/frontend/**` (Vitest + jsdom). Run the server layer as `bun test tests/server` and the
component layer as `vitest run`: either one alone is half the suite, `bun run test` is both. Tests that need a database use
in-process PGlite (`@electric-sql/pglite`); nothing in the suite connects to a real Postgres.

To run the production server locally: `bun run build`, then `PG_CONNECTION_URL=... bun server.ts` (port 3000).

**Local database** (K-02: Docker Postgres 18 from `docker-compose.yml`, never the production DB)

```bash
cp .env.example .env     # PG_CONNECTION_URL -> localhost/portfolio_dev, no password
bun run db:up            # compose `db` service, waits for the healthcheck
bun run db:migrate       # src/db/migrate.ts, the same runner the image starts with (BE-14)
bun run db:seed          # 3 published sample posts + draft `taslak-ornek`; `-- --from-live` also copies public posts
bun run dev              # API (:3001) + Vite
bun run db:generate      # drizzle-kit generate: a new migration after a change in src/db/schema/
```

Reset: `docker compose --profile dev down -v` (the `db` service sits in the `dev` profile), then the chain again.
The dev API, drizzle-kit and `scripts/*` go through `src/db/guard.ts`: they refuse any database that is not on
localhost **and** named `*_dev`/`*_test`. One-off production work only via
`outplane env run --app cengoportfoliolhal -- ...` with `--prod` (scripts) or `ALLOW_REMOTE_DB=1` (drizzle-kit);
`db:seed` never runs against a non-local database. Nobody migrates production from a laptop: migrations run at deploy.

Once per clone: `bun run hooks:install` (needs `brew install gitleaks`), see Secrets.

Other generators (outputs are committed): `bun run images:build hero` (responsive photo set, PERF-02),
`bun run brand:build` (favicon, app icons and the default share image from vector masters, DSG-24),
`bun scripts/fonts/sync-fonts.ts [--check]` (self-hosted fonts and `src/styles/fonts.css`;
`bun scripts/fonts/measure-fallbacks.ts --write` refreshes the fallback metrics). `/fonts/` is served immutable, so a new font
version goes to `public/fonts/v2`, never over `v1`.

## Deployment (Out Plane)

There is one deployment path. A push to `main` deploys: Out Plane (app `cengoportfoliolhal`) builds the `Dockerfile`
(its last stage, `production`, is what runs; the builder stage runs `NODE_ENV=test bun run check` on the image's Bun, and a
red gate keeps the old release). The container starts `bun src/db/migrate.ts` and then `bun server.ts`: a failed
migration exits 1 and the new release never becomes ready. The container runs as the unprivileged `bun` user on port 3000
and carries only the `package.json` "dependencies" (hono, drizzle-orm, postgres, zod); React, Vite and the rest are bundled
into `dist/`. Cloudflare is the proxy and cache in front (`www.cengizhankose.com` is the canonical host, K-03).
Umami (analytics) is a separate Out Plane application, `stats.cengizhankose.com` (T-13), on the same managed Postgres
instance with its own database and role (`scripts/sql/umami-isolation.sql`, image pin in `ops/umami/Dockerfile`).

- Migrations: `src/db/migrate.ts` uses `PG_MIGRATE_URL`, else `PG_CONNECTION_URL`; `bun src/db/migrate.ts --print-baseline`
  prints the one-off baseline SQL. A session advisory lock serialises two starting instances.
- Probes: `/health` is liveness (constant answer, any Host header); `/ready` runs `select 1` against the portfolio
  database and returns `{status:"ready",db:"ok",commit,buildTime,uptimeS}`; it answers 503 `{status:"not_ready",db:"error"}`
  when the database is unreachable and 503 `{status:"not_ready",db:"skipped",reason:"shutting_down"}` after SIGTERM
  (graceful shutdown, `src/api/shutdown.ts`). Neither is redirected on any host, and neither is rate limited.
- After a deploy: `bun scripts/seo-smoke.ts https://www.cengizhankose.com [--post <slug> --min-words 1500]` checks the raw HTML a
  crawler sees (titles, canonicals, hreflang, `<html lang>`, post body, 404 policy). Exit 1 on any failure.
- Rollbacks without a code change are env switches: `CSP_MODE=report-only`, `HSTS_MAX_AGE=0`, `RATE_LIMIT_DISABLED=1`,
  `SEO_INJECT=off`, `POST_CACHE_DISABLED=1`, `REQUEST_STATS_ENABLED=0` (set with
  `outplane env set --app cengoportfoliolhal NAME=value` and deploy; try `--dry-run` first).
- Local Docker (not a deployment path): `docker-compose.yml` has `db` (profile `dev`), `app-dev` (profile `development`, hot
  reload) and `app-prod` (profile `production`: the production image against the compose database).
  `docker compose --profile production up --build app-prod`, then
  `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/posts` gives 200. Ports are bound to 127.0.0.1.
  `./docker-deploy.sh dev|prod|logs|clean` wraps the same commands.
- `.dockerignore` keeps every root `*.md`, `.github` and `ops` out of the build context, so tests that read those files skip
  themselves inside the image build.

### Environment variables (names only; values live in the Out Plane env or a local `.env`, see `.env.example`)

| Name | Where | Meaning |
|---|---|---|
| `PG_CONNECTION_URL` | server, scripts | Required. In production the SELECT-only `portfolio_reader` (SEC-14). |
| `PG_MIGRATE_URL` | migrate step, drizzle-kit | Owner role (DDL), direct session; needed on every production start. |
| `PG_WRITE_CONNECTION_URL` | publish CLI only (`--prod`) | `portfolio_writer`; never read by `server.ts`. |
| `PG_STATS_URL`, `REQUEST_STATS_ENABLED` | server | ANL-13 daily request counts into `request_daily_stats`; off unless `REQUEST_STATS_ENABLED=1`. |
| `PG_SSL_MODE`, `PG_CA_CERT` | server | DB TLS (BE-13): unset = verify-full; `disable` is accepted only for a local host (compose `db`); `PG_CA_CERT` = PEM text of a private CA. |
| `PORT`, `LOG_LEVEL` | server | Port (default 3000; the dev API sets 3001). JSON log threshold debug, info, warn or error (`/health` and `/ready` log at debug). |
| `CSP_MODE`, `HSTS_MAX_AGE` | server | CSP `report-only` (default) or `enforce`; HSTS seconds (default 86400; `includeSubDomains`, no preload). |
| `RL_READ_PER_MIN`, `RATE_LIMIT_DISABLED` | server | `/api` read limit per client (default 60/min); `RATE_LIMIT_DISABLED=1` is the emergency switch. |
| `CF_WEB_ANALYTICS` | server and build | T-09 flag, default on. `off` removes the Cloudflare beacon hosts from the CSP and the Cloudflare entry from the privacy notice (see Analytics). |
| `SEO_INJECT` | server | `off` is the kill switch of the server-written head and render (logs a startup warning). |
| `POST_CACHE_DISABLED` | server | `1` serves posts without the in-process cache (the edge cache is separate). |
| `VITE_UMAMI_WEBSITE_ID`, `VITE_UMAMI_SRC` | build (Docker build args) | Umami tracker; an empty website id means tracking is off. Not secrets. |
| `GIT_COMMIT` (also `SOURCE_COMMIT`, `COMMIT_SHA`) | build arg or runtime | Reported by `/ready`. |
| `ALLOW_REMOTE_DB` | one-off task | Only inside `outplane env run`, for drizzle-kit (see Local database). |
| `CHROME_PATH` | publish machine | Chrome or Chromium that draws Mermaid diagrams for `content:publish`. |

## Publishing blog posts (K-01 = A: CLI only)

Posts live in git as `content/posts/<slug>.<lang>.md`: YAML frontmatter (`slug`, `lang` en or tr, `title`, optional
`seoTitle` (required when the title is over 43 characters), `excerpt` of at most 160 characters, `coverImage`,
`translationKey`) and the Markdown body. `scripts/content/publish-post.ts` is the only writer; the API has no write routes.
A post and its translation share one `translationKey`.

```bash
bun run content:publish content/posts/<slug>.<lang>.md --dry-run   # validate only, no connection
bun run content:publish content/posts/<slug>.<lang>.md             # local DB, draft (the default)
bun run content:publish content/posts/<slug>.<lang>.md --publish   # local DB, public
bun run content:publish --verify                                   # local DB vs content/posts
```

Mermaid diagrams are drawn at publish time (PERF-05) into light and dark SVGs stored in the post's `diagrams` column, so a
post with a diagram needs Chrome or Chromium on the publishing machine (`CHROME_PATH` overrides the lookup); the image never
runs it. `--verify` also reports `drift diagrams`. After changing `src/lib/mermaidTheme.js` or `scripts/mermaid.*.json`, run
`bun scripts/lib/write-mermaid-config.ts` and republish the posts that have diagrams.

Production, in this order (SEC-29 / SEC-15):
1. Commit the file and push it. `--prod` refuses a file that is untracked or has uncommitted changes.
2. `outplane env run --app cengoportfoliolhal -- bun run content:publish content/posts/<slug>.<lang>.md --prod --publish`
   (without `--publish` a post is written as a draft; a public post is only taken down with an explicit
   `--draft`). The last stdout line is the JSON audit line (`post_publish`, commit, contentSha256); the git history of
   `content/posts/` is the audit trail.
3. `outplane env run --app cengoportfoliolhal -- bun run content:publish --verify --prod` must print only
   `<slug> ok`; `drift`, `missing` or `untracked` (a row without a file, e.g. a write that bypassed the CLI) exit 1.
4. Cache: the server's post cache is fresh for 60 s and then answers once with the old value while it refreshes
   in the background, and that answer may stay at the edge for 5 min. So: wait 60 s; GET each URL the CLI printed
   once with an extra `cb=<n>` query parameter (a new edge cache key, so the request reaches the server, which
   ignores the parameter and refreshes); wait a few seconds; then purge exactly the printed URLs in Cloudflare
   (www only).

`--prod` reads only the process environment: the package script starts Bun with `--no-env-file`, so a local
`.env` (e.g. `PG_SSL_MODE=disable`) never reaches a production write; TLS is always verify-full (SEC-22).
Credentials never touch the disk.

**Database roles (SEC-14)** (production env of the app):
- `PG_CONNECTION_URL` = `portfolio_reader` (SELECT on `posts` only); the server's only client (`dbRead`,
  `src/db/index.ts`) also opens every session read-only.
- `PG_WRITE_CONNECTION_URL` = `portfolio_writer` (DML on `posts`); read only by `content:publish --prod`,
  never by `server.ts` / `src/`.
- `PG_MIGRATE_URL` = the owner role (DDL, direct session); needed on every start once `PG_CONNECTION_URL` is the
  reader, because drizzle's migrator always runs `CREATE SCHEMA IF NOT EXISTS drizzle`.
- Grants: `scripts/sql/least-privilege.sql` (as the owner, in the portfolio DB; rerun after a migration that adds
  a table); Umami's own database: `scripts/sql/umami-isolation.sql`. Neither file holds a password.

## Secrets

- Secrets never go into git. `.env` / `.env.*` are gitignored; only `.env.example` (names + local placeholders) is tracked.
  Local secrets, if any, go in `.env.local`. Production values live only in the Out Plane environment. No document, test
  or commit message may contain a value.
- Run `bun run hooks:install` once per clone (needs `brew install gitleaks`): the pre-commit hook blocks `.env*` files
  and runs gitleaks on staged changes. CI runs gitleaks and `bun audit --audit-level=high` (`.github/workflows/security.yml`).
- The public API is read-only (K-01 = A): no write routes, no API key in the runtime. Content is published by CLI
  (see "Publishing blog posts").
- Design rule: if a secret ever has to be compared again, compare SHA-256 digests with `crypto.timingSafeEqual`,
  never `===`/`!==`, and fail closed when the expected value is missing (no fallback defaults).

## Architecture

### Stack
- **React 19.2** + **Vite 7** (client and SSR builds), **React Router 7**, **SWR** for blog data; **Hono** on Bun for the
  server; **Postgres** through **drizzle-orm** + **postgres.js**; **zod** for API input.
- UI: a **Bootstrap 5.3 SCSS subset** (`src/styles/bootstrap-subset.scss`, no Bootstrap JS) plus **react-bootstrap** (its Alert
  pulls `react-transition-group` in transitively; do not import that package directly) and **CSS Modules**.
- The browser layer is JavaScript (JSX), the server layer TypeScript. There is no path alias: use relative imports.

### Server (`server.ts`, `src/api`, `src/server`, `src/db`)
- `createApp()` in `src/api/app.ts` is the one Hono app. `server.ts` (production: API + site) and `src/api/index.ts`
  (dev API, no site) both call it, so middleware and error handling cannot drift. It never imports `src/db`: the query
  object is injected, which is how tests run it with fakes or PGlite and no port.
- Order: request id, request statistics (ANL-13), request logger, security headers, `/api` rate limit, canonical host,
  `/health`, `/ready`, `/api/posts`, `/api/*` JSON 404, RSS feeds, `/sitemap.xml`, the site (`src/server/static.ts`), then
  the not-found and error handlers. Everything before `/health` applies to every host, including the default
  `*.outplane.app` address (SEC-30).
- **Errors (T-01):** one envelope `{ error, code, issues? }`, `Cache-Control: no-store`, the request id only in `X-Request-Id`.
  The status/code table is the header of `src/api/errors.ts`: 400 `BAD_PARAM`, `BAD_CURSOR` or `BAD_REQUEST`, 404 `NOT_FOUND`,
  429 `RATE_LIMITED`, 500 `INTERNAL`. No stack, SQL or driver text reaches a body.
- **Security headers (`src/api/middleware/security-headers.ts`, hono/secure-headers):** CSP, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, referrer and permissions policies on every response. The one CSP source is `src/api/middleware/csp.ts`: `'self'`,
  a sha256 per inline script of the built HTML (read once at startup), Umami and EmailJS hosts, and the Cloudflare beacon hosts
  while `CF_WEB_ANALYTICS` is on. `CSP_MODE=enforce` sends `Content-Security-Policy`, anything else Report-Only.
  A new executable inline script must be in the built HTML (so it is hashed) or live in a file.
- **Rate limit and 404 policy:** `/api/*` reads are limited per client by an in-memory token bucket (60/min,
  `src/api/middleware/rate-limit.ts`); it is per process, so it assumes one instance (move the buckets to a shared store
  before scaling out). `CF-Connecting-IP` is trusted only for requests whose `Host` is www or the apex, decided by `Host`
  alone; elsewhere the client key is the socket address. Unknown paths get the 404 shell with `noindex`, never a redirect to `/`.
- **Canonical host (`canonical-host.ts`):** the owner's Cloudflare rule redirects the apex to www; as a fallback the app
  answers 301 (GET, HEAD) or 308 (other methods) for the apex and `*.outplane.app`, to `https://www.cengizhankose.com` with
  path and query. localhost and IP literals pass through; `/health` and `/ready` are never redirected.
- **Static files (`src/server/static.ts`, `mime.ts`, `safe-path.ts`):** `dist/` only; the MIME table is explicit and
  independent of letter case; `dist/server/` and `dist/.vite/` are never served; hashed assets, `/fonts/` and `/img/` are
  immutable; HTML is served with an ETag and `no-cache`.
- **Post cache (`src/api/cache.ts`):** in-process, fresh 60 s, stale-while-revalidate up to 24 h, stale-if-error, never stores
  a null (404 or draft), at most 200 keys, `ping()` uncached. The API adds `s-maxage=300` for the Cloudflare Cache Rule and
  `max-age=60` for browsers; errors are `no-store`. Startup warms every list view and listed post in the background.
- **Request statistics (`src/server/requestStats.ts`):** daily counts by host group, path group, status class, country and a
  bot bit, kept in a Map and flushed once a minute and at shutdown through a one-connection pool (`PG_STATS_URL`). No IP,
  user agent, path or query is stored; 400-day retention; the database is never on the request path.
- **Database (`src/db`):** schema in `src/db/schema/`, migrations in `src/db/migrations/` (journal-driven: add one with
  `bun run db:generate`, never edit an applied file), post queries in `src/db/queries/posts.ts`, input validation in
  `post-input.ts`, TLS rules in `tls.ts` and `config.ts`, the non-production guard in `guard.ts`.

### API contract (read-only)
- `GET /api/posts?limit=<1-50, default 20>&cursor=<opaque>&lang=<en|tr>&missingIn=<en|tr>`: JSON array of **card fields only**
  (never the body), newest first, each with `lang` and `translationKey`; the next page's cursor is in `X-Next-Cursor`
  (absent on the last page). `400 BAD_PARAM` (with `issues`) or `400 BAD_CURSOR` for bad input.
- `GET /api/posts/:slug`: the post and its translations; `404 NOT_FOUND` for a draft, an unknown slug or a malformed slug
  (a malformed slug never reaches the database).
- `POST`, `PUT`, `PATCH` and `DELETE` on `/api/*` end in the JSON 404. There is no auth because there is nothing to write.

### Rendering: prerender, SSR and the SEO layer
- `src/entry-server.jsx` exports `render(url, { fallback, errors })` -> `{ html }` (`react-dom/static` `prerender`,
  StaticRouter). `src/app/App.jsx` exports `AppShell` and `AppRoot`, the tree inside the router, identical on both sides.
  `src/entry-client.jsx` is the only browser entry: it hydrates (`hydrateRoot`) when `#root` carries `data-ssr`, otherwise it
  draws with `createRoot` (Vite dev server, `SEO_INJECT=off`, a 503 shell).
- `bun run build` = `vite build` + `vite build --ssr src/entry-server.jsx --outDir dist/server` (self-contained,
  `ssr.noExternal`) + `bun scripts/prerender.ts`. The prerender keeps the untouched shell as `dist/server/_shell.html` and
  writes `dist/index.html`, `dist/about/index.html`, ... and `dist/tr/...` for every language open in `LIVE.static`
  (EN and TR static pages are both live, T-12). It fails the build on a page without `<h1>`, with a wrong `<html lang>` or
  without the `data-ssr` marker. `/blog`, `/tr/blog` and every post are drawn per request by `src/server/static.ts`
  (head from `src/seo/pages.js`, data from the cached post queries, render cached by its input).
- Keep every module the app imports free of `window` and `document` at module scope and in render (effects only);
  `tests/server/ssr/hydrate*.vitest.jsx` hydrates each page and fails on any mismatch. The theme is applied by the inline
  head script of `index.html`; the server never writes `data-theme`.
- **Head (T-03):** `src/seo/pages.js` (registry of per-page metadata, `getPageMeta`) is the one source. `src/seo/head.ts` prints it
  into the HTML, `src/seo/usePageMeta.js` applies the same values in the browser, `src/seo/inject.ts` writes head, render and
  first data into the shell. Every printed tag carries `data-seo`. A 404 prints no canonical, no share card, no structured data.
  `src/seo/site.js` holds the site identity (canonical host, name, locales), `src/seo/jsonld.js` the structured data and
  `src/seo/routes.js` the route table shared by the server and the client (`matchRoute`, `LIVE`).
- **First data (T-04):** the server appends the first data of a page as a non-executable `<script type="application/json">`
  block (`__SEO_DATA__`, `<`, `>` and `&` escaped); `src/seo/readSeoData.js` and `src/lib/swrFallback.js` turn it into the SWR
  `fallback`. SWR keys are the API paths themselves (`src/lib/swr.js`), so a fallback entry, a cache entry and a request name
  one thing.
- Sitemap and feeds: `src/seo/sitemap.ts` + `src/server/sitemap.ts` (`/sitemap.xml` with hreflang alternates), `src/server/rss.ts`.
- `SEO_INJECT=off` switches the whole server-written layer off (pages become the plain shell; a warning is logged at start).

### Languages (T-12)
- EN has no prefix, TR lives under `/tr`; the same path segments in both (`/about` and `/tr/about`, `/blog/:slug` and
  `/tr/blog/:slug`). The language comes from the URL only (`src/seo/routes.js`), never from a header, cookie or storage, so the
  server and the client agree. `LIVE` in that file says which languages are open per route kind (both are open for static pages
  and posts), and `matchRoute()` answers `notfound` for anything else: the server's 404 and the client's NotFound.
- Interface text goes through `t()` / `translate()` (`src/i18n/`): dictionaries per namespace in `src/i18n/{en,tr}/*.js`
  (`common`, `nav`, `a11y`, `home`, `services`, `cv`, `contact`, `blog`, `post`, `status`, `privacy`, ...), EN as the
  fallback. Page content (long copy, timeline, skills, project text) is in `src/content/{en,tr}/*.js`, read with
  `useContent()`; the language-independent project registry and its permission gate is `src/content/projects.js`.
  `react/jsx-no-literals` forbids a bare string in JSX under `src/{pages,header,components}`.
  Add every new string to **both** languages: `tests/frontend/i18n` enforces strict parity (same keys and paths, same list
  lengths, no empty strings). TR copy follows `.agents/product-marketing.md` (form of address, glossary).
- Hooks (`src/i18n/index.js`): `useLocale()`, `useUiLocale()`, `useT()`, `useLocalePath()`, `useContent()`. Internal links to
  static pages go through `useLocalePath()`. The language switcher (`src/components/langswitch/`) links a post to its
  translation by `translationKey`, otherwise to the blog index of the other language.
- Analytics carries `ui_locale` and `content_language` on every event (see Analytics).

### Front end
- **Entry and shell:** `src/app/App.jsx` (router, `CursorGate`, stale-chunk reload on `vite:preloadError`),
  `src/app/routes.jsx` (landmarks, one `<main id="main">`, route error boundary), `src/app/pageRoutes.jsx` (the page table:
  every page x every language). A page change is one commit: the new route renders at once, the wrapper is keyed by the
  pathname (`data-route`) and plays a 150 ms fade (`.pageEnter`; not on the landing page, not with reduced motion), one
  effect scrolls to the top (unless there is a hash) and focuses `<main>`, and `page_view` is sent by `usePageViewTracking`
  from a layout effect after the commit. Home, About, Portfolio, Contact and Privacy are in the entry chunk; `BlogHome` and
  `BlogPost` are lazy chunks (`src/pages/blog/loaders.js`; the markdown chain and Mermaid live only there).
  Pages: `src/pages/{home,about,portfolio,contact,blog,privacy,notfound}`; header and menu: `src/header`.
- **Home sections:** `src/pages/home/` composes the sections in `src/pages/home/sections/` (featured work, services, latest
  posts, final CTA; CSS Modules) around the hero and the proof strip (`src/components/proofstrip`). `LatestPosts`
  (`src/components/latestposts`) reads `usePosts` + `groupPostsForLocale` with the SSR fallback. `CvLink`
  (`src/components/cvlink`) offers the EN and TR CV PDFs from `public/cv/` (hidden while a file is absent) and sends
  `cv_downloaded`. Services link to `/contact?type=<id>`, which the contact form preselects (`services`, `cv` and `cta` are
  their own i18n namespaces).
- **Blog data:** `src/hooks/usePosts.js` (SWR hooks, error reporting), `src/lib/swr.js` (keys and config),
  `src/lib/prefetch.js` + `src/hooks/useIntentPrefetch.js` (intent preload), `src/lib/postGroups.js` (the T-12 second group:
  Turkish posts without an English translation), `src/lib/api.js` (relative `/api` base, `ApiError` from the T-01 envelope).
  Markdown renders through `src/lib/markdown/` (react-markdown, a strict sanitize schema, a diagram SVG sanitiser).
- **Styling (FE-20):** cascade layers are declared in `src/styles/layers.css` (`vendor, tokens, base`; component styles are
  unlayered and win); `src/styles/tokens.css` is the one place for colour, type, spacing, layer and motion values (dark
  `:root`, light through `data-theme`); `src/styles/base.css` holds element defaults; `src/index.css` imports tokens and base into
  their layers. Component and page styles are **CSS Modules** next to the component (`App.module.css`, `home.module.css`, ...,
  camelCase class names; `src/pages/blog/style.css` is the one plain stylesheet, for the post body). In tests the class names
  stay as written (the `bunfig.toml` preload for Bun, `css.modules.classNameStrategy: "non-scoped"` for Vitest). Never write a
  colour, z-index or font stack in a rule: use a token. Fonts are self-hosted (`public/fonts/v1`, `src/styles/fonts.css`).
- **Theme:** the inline script in `index.html` sets `<html data-theme>`, `color-scheme` and the `theme-color` metas before the
  first paint (K-10: follow the system until the visitor picks); `src/lib/theme.js` keeps it in sync and owns all `localStorage`
  access (inside try/catch). `THEME_COLORS` must equal `--bg-color` and the script.
- **Cursor (T-14):** `src/components/Cursor.jsx` is a ref-based ring (no React state, a `translate` property per frame), loaded
  lazily by `CursorGate` only for a fine hovering pointer with reduced motion off; the system cursor is never hidden and no
  frame loop runs while idle.
- **Contact form:** `src/pages/contact` (EmailJS from the browser, a honeypot field, a mailto fallback); the EmailJS ids are
  public by design and live in `src/content/shared.js`.
- **Portfolio:** cards come from `src/content/projects.js` and the per-language `projects.js`; a project that belongs to
  someone else stays `awaiting-permission` with no text, links or image until the written permission is recorded (K-12).
  While no case is publishable, the page is noindex and out of the menu (T-10).

### Analytics (Umami, T-13) and the Cloudflare beacon (T-09)
- `src/lib/analytics/` is the only tracking code: `track()` sends only catalogued events with allowed properties
  (`events.js`), `trackPageview()`, `config.js` (build-time `VITE_UMAMI_*`; an empty id is off), `guard.js` (only the www host
  sends, Do Not Track honoured), `outbound.js`, `pageType.js` (page type and language, also used by the request statistics),
  `src/lib/webVitals.js` (`web_vital_reported`). The catalogue, enums, PII rules and weekly queries are in
  `claudedocs/analytics/tracking-plan.md`; that document and `events.js` change in the same commit
  (`tests/frontend/analytics/tracking-plan.test.js`).
- The Cloudflare Web Analytics beacon is injected by Cloudflare, not by this repository. It runs next to Umami for two weeks and
  is then switched off. Until then its hosts are in the CSP and the processor is listed in the privacy notice
  (`src/content/{en,tr}/privacy.js`, date in `src/pages/privacy/updated.js`). **Switch-off:** the owner disables the
  automatic injection in Cloudflare (www and apex), sets `CF_WEB_ANALYTICS=off` in the Out Plane env and deploys (the Dockerfile
  hands the value to the build as `VITE_CF_WEB_ANALYTICS`, because the notice is prerendered), and the dates go into
  section 3 of the tracking plan. The flag leaves Umami's host alone.

### Adding a page
1. Create `src/pages/<name>/index.jsx` (CSS Module beside it; strings through `useT()`, copy through `useContent()`).
2. Add its path to `STATIC_PATHS` in `src/seo/routes.js`, its metadata to `src/seo/pages/` and `src/seo/pages.js`, and a row to
   `PAGE_ROUTES` in `src/app/pageRoutes.jsx`; add the nav link in `src/header/index.jsx`.
3. Add the EN and TR strings and content and run the i18n parity tests. The prerender and the sitemap pick the page up from the
   route table.

## Quality gates and CI

- Local: `bun run lint`, `bun run format:check` and `bun run check`. The Docker builder runs `NODE_ENV=test bun run check` on the
  image's Bun (the version in `package.json` "packageManager", the `Dockerfile` `BUN_IMAGE` and `@types/bun` move together).
- `.github/workflows/ci.yml`: lint and format, tests, production build. `.github/workflows/security.yml`: gitleaks and
  `bun audit --audit-level=high`. `.github/dependabot.yml` keeps dependencies and the base image current.
- `dist/` is gitignored build output. To build somewhere else: `bunx vite build --outDir <dir> --emptyOutDir` (client only).

## Audit documentation

The 2026-09-30 audit and its implementation plans are kept on the owner's machine, outside git
(`claudedocs/audit-2026-09-30/`; `plans/` holds the decisions T-01..T-14 and K-01..K-12 cited throughout the code comments,
`impl/` the per-package reports). The analytics plan, which is tracked, is `claudedocs/analytics/tracking-plan.md`.
`claudedocs/archive/` holds retired documents (the Vite + Bun migration plan).
