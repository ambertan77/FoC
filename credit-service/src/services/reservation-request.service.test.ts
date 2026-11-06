import test, { mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import type { ReservationRequestEvent } from "../schemas/reservation-request-event.schema.js";
import { reservationRequestService } from "./reservation-request.service.js";

type Row = Record<string, unknown>;

interface MockConfig {
    account?: Row | null;
    previousReservation?: Row | null;
    updateManyCount?: number;
    transactionError?: unknown;
}

type MockCall = {
    arguments: readonly unknown[];
};

type CreateReservationRequest = Extract<
    ReservationRequestEvent,
    { requestType: "CREATE" }
>;

type RenewReservationRequest = Extract<
    ReservationRequestEvent,
    { requestType: "RENEW" }
>;

type CreateEventOverrides = Partial<
    Omit<CreateReservationRequest, "requestType">
>;

type RenewEventOverrides = Partial<
    Omit<RenewReservationRequest, "requestType">
>;

// Constants for test data
const requesterId = "requester-1";
const orderId = "order-1";
const eventId = "event-1";
const renewEventId = "renew-event-1";
const previousReservationId = "previous-reservation-1";
const accountId = "account-1";

const defaultAccount: Row = {
    id: accountId,
    userId: requesterId,
    availableCredits: 50,
    reservedCredits: 0,
};

const renewableReservation: Row = {
    id: previousReservationId,
    orderId,
    requesterId,
    amount: 10,
    status: "RELEASED",
    settlementReason: "EXPIRED",
};

function firstArgument<T>(calls: readonly MockCall[]): T {
    const call = calls[0];
    assert.ok(call, "Expected mock to have been called");

    const argument = call.arguments[0];
    assert.ok(argument, "Expected mock call to have an argument");

    return argument as T;
}

function assertAppError(
    error: unknown,
    message: string,
    statusCode: number,
) {
    assert.ok(error instanceof AppError);
    assert.equal(error.message, message);
    assert.equal(error.statusCode, statusCode);
}


function createEvent(
    overrides: CreateEventOverrides = {},
): CreateReservationRequest {
    return {
        eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "CREATE",
        orderId,
        requesterId,
        amount: 10,
        ...overrides,
    };
}

function createRenewEvent(
    overrides: RenewEventOverrides = {},
): RenewReservationRequest {
    return {
        eventId: renewEventId,
        eventType: "RESERVE_CREDITS",
        requestType: "RENEW",
        orderId,
        requesterId,
        amount: 10,
        previousReservationId,
        expectedVersion: 1,
        expiryAt: "2026-12-01T00:00:00.000Z",
        ...overrides,
    };
}

// Create a mock Prisma client with in-memory data for testing
function createMockPrisma(config: MockConfig = {}) {
    const account = {
        ...(config.account ?? defaultAccount),
    };

    const requests = new Map<string, Row>();
    const reservations: Row[] = [];
    const transactions: Row[] = [];
    const outboxEvents: Row[] = [];

    // Determine the previous reservation to use for RENEW requests
    const configuredPreviousReservation =
        Object.prototype.hasOwnProperty.call(config, "previousReservation")
            ? config.previousReservation
            : renewableReservation;

    let reservationSequence = 1;

    const reservationRequest = {
        findUnique: mock.fn(async (args: unknown) => {
            const { where } = args as { where: { eventId: string } };
            return requests.get(where.eventId) ?? null;
        }),

        findUniqueOrThrow: mock.fn(async (args: unknown) => {
            const { where } = args as { where: { eventId: string } };
            const request = requests.get(where.eventId);

            if (!request) {
                throw new Error("Reservation request not found");
            }

            return request;
        }),

        create: mock.fn(async (args: unknown) => {
            const { data } = args as { data: Row };
            const request = { ...data };

            requests.set(data.eventId as string, request);
            return request;
        }),

        update: mock.fn(async (args: unknown) => {
            const { where, data } = args as {
                where: { eventId: string };
                data: Row;
            };

            const request = requests.get(where.eventId);

            if (!request) {
                throw new Error("Reservation request not found");
            }

            Object.assign(request, data);
            return request;
        }),
    };

    const creditReservation = {
        findUnique: mock.fn(async (args: unknown) => {
            const { where } = args as { where: { id: string } };

            return (
                reservations.find(
                    reservation => reservation.id === where.id,
                ) ??
                (where.id === previousReservationId
                    ? configuredPreviousReservation
                    : null)
            );
        }),

        create: mock.fn(async (args: unknown) => {
            const { data } = args as { data: Row };

            const reservation = {
                id: `reservation-${reservationSequence++}`,
                ...data,
                status: "RESERVED",
            };

            reservations.push(reservation);
            return reservation;
        }),
    };

    const creditAccount = {
        findUnique: mock.fn(async () => {
            if (!config.account) {
                return null;
            }

            return account;
        }),

        updateMany: mock.fn(async (args: unknown) => {
            const { where, data } = args as {
                where: {
                    id: string;
                    availableCredits: { gte: number };
                    reservedCredits: { lte: number };
                };
                data: {
                    availableCredits: { decrement: number };
                    reservedCredits: { increment: number };
                };
            };

            const amount = data.availableCredits.decrement;

            const matchesAccount = where.id === account.id;
            const hasAvailableCredits =
                Number(account.availableCredits) >=
                where.availableCredits.gte;
            const hasReservedCreditCapacity =
                Number(account.reservedCredits) <=
                where.reservedCredits.lte;

            if (
                config.updateManyCount === 0 ||
                !matchesAccount ||
                !hasAvailableCredits ||
                !hasReservedCreditCapacity
            ) {
                return { count: 0 };
            }

            account.availableCredits =
                Number(account.availableCredits) - amount;
            account.reservedCredits =
                Number(account.reservedCredits) +
                data.reservedCredits.increment;

            return { count: 1 };
        }),
    };

    const creditTransaction = {
        create: mock.fn(async (args: unknown) => {
            const { data } = args as { data: Row };
            transactions.push(data);
            return data;
        }),
    };

    const creditOutboxEvent = {
        create: mock.fn(async (args: unknown) => {
            const { data } = args as { data: Row };
            outboxEvents.push(data);
            return data;
        }),
    };

    const prisma = {
        reservationRequest,
        creditReservation,
        creditAccount,
        creditTransaction,
        creditOutboxEvent,

        // Mock the $transaction method to simulate transaction behavior
        $transaction: mock.fn(
            async (
                callback: (transaction: unknown) => Promise<unknown>,
                _options?: unknown,
            ) => {
                if (config.transactionError) {
                    throw config.transactionError;
                }

                return callback(prisma);
            },
        ),
    } as unknown as PrismaClient;

    return {
        prisma,
        reservationRequest,
        creditReservation,
        creditAccount,
        creditTransaction,
        creditOutboxEvent,
        account,
        requests,
        reservations,
        transactions,
        outboxEvents,
    };
}

function createP2002Error() {
    return new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
            code: "P2002",
            clientVersion: "7.10.0",
        },
    );
}

