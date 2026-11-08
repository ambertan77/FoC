// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated startRegistration, resendRegistrationOtp and verifyRegistration: hashed OTPs, hourly request limits, failed-attempt lockout, transaction-conflict retry and outbox event creation.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { randomInt, randomUUID } from "node:crypto";
import argon2 from "argon2";
import {
  REGISTRATION_OTP_EXPIRES_IN_MINUTES,
  REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR,
  REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS,
} from "../constants/auth.constants.js";
import { AppError } from "../errors/errors.js";
import {
  Prisma,
  Role,
  type PendingRegistration,
} from "../generated/prisma/client.js";
import { sendRegistrationOtpEmail } from "../libs/email.js";
import { prisma } from "../libs/prisma.js";
import type {
  RegisterInput,
  ResendRegistrationOtpInput,
  VerifyRegistrationInput,
} from "../schemas/register.schema.js";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;
const TRANSACTION_ATTEMPTS = 2;

type OtpRequest =
  | {
      kind: "initial";
      input: RegisterInput;
      passwordHash: string;
    }
  | {
      kind: "resend";
      pending: PendingRegistration;
    };

async function ensureIdentityIsAvailable(
  identity: Pick<RegisterInput, "email" | "username" | "phoneNumber">,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identity.email },
        { username: identity.username },
        { phoneNumber: identity.phoneNumber },
      ],
    },
    select: {
      email: true,
      username: true,
      phoneNumber: true,
    },
  });

  if (!user) {
    return;
  }

  if (user.email === identity.email) {
    throw new AppError("Email is already registered", 409, "EMAIL_ALREADY_REGISTERED");
  }

  if (user.username === identity.username) {
    throw new AppError("Username is already taken", 409, "USERNAME_TAKEN");
  }

  throw new AppError("Phone number is already registered", 409, "PHONE_NUMBER_TAKEN");
}

function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2034";
}

async function saveOtpRequest(
  request: OtpRequest,
  otpHash: string,
  expiresAt: Date,
): Promise<PendingRegistration> {
  const email = request.kind === "initial"
    ? request.input.email
    : request.pending.email;
  const windowStart = new Date(Date.now() - ONE_HOUR_IN_MS);

  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const requestCount = await tx.registrationOtpRequest.count({
          where: {
            email,
            requestedAt: { gte: windowStart },
          },
        });

        if (requestCount >= REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR) {
          throw new AppError(
            "Too many verification codes requested. Please try again later.",
            429,
            "OTP_REQUEST_LIMIT_EXCEEDED",
          );
        }

        const pending = request.kind === "initial"
          ? await tx.pendingRegistration.upsert({
              where: { email },
              create: {
                email,
                username: request.input.username,
                phoneNumber: request.input.phoneNumber,
                passwordHash: request.passwordHash,
                otpHash,
                expiresAt,
              },
              update: {
                username: request.input.username,
                phoneNumber: request.input.phoneNumber,
                passwordHash: request.passwordHash,
                otpHash,
                expiresAt,
                failedAttempts: 0,
                emailSentAt: null,
                consumedAt: null,
              },
            })
          : await tx.pendingRegistration.update({
              where: {
                challengeId: request.pending.challengeId,
                consumedAt: null,
              },
              data: {
                otpHash,
                expiresAt,
                failedAttempts: 0,
                emailSentAt: null,
              },
            });

        await tx.registrationOtpRequest.create({
          data: { email },
        });

        return pending;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new AppError("Unable to issue verification code", 500);
}

async function issueOtp(request: OtpRequest) {
  const email = request.kind === "initial"
    ? request.input.email
    : request.pending.email;
  const otp = randomInt(OTP_MIN, OTP_MAX).toString();
  const otpHash = await argon2.hash(otp);
  const expiresAt = new Date(
    Date.now() + REGISTRATION_OTP_EXPIRES_IN_MINUTES * 60 * 1000,
  );
  const pending = await saveOtpRequest(request, otpHash, expiresAt);

  await sendRegistrationOtpEmail(email, otp);

  await prisma.pendingRegistration.updateMany({
    where: {
      challengeId: pending.challengeId,
      otpHash,
      consumedAt: null,
    },
    data: { emailSentAt: new Date() },
  });

  return {
    challengeId: pending.challengeId,
    expiresAt,
  };
}

