// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for registerSchema normalisation, weak passwords, invalid usernames, non-Singapore numbers, unknown fields and the verify payload.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test from "node:test";
import assert from "node:assert/strict";
import {
  registerSchema,
  verifyRegistrationSchema,
} from "./register.schema.js";

const validRegisterInput = {
  username: "alice123",
  email: "  Alice@Example.COM ",
  phoneNumber: "9123 4567",
  password: "Str0ng!Pass",
};

test("registerSchema accepts a valid payload and normalises email and phone", () => {
  const result = registerSchema.parse(validRegisterInput);

  assert.equal(result.email, "alice@example.com");
  assert.equal(result.phoneNumber, "+6591234567");
});

test("registerSchema keeps an already prefixed Singapore number", () => {
  const result = registerSchema.parse({
    ...validRegisterInput,
    phoneNumber: "+6581234567",
  });

  assert.equal(result.phoneNumber, "+6581234567");
});

test("registerSchema rejects weak passwords", () => {
  for (const password of ["Sh0rt!", "str0ng!pass", "Strong!Pass", "Str0ngPass"]) {
    const result = registerSchema.safeParse({ ...validRegisterInput, password });
    assert.equal(result.success, false, `expected "${password}" to be rejected`);
  }
});

test("registerSchema rejects invalid usernames", () => {
  for (const username of ["ab", "alice_123", "a".repeat(31)]) {
    const result = registerSchema.safeParse({ ...validRegisterInput, username });
    assert.equal(result.success, false, `expected "${username}" to be rejected`);
  }
});

test("registerSchema rejects non-Singapore mobile numbers", () => {
  for (const phoneNumber of ["71234567", "912345678", "+6091234567"]) {
    const result = registerSchema.safeParse({ ...validRegisterInput, phoneNumber });
    assert.equal(result.success, false, `expected "${phoneNumber}" to be rejected`);
  }
});

test("registerSchema rejects unknown fields", () => {
  const result = registerSchema.safeParse({
    ...validRegisterInput,
    role: "ADMIN",
  });

  assert.equal(result.success, false);
});

test("verifyRegistrationSchema requires a UUID challenge and a 6-digit OTP", () => {
  const challengeId = "8f14e45f-ceea-4e7a-9b1d-3c2a1f0e5d6b";

  assert.equal(
    verifyRegistrationSchema.safeParse({ challengeId, otp: "123456" }).success,
    true,
  );
  assert.equal(
    verifyRegistrationSchema.safeParse({ challengeId, otp: "12345" }).success,
    false,
  );
  assert.equal(
    verifyRegistrationSchema.safeParse({ challengeId, otp: "12345a" }).success,
    false,
  );
  assert.equal(
    verifyRegistrationSchema.safeParse({ challengeId: "abc", otp: "123456" }).success,
    false,
  );
});