// Each test will create its own mock Prisma client and clean up after itself
function useMockPrisma(
    t: TestContext,
    config: MockConfig = {},
) {
    const harness = createMockPrisma(config);

    t.after(() => {
        mock.reset();
    });

    return harness;
}

test("processes a CREATE request successfully", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
    });

    const result = await reservationRequestService(
        harness.prisma,
        createEvent(),
    );

    assert.equal(result.outcome, "SUCCEEDED");
    assert.equal(result.failureCode, undefined);

    assert.equal(harness.account.availableCredits, 40);
    assert.equal(harness.account.reservedCredits, 10);

    assert.equal(harness.reservations.length, 1);
    assert.equal(harness.transactions.length, 1);
    assert.equal(harness.outboxEvents.length, 1);

    const createArgs = firstArgument<{
        data: Row;
    }>(harness.reservationRequest.create.mock.calls);

    assert.deepEqual(createArgs.data, {
        eventId,
        requestType: "CREATE",
        orderId,
        requesterId,
        amount: 10,
        previousReservationId: null,
        outcome: "PENDING",
    });

    const transactionArgs = firstArgument<{
        data: Row;
    }>(harness.creditTransaction.create.mock.calls);

    assert.deepEqual(transactionArgs.data, {
        accountId,
        reservationId: "reservation-1",
        orderId,
        type: "RESERVATION",
        amount: 10,
        availableDelta: -10,
        reservedDelta: 10,
        idempotencyKey: "reservation-1:RESERVATION:account-1",
    });

    const outboxArgs = firstArgument<{
        data: Row;
    }>(harness.creditOutboxEvent.create.mock.calls);

    assert.equal(outboxArgs.data.requestEventId, eventId);
    assert.equal(outboxArgs.data.eventType, "CREDIT_RESERVATION_SUCCEEDED");

    assert.deepEqual(outboxArgs.data.payload, {
        eventId: outboxArgs.data.id,
        correlationId: eventId,
        orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
        reservationId: "reservation-1",
    });
});

