// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for listUsersQuerySchema defaults and bounds, updateMyProfileSchema and updateUserRoleSchema.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test from "node:test";
import assert from "node:assert/strict";
import {
  listUsersQuerySchema,
  updateMyProfileSchema,
  updateUserRoleSchema,
} from "./user.schema.js";

test("listUsersQuerySchema applies pagination defaults", () => {
  const result = listUsersQuerySchema.parse({});

  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.equal(result.search, undefined);
});

test("listUsersQuerySchema parses numeric query strings", () => {
  const result = listUsersQuerySchema.parse({ page: "3", pageSize: "50" });

  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 50);
});

test("listUsersQuerySchema rejects out-of-range pagination", () => {
  assert.equal(listUsersQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(listUsersQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(listUsersQuerySchema.safeParse({ page: "-1" }).success, false);
});

test("updateMyProfileSchema requires at least one field", () => {
  assert.equal(updateMyProfileSchema.safeParse({}).success, false);
  assert.equal(updateMyProfileSchema.safeParse({ username: "bob123" }).success, true);
});

test("updateUserRoleSchema only allows promotion to ADMIN", () => {
  assert.equal(updateUserRoleSchema.safeParse({ role: "ADMIN" }).success, true);
  assert.equal(updateUserRoleSchema.safeParse({ role: "STUDENT" }).success, false);
});
