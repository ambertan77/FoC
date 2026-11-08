// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated startEmailChange, resendEmailChangeOtp, verifyEmailChange and getPendingEmailChange, mirroring the registration OTP flow (rate limits, expiry, lockout).
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { randomInt } from "node:crypto";
import argon2 from "argon2";
import {
  REGISTRATION_OTP_EXPIRES_IN_MINUTES,
  REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR,
  REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS,
} from "../constants/auth.constants.js";
import { AppError } from "../errors/errors.js";
import {
  Prisma,
  type PendingEmailChange,
  type Role,
} from "../generated/prisma/client.js";
import { sendEmailChangeOtpEmail } from "../libs/email.js";
import { prisma } from "../libs/prisma.js";
import type {
  ResendEmailChangeOtpInput,
  StartEmailChangeInput,
  VerifyEmailChangeInput,
} from "../schemas/user.schema.js";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;
const TRANSACTION_ATTEMPTS = 2;

const publicUserSelect = {
  userId: true,
  email: true,
  username: true,
  phoneNumber: true,
  role: true,
} as const;

function toPublicUser(user: {
  userId: string;
  email: string;
  username: string;
  phoneNumber: string;
  role: Role;
}) {
  return {
    id: user.userId,
    email: user.email,
    username: user.username,
    phoneNumber: user.phoneNumber,
    role: user.role,
  };
}

function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2034";
}

async function ensureNewEmailIsAvailable(
  userId: string,
  newEmail: string,
): Promise<void> {
  const currentUser = await prisma.user.findUnique({
    where: { userId },
    select: { email: true },
  });

  if (!currentUser) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  if (currentUser.email === newEmail) {
    throw new AppError(
      "This is already your current email address",
      400,
      "EMAIL_UNCHANGED",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { userId: true },
  });

  if (existingUser) {
    throw new AppError(
      "Email is already registered",
      409,
      "EMAIL_ALREADY_REGISTERED",
    );
  }
}

