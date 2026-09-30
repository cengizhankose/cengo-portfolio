# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Primary Runtime: Bun** (preferred over npm)
```bash
bun run dev          # Start Vite dev server (port 3000, auto-opens browser)
bun run build        # Production build to dist/
bun run preview      # Preview production build (port 4173)
bun test             # Run tests with Bun
bun run check        # typecheck + bun test + vitest: the gate the image build runs (NODE_ENV=test)
```

**Local database** (K-02: Docker Postgres 18 from `docker-compose.yml`, never the production DB)
```bash
cp .env.example .env     # PG_CONNECTION_URL -> localhost/portfolio_dev, no password
bun run db:up            # compose `db` service, waits for the healthcheck
bun run db:migrate       # src/db/migrate.ts, the same runner the image starts with (BE-14)
bun run db:seed          # 3 published sample posts + draft `taslak-ornek`; `-- --from-live` also copies public posts
bun run dev              # API (:3001) + Vite
```
Reset: `docker compose --profile dev down -v` (the `db` service sits in the `dev` profile), then the chain again.
The dev API, drizzle-kit and `scripts/*` go through `src/db/guard.ts`: they refuse any database that is not on
localhost **and** named `*_dev`/`*_test`. One-off production work only via
`outplane env run --app cengoportfoliolhal -- ...` with `--prod` (scripts) or `ALLOW_REMOTE_DB=1` (drizzle-kit);
`db:seed` never runs against a non-local database. Nobody migrates production from a laptop: migrations run at deploy.

**Deployment**

A push to `main` deploys: Out Plane builds the Dockerfile (the builder runs `NODE_ENV=test bun run check` on the
image's Bun; a red gate keeps the old release), the container runs `src/db/migrate.ts` (with `PG_MIGRATE_URL`,
else `PG_CONNECTION_URL`; `bun run src/db/migrate.ts --print-baseline` prints the one-off baseline SQL), then
`server.ts`. Locally: `./docker-deploy.sh dev|prod`.

## Publishing blog posts (K-01 = A: CLI only)

Posts live in git as `content/posts/<slug>.<lang>.md`: YAML frontmatter (`slug`, `lang` en|tr, `title`, optional
`seoTitle` — required when the title is over 43 characters —, `excerpt` ≤ 160, `coverImage`, `translationKey`)
and the Markdown body. `scripts/content/publish-post.ts` is the only writer; the API has no write routes.
```bash
bun run content:publish content/posts/<slug>.<lang>.md --dry-run   # validate only, no connection
bun run content:publish content/posts/<slug>.<lang>.md             # local DB, draft (the default)
bun run content:publish content/posts/<slug>.<lang>.md --publish   # local DB, public
bun run content:publish --verify                                   # local DB vs content/posts
```
Production, in this order (SEC-29 / SEC-15):
1. Commit the file and push it. `--prod` refuses a file that is untracked or has uncommitted changes.
2. `outplane env run --app cengoportfoliolhal -- bun run content:publish content/posts/<slug>.<lang>.md --prod --publish`
   (without `--publish` a post is written as a draft; a public post is only taken down with an explicit
   `--draft`). The last stdout line is the JSON
   audit line (`post_publish`, commit, contentSha256); the git history of `content/posts/` is the audit trail.
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

**Database roles (SEC-14)** — production env of the app:
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
  Local secrets, if any, go in `.env.local`. Production values live only in the Out Plane environment.
- Run `bun run hooks:install` once per clone (needs `brew install gitleaks`): the pre-commit hook blocks `.env*` files
  and runs gitleaks on staged changes. CI runs gitleaks and `bun audit --audit-level=high` (`.github/workflows/security.yml`).
- The public API is read-only (K-01 = A): no write routes, no API key in the runtime. Content is published by CLI
  (see "Publishing blog posts").
- Design rule: if a secret ever has to be compared again, compare SHA-256 digests with `crypto.timingSafeEqual`,
  never `===`/`!==`, and fail closed when the expected value is missing (no fallback defaults).

## Architecture Overview

### Tech Stack
- **React 19.2** + **Vite 7.3** + **Bun** runtime
- **React Router DOM 7.12** for client-side routing
- **Bootstrap 5.3** + React Bootstrap for UI
- **No react-transition-group** - uses custom transition system (see below)

### Custom Page Transition System

**File**: `src/app/routes.jsx`

The project uses a custom page transition implementation instead of `react-transition-group` (removed for React 19 compatibility). The system:

- Uses `useState` to track `displayLocation` and `transitionStage`
- Applies CSS animations (fadeIn/fadeOut) via `onAnimationEnd` callback
- Routes render during transitions for smooth visual flow
- Auto-scrolls to top on navigation completion

**Do not** reintroduce `react-transition-group` or `@steveeeie/react-page-transition` as dependencies.

### Content Management Pattern

**File**: `src/content_option.js`

All site content is centralized in a single configuration file:
- Meta tags (SEO title/description)
- Intro data with typewriter animation strings
- About section, work timeline, skills
- Portfolio items and services
- Contact form config (EmailJS credentials)
- Social media profile links

To modify site content, edit this file rather than individual page components.

### Component Organization

```
src/
├── app/
│   ├── App.jsx         # Root with Router, AnimatedCursor, ScrollToTop
│   ├── App.css         # Page transition animations (@keyframes)
│   └── routes.jsx      # Route definitions with custom transitions
├── pages/              # Page components (home, about, portfolio, contact)
├── components/         # Reusable UI (socialicons, themetoggle)
├── header/             # Navigation with hamburger menu
└── assets/images/      # Static assets
```

### Adding New Pages/Routes

1. Create page component in `src/pages/[page-name]/index.jsx`
2. Add route in `src/app/routes.jsx`:
   ```jsx
   <Route path="/new-route" element={<NewPage />} />
   ```
3. Add navigation link in `src/header/index.jsx`

### Vite Configuration Notes

- **Path alias**: `@/` maps to `/src` for imports
- **Manual chunks**: vendor (React), bootstrap, router separated
- **Production**: Terser removes console logs, source maps disabled
- **Assets**: Hashed filenames for caching (`[name]-[hash].[ext]`)

### Docker Deployment

**Multi-stage build**: Bun base → Builder → Nginx production

Nginx configuration (`nginx.conf`) includes:
- Gzip compression
- Security headers (CSP, XSS Protection)
- SPA routing fallback
- Static asset caching (1-year for immutable assets)

### EmailJS Contact Form

Contact form uses EmailJS service. Configuration in `src/content_option.js`:
- `YOUR_SERVICE_ID`, `YOUR_TEMPLATE_ID`, `YOUR_USER_ID`
- Update these values to change contact form behavior

## Recent Migration

The project migrated from Create React App to Vite + Bun. `src/main.jsx` is the only entry point
(React 19 createRoot); the CRA entry was removed (FE-30).

When working with entry points or initialization, use `main.jsx`.
