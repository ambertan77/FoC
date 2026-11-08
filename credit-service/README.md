<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-08
Scope: Audited against the code; documented reservation processing, result events, reason codes, the reservation consumer and outbox publisher, and the disabled internal API, and corrected stale messaging claims.
Author review: Reviewed and edited by Lim Shao Qi.
-->

# Credit service

## Table of Contents

- [About](#about)
- [Features](#features)
- [Credit Lifecycle](#credit-lifecycle)
- [Asynchronous Workflows with RabbitMQ](#asynchronous-workflows-with-rabbitmq)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Acknowledgements](#acknowledgements)

## About

Credit Service manages student credit accounts using PostgreSQL and Prisma. It stores current balances in CreditAccount and records balance changes in the append-only CreditTransaction ledger.

The service handles initial credit grants, order reservations, and credit settlement. It communicates asynchronously with Order Service through RabbitMQ for order reservation requests and order lifecycle events.

Current balances are stored directly in account records. The ledger provides an audit trail; this is not full event sourcing.

## Features

- Grant initial credits to eligible students after registration.
- Show a student their available and reserved balances.
- Show paginated credit transaction history.
- Reserve credits asynchronously when a requester creates or renews an order.
- Transfer reserved credits to a courier after the requester marks an order received.
- Release reserved credits when an order is canceled or expires.
- Refund reserved credits when an order fails.
- Handle duplicate messages idempotently.
- Retry temporary processing and broker failures, with dead-letter inspection and redrive support.

## Credit Lifecycle

A student’s credits are tracked as **available** or **reserved**. Available credits can be used for an order. When an order is created, Credit Service reserves the offered amount by moving it from the available balance to the reserved balance. Each balance change is recorded in the credit transaction ledger.

A reservation follows this lifecycle:

| Trigger | Reservation change | Balance effect |
| --- | --- | --- |
| Order creation succeeds | Created as `RESERVED` | Requester: available decreases; reserved increases |
| Order renewal succeeds | A new reservation is created for the renewed order | Requester: available decreases; reserved increases |
| Order is received | `RESERVED` → `TRANSFERRED` | Requester’s reserved credits decrease; courier’s available credits increase |
| Order is canceled or expires | `RESERVED` → `RELEASED` | Requester’s reserved credits decrease; available credits increase |
| Order fails | `RESERVED` → `REFUNDED` | Requester’s reserved credits decrease; available credits increase |
| Creation aborted (internal HTTP API only, [currently disabled](#internal-reservation-api-disabled)) | `RESERVED` → `ABORTED`, reason `CREATION_ABORTED` | Requester’s reserved credits decrease; available credits increase |

A renewal can only use a previous reservation for the same order,
requester and amount, and only if that reservation is `RELEASED` with
reason `EXPIRED`. See [Order Reservation and Renewal](#order-reservation-and-renewal).

The reservation and its balance and ledger changes are committed together in a database transaction. A reservation can be settled only once. Repeated delivery of the same event does not apply the balance change again, and conflicting settlement attempts are rejected.

Order Service owns order status and order IDs. Credit Service owns credit accounts, reservations, and the credit ledger. The services exchange reservation requests, results, and settlement events through RabbitMQ; they do not share database tables or foreign keys.

## Asynchronous Workflows with RabbitMQ

### Messaging Overview

Services communicate through RabbitMQ. Every message is one of two kinds:

- **Event**: a fact that already happened, named in the past tense (`USER_REGISTERED`, `ORDER_RECEIVED`). The publisher does not know or care who consumes it. Events go to **topic** exchanges, so more consumers can subscribe later without changing the publisher.
- **Command**: a request that one specific service must act on (`RESERVE_CREDITS`). The sender depends on the outcome, so the command goes to a **direct** exchange with exactly one consumer. The outcome comes back as an event.

#### Exchange types used

| Type | Routing rule | Used for |
| --- | --- | --- |
| Direct | Delivered to queues whose binding key exactly equals the routing key | Commands (`credit.commands`) |
| Topic | Delivered to queues whose binding pattern matches the routing key. `*` matches exactly one word and `#` matches zero or more | Events (`user.events`, `order.events`, `credit.events`) |

Fanout and header exchanges are not used.

#### All messages

| Message | Kind | Flow | Exchange (type) | Routing key | Binding | Consumer queue |
| --- | --- | --- | --- | --- | --- | --- |
| `USER_REGISTERED` | Event | User → Credit | `user.events` (topic) | `user.registered.v1` | `user.registered.v1` | `credit.user-registered.v1` |
| `RESERVE_CREDITS` | Command | Order → Credit | `credit.commands` (direct) | `credit.reserve.v1` | `credit.reserve.v1` | `credit.reserve.v1` |
| `ORDER_RECEIVED` | Event | Order → Credit | `order.events` (topic) | `order.received.v1` | `order.*.v1` | `credit.order-events.v1` |
| `ORDER_CANCELED` | Event | Order → Credit | `order.events` (topic) | `order.canceled.v1` | `order.*.v1` | `credit.order-events.v1` |
| `ORDER_EXPIRED` | Event | Order → Credit | `order.events` (topic) | `order.expired.v1` | `order.*.v1` | `credit.order-events.v1` |
| `ORDER_FAILED` | Event | Order → Credit | `order.events` (topic) | `order.failed.v1` | `order.*.v1` | `credit.order-events.v1` |
| `CREDIT_RESERVATION_SUCCEEDED` | Event | Credit → Order | `credit.events` (topic) | `credit.reservation.succeeded.v1` | `credit.reservation.*.v1` | `order.credit-events.v1` |
| `CREDIT_RESERVATION_FAILED` | Event | Credit → Order | `credit.events` (topic) | `credit.reservation.failed.v1` | `credit.reservation.*.v1` | `order.credit-events.v1` |

All exchanges are durable. Each publishing service owns its exchange. Exchange names are not versioned; routing keys and queue names carry the `.v1` suffix.

#### Queue topology (same for every consumer)

Each consumer has three durable quorum queues:

| Queue | Purpose |
| --- | --- |
| `<name>.v1` | Main queue, bound to the exchange |
| `<name>.retry.v1` | Delay queue with a 10-second TTL and no consumer. Expired messages dead-letter through the default exchange (`""`) straight back to the main queue by name |
| `<name>.dead.v1` | Dead-letter queue (DLQ) with no TTL and no consumer. The consumer publishes here itself |

All queues use `reject-publish` when full and `x-delivery-limit: -1`. The retry queue uses `x-dead-letter-strategy: at-least-once`, so a retry can be delivered more than once.

Retries return to the main queue by queue name, not through the topic exchange. This stops other queues bound to the same key from receiving duplicates. A retried message therefore arrives with the queue name as its routing key. The registration and settlement consumers store the original key in the `x-original-routing-key` header when they forward a message to the retry or dead queue. On a delayed retry, they check that header against the event type. The reservation-request consumer does not set this header: its queue name and routing key are both `credit.reserve.v1`, so a retried message still matches.

Publishers and consumers both declare the topology of every queue they publish to or read from, so a `mandatory` publish is never returned as unroutable because the other service has not started yet. Keep these definitions identical in all services. A mismatch fails at startup with `PRECONDITION_FAILED`.

The DLQ is a consumer-side concept: it holds messages that reached the broker but could not be processed. In Credit Service's and Order Service's outboxes, the publisher-side equivalent is a row with status `DEAD`. User Service's outbox has no `DEAD` state. It keeps retrying unpublished rows indefinitely.

### Registration and Initial Credit Grant

`USER_REGISTERED` is an **event**. User Service reports that a student registered; Credit Service decides that its reaction is to grant the initial credits. User Service does not know that Credit exists.

```json
{
  "eventId": "4c32dd25-ae56-4adc-92fb-a8a663b82957",
  "eventType": "USER_REGISTERED",
  "eventVersion": 1,
  "occurredAt": "2026-10-12T00:00:00.000Z",
  "userId": "f71dc4c3-af70-47db-adc5-d547c0781a91",
  "role": "STUDENT"
}
```

The consumer requires exactly these fields. UUIDs must be valid, the timestamp must be UTC ISO format ending in `Z`, and AMQP `messageId` must equal `eventId`. Do not include email, passwords or grant amounts.

Credit trusts the publisher to report verified student registrations. It does not ask user-service to check eligibility, so restrict who can publish to the broker.

| Component | Declaration |
| --- | --- |
| Exchange | Durable topic exchange `user.events` (published by User Service) |
| Registration route | `user.registered.v1` → `credit.user-registered.v1` |
| Retry queue | `credit.user-registered.retry.v1`, 10-second TTL, dead-letters through the default exchange back to `credit.user-registered.v1` |
| Dead-letter queue | `credit.user-registered.dead.v1`, no TTL |

All three queues are durable quorum queues. They use `reject-publish` when full and disable automatic delivery-count limits. The retry queue uses at-least-once dead-lettering, which can deliver the same message more than once. Retry and dead-letter messages are sent to queue names through the default exchange.

The consumer checks that the routing key is `user.registered.v1`. On a delayed retry it reads the key from `x-original-routing-key`.

Both services define the same exchanges, queues and bindings in `src/libs/rabbitmq.ts`. Update both files together when changing the contract.

Publishers send persistent messages, require successful routing, and wait up to 10 seconds for broker confirmation. A returned message still counts as a routing failure, even if the broker also confirms it. Confirmation means RabbitMQ accepted the message; it does not mean Credit has granted the credits yet.

The consumer processes one message at a time (`prefetch: 1`). It acknowledges the message only after the grant function succeeds, including when the grant already exists.

Temporary database connection failures, timeouts and transaction conflicts get up to five delayed retries after the first attempt, for six processing attempts in total. `x-retry-count` starts at zero and increases with each scheduled retry. The retry queue waits at least 10 seconds; outages or a backlog can make the wait longer.

Invalid or unsupported events, invalid retry metadata, permanent failures (including `CREDIT_ACCOUNT_INCONSISTENT`), and messages that use up their retries go to the dead-letter queue for investigation.

The consumer waits for confirmation before acknowledging a message moved to a retry or dead-letter queue. If forwarding fails, it leaves the original unacknowledged and reconnects. The wait between reconnect attempts grows to at most 60 seconds.

Lost confirmations or acknowledgments can cause extra deliveries beyond the scheduled retry count. The initial-grant function prevents these deliveries from granting credits again.

#### Migration contract

Deploy `20261012000000_add_credit_transaction_ledger` before using the grant function. `npm run db:deploy` applies pending migrations, including the original account migration on a fresh database. Client generation is a separate step.

The ledger migration runs in a transaction. It adds constraints, the transaction enum and table, indexes, and rules that prevent editing or deleting ledger entries. It does not create accounts, change balances or grant credits to existing users.

If existing balances are negative, the migration fails. Investigate and correct that data explicitly. Do not silently reset balances or grant credits to work around the failure. Follow Prisma's failed-migration recovery process before retrying deployment.

Database invariants:

- `availableCredits` and `reservedCredits` are non-negative integers.
- Transaction `amount` is a positive integer; `availableDelta` and `reservedDelta` are signed integers.
- `idempotencyKey` is unique across the ledger.
- A SQL partial unique index permits at most one `INITIAL_ALLOCATION` per account.
- A PostgreSQL trigger rejects ledger `UPDATE`, `DELETE`, and `TRUNCATE` statements. Corrections require new entries; no correction workflow is implemented.
- The local account foreign key uses `ON DELETE RESTRICT ON UPDATE RESTRICT`. Ledger records cannot be cascaded away with an account.

Migration SQL defines the checks, partial unique index, and trigger/function. Preserve these in future migrations; the Prisma schema does not describe all of them.

- Use `npm run db:migrate -- --name <change_name>` to create migrations against a development database, then review the SQL.
- Deploy using the checked-in migrations. Do not substitute `prisma db push`.
- `npm run db:reset` destroys database data. Do not use it to upgrade a database.

#### Initial-grant function

Exported from `src/services/credit.service.ts`:

```ts
grantInitialCredits(
    prisma: PrismaClient,
    userId: string,
): Promise<InitialCreditGrantResult>

interface InitialCreditGrantResult {
    account: CreditAccount;
    transaction: CreditTransaction;
    created: boolean;
}
```

Pass a full Prisma client; the function owns its transaction. For example, code under `src/` can call:

```ts
import { prisma } from "./libs/prisma.js";
import { grantInitialCredits } from "./services/credit.service.js";

// Eligibility and event validation must already have succeeded.
const result = await grantInitialCredits(prisma, verifiedStudentUserId);
```

The function validates `userId` with Zod's UUID validator and normalizes it to lowercase. Its deterministic idempotency key is `initial-allocation:<normalized-userId>`.

On first provisioning, one database transaction creates:

| Record | Values |
| --- | --- |
| Account | `availableCredits: 50`, `reservedCredits: 0` |
| Initial transaction | `type: INITIAL_ALLOCATION`, `amount: 50`, `availableDelta: 50`, `reservedDelta: 0`, `orderId: null` |

Both writes succeed together or are rolled back together. The first successful call returns `created: true`.

Repeated calls, including simultaneous calls for the same user, return the existing account and original grant with `created: false`. Any failed account-creation transaction is rolled back first. These calls do not add credits or reset balances, even if later activity has changed the balance.

An existing account must have exactly one initial-allocation record matching the deterministic key, amount, deltas, and null order ID. The function does not repair an account lacking that record or having an incompatible record.

| Failure | Contract |
| --- | --- |
| Invalid UUID | `AppError` with code `INVALID_USER_ID`, status `400`; no database writes. |
| Missing or incompatible grant on an existing account | `AppError` with code `CREDIT_ACCOUNT_INCONSISTENT`, status `500`; investigate without automatic repair. |
| Other database/transaction failure | Error propagates. Writes in the failed provisioning transaction roll back. |

These statuses describe errors from the function; there is no public HTTP grant API. If a connection fails, the caller may not know whether the transaction committed. Retrying with the same user ID is safe.

#### Access and provisioning boundaries

- Call the internal function only for newly verified students. The caller must check eligibility; the function does not query user-service or check role and verification state. Do not use it to give all existing users credits during a migration or startup.
- User-service saves the new user and its provisioning outbox event in the same transaction. Registration can succeed before Credit creates the account. A missing account means provisioning is pending, not that the student has a zero balance.
- Acknowledge delivery after the function succeeds, including `created: false`. Redelivery after a lost acknowledgment is safe. Retry temporary database failures. Investigate invalid IDs and `CREDIT_ACCOUNT_INCONSISTENT` errors instead of granting again or resetting balances.
- Only students can read balances and history. Promoting a student to admin keeps their credit records. Access checks use the role in the verified JWT; they do not query user-service or revoke existing student tokens after promotion.
- Save each balance change and its transaction entries together. Show available and reserved balances separately. Available credits are already spendable, so do not subtract reserved credits again.

### Order Reservation and Renewal

`RESERVE_CREDITS` is a **command**. Order Service needs Credit Service specifically to reserve credits, and an order stays `PENDING_RESERVATION` until it gets the answer. It is published to the direct exchange `credit.commands` with routing key `credit.reserve.v1` and is consumed from `credit.reserve.v1` (retry `credit.reserve.retry.v1`, dead `credit.reserve.dead.v1`).

Credit Service answers with an **event** on the topic exchange `credit.events`: `CREDIT_RESERVATION_SUCCEEDED` (`credit.reservation.succeeded.v1`) or `CREDIT_RESERVATION_FAILED` (`credit.reservation.failed.v1`). Order Service consumes both from `order.credit-events.v1` (retry `order.credit-events.retry.v1`, dead `order.credit-events.dead.v1`).

```Text
Order Service ── RESERVE_CREDITS (command) ──▶ [credit.commands, direct] ──▶ credit.reserve.v1 ──▶ Credit Service
Order Service ◀── CREDIT_RESERVATION_SUCCEEDED / FAILED (event) ── [credit.events, topic] ◀── Credit Service
```

A create request has this shape:

```json
{
  "eventId": "4c32dd25-ae56-4adc-92fb-a8a663b82957",
  "eventType": "RESERVE_CREDITS",
  "requestType": "CREATE",
  "orderId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6482",
  "requesterId": "f71dc4c3-af70-47db-adc5-d547c0781a91",
  "amount": 10
}
```

A renewal request also identifies the previous reservation and carries the order version and new expiry time:

```json
{
  "eventId": "4c32dd25-ae56-4adc-92fb-a8a663b82958",
  "eventType": "RESERVE_CREDITS",
  "requestType": "RENEW",
  "orderId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6482",
  "requesterId": "f71dc4c3-af70-47db-adc5-d547c0781a91",
  "amount": 10,
  "previousReservationId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6483",
  "expectedVersion": 3,
  "expiryAt": "2026-10-31T12:00:00.000Z"
}
```

Credit Service processes the request and publishes either `CREDIT_RESERVATION_SUCCEEDED` with the new reservation ID, or `CREDIT_RESERVATION_FAILED` with a reason code. The result includes a `correlationId` linking it to the request.

#### How a request is processed

In one database transaction, Credit Service:

1. Stores the request by `eventId` with outcome `PENDING`. If that
   `eventId` was already processed, it returns the stored outcome without
   doing anything else. A repeat whose `requestType`, `orderId`,
   `requesterId`, `amount` or `previousReservationId` differs is rejected
   as a conflict.
2. For `RENEW`, checks the previous reservation. It must exist, match the
   request's order, requester and amount, and be `RELEASED` with reason
   `EXPIRED`. `expectedVersion` and `expiryAt` are validated but not stored
   or returned. Only Order Service uses them.
3. Moves `amount` from the requester's available to reserved credits,
   creates a `RESERVED` reservation and writes a `RESERVATION` ledger
   entry.
4. Sets the outcome to `SUCCEEDED` or `FAILED`, and writes the result
   event to the `CreditOutboxEvent` table.

A failed request changes no balances. The possible `reasonCode` values:

| `reasonCode` | Meaning |
| --- | --- |
| `PREVIOUS_RESERVATION_NOT_FOUND` | `RENEW`: `previousReservationId` does not exist |
| `PREVIOUS_RESERVATION_MISMATCH` | `RENEW`: the previous reservation has a different order, requester or amount |
| `PREVIOUS_RESERVATION_NOT_RENEWABLE` | `RENEW`: the previous reservation is not `RELEASED` with reason `EXPIRED` |
| `CREDIT_ACCOUNT_NOT_FOUND` | The requester has no credit account |
| `INSUFFICIENT_AVAILABLE_CREDITS` | Available credits are below `amount`, or the reserved balance would overflow |

#### Result events

```json
{
  "eventId": "9a1d7c52-3f0e-4b8a-9c61-2e5f4d3b1a70",
  "correlationId": "4c32dd25-ae56-4adc-92fb-a8a663b82957",
  "orderId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6482",
  "requestType": "CREATE",
  "eventType": "CREDIT_RESERVATION_SUCCEEDED",
  "reservationId": "5b0e2f4c-8d17-4a39-b6e2-0c9a7d1f3e84"
}
```

```json
{
  "eventId": "9a1d7c52-3f0e-4b8a-9c61-2e5f4d3b1a71",
  "correlationId": "4c32dd25-ae56-4adc-92fb-a8a663b82958",
  "orderId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6482",
  "requestType": "RENEW",
  "eventType": "CREDIT_RESERVATION_FAILED",
  "reasonCode": "PREVIOUS_RESERVATION_NOT_RENEWABLE"
}
```

- `eventId` is a new UUID for the result. It is also the AMQP `messageId`.
- `correlationId` is the request's `eventId`. It is also sent as the AMQP
  `correlationId`.

#### Reservation-request consumer rules

The consumer of `credit.reserve.v1` processes one message at a time
(prefetch 1):

- Bodies over 64 KiB, invalid JSON, invalid fields, a `messageId` that
  differs from `eventId`, or an unexpected routing key go straight to
  `credit.reserve.dead.v1` with `x-credit-failure: INVALID_EVENT`. An
  invalid `x-retry-count` header goes there as `INVALID_RETRY_COUNT`.
- A temporary database outage closes the consumer session. The consumer
  then reconnects without using up the message's retries.
- **Any other processing error** is retried through
  `credit.reserve.retry.v1` (10-second delay) up to 5 times. After that,
  the message is dead-lettered with `RETRIES_EXHAUSTED`. This includes an
  `eventId` reused with different data, which will not succeed on retry.

#### Result outbox publisher

Result events are written to the `CreditOutboxEvent` table and published
by a background publisher in the same process:

- It claims up to 30 due rows at a time with `FOR UPDATE SKIP LOCKED`
  and a 30-second lease. When there is nothing to publish, it waits 30
  seconds before polling again.
- Each event is published to `credit.events` and waits for broker
  confirmation. Only then is the row marked `PUBLISHED`.
- A failed publish is retried with exponential backoff and jitter (1 s,
  2 s, 4 s …, up to 60 s). After 5 failures the row becomes `DEAD`. A row
  whose stored payload is invalid fails the same way.
- To publish `DEAD` rows again, use `npm run redrive:credit-outbox` (see
  [Dead-Letter Inspection and Redrive](#dead-letter-inspection-and-redrive)).

Order Service consumes the result and updates its order. A successful create makes the order available as `OPEN`; a failed create is recorded as a reservation failure. A successful renewal reopens the expired order, updates its expiry time, and saves the new reservation ID. A failed renewal leaves the order expired.

The renewal’s `expectedVersion` lets Order Service reject a result if the order changed after the renewal request was made. Duplicate results are checked against the previously processed result so they cannot apply the same order update twice.

### Order Settlement

Settlement means paying out or returning a reservation. Order Service publishes four **events** on the durable topic exchange `order.events`. Credit consumes them from `credit.order-events.v1`, bound with the pattern `order.*.v1`.

| Event | Routing key | Result |
| --- | --- | --- |
| `ORDER_RECEIVED` | `order.received.v1` | Pay the courier (F5) |
| `ORDER_CANCELED` | `order.canceled.v1` | Return held credits to the requester (F6) |
| `ORDER_EXPIRED` | `order.expired.v1` | Return held credits to the requester (F6) |
| `ORDER_FAILED` | `order.failed.v1` | Refund held credits to the requester (F7) |

These are events, not commands. Order reports what happened, and Credit owns the rules for transferring, releasing or refunding credits. The pattern `order.*.v1` also matches any future `order.<x>.v1` event, and the consumer sends unknown ones to the DLQ as `INVALID_EVENT`.

#### Event format

Publish persistent JSON, require successful routing, and wait for broker confirmation. `messageId` must equal the lowercase `eventId` (the original outbox UUID). Keep that identity and every event field unchanged on retries:

```json
{
  "eventId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6490",
  "eventType": "ORDER_RECEIVED",
  "orderId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6482",
  "reservationId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6481",
  "requesterId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6483",
  "courierId": "d0379a4b-657c-4aaf-a2c9-cde57bbb6484",
  "amount": 10
}
```

All fields are required for receipt. For cancellation, expiry or failure, use the matching eventType and **omit courierId**. Extra fields are rejected.

Settlement events no longer include eventVersion, orderVersion, orderName or occurredAt. Old-format messages are rejected, and removing those fields from a replay will not match a previously stored old-format settlementPayload.

Validation rules:

- Maximum body size: 64 KiB.
- UUIDs are converted to lowercase.
- amount must be a positive PostgreSQL Int.
- Requester and courier must be different users.

Credit stores the complete validated event. An identical repeat is safe, but a repeat with changed fields is rejected, including changes to eventId, eventType, courierId or amount.

#### Receipt: pay the courier (F5)

Credit uses one Serializable transaction, which protects concurrent balance changes, to:

1. Find the exact reservation and check its order, requester and amount.
2. Change its state from RESERVED to TRANSFERRED.
3. Move the stored amount from the requester's reserved credits to the courier's available credits.
4. Write both ledger entries and save RECEIVED, the courier, event identity, full event and settledAt.

Both accounts must already exist; transfers never create accounts. The whole transaction rolls back if the reserved balance is too small, an account is inconsistent, the courier balance would exceed the Int limit, the event ID was used for another reservation cycle, or the reservation already has a different final outcome.

An identical repeat changes nothing. Credit makes at most three local attempts for serialization or deadlock conflicts before using delayed retry. Payment happens asynchronously after Order records receipt.

#### Cancellation and expiry: release a hold (F6)

Credit changes RESERVED to RELEASED and moves the stored amount from requester reserved credits back to available credits. It adds one `RELEASE` row with available/reserved deltas +amount/−amount. The CANCELED/EXPIRED reason, event identity, full event and settledAt are saved in the same transaction.

No courier account is needed. If the available balance would overflow or the reserved balance is inconsistent, the transaction rolls back.

Repeating the identical event changes nothing. Credit rejects a changed repeat, receipt after release, or release after transfer or abort. An old expiry event only targets its own reservation ID, so it cannot release a renewed hold.

#### Failure: refund a hold (F7)

For `ORDER_FAILED`, Credit changes RESERVED to REFUNDED and returns the held amount to the requester. It adds one `REFUND` row with available/reserved deltas +amount/−amount. The FAILED reason, event identity, full event and settledAt are saved in the same transaction.

The same duplicate-event and balance checks as F6 apply. No courier account is needed. Refunds after transfer, release or abort are rejected. This operation only returns held credits; it cannot reclaim credits already paid to a courier.

#### Order Service responsibilities

Order Service publishes all four settlement events through its outbox. For each one, it:

- Authorizes the cancellation or expiry, then saves OPEN → CANCELED/EXPIRED together with its version, status history and outbox event.
- Protects COMPLETED → FAILED against a competing manual or automatic receipt, then saves the failure change and outbox event together.

Credit's consumer does not complete Order's lifecycle workflow. After cancellation, expiry or failure, credits may remain unavailable until the event is delivered and processed.

#### Queues and retries

Settlement uses three durable quorum queues:

- `credit.order-events.v1`: incoming events.
- `credit.order-events.retry.v1`: delayed retries (10-second TTL).
- `credit.order-events.dead.v1`: events needing investigation (the DLQ).

The retry queue dead-letters through the default exchange straight back to `credit.order-events.v1`. Retry forwarding waits for confirmation and keeps the original routing key in `x-original-routing-key`. The consumer checks that header against `eventType` for delayed retries. Redrive republishes to `order.events` with the event's own routing key.

Missing accounts or reservations, or conflicts that use up the local serialization attempts, get at most five delayed retries: six processing attempts in total. Invalid messages and conflicts go straight to the DLQ. Dead letters have no TTL.

A database outage closes the consumer session. Reconnect waits grow from 1 to 60 seconds without increasing the event's retry count. Before acknowledging an original message, retry/DLQ forwarding must be confirmed and successfully routed.

The settlement consumer starts alongside registration after the HTTP server begins listening. It processes one message at a time (prefetch 1) and stops before Prisma disconnects.

#### Broker integration checks

Run optional broker checks together with PostgreSQL tests:

```sh
CREDIT_TEST_DATABASE_URL="postgresql://username:password@localhost:5432/credit_test" \
CREDIT_TEST_RABBITMQ_URL="amqp://username:password@localhost:5672/isolated_test_vhost" \
npm run test:integration
```

Use a fresh, dedicated RabbitMQ vhost with permission to create exchanges, queues and bindings, and no other consumers. The suite does not purge existing queues. Remove the test vhost afterward.

PostgreSQL tests create and drop isolated schemas. They leave existing application data and real credentials untouched. Checks are skipped when their test URLs are missing.

#### Validation

```sh
npx prisma validate
npm run db:generate
npm run build
```

Run F4–F7 input-validation tests with `npm test` (no database or broker required). Generate the Prisma client with `npm run db:generate` after schema changes. Run PostgreSQL integration tests with:

```sh
CREDIT_TEST_DATABASE_URL="postgresql://username:password@localhost:5432/credit_test" npm run test:integration
```

Use a dedicated test database, never production. The database role needs permission to create schemas.

The F4–F7 tests cover:

- **F4:** available-to-reserved balances and ledger entries, full-balance reservation, insufficient funds, concurrent holds, atomic rollback, and HTTP authentication/validation.
- **F5:** payment of held credits to the courier, conservation of credits, duplicate/conflicting receipts, and rollback of both participants' balances.
- **F6:** cancellation and expiry returning held credits with the correct release reason and ledger entry.
- **F7:** failure returning held credits with a REFUND entry, without refunding an already transferred reservation.

Settlement checks also verify exact-event replays, competing terminal outcomes, and preservation of unrelated holds for both participants. Reservation services are redirected to the isolated test schema; application databases are not used by these tests.

The suite creates a schema with a random name, applies all checked-in migrations, then drops only that schema. If the integration URL is missing, the database suite is skipped.

Previously reported local checks: Prisma client generation, the TypeScript application build, and PostgreSQL integration tests (30 passed, one live-broker test skipped). The suite covers historical abort tombstones, Credit-generated IDs, repeated and simultaneous holds for the same order, insufficient credits, balance overflow, rollback, repeated aborts, HTTP contracts, and independent settlement of each reservation.

These results do not verify full Order creation/recovery, live-broker behavior for this change, or browser E2E.

#### Earlier validation results

These results were reported for earlier F5, F6 and F7 changes. They do not verify the latest reservation changes against a live broker.

| Change | Reported checks |
| --- | --- |
| F5 | Nine F4 PostgreSQL subtests and nine F5 PostgreSQL/broker subtests |
| F6 | TypeScript build, five unit tests, and all 25 isolated PostgreSQL/RabbitMQ tests with no skips (23 subtests plus two parent tests) |
| F7 | TypeScript build, six unit tests, and all 28 isolated PostgreSQL/RabbitMQ tests with no skips (26 subtests plus two parent tests) |

F5 coverage includes conservation of credits, rejection of changed repeat events, recovery when an account is missing, concurrent operations, abort races, rollback after ledger failure, overflow and reserved-balance checks, F3 history, lost acknowledgments, real delayed retries, DLQ/redrive, mandatory publishing with no matching route, connection loss between commit and acknowledgment, and background-consumer shutdown.

F6 adds cancellation/expiry ledger and F3 history checks, conflicts on changed repeat events, reuse of event IDs across reservation cycles, balance limits, injected ledger failures, simultaneous receive/cancel/expire/abort operations, protection of renewed holds, lost acknowledgments, and real F6 routing/retry/DLQ/redrive. It needs no migration or new dependency.

F7 adds concurrent repeat delivery that applies the refund once, conflicts on changed repeat events, REFUND history/deltas, event-ID reuse, overflow and insufficient reserved balance, conflicts after transfer while another hold exists, injected ledger failures, lost acknowledgments, protection of renewed holds, competing receive/release/refund/abort operations, and real failure routing/delayed retry/DLQ/redrive.

The temporary database, role and broker vhost were removed after the F6 run. The temporary test database and broker vhost were removed after the F7 run.

Order failure producers, outbox and recovery, full Order/browser workflows, broker restart survival, and deployed access control/security remain unverified.

### Reliability, Retries, and Duplicate Handling

Credit Service's and Order Service's outbox publishers claim events in a database transaction using `FOR UPDATE SKIP LOCKED`. This lets multiple publishers claim different rows without claiming the same row at the same time. A lease allows another publisher to reclaim a row if its original publisher stops before completing the work.

Publishers send persistent messages and wait for RabbitMQ publisher confirmation. They mark an outbox row as published only after confirmation. Failed publishes are retried with backoff; events that exceed the configured retry limit are marked `DEAD` for inspection and redrive. User Service's registration outbox is simpler: a single publisher handles one row at a time and retries until it succeeds.

A publisher confirmation means RabbitMQ accepted the message. It does not mean the consumer finished processing it. Consumers acknowledge a message only after their database work succeeds. If processing fails, the consumer retries or forwards the message to its dead-letter queue according to that workflow’s retry policy.

Messages can be delivered more than once. Credit Service uses request event IDs and the stored request data to recognize repeated reservation requests. Order Service records processed credit results in an inbox and checks that a repeated result has the same payload. Settlement processing also checks the event identity and payload before applying a balance change. A repeated event with different data is rejected.

Exactly-once delivery is not guaranteed. For example, a publisher may receive RabbitMQ confirmation and stop before marking its database row published. The event may then be published again, so consumers must remain idempotent.

Commands and events get the same delivery guarantees: at-least-once delivery with idempotent consumers. A command is not safer than an event. Credit Service recognizes a repeated `RESERVE_CREDITS` by its event ID and stored request data, and the outcome is published once per request through its outbox.

### Dead-Letter Inspection and Redrive

Inspect queue counts without consuming messages:

```sh
docker compose exec rabbitmq rabbitmqctl list_queues -p / name messages_ready messages_unacknowledged consumers
```

Redrive commands for each Credit dead-letter queue:

| Workflow | Dead queue | Command |
| --- | --- | --- |
| Registration | `credit.user-registered.dead.v1` | `npm run redrive:registration -- --limit 10` |
| Settlement | `credit.order-events.dead.v1` | `npm run redrive:settlement -- --limit 10` |
| Reservation requests | `credit.reserve.dead.v1` | `npm run redrive:reservation -- --limit 10` |
| Credit outbox (`DEAD` rows) | database | `npm run redrive:credit-outbox -- --limit 10` |

Redrive means sending a dead-letter message back for another processing attempt. The command only needs `RABBITMQ_URL`; it does not start Prisma or the HTTP server.

Restart credit service afterward. Keeping its consumer paused during redrive prevents a still-failing event from returning to the dead-letter queue and being picked up again in the same run. Run one redrive command at a time.

The command processes the oldest available dead letters. It stops at the requested positive limit or the number of ready messages counted at startup, whichever is smaller.

For each message, it:

- Preserves the exact event bytes, event ID and message ID.
- Resets `x-retry-count` to zero, increments `x-redrive-count`, and sets `x-redriven-at`.
- Keeps failure and death headers for diagnosis, but drops message expiration and AMQP user identity.
- Acknowledges the dead letter only after RabbitMQ confirms republication to its original exchange and routing key:

  | Workflow | Republished to |
  | --- | --- |
  | Registration | `user.events` with `user.registered.v1` |
  | Settlement | `order.events` with the event's own key (`order.received.v1`, `order.canceled.v1`, `order.expired.v1` or `order.failed.v1`) |
  | Reservation requests | `credit.commands` with `credit.reserve.v1` |

A broker failure stops the command with exit code 1. The current unacknowledged message becomes available again when the connection closes. Invalid event bodies, identities or redrive counts also stop the command without removing the message. Investigate these separately; redrive does not rewrite events or repair accounts and reservations.

A crash after forwarding but before acknowledgment can create a duplicate delivery. Credit Service's handlers are idempotent, so a duplicate cannot grant reserve, transfer, release or refund twice. A successful redrive means the message was republished; credit service may not have processed it yet.

### Database Transactions and Credit Ledger

Credit Service commits related balance, reservation, ledger, and outbox changes in database transactions. If a step fails, the transaction rolls back so the account cannot be updated without its corresponding ledger entry.

For a reservation request, Credit Service saves the request’s processing outcome and the resulting reservation and ledger changes together. It also records the result event in its outbox as part of that transaction. For settlement, it changes the reservation state, updates the affected balances, writes ledger entries, and stores the processed settlement event together.

The ledger is append-only. Corrections require new transactions rather than editing or deleting old entries. Database migrations enforce important invariants, including non-negative balances, positive transaction amounts, and restrictions against updating or deleting ledger records. Preserve those migration rules when changing the schema.

`CreditAccount.userId` and `CreditTransaction.orderId` are UUID references owned by other services. They do not use cross-service database foreign keys.

## Tech Stack

Technology    | Purpose
------------- | -----------------------------
Node.js       | Runtime environment
TypeScript    | Programming language
Express       | Backend web framework
Prisma        | ORM and database access
PostgreSQL    | Relational database
Zod           | Request validation
RabbitMQ      | Messaging
CORS          | Cross-origin resource sharing
JWT           | Authentication tokens
Docker        | Containerization

## Architecture

### Overview Architecture Diagram

The Credit Service is one of the backend microservices in Aaron.

```text
┌──────────────────────┐
│      Frontend        │
│   React + TypeScript │
└──────────┬───────────┘
           │
           │ REST API
           ▼
┌──────────────────────────────────────────────┐
│           Credit Service                     │
│                                              │
│  ┌──────────────┐  ┌──────────────┐          │
│  │    Routes    │→ │ Controllers  │          │
│  └──────────────┘  └──────┬───────┘          │
│                           │                  │
│                    ┌──────▼───────┐          │
│                    │   Services   │          │
│                    └──────┬───────┘          │
│                           │                  │
│                    ┌──────▼───────┐          │
│                    │   Credit     │          │
│                    │   Management │          │
│                    └──────┬───────┘          │
│                           │                  │     
│                    ┌──────▼───────┐          │
│                    │ Prisma ORM   │          │
│                    └───────┬──────┘          │
└────────────────────────────┼─────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  PostgreSQL      │  
                    │  credits         │
                    └──────────────────┘
```

### Database

- PostgreSQL database
- Prisma ORM for database management

The Credit Service has its own PostgreSQL database.

```text
Credit Service
     │
     ▼
  PostgreSQL
     │
     ├── CreditAccount
     │
     ├── CreditTransaction
     │
     ├── CreditReservation
     │
     ├── ReservationRequest
     │
     └── CreditOutboxEvent
```

Alongside these tables, enums `CreditTransactionType`, `ReservationStatus`, `SettlementReason`,  `ReservationRequestType`, `ReservationRequestOutcome`, `CreditOutboxEventType` and `CreditOutboxEventStatus` are created.

To ensure concurrency, we use Prisma transactions, which make use of the database’s (Postgres) concurrency control mechanisms to ensure ACID (Atomicity, Consistency, Isolation and Durability) properties of all the credit service tables.

## Project Structure

```text
credit-service/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── errors/
│   ├── integrations/
│   ├── libs/
│   ├── middlewares/
│   ├── routes/
│   ├── schemas/
│   ├── scripts/
│   ├── services/
│   ├── types/
│   ├── workers/
│   └── index.ts
│
├── keys/
├── test/
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

### Credit read API contract

Both endpoints require `Authorization: Bearer <access-token>`. Tokens must verify using RS256 and contain a UUID `userId`, a string `email`, and a recognized role. Only `STUDENT` is authorized; valid `ADMIN` tokens receive 403, including when an account exists from before promotion.

Both endpoints select the account using only the verified JWT user ID. They do not accept account or user IDs in the path, query or body. Send GET requests without bodies.

Reading a balance or history never creates an account, grants credits or changes the ledger.

### Exact response types

Frontend consumers receive these JSON types. Backend definitions are in `src/types/credit.types.ts`; transaction-type values come from the Prisma enum.

```ts
type CreditTransactionType =
  | "INITIAL_ALLOCATION"
  | "RESERVATION"
  | "TRANSFER_SENT"
  | "TRANSFER_RECEIVED"
  | "RELEASE"
  | "REFUND";

type ProvisioningResponse = {
  success: true;
  data: { status: "PROVISIONING" };
};

type BalanceReadyResponse = {
  success: true;
  data: {
    status: "READY";
    availableCredits: number;
    reservedCredits: number;
    updatedAt: string;
  };
};

type CreditTransactionItem = {
  id: string;
  type: CreditTransactionType;
  amount: number;
  availableDelta: number;
  reservedDelta: number;
  createdAt: string;
  orderId: string | null;
};

type TransactionsReadyResponse = {
  success: true;
  data: {
    status: "READY";
    items: CreditTransactionItem[];
    nextCursor: string | null;
  };
};

type BalanceResponse = BalanceReadyResponse | ProvisioningResponse;
type TransactionsResponse = TransactionsReadyResponse | ProvisioningResponse;

type CreditErrorResponse = {
  success: false;
  code: string;
  message: string;
};
```

- READY responses use HTTP 200. PROVISIONING responses use HTTP 202.
- Errors contain the error fields shown above and no `data` field.
- Every field shown for a response type is required. `orderId` is always included, even when `null`.
- IDs are UUID strings. Timestamps are UTC ISO strings with milliseconds and a trailing `Z`.
- Balances are non-negative integers. Transaction amounts are positive integers; deltas can be positive, negative or zero.
- Transaction items do not expose account IDs, user IDs or idempotency keys.

### Balance endpoint

```http
GET /api/credits/me/balance
Authorization: Bearer <access-token>
```

This endpoint accepts no query parameters. A provisioned account returns HTTP 200:

```json
{
  "success": true,
  "data": {
    "status": "READY",
    "availableCredits": 50,
    "reservedCredits": 0,
    "updatedAt": "2026-10-12T00:00:00.000Z"
  }
}
```

Display available and reserved credits separately. Available credits are already spendable; do not subtract reserved credits again. Zero balances are valid READY values. `updatedAt` is the account's stored update time, not the request time.

### Provisioning (both endpoints)

When an account lookup succeeds but no account exists, either endpoint returns HTTP 202:

```json
{
  "success": true,
  "data": {
    "status": "PROVISIONING"
  }
}
```

This response means the account is missing. It contains no numeric balances, timestamps, items or cursor. Do not display it as a zero balance or empty history. A database failure returns an error instead.

Axios treats 202 as success. Check `response.data.data.status` before reading READY fields.

An older user without a credit account also gets PROVISIONING. Reading the endpoint does not create the account, and the response does not guarantee that an account will eventually be created. The API supplies no polling interval or completion deadline. Offer a refresh/retry action; repeated 202 responses still mean provisioning is incomplete.

### Transaction-history endpoint

```http
GET /api/credits/me/transactions?type=INITIAL_ALLOCATION&sort=desc&limit=20
Authorization: Bearer <access-token>
```

| Query parameter | Accepted value | When omitted |
| --- | --- | --- |
| `type` | One exact, case-sensitive `CreditTransactionType` value | All types |
| `sort` | `asc` or `desc` | `desc` |
| `limit` | Digits representing an integer from 1 through 100 | `20` |
| `cursor` | Nonempty opaque token returned by the API, at most 1,024 characters | First page |

Invalid query parameters return 400. This includes unknown or repeated parameters, arrays, empty values, unsupported enum values, and invalid limits. Limits must contain digits only, with no signs, spaces, decimal points or exponent notation.

Leave optional parameters out when unused. Do not send `type=ALL`, `cursor=null`, or empty strings.

History only includes the authenticated student's account, even when filters are used. All credit operations write to the same ledger: initial allocation, reservation, release after abandoned creation, F5 receipt transfers (`TRANSFER_SENT` and `TRANSFER_RECEIVED`), F6 cancellation/expiry (`RELEASE`), and F7 failure (`REFUND`).

HTTP 200 example with one transaction and no further page:

```json
{
  "success": true,
  "data": {
    "status": "READY",
    "items": [
      {
        "id": "f6cef655-f9a9-4819-bce9-71261870fab0",
        "type": "INITIAL_ALLOCATION",
        "amount": 50,
        "availableDelta": 50,
        "reservedDelta": 0,
        "createdAt": "2026-10-12T00:00:00.000Z",
        "orderId": null
      }
    ],
    "nextCursor": null
  }
}
```

An existing account with no matching transactions returns HTTP 200:

```json
{
  "success": true,
  "data": { "status": "READY", "items": [], "nextCursor": null }
}
```

`amount` is always positive. Use `availableDelta` and `reservedDelta` to show whether each balance increased or decreased.

### Sorting and pagination

The default order is `createdAt DESC, id DESC`. With `sort=asc`, it is `createdAt ASC, id ASC`. The transaction ID breaks ties when stored timestamps are equal.

Keep the API's order in the UI. PostgreSQL stores microseconds, but response timestamps do not include that full precision. Sorting the response again can change the intended order.

Each page has at most `limit` items. If another row exists, `nextCursor` contains a token for the next page. Otherwise it is `null`.

A cursor belongs to one account, type filter (including no filter), and sort direction. It must point to an existing transaction within those settings. Invalid or incompatible cursors return 400. Pass the token back unchanged; do not decode, edit or create cursors in the frontend. The server checks account access separately from cursor content.

Keep type and sort unchanged between pages. Reset the list and cursor when either changes. You may change `limit` between pages.

The server checks query syntax and cursor structure before looking up the account. It checks whether the cursor matches the account only after finding that account. A request with valid syntax and cursor structure returns 202 if the account is missing.

Example consuming a first page and, when available, a second page using the service's Axios client:

```ts
// creditApi uses the credit-service origin as its baseURL and the existing
// bearer-token/refresh interceptors. These paths include /api/credits.
const params = { sort: "desc", limit: 20 } as const; // all transaction types
const first = await creditApi.get<TransactionsResponse>(
  "/api/credits/me/transactions", { params },
);

if (first.data.data.status === "READY") {
  const items = [...first.data.data.items];
  const cursor = first.data.data.nextCursor;
  if (cursor !== null) {
    const second = await creditApi.get<TransactionsResponse>(
      "/api/credits/me/transactions",
      { params: { ...params, cursor } }, // Axios URL-encodes the returned token
    );
    if (second.data.data.status === "READY") {
      items.push(...second.data.data.items);
      // Retain second.data.data.nextCursor for the next load-more action.
    }
  }
  // Render items in their returned order; handle PROVISIONING separately.
}
```

Pages read live data, so new transactions can arrive while the user browses. Refresh the first page to see new rows before the current cursor. New rows after it may appear on later pages. Page length does not tell you the total transaction count.

Existing indexes on `(accountId, createdAt DESC, id DESC)` and `(accountId, type, createdAt DESC, id DESC)` support these reads. No new migration is required.

### Errors and frontend handling

| HTTP | `code` | `message` | Meaning |
| --- | --- | --- | --- |
| 400 | `BAD_REQUEST` | `Invalid query parameters` | Unsupported/invalid query fields, including empty or oversized cursor parameters |
| 400 | `BAD_REQUEST` | `Invalid cursor` | Cursor decoding, schema, scope, or anchor validation failed |
| 401 | `AUTHENTICATION_REQUIRED` | `Authentication required` | Missing/empty bearer authentication or unsupported authorization scheme |
| 401 | `UNAUTHORIZED` | `Invalid token, please sign out and back in` | Invalid/expired token, signature, or required claims |
| 403 | `FORBIDDEN` | `You do not have permission to access this resource` | Valid admin token cannot access credit reads |
| 500 | `INTERNAL_SERVER_ERROR` | `An unexpected error occurred` | Unexpected failure, including database errors |

Example HTTP 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Invalid cursor"
}
```

- Hide credit UI for admins.
- Use the existing authentication refresh handling for 401 responses.
- Show 403 and 500 as errors, not as provisioning, zero balance or empty history.
- On a cursor error, offer to restart from the first page.
- Show READY with no items, PROVISIONING, and request errors as separate states. Ignore stale page responses after the user changes filters or sort.

### Internal reservation API (disabled)

`src/routes/internal-credit.route.ts` defines a synchronous HTTP API
that Order Service used to call to reserve credits. **It is not mounted.**
The line `app.use("/api/internal/credits", internalCreditRouter)` is
commented out in `src/index.ts`. Order Service now reserves credits only
through the `RESERVE_CREDITS` command (see
[Order Reservation and Renewal](#order-reservation-and-renewal)). Only
the integration tests mount this router, at `/internal/credits`.

For reference, if it were mounted:

Method | Path | Body | Success
------ | ---- | ---- | -------
`POST` | `/reservations` | `{ orderId, requesterId, amount }` | `201` new reservation (each call creates another hold)
`GET`  | `/reservations/:reservationId` | | `200` reservation
`POST` | `/reservations/:reservationId/abort` | `{ reservationId, orderId, requesterId, amount }` | `200`. Sets `ABORTED` / `CREATION_ABORTED` and returns the hold

Every request needs the header `X-Order-Credit-Service-Secret`. The
service compares it in constant time with `ORDER_CREDIT_SERVICE_TOKEN`
and returns `401` "Service authentication required" on a mismatch.
Malformed JSON returns `400` "Invalid JSON body".

`ORDER_CREDIT_SERVICE_TOKEN` is still **required at startup**
(`src/config/config.ts`), even though nothing in the running service uses
it. `ABORTED` and `CREATION_ABORTED` can't be reached in production
while this API is disabled.

## Getting Started

### Prerequisites

Make sure the following are installed:

- Node.js compatible with the project’s installed Prisma version.
- npm.
- PostgreSQL.
- Docker Desktop or another Docker Engine for local RabbitMQ.

### Environment Variables

Create a `.env` file in the root of the Credit Service and fill in the required environment variables. You can use the provided `.env.example` as a template.

| Variable | Purpose |
| --- | --- |
`PORT` | Port used by the User Service
`NODE_ENV` | Node environment (development, production, etc.)
`FRONTEND_URL` | Frontend URL allowed by CORS
`CREDIT_POSTGRES_DB` | Name of the PostgreSQL database for the Credit Service
`CREDIT_POSTGRES_USER` | Username for the PostgreSQL database
`CREDIT_POSTGRES_PASSWORD` | Password for the PostgreSQL database
`DATABASE_URL` | PostgreSQL connection string
`RABBITMQ_URL` | Broker connection URL for the background outbox publisher
`JWT_PUBLIC_KEY_PATH` | Path to the RSA public key used to verify access tokens
`ORDER_CREDIT_SERVICE_TOKEN` | Shared secret for internal Order → Credit requests

> Do not commit `.env`, private keys, or other secrets to the repository.

### Database Setup

From the repository root:

```sh
cd credit-service
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

The registration consumer starts after the HTTP server begins listening. It reconnects if RabbitMQ becomes unavailable. `GET /healthz` only confirms that the HTTP server is running; it does not check RabbitMQ or whether students have received credits.

## Acknowledgements

- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [Zod](https://zod.dev/)
- [JSON Web Token](https://jwt.io/)
- [RabbitMQ](https://www.rabbitmq.com/)
- [Docker](https://www.docker.com/)