export async function startRegistration(input: RegisterInput) {
  await ensureIdentityIsAvailable(input);
  const passwordHash = await argon2.hash(input.password);

  return issueOtp({
    kind: "initial",
    input,
    passwordHash,
  });
}

export async function resendRegistrationOtp(
  input: ResendRegistrationOtpInput,
) {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { challengeId: input.challengeId },
  });

  if (!pending || pending.consumedAt || !pending.passwordHash) {
    throw new AppError(
      "Registration request is no longer active",
      409,
      "REGISTRATION_NOT_ACTIVE",
    );
  }

  await ensureIdentityIsAvailable(pending);

  return issueOtp({ kind: "resend", pending });
}

export async function verifyRegistration(input: VerifyRegistrationInput) {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { challengeId: input.challengeId },
  });

  if (!pending
    || pending.consumedAt
    || !pending.passwordHash
    || !pending.otpHash
    || !pending.emailSentAt) {
    throw new AppError(
      "Registration request is no longer active",
      409,
      "REGISTRATION_NOT_ACTIVE",
    );
  }

  if (pending.expiresAt <= new Date()) {
    throw new AppError(
      "Verification code has expired",
      410,
      "OTP_EXPIRED",
    );
  }

  if (pending.failedAttempts >= REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS) {
    throw new AppError(
      "Too many incorrect verification attempts. Request a new code.",
      429,
      "OTP_ATTEMPTS_EXCEEDED",
    );
  }

  const passwordHash = pending.passwordHash;
  const otpHash = pending.otpHash;
  const otpValid = await argon2.verify(otpHash, input.otp);

  if (!otpValid) {
    await prisma.pendingRegistration.updateMany({
      where: {
        challengeId: pending.challengeId,
        otpHash,
        consumedAt: null,
        failedAttempts: { lt: REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS },
      },
      data: {
        failedAttempts: { increment: 1 },
      },
    });

    throw new AppError("Invalid verification code", 400, "INVALID_OTP");
  }

  const verifiedAt = new Date();

  try {
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.pendingRegistration.updateMany({
        where: {
          challengeId: pending.challengeId,
          otpHash,
          consumedAt: null,
          expiresAt: { gt: verifiedAt },
          failedAttempts: { lt: REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS },
        },
        data: {
          consumedAt: verifiedAt,
          passwordHash: null,
          otpHash: null,
        },
      });

      if (consumed.count !== 1) {
        throw new AppError(
          "Verification code is no longer valid",
          409,
          "OTP_NO_LONGER_VALID",
        );
      }

      const user = await tx.user.create({
        data: {
          email: pending.email,
          username: pending.username,
          phoneNumber: pending.phoneNumber,
          password: passwordHash,
          role: Role.STUDENT,
        },
        select: {
          userId: true,
          email: true,
          username: true,
          phoneNumber: true,
          role: true,
        },
      });

      const eventId = randomUUID();
      const occurredAt = new Date();
      // Persist the exact event once, atomically with OTP consumption and user
      // creation. Broker publication happens later, outside this transaction.
      await tx.outboxEvent.create({
        data: {
          eventId,
          payload: {
            eventId,
            eventType: "USER_REGISTERED",
            eventVersion: 1,
            occurredAt: occurredAt.toISOString(),
            userId: user.userId,
            role: Role.STUDENT,
          },
          createdAt: occurredAt,
          nextAttemptAt: occurredAt,
        },
      });

      return user;
    });

    return {
      id: user.userId,
      email: user.email,
      username: user.username,
      phoneNumber: user.phoneNumber,
      role: user.role,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
      && error.meta?.modelName === "User") {
      await ensureIdentityIsAvailable(pending);

      throw new AppError(
        "Registration details are already in use",
        409,
        "REGISTRATION_CONFLICT",
      );
    }

    throw error;
  }
}
