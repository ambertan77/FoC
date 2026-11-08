<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-08
Scope: Audited against the code; updated the repository structure, added the services and API index, and updated the AI Use Summary.
Author review: Reviewed and edited by Lim Shao Qi.
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
| Amber Tan Junning | Your ownership |
| Duong Ngoc Mai | Your ownership |
| Lim Shao Qi | Your ownership |
| Ng See Pui | Your ownership |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── user-service/        # Accounts, auth (JWT), OTP registration, admin management
├── supplier-service/    # Campus stores/facilities, supplier types, image uploads
├── order-service/       # Order (errand) lifecycle, courier actions, expiry/receipt workers
├── credit-service/      # Credit ledger, reservations and settlement
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

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

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

The project is built, tested and deployed by GitHub Actions.

- **CI** (`.github/workflows/ci.yml`) runs on every pull request into
  `main`: it builds and tests each service, lints and builds the frontend,
  and checks that every Dockerfile builds.
- **CD** (`.github/workflows/deploy.yml`) runs on every push to `main`: it
  pushes the backend images to Amazon ECR, restarts the Docker Compose stack
  on EC2 (`compose.yaml` + `compose.prod.yaml`, with `gateway/nginx.conf` as
  the API gateway), and publishes the frontend to S3 behind CloudFront.

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

---

## RabbitMQ and Service Startup

RabbitMQ runs in Docker; no native RabbitMQ installation is needed. Start Docker Desktop/the Docker engine first. From the repository root:

```sh
docker compose config --quiet
docker compose up -d rabbitmq
docker compose ps
docker compose logs --tail=50 rabbitmq
```

If macOS reports `docker: command not found` and Docker Desktop installed its CLI under `~/.docker/bin`, run `export PATH="$HOME/.docker/bin:$PATH"` in your terminal. Add that export to `~/.zshrc` to keep it for new shells.

Compose downloads `rabbitmq:4.2-management` and stores broker data in a named volume. Both ports are bound to localhost:

- AMQP: `5672`
- Management UI: `15672`, at <http://localhost:15672>

The development login is `foc` / `foc-local-only`. Override it using `RABBITMQ_USER` and `RABBITMQ_PASSWORD` in the **root** `.env`. These settings create users when the broker volume is first initialized. Changing them later does not update existing broker users.

Set `RABBITMQ_URL` in **both service directories'** `.env` files using the same credentials. URL-encode any special characters in the credentials.

Services running on your host use `localhost`. A future service running in a container on the same Compose network would use `rabbitmq`. Host service processes do not automatically load the root `.env`.

Apply migrations and generate clients in each service before startup:

```sh
cd user-service && npm ci && npm run db:deploy && npm run db:generate && npm run build
cd supplier-service && npm ci && npm run db:deploy && npm run db:generate && npm run build
cd order-service && npm ci && npm run db:deploy && npm run db:generate && npm run build
cd credit-service && npm ci && npm run db:deploy && npm run db:generate && npm run build
```

Run `npm start` from each service directory in separate terminals, or use `npm run dev`. The user-service publisher and credit-service consumer run inside those processes; you do not need separate worker commands.

Either service can start first. Each connection sets up the required exchanges, queues and bindings before processing messages. The HTTP servers can start while RabbitMQ is down.

Stop services with Ctrl+C. They try to finish work already in progress before a 15-second shutdown deadline.

Use `docker compose stop rabbitmq` to stop the broker and `docker compose start rabbitmq` to restart it. These commands and ordinary `docker compose down` preserve the volume. **`docker compose down -v` deletes broker data.**

This local setup uses one broker node. Data survives restarts, but the setup does not provide high availability or recovery from permanent volume loss.

## AI Use Summary

- **Tools:** ChatGPT (Astra 6), Claude Code (Claude Opus 5.5)
- **Used for:**
  - Generating initial implementations:
    - user-service registration with OTP, profile, email change, password change, admin invitation and activation, and first-admin bootstrap
    - credit-service ledger, initial credit grant, balance and history endpoints
    - RabbitMQ outbox publisher, registration consumer and redrive script
    - frontend auth, profile, user-management and credits features
    - Dockerfiles, Compose files and GitHub Actions CI/CD workflows
  - Writing the user-service unit tests
  - Debugging:
    - stale credit data across sessions
    - phone prefix display
    - service startup ordering
    - gateway DNS resolution after redeploys
  - Refactoring the credits history UI and the CI test steps
  - Drafting frontend README documentation
  - Auditing and updating READMEs and API docs against the code (Claude Code)
- **Prohibited phases avoided:** requirements elicitation; architecture/design decisions
- **Verification:** all AI outputs reviewed, edited and tested by the authors
- **Full log:** [/ai/usage-log.md](ai/usage-log.md)