test("rejects CREATE when available credits are insufficient", async t => {
    const harness = useMockPrisma(t, {
        account: {
            ...defaultAccount,
            availableCredits: 5,
        },
        updateManyCount: 0,
    });

    const result = await reservationRequestService(
        harness.prisma,
        createEvent(),
    );

    assert.equal(result.outcome, "FAILED");
    assert.equal(result.failureCode, "INSUFFICIENT_AVAILABLE_CREDITS");

    assert.equal(harness.account.availableCredits, 5);
    assert.equal(harness.account.reservedCredits, 0);
    assert.equal(harness.reservations.length, 0);
    assert.equal(harness.transactions.length, 0);

    const outboxArgs = firstArgument<{
        data: Row;
    }>(harness.creditOutboxEvent.create.mock.calls);

    assert.equal(outboxArgs.data.eventType, "CREDIT_RESERVATION_FAILED");

    const payload = outboxArgs.data.payload as Row;
    assert.equal(payload.reasonCode, "INSUFFICIENT_AVAILABLE_CREDITS");
    assert.equal(payload.correlationId, eventId);
});

test("rejects CREATE when the credit account does not exist", async t => {
    const harness = useMockPrisma(t, {
        account: null,
    });

    const result = await reservationRequestService(
        harness.prisma,
        createEvent(),
    );

    assert.equal(result.outcome, "FAILED");
    assert.equal(result.failureCode, "CREDIT_ACCOUNT_NOT_FOUND");

    assert.equal(harness.reservations.length, 0);
    assert.equal(harness.transactions.length, 0);
    assert.equal(harness.outboxEvents.length, 1);

    const accountFindArgs = firstArgument<{
        where: Row;
    }>(harness.creditAccount.findUnique.mock.calls);

    assert.deepEqual(accountFindArgs, {
        where: { userId: requesterId },
    });
});

test("processes a RENEW request successfully", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
        previousReservation: renewableReservation,
    });

    const result = await reservationRequestService(
        harness.prisma,
        createRenewEvent(),
    );

    assert.equal(result.outcome, "SUCCEEDED");
    assert.equal(harness.account.availableCredits, 40);
    assert.equal(harness.account.reservedCredits, 10);

    const requestCreateArgs = firstArgument<{
        data: Row;
    }>(harness.reservationRequest.create.mock.calls);

    assert.deepEqual(requestCreateArgs.data, {
        eventId: renewEventId,
        requestType: "RENEW",
        orderId,
        requesterId,
        amount: 10,
        previousReservationId,
        outcome: "PENDING",
    });

    const previousReservationArgs = firstArgument<{
        where: Row;
    }>(harness.creditReservation.findUnique.mock.calls);

    assert.deepEqual(previousReservationArgs, {
        where: { id: previousReservationId },
    });

    const outboxArgs = firstArgument<{
        data: Row;
    }>(harness.creditOutboxEvent.create.mock.calls);

    assert.equal(outboxArgs.data.eventType, "CREDIT_RESERVATION_SUCCEEDED");

    const payload = outboxArgs.data.payload as Row;
    assert.equal(payload.requestType, "RENEW");
    assert.equal(payload.reservationId, "reservation-1");
    assert.equal(payload.correlationId, renewEventId);
});

test("rejects RENEW when the previous reservation does not exist", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
        previousReservation: null,
    });

    const result = await reservationRequestService(
        harness.prisma,
        createRenewEvent(),
    );

    assert.equal(result.outcome, "FAILED");
    assert.equal(result.failureCode, "PREVIOUS_RESERVATION_NOT_FOUND");

    assert.equal(harness.creditAccount.findUnique.mock.calls.length, 0);
    assert.equal(harness.reservations.length, 0);
    assert.equal(harness.transactions.length, 0);
});

test("rejects RENEW when the previous reservation does not match", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
        previousReservation: {
            ...renewableReservation,
            orderId: "different-order",
        },
    });

    const result = await reservationRequestService(
        harness.prisma,
        createRenewEvent(),
    );

    assert.equal(result.outcome, "FAILED");
    assert.equal(result.failureCode, "PREVIOUS_RESERVATION_MISMATCH");

    assert.equal(harness.creditAccount.findUnique.mock.calls.length, 0);
    assert.equal(harness.reservations.length, 0);
    assert.equal(harness.transactions.length, 0);
});

