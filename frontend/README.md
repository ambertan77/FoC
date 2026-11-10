<!--
AI Assistance Disclosure:
Tool: ChatGPT (Astra 6)
Date: approx. 2026-10-21
Scope: Helped draft the Docker and Credits page sections.
Author review: Reviewed, tested, and edited by Lim Shao Qi.
-->

<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-08
Scope: Audited against the code; replaced the Vite template text and rewrote the setup, scripts, routes and code layout sections.
Author review: Reviewed and edited by Lim Shao Qi.
-->

# Frontend

The Aaron web app is a React 19 + TypeScript single-page app built with Vite.
Students use it to request and deliver errands and track their credits.
Admins use it to manage users, suppliers and orders.

## Run locally

The supported local setup is the full Docker stack. From the repository
root, follow [Run Locally with Docker](../README.md#run-locally-with-docker)
in the root README, then open <http://localhost:5173>.

The frontend container (`Dockerfile`, `nginx.conf`):

- builds the app with Node.js 22
- serves the static output with non-root nginx on port 8080. Compose
  publishes it on `127.0.0.1:${FRONTEND_PORT}`.
- proxies `/api/auth` and `/api/users`, `/api/suppliers`, `/api/orders`, `/api/credits` and `/api/notifications` to the backend containers by service name. The browser
  only ever talks to one origin.
- falls back to `index.html`, so client-side routes survive direct
  navigation and page refreshes

### Environment (`frontend/.env`)

| Variable | Example | Purpose |
| --- | --- | --- |
| `FRONTEND_PORT` | `5173` | Host port Compose publishes the container on |
| `VITE_AUTH_API_BASE_URL` | `/api` | Base URL for `/auth/...` and `/users/...` |
| `VITE_SUPPLIER_API_BASE_URL` | `/api` | Base URL for `/suppliers/...` |
| `VITE_ORDER_API_BASE_URL` | `/api` | Base URL for `/orders/...` |
| `VITE_CREDIT_API_BASE_URL` | `/api` | Base URL for `/credits/...` |
| `VITE_NOTIFICATION_API_BASE_URL` | `/api` | Base URL for `/notifications/...` |

Keep the `VITE_*` values as `/api` for Docker. CI and the production
build use `/api` too. Vite embeds `VITE_*` values in the public
JavaScript bundle at build time, so:

- only put public configuration in them
- after changing them, rebuild with `docker compose up -d --build frontend`.
  Restarting alone is not enough.

The `.env` file and any keys are excluded from the Docker build context. If
you change the frontend port, update `FRONTEND_URL` in each backend `.env`
to match. The backends use it for CORS.

### Vite dev server (optional)

`npm run dev` serves the app with hot reload. It has no `/api` proxy, and
the Docker stack doesn't publish the backend ports. So to use it:

1. Run the backend services on the host. See
   [Running services on the host instead](../README.md#running-services-on-the-host-instead).
2. Point the `VITE_*` values at each service: `http://localhost:3000/api`
   (auth), `:3001/api` (supplier), `:3002/api` (order), `:3003/api` (credit), `:3004/api` (notification).

Stop the frontend container first if it is using port 5173.

## Production

The frontend container is not used in production. It is in the
`local-only` Compose profile. The deploy workflow builds the app with
`VITE_*=/api` and uploads `dist/` to S3, served through CloudFront.
CloudFront forwards `/api/*` to the backend gateway. See
[Deployment](../README.md#deployment).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Lint with Oxlint (`.oxlintrc.json`) |
| `npm run format` | Format with oxfmt |

There are no automated frontend tests yet. CI runs `npm ci`,
`npm run lint` and `npm run build`. The Docker build runs `npm run build`,
which includes the full TypeScript check.

## Routes

Defined in `src/routes/routes.ts` and `src/routes/AppRouter.tsx`.
`ProtectedRoute` sends signed-out users to the login page, and
`RoleRoute` limits each page to the roles below.

| Path | Page | Access |
| --- | --- | --- |
| `/` | Login | Public |
| `/register` | Student registration with email OTP | Public |
| `/activate-admin` | Admin account activation from an invitation link | Public |
| `/home` | Home | Student, Admin |
| `/suppliers` | Supplier list | Student, Admin |
| `/profile` | Profile, email change, password change | Student, Admin |
| `/credits` | Credit balance and history | Student |
| `/requester-activity` | Requests I've made | Student |
| `/courier-activity` | Requests I've accepted as a courier | Student |
| `/admin/manage-users` | Users, admin invitations and promotion | Admin |
| `/admin/manage-suppliers` | Suppliers | Admin |
| `/admin/supplier-types` | Supplier types | Admin |
| `/admin/manage-orders` | All orders | Admin |

## Code layout

```text
src/
├── api/          # Axios clients (authApi, supplierApi, orderApi, creditApi) and endpoints.ts
├── components/   # Shared layout, navbar and shadcn/ui components
├── context/      # AuthContext (restores the session on load)
├── features/     # auth, credit, order, supplier, user. Each has its own components/, hooks/, services/, schemas/ and types/ as needed
├── hooks/        # App-wide hooks (useAuth, useLogout)
├── lib/          # TanStack Query client, utilities
├── pages/        # One component per route
├── routes/       # Route table, AppRouter, ProtectedRoute, RoleRoute
├── store/        # Zustand auth store
├── types/        # Shared API response types
└── utils/        # Access-token storage and helpers
```

- **Stack:**
  - routing: React Router
  - server state: TanStack Query
  - client auth state: Zustand
  - forms: React Hook Form / TanStack Form with Zod
  - styling: Tailwind CSS v4 with shadcn/ui (`components.json`)
  - notifications: react-toastify
- **Imports:** `@/` resolves to `src/` (`vite.config.ts`).
- **Auth:**
  - The access token is kept in `sessionStorage`. The refresh token is an
    HTTP-only cookie set by user-service.
  - On a 401, the API clients (`src/api/axios.ts`) make one shared refresh
    call and retry the request.
  - Signing out, or a session change, clears cached credit queries.

## Credits page (CS F3)

Authenticated students can open `/credits` from the existing Credits navigation link.
The page uses the same `useCreditBalance` query as the navbar and the create-request
form (`CreateRequestForm`), displays available
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

## Code References

- [AuthForge Client](https://github.com/hamidukarimi/authforge-client): Referenced for authentication-related and authorization-related client code.