async function saveOtpRequest(
  userId: string,
  newEmail: string,
  otpHash: string,
  expiresAt: Date,
  pending?: PendingEmailChange,
): Promise<PendingEmailChange> {
  const windowStart = new Date(Date.now() - ONE_HOUR_IN_MS);

  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async tx => {
        const emailRequestCount = await tx.emailChangeOtpRequest.count({
          where: {
            email: newEmail,
            requestedAt: { gte: windowStart },
          },
        });
        const userRequestCount = await tx.emailChangeOtpRequest.count({
          where: {
            userId,
            requestedAt: { gte: windowStart },
          },
        });

        if (
          emailRequestCount >= REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR
          || userRequestCount >= REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR
        ) {
          throw new AppError(
            "Too many verification codes requested. Please try again later.",
            429,
            "OTP_REQUEST_LIMIT_EXCEEDED",
          );
        }

        const saved = pending
          ? await tx.pendingEmailChange.update({
              where: {
                challengeId: pending.challengeId,
                userId,
                newEmail,
                consumedAt: null,
              },
              data: {
                otpHash,
                expiresAt,
                failedAttempts: 0,
                emailSentAt: null,
              },
            })
          : await tx.pendingEmailChange.upsert({
              where: { userId },
              create: {
                userId,
                newEmail,
                otpHash,
                expiresAt,
              },
              update: {
                newEmail,
                otpHash,
                expiresAt,
                failedAttempts: 0,
                emailSentAt: null,
                consumedAt: null,
              },
            });

        await tx.emailChangeOtpRequest.create({
          data: {
            userId,
            email: newEmail,
          },
        });

        return saved;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2025"
      ) {
        throw new AppError(
          "Email change request is no longer active",
          409,
          "EMAIL_CHANGE_NOT_ACTIVE",
        );
      }

      if (!isTransactionConflict(error) || attempt === TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new AppError("Unable to issue verification code", 500);
}

async function issueOtp(
  userId: string,
  newEmail: string,
  pending?: PendingEmailChange,
) {
  const otp = randomInt(OTP_MIN, OTP_MAX).toString();
  const otpHash = await argon2.hash(otp);
  const expiresAt = new Date(
    Date.now() + REGISTRATION_OTP_EXPIRES_IN_MINUTES * 60 * 1000,
  );
  const saved = await saveOtpRequest(
    userId,
    newEmail,
    otpHash,
    expiresAt,
    pending,
  );

  await sendEmailChangeOtpEmail(newEmail, otp);

  const markedAsSent = await prisma.pendingEmailChange.updateMany({
    where: {
      challengeId: saved.challengeId,
      userId,
      newEmail,
      otpHash,
      consumedAt: null,
    },
    data: { emailSentAt: new Date() },
  });

  if (markedAsSent.count !== 1) {
    throw new AppError(
      "Email change request is no longer active",
      409,
      "EMAIL_CHANGE_NOT_ACTIVE",
    );
  }

  return {
    challengeId: saved.challengeId,
    expiresAt,
  };
}

export async function startEmailChange(
  userId: string,
  input: StartEmailChangeInput,
) {
  await ensureNewEmailIsAvailable(userId, input.email);
  return issueOtp(userId, input.email);
}

export async function resendEmailChangeOtp(
  userId: string,
  input: ResendEmailChangeOtpInput,
) {
  const pending = await prisma.pendingEmailChange.findFirst({
    where: {
      challengeId: input.challengeId,
      userId,
      consumedAt: null,
    },
  });

  if (!pending) {
    throw new AppError(
      "Email change request is no longer active",
      409,
      "EMAIL_CHANGE_NOT_ACTIVE",
    );
  }

  await ensureNewEmailIsAvailable(userId, pending.newEmail);
  return issueOtp(userId, pending.newEmail, pending);
}

export async function verifyEmailChange(
  userId: string,
  input: VerifyEmailChangeInput,
) {
  const pending = await prisma.pendingEmailChange.findFirst({
    where: {
      challengeId: input.challengeId,
      userId,
    },
  });

  if (
    !pending
    || pending.consumedAt
    || !pending.otpHash
    || !pending.emailSentAt
  ) {
    throw new AppError(
      "Email change request is no longer active",
      409,
      "EMAIL_CHANGE_NOT_ACTIVE",
    );
  }

  if (pending.expiresAt <= new Date()) {
    throw new AppError("Verification code has expired", 410, "OTP_EXPIRED");
  }

  if (pending.failedAttempts >= REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS) {
    throw new AppError(
      "Too many incorrect verification attempts. Request a new code.",
      429,
      "OTP_ATTEMPTS_EXCEEDED",
    );
  }

  const otpHash = pending.otpHash;
  const otpValid = await argon2.verify(otpHash, input.otp);

  if (!otpValid) {
    await prisma.pendingEmailChange.updateMany({
      where: {
        challengeId: pending.challengeId,
        userId,
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
    const user = await prisma.$transaction(async tx => {
      const consumed = await tx.pendingEmailChange.updateMany({
        where: {
          challengeId: pending.challengeId,
          userId,
          otpHash,
          consumedAt: null,
          expiresAt: { gt: verifiedAt },
          failedAttempts: { lt: REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS },
        },
        data: {
          consumedAt: verifiedAt,
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

      return tx.user.update({
        where: { userId },
        data: { email: pending.newEmail },
        select: publicUserSelect,
      });
    });

    return toPublicUser(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      throw new AppError(
        "Email is already registered",
        409,
        "EMAIL_ALREADY_REGISTERED",
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2025"
    ) {
      throw new AppError("User account not found", 404, "USER_NOT_FOUND");
    }

    throw error;
  }
}

export async function getPendingEmailChange(userId: string) {
  const pending = await prisma.pendingEmailChange.findFirst({
    where: {
      userId,
      consumedAt: null,
      emailSentAt: { not: null },
    },
    select: {
      challengeId: true,
      newEmail: true,
      expiresAt: true,
    },
  });

  if (!pending) {
    return null;
  }

  return {
    challengeId: pending.challengeId,
    email: pending.newEmail,
    expiresAt: pending.expiresAt,
  };
}