test("rejects RENEW when the previous reservation is not renewable", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
        previousReservation: {
            ...renewableReservation,
            status: "RELEASED",
            settlementReason: "MANUAL",
        },
    });

    const result = await reservationRequestService(
        harness.prisma,
        createRenewEvent(),
    );

    assert.equal(result.outcome, "FAILED");
    assert.equal(result.failureCode, "PREVIOUS_RESERVATION_NOT_RENEWABLE");

    assert.equal(harness.creditAccount.findUnique.mock.calls.length, 0);
    assert.equal(harness.reservations.length, 0);
    assert.equal(harness.transactions.length, 0);
});

test("returns the existing result when the same CREATE request is replayed", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
    });

    const event = createEvent();

    const firstResult = await reservationRequestService(
        harness.prisma,
        event,
    );

    const secondResult = await reservationRequestService(
        harness.prisma,
        event,
    );

    assert.equal(firstResult.outcome, "SUCCEEDED");
    assert.equal(secondResult.outcome, "SUCCEEDED");

    assert.equal(harness.reservationRequest.create.mock.calls.length, 1);
    assert.equal(harness.creditReservation.create.mock.calls.length, 1);
    assert.equal(harness.creditTransaction.create.mock.calls.length, 1);
    assert.equal(harness.creditOutboxEvent.create.mock.calls.length, 1);

    assert.equal(harness.account.availableCredits, 40);
    assert.equal(harness.account.reservedCredits, 10);
});

test("returns the existing failed result when a failed request is replayed", async t => {
    const harness = useMockPrisma(t, {
        account: {
            ...defaultAccount,
            availableCredits: 5,
        },
        updateManyCount: 0,
    });

    const event = createEvent();

    const firstResult = await reservationRequestService(
        harness.prisma,
        event,
    );

    const secondResult = await reservationRequestService(
        harness.prisma,
        event,
    );

    assert.equal(firstResult.outcome, "FAILED");
    assert.equal(secondResult.outcome, "FAILED");
    assert.equal(secondResult.failureCode, "INSUFFICIENT_AVAILABLE_CREDITS");

    assert.equal(harness.reservationRequest.create.mock.calls.length, 1);
    assert.equal(harness.creditOutboxEvent.create.mock.calls.length, 1);
});

test("rejects reuse of an event ID with different request data", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
    });

    await reservationRequestService(
        harness.prisma,
        createEvent(),
    );

    await assert.rejects(
        reservationRequestService(
            harness.prisma,
            createEvent({ amount: 20 }),
        ),
        error => {
            assertAppError(
                error,
                "Reservation request event ID was reused with different data",
                409,
            );
            return true;
        },
    );

    assert.equal(harness.creditReservation.create.mock.calls.length, 1);
    assert.equal(harness.creditOutboxEvent.create.mock.calls.length, 1);
});

test("rejects reuse of a RENEW event ID with a different previous reservation", async t => {
    const harness = useMockPrisma(t, {
        account: defaultAccount,
        previousReservation: renewableReservation,
    });

    await reservationRequestService(
        harness.prisma,
        createRenewEvent(),
    );

    await assert.rejects(
        reservationRequestService(
            harness.prisma,
            createRenewEvent({
                previousReservationId: "different-reservation",
            }),
        ),
        error => {
            assertAppError(
                error,
                "Reservation request event ID was reused with different data",
                409,
            );
            return true;
        },
    );
});

test("returns the committed request after a P2002 race", async t => {
    const existingRequest: Row = {
        eventId,
        requestType: "CREATE",
        orderId,
        requesterId,
        amount: 10,
        previousReservationId: null,
        outcome: "SUCCEEDED",
    };

    const harness = useMockPrisma(t, {
        transactionError: createP2002Error(),
    });

    harness.requests.set(eventId, existingRequest);

    const result = await reservationRequestService(
        harness.prisma,
        createEvent(),
    );

    assert.deepEqual(result, existingRequest);
    assert.equal(harness.reservationRequest.create.mock.calls.length, 0);
});

test("rethrows a non-P2002 transaction error", async t => {
    const error = new Error("database failure");

    const harness = useMockPrisma(t, {
        transactionError: error,
    });

    await assert.rejects(
        reservationRequestService(
            harness.prisma,
            createEvent(),
        ),
        error,
    );

    assert.equal(
        harness.reservationRequest.findUnique.mock.calls.length,
        0,
    );
});