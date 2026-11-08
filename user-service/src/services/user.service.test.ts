// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for promoteUserToAdmin and changePassword edge cases with mocked Prisma.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { AppError } from "../errors/errors.js";

const asyncMock = () => mock.fn(async (..._args: unknown[]): Promise<unknown> => undefined);

const prisma = {
  user: {
    findUnique: asyncMock(),
    updateMany: asyncMock(),
  },
};

mock.module("../libs/prisma.js", { namedExports: { prisma } });

const { changePassword, promoteUserToAdmin } = await import("./user.service.js");

const STUDENT = {
  userId: "user_2",
  email: "bob@example.com",
  username: "bob123",
  phoneNumber: "+6581234567",
  role: "STUDENT" as const,
};

const CURRENT_PASSWORD = "Str0ng!Pass";
const currentPasswordHash = await argon2.hash(CURRENT_PASSWORD);

function hasError(statusCode: number, code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  };
}

beforeEach(() => {
  mock.method(console, "info", () => {});
  prisma.user.updateMany = mock.fn(async () => ({ count: 1 }));
});

test("promoteUserToAdmin rejects a missing user", async () => {
  prisma.user.findUnique = mock.fn(async () => null);

  await assert.rejects(
    promoteUserToAdmin("admin_1", STUDENT.userId),
    hasError(404, "USER_NOT_FOUND"),
  );
});

test("promoteUserToAdmin rejects a user who is already an admin", async () => {
  prisma.user.findUnique = mock.fn(async () => ({ ...STUDENT, role: "ADMIN" }));

  await assert.rejects(
    promoteUserToAdmin("admin_1", STUDENT.userId),
    hasError(409, "USER_ALREADY_ADMIN"),
  );
  assert.equal(prisma.user.updateMany.mock.callCount(), 0);
});

test("promoteUserToAdmin promotes only a current student", async () => {
  let reads = 0;
  prisma.user.findUnique = mock.fn(async () =>
    reads++ === 0 ? STUDENT : { ...STUDENT, role: "ADMIN" });

  const result = await promoteUserToAdmin("admin_1", STUDENT.userId);

  assert.equal(result.role, "ADMIN");
  const [args] = prisma.user.updateMany.mock.calls[0]!.arguments as [
    { where: unknown; data: unknown },
  ];
  assert.deepEqual(args.where, { userId: STUDENT.userId, role: "STUDENT" });
  assert.deepEqual(args.data, { role: "ADMIN" });
});

test("changePassword rejects an incorrect current password", async () => {
  prisma.user.findUnique = mock.fn(async () => ({ password: currentPasswordHash }));

  await assert.rejects(
    changePassword(STUDENT.userId, {
      currentPassword: "Wr0ng!Pass",
      newPassword: "N3w!Password",
    }),
    hasError(401, "INVALID_CURRENT_PASSWORD"),
  );
});

test("changePassword rejects reusing the current password", async () => {
  prisma.user.findUnique = mock.fn(async () => ({ password: currentPasswordHash }));

  await assert.rejects(
    changePassword(STUDENT.userId, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: CURRENT_PASSWORD,
    }),
    hasError(400, "PASSWORD_UNCHANGED"),
  );
});
