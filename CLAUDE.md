# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Primary Runtime: Bun** (preferred over npm)
```bash
bun run dev          # Start Vite dev server (port 3000, auto-opens browser)
bun run build        # Production build to dist/
bun run preview      # Preview production build (port 4173)
bun test             # Run tests with Bun
```

**Deployment**
```bash
bun run predeploy    # Build before deployment
bun run deploy       # Deploy to GitHub Pages (gh-pages)

./docker-deploy.sh dev    # Docker with hot reload
./docker-deploy.sh prod   # Docker production build
```

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

The project migrated from Create React App to Vite + Bun. Remnants:
- `src/index.jsx` is legacy CRA entry (no longer used)
- `src/main.jsx` is the current entry point (React 19 createRoot)

When working with entry points or initialization, use `main.jsx`.
