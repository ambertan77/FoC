// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated createAdminInvitation: hashed 32-byte token, activation URL, resend cooldown, already-registered check and cleanup when the email fails to send.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { createHash, randomBytes } from "node:crypto";
import config from "../config/config.js";
import {
  ADMIN_INVITATION_EXPIRES_IN_HOURS,
  ADMIN_INVITATION_RESEND_COOLDOWN_SECONDS,
} from "../constants/auth.constants.js";
import { AppError } from "../errors/errors.js";
import { Prisma } from "../generated/prisma/client.js";
import { sendAdminInvitationEmail } from "../libs/email.js";
import { prisma } from "../libs/prisma.js";
import type { CreateAdminInvitationInput } from "../schemas/user.schema.js";

const TOKEN_BYTES = 32;

function createActivationUrl(token: string): string {
  const activationUrl = new URL("/activate-admin", config.frontendUrl);
  activationUrl.hash = new URLSearchParams({ token }).toString();
  return activationUrl.toString();
}

function throwCooldownError(): never {
  throw new AppError(
    "An invitation was sent recently. Please wait before sending another.",
    429,
    "ADMIN_INVITATION_COOLDOWN",
  );
}

async function ensureEmailIsNotRegistered(email: string): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
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

export async function createAdminInvitation(
  input: CreateAdminInvitationInput,
): Promise<void> {
  await ensureEmailIsNotRegistered(input.email);

  const now = new Date();
  const cooldownCutoff = new Date(
    now.getTime() - ADMIN_INVITATION_RESEND_COOLDOWN_SECONDS * 1000,
  );
  const expiresAt = new Date(
    now.getTime() + ADMIN_INVITATION_EXPIRES_IN_HOURS * 60 * 60 * 1000,
  );
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const existingInvitation = await prisma.adminInvitation.findUnique({
    where: { email: input.email },
    select: { updatedAt: true },
  });

  try {
    if (existingInvitation) {
      const replacement = await prisma.adminInvitation.updateMany({
        where: {
          email: input.email,
          updatedAt: { lte: cooldownCutoff },
        },
        data: {
          tokenHash,
          expiresAt,
          updatedAt: now,
        },
      });

      if (replacement.count !== 1) {
        throwCooldownError();
      }
    } else {
      await prisma.adminInvitation.create({
        data: {
          email: input.email,
          tokenHash,
          expiresAt,
          updatedAt: now,
        },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const concurrentInvitation = await prisma.adminInvitation.findUnique({
        where: { email: input.email },
        select: { invitationId: true },
      });

      if (concurrentInvitation) {
        throwCooldownError();
      }
    }

    throw error;
  }

  try {
    await sendAdminInvitationEmail(input.email, createActivationUrl(token));
  } catch (error) {
    await prisma.adminInvitation.deleteMany({
      where: {
        email: input.email,
        tokenHash,
      },
    });

    throw error;
  }
}
