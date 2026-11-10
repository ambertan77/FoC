// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated listUsers, promoteUserToAdmin, getMyProfile, updateMyProfile and changePassword, including uniqueness checks and P2002 conflict handling.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import argon2 from "argon2";
import {
  Prisma,
  type PrismaClient,
  type Role,
} from "../generated/prisma/client.js";
import { REFRESH_TOKEN_MAX_AGE } from "../constants/auth.constants.js";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { generateRefreshToken } from "../libs/refreshToken.js";
import type {
  ChangePasswordInput,
  ListUsersQuery,
  UpdateMyProfileInput,
} from "../schemas/user.schema.js";
import { logger } from "../libs/logger.js";

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

export async function listUsers(
  input: ListUsersQuery,
  db: PrismaClient = prisma,
) {
  const where: Prisma.UserWhereInput = {};

  if (input.search) {
    where.OR = [
      { username: { contains: input.search, mode: "insensitive" } },
      { email: { contains: input.search, mode: "insensitive" } },
    ];
  }

  if (input.role) {
    where.role = input.role;
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return {
    users: users.map(toPublicUser),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function promoteUserToAdmin(
  actorId: string,
  targetUserId: string,
) {
  const target = await prisma.user.findUnique({
    where: { userId: targetUserId },
    select: publicUserSelect,
  });

  if (!target) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  if (target.role === "ADMIN") {
    throw new AppError(
      "The user is already an admin",
      409,
      "USER_ALREADY_ADMIN",
    );
  }

  // TODO(F6.3.2): Check requester history once Order Service is implemented.
  const updateResult = await prisma.user.updateMany({
    where: {
      userId: targetUserId,
      role: "STUDENT",
    },
    data: { role: "ADMIN" },
  });

  if (updateResult.count !== 1) {
    throw new AppError(
      "The user's role could not be updated",
      409,
      "ROLE_UPDATE_CONFLICT",
    );
  }

  const updatedUser = await prisma.user.findUnique({
    where: { userId: targetUserId },
    select: publicUserSelect,
  });

  if (!updatedUser) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  logger.info({
    actorId,
    targetUserId,
    previousRole: "STUDENT",
    newRole: "ADMIN",
  }, "Administrative user role changed");

  return toPublicUser(updatedUser);
}

async function ensureProfileValuesAreAvailable(
  userId: string,
  input: UpdateMyProfileInput,
) {
  const conflicts = await prisma.user.findFirst({
    where: {
      userId: { not: userId },
      OR: [
        ...(input.username ? [{ username: input.username }] : []),
        ...(input.phoneNumber ? [{ phoneNumber: input.phoneNumber }] : []),
      ],
    },
    select: {
      username: true,
      phoneNumber: true,
    },
  });

  if (conflicts?.username === input.username) {
    throw new AppError("Username is already taken", 409, "USERNAME_TAKEN");
  }

  if (conflicts?.phoneNumber === input.phoneNumber) {
    throw new AppError(
      "Phone number is already registered",
      409,
      "PHONE_NUMBER_TAKEN",
    );
  }
}

export async function getMyProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  return toPublicUser(user);
}

export async function updateMyProfile(
  userId: string,
  input: UpdateMyProfileInput,
) {
  await ensureProfileValuesAreAvailable(userId, input);

  const data: Prisma.UserUpdateInput = {};

  if (input.username !== undefined) {
    data.username = input.username;
  }

  if (input.phoneNumber !== undefined) {
    data.phoneNumber = input.phoneNumber;
  }

  try {
    const user = await prisma.user.update({
      where: { userId },
      data,
      select: publicUserSelect,
    });

    return toPublicUser(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2025"
    ) {
      throw new AppError("User account not found", 404, "USER_NOT_FOUND");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      await ensureProfileValuesAreAvailable(userId, input);
      throw new AppError("Profile details are already in use", 409, "PROFILE_CONFLICT");
    }

    throw error;
  }
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { password: true },
  });

  if (!user) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  const currentPasswordValid = await argon2.verify(
    user.password,
    input.currentPassword,
  );

  if (!currentPasswordValid) {
    throw new AppError(
      "Current password is incorrect",
      401,
      "INVALID_CURRENT_PASSWORD",
    );
  }

  if (input.currentPassword === input.newPassword) {
    throw new AppError(
      "New password must be different from your current password",
      400,
      "PASSWORD_UNCHANGED",
    );
  }

  const passwordHash = await argon2.hash(input.newPassword);
  const { refreshToken, tokenId } = generateRefreshToken(userId);
  const tokenHash = await argon2.hash(refreshToken);
  const changedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { userId },
      data: { password: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: changedAt },
    }),
    prisma.refreshToken.create({
      data: {
        tokenId,
        tokenHash,
        userId,
        expiresAt: new Date(changedAt.getTime() + REFRESH_TOKEN_MAX_AGE),
      },
    }),
  ]);

  return { refreshToken };
}


export async function getUserByIdService(
  userId: string
) {
  return prisma.user.findUnique({
    where: {
      userId: userId,
    },
    select: {
      userId: true,
      username: true,
      email: true,
      phoneNumber: true,
    },
  });
}