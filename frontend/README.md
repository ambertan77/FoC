<!--
AI Assistance Disclosure:
Tool: ChatGPT (Astra 6)
Date: approx. 2026-10-21
Scope: Helped draft the Docker and Credits page sections.
Author review: Reviewed, tested, and edited by Lim Shao Qi.
-->

# React + TypeScript + Vite

## Docker

Copy `.env.example` to `.env` if needed. Set `FRONTEND_PORT` and the four
`VITE_*_API_BASE_URL` values, then run from the repository root:

```sh
docker compose up -d --build
```

Open `http://localhost:5173` with the example settings. The image builds the app
with Node.js and serves only the static output using non-root Nginx. Client-side
routes support direct navigation and page refreshes.

API requests run in the browser, so use browser-accessible backend addresses
(such as `http://localhost:3000/api`), rather than Docker service names. If you
change the frontend port, update the backend `FRONTEND_URL` settings to match.

Vite embeds `VITE_*` values in the public JavaScript bundle during the build.
Only put public configuration in these variables. After changing them, rebuild
with `docker compose up -d --build frontend`; restarting alone is insufficient.
The `.env` file and any keys are excluded from the Docker build context.

## Credits page (CS F3)

Authenticated students can open `/credits` from the existing Credits navigation link.
The page uses the same `useCreditBalance` query as the navbar, displays available
credits directly (without subtracting reserved), and waits for a READY account
before requesting history. Admins cannot mount the page or issue credit queries.

History reads `GET /credits/me/transactions` through the configured credit API
base URL and existing authentication interceptors. It defaults to 20 entries,
all transaction types, newest first. Sorting and filtering are performed by the
server; the UI preserves its order, including timestamp ties. Opaque cursors are
stored in a local stack for Next/Previous, reset on sort/filter/account changes,
and never decoded. Refresh history returns to page one and expires visited pages
because pagination reads live data rather than a frozen snapshot.

Amounts are unsigned magnitudes. Signed available/reserved effects come from
the returned deltas, with neutral explanations for reservations and releases.
Missing order IDs display a dash; present IDs are text until an order-detail
route exists. Desktop tables become labelled cards on mobile, and timestamps
use the browser's locale and timezone.

Balance provisioning reuses the existing bounded polling and delayed Retry
state. A PROVISIONING history response offers a manual retry. Neither response
is treated as zero credits or empty history. Missing legacy accounts can remain
pending indefinitely; reads do not provision them. Balance/history errors are
independent, retained data is labelled as potentially outdated after a failed
refresh, and invalid cursors offer a return to page one.

### Frontend validation

```sh
npm ci
npm run lint
npm run build
```

The Docker build runs `npm run build`, including the full TypeScript check and
Vite production bundling.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
