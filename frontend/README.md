# Fifty30 Frontend

React + TypeScript app built with Vite.

## Run locally

Requires Node.js. Start the backend on port 8080 first (the dev server proxies `/api` to it).

```sh
cd frontend
npm install
npm run dev
```

Then open the URL printed in the terminal (usually http://localhost:5173).

Other commands:

```sh
npm run build   # type-check and build to dist/
npm run lint    # run Oxlint
```

## Deployment

`vercel.json` sends `/api/*` to the backend on Render, so the browser sees one origin and the refresh cookie works. Every other path goes to `index.html` so deep links such as `/expenses` survive a reload.

## Error monitoring

Set `VITE_SENTRY_DSN` in Vercel (Project settings > Environment variables) and redeploy. Only production builds with a DSN load the Sentry SDK, on demand; without it nothing is added to the app. No personal data, cookies, headers, bodies or query strings are sent, and reset tokens are removed from URLs (`src/monitoring.ts`). A crash shows a "Something went wrong" screen with a Reload button instead of a blank page.

## Offline expenses

Add expense works without a connection: the expense is saved on the phone and sent by itself when the connection is back (on reconnect, when the app comes to the front, and every minute while some are waiting). Each one carries a `clientId`, so a retry never stores it twice. If the server refuses one (for example its category was archived meanwhile), it stays on the Add expense page with Try again and Discard. The app also opens offline for the user who last signed in on that phone, using their remembered categories. See `src/offline.ts`.

## Tests

```sh
npm test            # unit tests (Vitest): money, dates, charts, reports, offline queue, display rules
npm run test:e2e    # browser tests (Playwright) against a mock API
```

The browser tests start two servers themselves: `e2e/mock-api.mjs` (an in-memory stand-in for the backend) on port 8080 and the Vite dev server on port 5173. Stop a locally running backend first, since both use port 8080. The first run needs a browser: `npx playwright install chromium`.

The mock API follows the real API's shapes and the rules the screens depend on, but it is not the backend. Backend rules are tested in `backend/` with a real PostgreSQL database.

## Installing as an app (PWA)

Fifty30 can be installed on a phone or computer:

- Android and desktop Chrome or Edge: **More → Install Fifty30**, or the browser menu's **Install app**.
- iPhone and iPad: open the site in Safari, tap **Share**, then **Add to Home Screen**.

How it works:

- `public/manifest.webmanifest` and the icons in `public/` describe the app.
- `public/sw.js` is a small hand-written service worker. It caches the app's code so it opens instantly and offline, and never caches anything under `/api`. It is only registered in production builds (`npm run build`), so `npm run dev` behaves like a normal website.
- Each build gets a new worker URL (`/sw.js?v=<build id>`), which replaces the previous deploy's cache.
- Offline, the app opens for the user who last signed in on that device, and new expenses wait on the phone until the connection is back (see Offline expenses above).
