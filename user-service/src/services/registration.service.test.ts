// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for verifyRegistration (consumed challenge, expiry, lockout, wrong code, outbox event, concurrent consumption) with mocked Prisma.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { AppError } from "../errors/errors.js";
import { REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS } from "../constants/auth.constants.js";

const asyncMock = () => mock.fn(async (..._args: unknown[]): Promise<unknown> => undefined);

// Interactive transactions run against the same fake client.
const prisma = {
  pendingRegistration: {
    findUnique: asyncMock(),
    updateMany: asyncMock(),
  },
  user: { create: asyncMock() },
  outboxEvent: { create: asyncMock() },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
};

mock.module("../libs/prisma.js", { namedExports: { prisma } });

const { verifyRegistration } = await import("./registration.service.js");

const OTP = "123456";
const CHALLENGE_ID = "8f14e45f-ceea-4e7a-9b1d-3c2a1f0e5d6b";
const otpHash = await argon2.hash(OTP);

function pendingRegistration(overrides: Record<string, unknown> = {}) {
  return {
    challengeId: CHALLENGE_ID,
    email: "alice@example.com",
    username: "alice123",
    phoneNumber: "+6591234567",
    passwordHash: "hashed-password",
    otpHash,
    expiresAt: new Date(Date.now() + 60_000),
    emailSentAt: new Date(),
    failedAttempts: 0,
    consumedAt: null,
    ...overrides,
  };
}

function hasError(statusCode: number, code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  };
}

beforeEach(() => {
  prisma.pendingRegistration.findUnique = mock.fn(async () => pendingRegistration());
  prisma.pendingRegistration.updateMany = mock.fn(async () => ({ count: 1 }));
  prisma.user.create = mock.fn(async (args: unknown) => {
    const { data } = args as { data: Record<string, unknown> };
    return {
      userId: "user_1",
      email: data.email,
      username: data.username,
      phoneNumber: data.phoneNumber,
      role: data.role,
    };
  });
  prisma.outboxEvent.create = mock.fn(async () => ({}));
});

test("verifyRegistration rejects an unknown or consumed challenge", async () => {
  prisma.pendingRegistration.findUnique = mock.fn(async () =>
    pendingRegistration({ consumedAt: new Date() }));

  await assert.rejects(
    verifyRegistration({ challengeId: CHALLENGE_ID, otp: OTP }),
    hasError(409, "REGISTRATION_NOT_ACTIVE"),
  );
});

test("verifyRegistration rejects an expired code", async () => {
  prisma.pendingRegistration.findUnique = mock.fn(async () =>
    pendingRegistration({ expiresAt: new Date(Date.now() - 1000) }));

  await assert.rejects(
    verifyRegistration({ challengeId: CHALLENGE_ID, otp: OTP }),
    hasError(410, "OTP_EXPIRED"),
  );
});

test("verifyRegistration locks out after too many failed attempts", async () => {
  prisma.pendingRegistration.findUnique = mock.fn(async () =>
    pendingRegistration({ failedAttempts: REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS }));

  await assert.rejects(
    verifyRegistration({ challengeId: CHALLENGE_ID, otp: OTP }),
    hasError(429, "OTP_ATTEMPTS_EXCEEDED"),
  );
});

test("verifyRegistration counts a wrong code as a failed attempt", async () => {
  await assert.rejects(
    verifyRegistration({ challengeId: CHALLENGE_ID, otp: "654321" }),
    hasError(400, "INVALID_OTP"),
  );

  const [args] = prisma.pendingRegistration.updateMany.mock.calls[0]!.arguments as [
    { data: unknown },
  ];
  assert.deepEqual(args.data, { failedAttempts: { increment: 1 } });
  assert.equal(prisma.user.create.mock.callCount(), 0);
});

test("verifyRegistration creates a student and a USER_REGISTERED outbox event", async () => {
  const user = await verifyRegistration({ challengeId: CHALLENGE_ID, otp: OTP });

  assert.deepEqual(user, {
    id: "user_1",
    email: "alice@example.com",
    username: "alice123",
    phoneNumber: "+6591234567",
    role: "STUDENT",
  });

  const [userArgs] = prisma.user.create.mock.calls[0]!.arguments as [
    { data: { password: string; role: string } },
  ];
  assert.equal(userArgs.data.password, "hashed-password");
  assert.equal(userArgs.data.role, "STUDENT");

  // credit-service consumes this payload to provision starting credits.
  const [eventArgs] = prisma.outboxEvent.create.mock.calls[0]!.arguments as [
    { data: { eventId: string; payload: Record<string, unknown> } },
  ];
  const { payload } = eventArgs.data;
  assert.equal(payload.eventId, eventArgs.data.eventId);
  assert.equal(payload.eventType, "USER_REGISTERED");
  assert.equal(payload.eventVersion, 1);
  assert.equal(payload.userId, "user_1");
  assert.equal(payload.role, "STUDENT");
  assert.ok(!Number.isNaN(Date.parse(payload.occurredAt as string)));
});

test("verifyRegistration does not create a user if the code was consumed concurrently", async () => {
  // First updateMany call is the consume step inside the transaction.
  prisma.pendingRegistration.updateMany = mock.fn(async () => ({ count: 0 }));

  await assert.rejects(
    verifyRegistration({ challengeId: CHALLENGE_ID, otp: OTP }),
    hasError(409, "OTP_NO_LONGER_VALID"),
  );
  assert.equal(prisma.user.create.mock.callCount(), 0);
  assert.equal(prisma.outboxEvent.create.mock.callCount(), 0);
});
