// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for access/refresh token round-trips and rejection of tampered, wrong-key and unknown-role tokens.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { generateAccessToken, verifyAccessToken } from "./accessToken.js";
import { generateRefreshToken, verifyRefreshToken } from "./refreshToken.js";
import { AppError } from "../errors/errors.js";

const payload = {
    userId: "user_1",
    email: "alice@example.com",
    role: "STUDENT" as const,
};

function assertUnauthorized(error: unknown) {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
    return true;
}

test("access token round-trips its payload", () => {
    const token = generateAccessToken(payload);

    assert.deepEqual(verifyAccessToken(token), payload);
});

test("verifyAccessToken rejects a tampered token", () => {
    const [header, , signature] = generateAccessToken(payload).split(".");
    const forgedBody = Buffer.from(
        JSON.stringify({ ...payload, role: "ADMIN" }),
    ).toString("base64url");

    assert.throws(
        () => verifyAccessToken(`${header}.${forgedBody}.${signature}`),
        assertUnauthorized,
    );
});

test("verifyAccessToken rejects an HS256 token signed with the refresh key", () => {
    const token = jwt.sign(payload, process.env.JWT_REFRESH_TOKEN_KEY!, {
        algorithm: "HS256",
    });

    assert.throws(() => verifyAccessToken(token), assertUnauthorized);
});

test("verifyAccessToken rejects a token with an unknown role", () => {
    const token = generateAccessToken({ ...payload, role: "SUPERUSER" as never });

    assert.throws(() => verifyAccessToken(token), assertUnauthorized);
});

test("refresh token round-trips userId and jti", () => {
    const { refreshToken, tokenId } = generateRefreshToken("user_1");

    assert.deepEqual(verifyRefreshToken(refreshToken), {
        userId: "user_1",
        jti: tokenId,
    });
});

test("verifyRefreshToken rejects garbage and access tokens", () => {
    assert.throws(() => verifyRefreshToken("not-a-jwt"), assertUnauthorized);
    assert.throws(
        () => verifyRefreshToken(generateAccessToken(payload)),
        assertUnauthorized,
    );
});
