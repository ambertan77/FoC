// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated activateAdmin: token-hash lookup, expiry and used checks, identity availability checks and transactional ADMIN user creation.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { createHash } from "node:crypto";
import argon2 from "argon2";
import { AppError } from "../errors/errors.js";
import { Prisma, Role } from "../generated/prisma/client.js";
import { prisma } from "../libs/prisma.js";
import type { AdminActivationInput } from "../schemas/auth.schema.js";

type ActivationIdentity = Pick<
  AdminActivationInput,
  "username" | "phoneNumber"
> & { email: string };

async function ensureIdentityIsAvailable(
  identity: ActivationIdentity,
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
    throw new AppError(
      "Email is already registered",
      409,
      "EMAIL_ALREADY_REGISTERED",
    );
  }

  if (user.username === identity.username) {
    throw new AppError("Username is already taken", 409, "USERNAME_TAKEN");
  }

  throw new AppError(
    "Phone number is already registered",
    409,
    "PHONE_NUMBER_TAKEN",
  );
}

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

export async function activateAdmin(input: AdminActivationInput) {
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const invitation = await prisma.adminInvitation.findUnique({
    where: { tokenHash },
    select: {
      invitationId: true,
      email: true,
      expiresAt: true,
    },
  });

  if (!invitation) {
    throw new AppError(
      "Administrator activation link is invalid or has already been used",
      400,
      "ADMIN_ACTIVATION_INVALID",
    );
  }

  const checkedAt = new Date();

  if (invitation.expiresAt <= checkedAt) {
    throw new AppError(
      "Administrator activation link has expired",
      410,
      "ADMIN_ACTIVATION_EXPIRED",
    );
  }

  const identity = {
    email: invitation.email,
    username: input.username,
    phoneNumber: input.phoneNumber,
  };

  await ensureIdentityIsAvailable(identity);
  const passwordHash = await argon2.hash(input.password);
  const activatedAt = new Date();

  if (invitation.expiresAt <= activatedAt) {
    throw new AppError(
      "Administrator activation link has expired",
      410,
      "ADMIN_ACTIVATION_EXPIRED",
    );
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.adminInvitation.deleteMany({
        where: {
          invitationId: invitation.invitationId,
          tokenHash,
          expiresAt: { gt: activatedAt },
        },
      });

      if (consumed.count !== 1) {
        throw new AppError(
          "Administrator activation link is no longer valid",
          409,
          "ADMIN_ACTIVATION_NO_LONGER_VALID",
        );
      }

      return tx.user.create({
        data: {
          email: invitation.email,
          username: input.username,
          phoneNumber: input.phoneNumber,
          password: passwordHash,
          role: Role.ADMIN,
        },
        select: {
          userId: true,
          email: true,
          username: true,
          phoneNumber: true,
          role: true,
        },
      });
    });

    return toPublicUser(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      await ensureIdentityIsAvailable(identity);

      throw new AppError(
        "Administrator account details are already in use",
        409,
        "ADMIN_ACTIVATION_CONFLICT",
      );
    }

    throw error;
  }
}
