<!-- AI Assistance Disclosure:
Tool: ChatGPT (Astra 6)
Date: approx. 2026-11-10
Scope: Verified and edited errors in the notification service README.
Author review: Reviewed and edited by Ng See Pui.
-->

# Notification Service

## Table of Contents

- [About](#about)
- [Features](#features)
- [Notification Status Transitions](#notification-status-transitions)
- [Asynchronous Workflows with RabbitMQ](#asynchronous-workflows-with-rabbitmq)
- [Background Workers](#background-workers)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Acknowledgements](#acknowledgements)

## About

The Notification Service provides persistent and real-time order status notifications.

It consumes `ORDER_STATUS_CHANGED` events from RabbitMQ, creates notifications for the relevant requester and courier, stores them in PostgreSQL, and pushes new notifications to connected frontend clients through Server-Sent Events (SSE).

The service also supports notification history, unread counts, read-state updates, replay after disconnection, and synchronization across browser tabs and devices.

## Features

### Notification Management

- Persist order status notifications in PostgreSQL
- Prevent duplicate notifications using event IDs
- List notifications with pagination
- Filter notifications by unread status
- Count unread notifications
- Mark one notification as read
- Mark all notifications as read

### Real-Time Delivery

- Push new notifications through Server-Sent Events
- Support multiple browser tabs and devices per user
- Replay missed notifications after reconnection
- Use notification sequence numbers as SSE event IDs
- Send heartbeat messages to keep connections alive
- Synchronize read-state changes across connected clients

### Reliability

- Validate incoming RabbitMQ events using Zod
- Reject malformed events
- Retry temporary processing failures
- Forward permanently failed messages to a dead-letter queue
- Acknowledge RabbitMQ messages only after successful processing
- Process duplicate events idempotently

## Notification Status Transitions

The Notification Service does not modify orders. It reacts to order status changes published by the Order Service.

| Order Status Change | Notification Recipient | Notification |
| --- | --- | --- |
| `OPEN → ACCEPTED` | Requester | A courier accepted the request |
| `ACCEPTED → PICKED_UP` | Requester | The item was picked up |
| `PICKED_UP → COMPLETED` | Requester | The order was delivered |
| `ACCEPTED → OPEN` | Requester | The courier dropped the request |
| `COMPLETED → RECEIVED` | Courier | The requester received the order |
| `COMPLETED → FAILED` | Courier | The requester reported a failed delivery |
| `OPEN → EXPIRED` | Requester | The request expired |
| `ACCEPTED → AUTO_FAILED` | Requester and courier | Completion deadline was missed |
| `PICKED_UP → AUTO_FAILED` | Requester and courier | Completion deadline was missed |
| `COMPLETED → AUTO_RECEIVED` | Requester and courier | The order was automatically received |
| `PENDING_RESERVATION → OPEN` | Requester | The request is available to couriers |
| `PENDING_RESERVATION → RESERVATION_FAILED` | Requester | Credits could not be reserved |

## Asynchronous Workflows with RabbitMQ

The Order Service writes an `ORDER_STATUS_CHANGED` event to its transactional outbox whenever an order status changes.

The outbox publisher sends the event to RabbitMQ. The Notification Service consumes the event and creates notifications for the appropriate users.

```text
Order Service
     |
     | ORDER_STATUS_CHANGED
     v
RabbitMQ order.events exchange
     |
     v
Notification Service consumer
     |
     +-- Validate event
     +-- Check retry metadata
     +-- Store notification
     +-- Push notification through SSE
     +-- Acknowledge message
```

### Event Payload

```json
{
  "eventId": "33333333-3333-4333-8333-333333333333",
  "eventType": "ORDER_STATUS_CHANGED",
  "orderId": "11111111-1111-4111-8111-111111111111",
  "orderName": "Buy coffee",
  "requesterId": "22222222-2222-4222-8222-222222222222",
  "courierId": "44444444-4444-4444-8444-444444444444",
  "fromStatus": "PICKED_UP",
  "toStatus": "COMPLETED",
  "version": 4,
  "offeredCredits": 10,
  "occurredAt": "2026-11-10T00:00:00.000Z"
}
```

### Retry and Dead-Letter Handling

Invalid messages are forwarded to the dead-letter queue.

Processing failures are forwarded to the retry queue until the maximum retry count is reached. After the retry limit is exceeded, the message is forwarded to the dead-letter queue.

The original message is acknowledged only after RabbitMQ confirms that the retry or dead-letter copy was published successfully.

## Background Workers

The Notification Service does not use scheduled business workers.

It runs two background processes:

### RabbitMQ Consumer

The RabbitMQ consumer:

- Connects to the order events exchange
- Consumes `ORDER_STATUS_CHANGED` messages
- Validates message size and JSON format
- Validates the event schema
- Verifies the message ID and routing key
- Stores notifications transactionally
- Acknowledges successfully processed messages
- Reconnects when RabbitMQ becomes unavailable

### SSE Heartbeat

The SSE hub sends heartbeat comments periodically:

```text
: ping
```

Heartbeat messages keep long-lived connections open through proxies and load balancers. They are ignored by the frontend SSE parser.

## Tech Stack

Technology | Purpose
--- | ---
Node.js | Runtime environment
TypeScript | Programming language
Express | HTTP server
Prisma | ORM and database access
PostgreSQL | Notification persistence
Zod | Event and request validation
RabbitMQ | Asynchronous event messaging
Server-Sent Events | Real-time browser notifications
JWT | Authentication
Docker | Containerization

## Architecture

```text
┌──────────────────────┐
│       Frontend       │
│   React + TypeScript │
│                      │
│  Notification Bell   │
│  Fetch-based SSE     │
└──────────┬───────────┘
           │
           │ HTTP / SSE
           ▼
┌──────────────────────────────────────┐
│        Notification Service          | 
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ HTTP Routes  │  │ SSE Hub      │  │
│  └──────┬───────┘  └──────┬───────┘  │
│         │                 │          │
│  ┌──────▼─────────────────▼───────┐  │
│  │ Notification Service           │  │
│  │ Persistence and read state     │  │
│  └──────────────┬─────────────────┘  │
│                 │                    │
│          ┌──────▼──────┐             │
│          │ PostgreSQL  │             │
│          └─────────────┘             │
│                                      │
│  ┌───────────────────────────────┐   │
│  │ RabbitMQ Order Status Consumer│   │
│  └───────────────┬───────────────┘   │
└──────────────────┼───────────────────┘
                   │
                   │ ORDER_STATUS_CHANGED
                   ▼
          ┌─────────────────┐
          │    RabbitMQ     │
          └────────┬────────┘
                   ▲
                   │
          ┌────────┴────────┐
          │  Order Service  │
          │  Transactional  │
          │     Outbox      │
          └─────────────────┘
```

### Notification Delivery Flow

1. Order Service changes an order status.
2. Order Service writes an `ORDER_STATUS_CHANGED` outbox event.
3. The outbox publisher sends the event to RabbitMQ.
4. Notification Service validates the event.
5. Notification Service creates one notification per recipient.
6. The notification is stored in PostgreSQL.
7. The SSE hub pushes the notification to all active connections for the recipient.
8. The frontend updates the notification list and unread count.

### Read-State Synchronization

When a user marks a notification as read:

1. The frontend sends a REST request to Notification Service.
2. Notification Service updates the database.
3. Notification Service broadcasts a `read` SSE event to the user's other connections.
4. Other browser tabs and devices update their local notification state.

Read-state broadcast events do not have an SSE ID because they are synchronization events rather than persisted notifications.

## Project Structure

```text
notification-service/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── errors/
│   ├── libs/
│   ├── middlewares/
│   ├── routes/
│   ├── schemas/
│   ├── scripts/
│   ├── services/
│   ├── sse/
│   ├── types/
│   ├── workers/
│   └── index.ts
│
├── keys/
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
|── AGENTS.md
|── compose.yaml
|── docker-entrypoint.sh
|── Dockerfile
|── package-lock.json
├── package.json
├── prisma.config.ts
|── README.md
└── tsconfig.json
```

## API Reference

All notification endpoints are mounted under:

```text
/api/notifications
```

Authentication requires a valid bearer token.

### Get Notifications

```http
GET /api/notifications
```

#### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `unread` | `true` or `false` | `false` | Return only unread notifications |
| `limit` | Integer from 1 to 100 | `20` | Number of notifications to return |
| `cursor` | Positive integer | None | Return notifications before this sequence number |

Example:

```http
GET /api/notifications?unread=true&limit=20
```

Response:

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

### Get Unread Count

```http
GET /api/notifications/unread-count
```

Response:

```json
{
  "success": true,
  "message": "Unread notification count retrieved successfully",
  "data": {
    "unread": 3
  }
}
```

### Mark One Notification as Read

```http
PATCH /api/notifications/:notificationId/read
```

Response:

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": "55555555-5555-4555-8555-555555555555"
  }
}
```

This also broadcasts the following SSE event to the user's other connections:

```text
event: read
data: {"id":"55555555-5555-4555-8555-555555555555"}
```

### Mark All Notifications as Read

```http
POST /api/notifications/read-all
```

Response:

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": {
    "updated": 3
  }
}
```

This broadcasts:

```text
event: read-all
data: {}
```

### Stream Notifications

```http
GET /api/notifications/stream
```

The endpoint returns an authenticated SSE stream.

The client must send:

```http
Authorization: Bearer <access-token>
Accept: text/event-stream
```

Example notification event:

```text
id: 42
event: notification
data: {"seq":42,"id":"...","orderId":"...","type":"COMPLETED","title":"Delivered","body":"Your order was delivered.","data":{},"createdAt":"2026-11-10T00:00:00.000Z"}
```

When connecting or reconnecting, the client may send:

```http
Last-Event-ID: 42
```

The service replays notifications created after sequence `42`, then sends:

```text
event: ready
data: {"unread":3}
```

### Health Check

```http
GET /healthz
```

Response:

```json
{
  "ok": true,
  "sseConnections": 2
}
```

### Response Shape

#### Success

```json
{ "success": true, "message": { /* message to be returned */ }, "data": { /* data to be returned */ } }
```

#### Errors

```json
{ "success": false, "code": "CONFLICT", "message": "..." }
```

## Getting Started

### Prerequisites

Make sure the following are installed:

- Node.js compatible with the project’s installed Prisma version.
- npm.
- PostgreSQL.
- Docker Desktop or another Docker Engine for local RabbitMQ.

### Environment Variables

Create a `.env` file in the root of the Order Service and fill in the required environment variables. You can use the provided `.env.example` as a template.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port for Notification Service |
| `FRONTEND_URL` | Frontend origin allowed by CORS |
| `DATABASE_URL` | PostgreSQL connection string |
| `NOTIFICATION_POSTGRES_DB` | Notification database name |
| `NOTIFICATION_POSTGRES_USER` | Notification database user |
| `NOTIFICATION_POSTGRES_PASSWORD` | Notification database password |
| `RABBITMQ_URL` | RabbitMQ connection URL |
| `JWT_PUBLIC_KEY_PATH` | Path to the JWT public key |
| `MAX_STREAMS_PER_USER` | Maximum active SSE connections per user |

> Do not commit `.env`, private keys, or other secrets to the repository.

### Database Setup

From the repository root:

```sh
cd notification-service
npm ci
```

Apply the database migrations and generate the Prisma client:

```sh
npm run db:deploy
npm run db:generate
```

To inspect the database schema, run:

```sh
npm run db:studio
```

Start development with `npm run dev`, or run the compiled application with `npm start`.

The order status consumer starts after the HTTP server begins listening. It reconnects if RabbitMQ becomes unavailable. `GET /healthz` only confirms that the HTTP server is running; it does not check RabbitMQ or whether students have received credits.

### Docker

The root `compose.yaml` includes this folder's `compose.yaml`, which defines two containers:

- **`notification-service`:** built from the `Dockerfile` (Node.js 22 Alpine). It mounts `../user-service/keys/public.pem` read-only at `JWT_PUBLIC_KEY_PATH`, so create the user-service keys first. `docker-entrypoint.sh` runs `prisma migrate deploy` and then starts `dist/index.js`. The API port isn't published to the host. In the root stack, reach it through the frontend at `http://localhost:5173/api/notifications/...`.
- **`notification-postgres`:** PostgreSQL 17 with a health check. The service waits until it is healthy.

The `127.0.0.1:5437` Postgres port mapping only works when you run this folder's compose on its own, for example `docker compose up -d notification-postgres` to use with `npm run dev`. In the root stack, the database is on an internal network and isn't reachable from the host. Use `docker compose exec notification-postgres psql -U <NOTIFICATION_POSTGRES_USER> <NOTIFICATION_POSTGRES_DB>` instead.

## Acknowledgements

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [RabbitMQ](https://www.rabbitmq.com/)
- [Zod](https://zod.dev/)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Docker](https://www.docker.com/)
