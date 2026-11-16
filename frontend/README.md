# Finance Tracker Frontend

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

## Tests

```sh
npm test            # unit tests (Vitest): money and date helpers
npm run test:e2e    # browser tests (Playwright) against a mock API
```

The browser tests start two servers themselves: `e2e/mock-api.mjs` (an in-memory stand-in for the backend) on port 8080 and the Vite dev server on port 5173. Stop a locally running backend first, since both use port 8080. The first run needs a browser: `npx playwright install chromium`.

The mock API follows the real API's shapes and the rules the screens depend on, but it is not the backend. Backend rules are tested in `backend/` with a real PostgreSQL database.
