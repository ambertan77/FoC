<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-08
Scope: Audited against the code; updated the repository structure, added the services and API index, the Docker quick start, the RabbitMQ/service startup section and the CI/CD and server setup details, and updated the AI Use Summary.
Author review: Reviewed and edited by Lim Shao Qi.
-->

<!--
AI Assistance Disclosure:
Tool: ChatGPT (Astra 6)
Date: 2026-11-10
Scope: README documentation verification
Author review: Reviewed and edited by Ng See Pui.
-->

# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Aaron

**Aaron** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| --------- | -------------- |
| Amber Tan Junning | Supplier Service, Order Service, Viewing Live and Past Orders (N2H) |
| Duong Ngoc Mai | Supplier Service, Credit Service, Centralised Logging (N2H) |
| Lim Shao Qi | User Service, Credit Service, CI/CD + Cloud Deployment (N2H) |
| Ng See Pui | User Service, Order Service, Credit Service (credits reservation async) Order History & Reordering + Real-time status update push notifications (N2H) |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`, `credit-service/`, `notification-service/`) lives in its own top-level folder.

```text
.
├── user-service/        # Accounts, auth (JWT), OTP registration, admin management
├── supplier-service/    # Campus stores/facilities, supplier types, image uploads
├── order-service/       # Order (errand) lifecycle, courier actions, expiry/receipt workers
├── credit-service/      # Credit ledger, reservations and settlement
├── notification-service/ # Real-time notifications
├── frontend/            # React + Vite web app
├── gateway/             # nginx API gateway config used in production
├── data/csv/            # Supplier seed data, loaded by supplier-service
├── ai/                  # AI usage log
├── .github/workflows/   # CI (ci.yml) and CD (deploy.yml)
├── compose.yaml         # Local stack: includes every service's compose.yaml + RabbitMQ
├── compose.prod.yaml    # Production override: ECR images and the gateway
├── .env.example         # Root Compose variables (RabbitMQ credentials)
└── README.md
```

---

## Services and API

All browser traffic goes through one origin. Requests under `/api/...` are
routed by path prefix to the service that owns them. In production that is
the gateway (`gateway/nginx.conf`). Locally it is the frontend container
(`frontend/nginx.conf`).

| Service | Internal port | Gateway prefix(es) | Docs |
| --- | --- | --- | --- |
| user-service | 3000 | `/api/auth`, `/api/users` | [user-service/README.md](user-service/README.md) |
| supplier-service | 3001 | `/api/suppliers` | [supplier-service/README.md](supplier-service/README.md) |
| order-service | 3002 | `/api/orders` | [order-service/README.md](order-service/README.md) |
| credit-service | 3003 | `/api/credits` | [credit-service/README.md](credit-service/README.md) |
| notification-service | 3004 | `/api/notifications` | [notification-service/README.md](notification-service/README.md) |
| frontend | 8080 (container) | `/` | [frontend/README.md](frontend/README.md) |

- The gateway answers `GET /healthz` itself. Any other `/api/...` path
  returns 404.
- Request bodies are limited to 5 MB, which caps supplier image uploads.
- Service-to-service endpoints under `/api/internal/...` are not routed by
  the gateway. They are reachable only inside the Docker network.
- Each service also exposes `GET /healthz` on its own port for container
  health checks.

---

## Deployment

The project is built, tested and deployed by GitHub Actions. In
production:

- the browser loads the frontend from S3 through CloudFront
- CloudFront forwards `/api/*` to the EC2 host
- on EC2, the nginx gateway (`gateway/nginx.conf`, published on port 80)
  routes each request to its service

### CI (`.github/workflows/ci.yml`)

CI runs on every pull request into `main`, and again as the first step of
every deploy. Its jobs:

| Job | What it checks |
| --- | --- |
| `backend` (one per service) | `npm ci`, `prisma validate`, `prisma generate`, `npm run build`, `npm test` |
| `credit-service integration` | `npm run test:integration` against real Postgres 17 and RabbitMQ 4.2 service containers |
| `frontend` | `npm ci`, `npm run lint`, `npm run build` (with `VITE_*=/api`) |
| `docker` (one per service and the frontend) | Every Dockerfile builds. Runs on pull requests only, because the deploy's `build-push` job already builds the images |

A newer push to the same pull request cancels the CI run in progress.

### CD (`.github/workflows/deploy.yml`)

CD runs on every push to `main`. Pushes that change only `.md` files are
skipped. You can also start it by hand from the Actions tab
(`workflow_dispatch`). Only one deploy runs at a time, and later ones
queue instead of cancelling it. The jobs:

1. **`ci`** reruns the full CI workflow.
2. **`build-push`** builds the five backend images and pushes them to
   Amazon ECR as `foc/<service>:<commit-sha>` and `:latest`. It only runs
   in `AY2627S1-CS3219-P20/FoC`, so on forks it and the rest of the deploy
   are skipped.
3. **`deploy-backend`**:
   1. copies the compose files, `gateway/nginx.conf`, `observability/` and
      `data/csv` to `EC2_APP_DIR`
   2. logs in to ECR, pulls the new images and runs
      `docker compose -f compose.yaml -f compose.prod.yaml up -d`
   3. waits for every service's `/healthz` and prints that service's logs
      if one stays unhealthy
   4. reloads the gateway, restarts Loki, Alloy and Grafana (so edited config
      is picked up) and saves `IMAGE_TAG` in the server `.env`
   5. finally, checks that `https://<CloudFront domain>/api/users/me`
      returns 401, which proves the CloudFront → gateway → service path
      works
4. **`deploy-frontend`** builds the frontend and uploads it to S3. Hashed
   assets are cached for a year, and `index.html` and other files are
   always revalidated. It then invalidates the CloudFront cache.

### Repository settings

The deploy workflow reads these repository settings
(**Settings → Secrets and variables → Actions**):

| Variable                     | Value                                             |
| ---------------------------- | ------------------------------------------------- |
| `AWS_REGION`                 | `ap-southeast-1`                                  |
| `AWS_ROLE_ARN`               | ARN of the IAM role GitHub Actions assumes        |
| `S3_BUCKET`                  | Bucket that holds the frontend build              |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID                        |
| `CLOUDFRONT_DOMAIN`          | CloudFront domain, without `https://`             |
| `EC2_APP_DIR`                | App folder on the server, e.g. `/home/ubuntu/foc` |

| Secret        | Value                                  |
| ------------- | -------------------------------------- |
| `EC2_HOST`    | The server's Elastic IP                |
| `EC2_USER`    | SSH user, e.g. `ubuntu`                |
| `EC2_SSH_KEY` | Private key of the deploy SSH key pair |

### One-time AWS and server setup

The workflow assumes this already exists:

- **IAM role** (`AWS_ROLE_ARN`): trusts GitHub's OIDC provider for this
  repository. It can push to ECR, sync to `S3_BUCKET` and create
  CloudFront invalidations. No long-lived AWS keys are stored in GitHub.
- **ECR repositories**: `foc/user-service`, `foc/supplier-service`,
  `foc/order-service`, `foc/credit-service`, `foc/notification-service`.
- **EC2 host**:
  - Docker with the Compose plugin and the AWS CLI are installed
  - the instance can pull from ECR
  - port 80 is reachable from CloudFront
- **Files in `EC2_APP_DIR`**, which the deploy never copies:
  - `.env` with `ECR_REGISTRY=<account-id>.dkr.ecr.<region>.amazonaws.com`
    and a `GRAFANA_ADMIN_PASSWORD`. The deploy writes it from the
    `GRAFANA_ADMIN_PASSWORD` GitHub secret if `.env` has none, and fails if
    neither exists. The deploy adds `IMAGE_TAG` itself.
  - each service's `.env`, filled in from its `.env.example`
  - `user-service/keys/private.pem` and `public.pem`, plus
    `supplier-service/keys/public.pem` (see
    [One-time setup](#one-time-setup))
- **CloudFront**: the default origin is `S3_BUCKET`, and `/api/*` goes to
  the EC2 host.

---

## Run Locally with Docker

The whole stack can run in Docker: five services, five Postgres
databases, RabbitMQ and the frontend. Start Docker Desktop or the Docker
engine first.

### One-time setup

1. Create each `.env` from its example. Fill in the secrets: the database
   passwords, `COOKIE_SECRET`, `JWT_REFRESH_TOKEN_KEY`, the shared service
   tokens and the Brevo SMTP settings.

   ```sh
   cp .env.example .env
   for d in user-service supplier-service order-service credit-service notification-service frontend; do
     cp "$d/.env.example" "$d/.env"
   done
   ```

   Under Docker, services reach each other by Compose hostname
   (`rabbitmq`, `<service>-postgres`). The order-service and credit-service
   examples already use these hostnames. For user-service and
   supplier-service, Compose overrides `DATABASE_URL` and the JWT key paths.
   Make sure the database credentials in each `.env` match its
   `*_POSTGRES_*` / `POSTGRES_*` values. Use the same RabbitMQ credentials in
   the root `.env` and in the `RABBITMQ_URL` of user-service, order-service
   and credit-service. URL-encode any special characters in the credentials.

2. Generate the RS256 key pair used for access tokens. user-service signs
   tokens with the private key. The other services verify them with the
   public key. order-service and credit-service mount
   `user-service/keys/public.pem` directly. supplier-service needs its own
   copy:

   ```sh
   mkdir -p user-service/keys supplier-service/keys
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out user-service/keys/private.pem
   openssl rsa -in user-service/keys/private.pem -pubout -out user-service/keys/public.pem
   cp user-service/keys/public.pem supplier-service/keys/public.pem
   ```

   `*.pem` files are git-ignored. Never commit them.

### Start, stop and reset

```sh
docker compose up -d --build   # build and start everything
docker compose ps              # all services should become healthy
docker compose logs -f order-service
docker compose down            # stop; data volumes are kept
```

**`docker compose down -v` deletes all database, broker and upload data.**

Each container's entrypoint runs `prisma migrate deploy` before the app
starts. supplier-service also seeds suppliers from `data/csv/`. No manual
migration step is needed.

If macOS reports `docker: command not found` and Docker Desktop installed its CLI under `~/.docker/bin`, run `export PATH="$HOME/.docker/bin:$PATH"` in your terminal. Add that export to `~/.zshrc` to keep it for new shells.

### Local ports

Only the frontend and Grafana are published, both on `127.0.0.1`:

| What | Address |
| --- | --- |
| Web app | <http://localhost:5173> (`FRONTEND_PORT` in `frontend/.env`) |
| API | <http://localhost:5173/api/...>, proxied by the frontend container's nginx |
| Grafana (logs) | <http://localhost:3030>, see [Centralized Logging](#centralized-logging) |

Nothing else is reachable from the host:

- The backend services (3000–3003) don't publish their ports.
- Postgres and RabbitMQ run only on `internal: true` networks (see
  `compose.yaml`). Docker doesn't publish ports for those containers, so the
  `ports:` entries in the compose files have no effect in the full stack.

To inspect a database, use `docker compose exec`:

```sh
docker compose exec user-postgres psql -U foc_user users
```

---

## Centralized Logging

Every service writes one JSON log line per event to stdout. Alloy reads the
containers' logs through the Docker API, pushes them to Loki (7-day
retention), and Grafana shows them.

```
service stdout (JSON) → Docker → Alloy → Loki → Grafana
```

- **Open Grafana:** <http://localhost:3030> locally (user `admin`, password
  `foc-local-only` unless `GRAFANA_ADMIN_PASSWORD` is set). On EC2 it
  listens on localhost only, so use a tunnel:
  `ssh -L 3030:localhost:3030 <user>@<EC2_HOST>`, then open the same URL.
- **Dashboard:** *FoC Service Logs*. Filter by service and level, or paste a
  request ID into the search box to follow one request across services.
- **Request IDs:** nginx stamps every request with `X-Request-Id`. Each log
  line carries it as `reqId`, and `order-service` forwards it to
  `supplier-service`. It is not carried through RabbitMQ events.
- **Log level:** set `LOG_LEVEL` (`debug`, `info`, `warn`, `error`) in a
  service's `.env`. The default is `info`.
- **Readable logs on the host:** `npm run dev` pipes through `pino-pretty`.
  Containers always log JSON so Loki can parse it.
- **Config:** everything lives in `observability/`.

---

## RabbitMQ and Service Startup

RabbitMQ is only used by user-service, order-service and credit-service.
supplier-service does not use it. The publishers, consumers and workers
run inside each service's process. You do not need separate worker
commands.

| Service | Runs in-process | Publishes to | Consumes from |
| --- | --- | --- | --- |
| user-service | Outbox publisher | `user.events` (`user.registered.v1`) | — |
| order-service | Outbox publisher, credit-result consumer, order-expiry worker, order-receipt worker | `credit.commands` (`credit.reserve.v1`), `order.events` (`order.received.v1`, `order.canceled.v1`, `order.expired.v1`, `order.failed.v1`, `order.status.changed.v1`) | `order.credit-events.v1`, `notification.order-events.v1` |
| credit-service | Registration consumer, settlement consumer, reservation-request consumer, outbox publisher | `credit.events` (`credit.reservation.succeeded.v1`, `credit.reservation.failed.v1`) | `credit.user-registered.v1`, `credit.order-events.v1`, `credit.reserve.v1` |
| notification-service | Notification worker | — | `notification.order-events.v1` |

Each consumer queue has a matching `.retry.v1` and `.dead.v1` queue.
Messages that keep failing end up in the dead queue. Each service README
explains how to replay them with its redrive scripts:

- order-service: `npm run redrive:credit-reservation-results`, `npm run redrive:order-outbox`
- credit-service: `npm run redrive:registration`, `redrive:settlement`, `redrive:reservation`, `redrive:credit-outbox` (and `redrive:prod`, the compiled registration redrive)
- notification-service: `npm run redrive:order-status-events`

Services can start in any order. Each connection sets up the exchanges,
queues and bindings it needs before processing messages. The HTTP servers
can start while RabbitMQ is down.

### Broker settings

Compose downloads `rabbitmq:4.2-management` and stores broker data in a named volume.

The development login is `foc` / `foc-local-only`. Override it using `RABBITMQ_USER` and `RABBITMQ_PASSWORD` in the **root** `.env`. These settings create users when the broker volume is first initialized. Changing them later does not update existing broker users.

This local setup uses one broker node. Data survives restarts, but the setup does not provide high availability or recovery from permanent volume loss.

### Running services on the host instead

To run a service with `npm run dev` outside Docker, its dependencies must
be reachable on `localhost`. The root stack's Postgres and RabbitMQ are on
internal networks, so start them separately:

```sh
# Postgres: each service's own compose file publishes its database
# (supplier 5433, user 5434, order 5435, credit 5436, notification 5437)
(cd user-service && docker compose up -d user-postgres)

# RabbitMQ: a standalone broker on 5672, with the management UI on 15672
docker run -d --name foc-rabbitmq-dev \
  -p 127.0.0.1:5672:5672 -p 127.0.0.1:15672:15672 \
  -e RABBITMQ_DEFAULT_USER=foc -e RABBITMQ_DEFAULT_PASS=foc-local-only \
  rabbitmq:4.2-management
```

These containers have their own volumes, separate from the full stack's
data. Then, in that service's `.env`:

- point `DATABASE_URL` at `localhost` and the published Postgres port
- change `RABBITMQ_URL` to use `localhost`
- use the relative `./keys/...` paths

Host processes do not load the root `.env`.

Apply migrations and generate clients before the first start. Run these
from the repository root. For supplier-service, `db:generate` must run
before `db seed`, because the seed script imports the generated client:

```sh
(cd user-service && npm ci && npm run db:deploy && npm run db:generate && npm run build)
(cd supplier-service && npm ci && npx prisma migrate deploy && npm run db:generate && npx prisma db seed && npm run build)
(cd order-service && npm ci && npm run db:deploy && npm run db:generate && npm run build)
(cd credit-service && npm ci && npm run db:deploy && npm run db:generate && npm run build)
(cd notification-service && npm ci && npm run db:deploy && npm run db:generate && npm run build)
```

Then run `npm start` or `npm run dev` from each service directory, each in
its own terminal.

Stop services with Ctrl+C. user-service, order-service and credit-service
try to finish work already in progress before a 15-second shutdown
deadline. supplier-service exits immediately.

## AI Use Summary

- **Tools:** ChatGPT (Astra 6), Claude Code (Claude Opus 5.5, Claude Sonnet 5.5)
- **Used for:**
  - Generating initial implementations:
    - user-service registration with OTP, profile, email change, password change, admin invitation and activation, and first-admin bootstrap
    - supplier-service: adding duplicate opening hours rows in table for different days of the week, using session storage, generating Prisma count query, adding optional pagination
    - supplier service refactoring
    - credit-service ledger, initial credit grant, balance and history endpoints
    - order-service prisma query, adding date range filter for order dashboard
    - RabbitMQ outbox publisher, registration consumer and redrive script
    - frontend auth, profile, user-management and credits features
    - Dockerfiles, Compose files and GitHub Actions CI/CD workflows
    - Migration of supplier images from AWS EC2 to S3, while using local storage when running the app locally
  - Writing the user-service, supplier-service and ordeer-service unit tests
  - Debugging:
    - stale credit data across sessions
    - phone prefix display
    - service startup ordering
    - supplier images not rendering on frontend on browser
    - supplier service queries not rerunning during state changes
    - order service pagination returning undefined
    - stale orders displaying
    - fix unaligned frontend components 
    - fix missing fields in event payloads
    - gateway DNS resolution after redeploys
    - fix image upload errors on cloud
  - Writing initial implementation code for supplier service containerization
  - Writing initial implementation code for reverse proxy configuration using nginx
  - Refactoring the credits history UI and the CI test steps
  - Writing a fix to run deployment only in the upstream repository
  - Drafting frontend README documentation
  - Auditing and suggesting updates for order service README
  - Auditing and updating READMEs and API docs against the code (Claude Code)
  - Centralized logging (Claude Code): pino logger and request-ID middleware in all five services, the Loki/Alloy/Grafana stack in `observability/`, deploy workflow changes, the architecture diagram and the Grafana access steps
- **Prohibited phases avoided:** requirements elicitation; architecture/design decisions
- **Verification:** all AI outputs reviewed, edited and tested by the authors
- **Full log:** [/ai/usage-log.md](ai/usage-log.md)
