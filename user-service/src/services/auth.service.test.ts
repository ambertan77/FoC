// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for loginUser and refreshAccessToken (unknown email, wrong password, revoked/expired/missing tokens, rotation, concurrent revocation) with mocked Prisma.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { AppError } from "../errors/errors.js";
import { verifyAccessToken } from "../libs/accessToken.js";
import { generateRefreshToken, verifyRefreshToken } from "../libs/refreshToken.js";

// Services import the prisma singleton directly, so swap the module before
// loading them. Each test replaces the methods it needs.
const asyncMock = () => mock.fn(async (..._args: unknown[]): Promise<unknown> => undefined);

const prisma = {
    user: { findUnique: asyncMock() },
    refreshToken: {
        findUnique: asyncMock(),
        updateMany: asyncMock(),
        create: asyncMock(),
    },
};

mock.module("../libs/prisma.js", { namedExports: { prisma } });

const { loginUser } = await import("./auth.service.js");
const { refreshAccessToken } = await import("./refresh.service.js");

const PASSWORD = "Str0ng!Pass";
const passwordHash = await argon2.hash(PASSWORD);

const MOCK_USER = {
    userId: "user_1",
    email: "alice@example.com",
    username: "alice123",
    phoneNumber: "+6591234567",
    password: passwordHash,
    role: "STUDENT" as const,
};

function unauthorized(code?: string) {
    return (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 401);
        if (code) assert.equal(error.code, code);
        return true;
    };
}

beforeEach(() => {
    mock.method(console, "log", () => {});
    prisma.user.findUnique = mock.fn(async () => MOCK_USER);
    prisma.refreshToken.updateMany = mock.fn(async () => ({ count: 1 }));
    prisma.refreshToken.create = mock.fn(async () => ({}));
});

test("loginUser rejects an unknown email", async () => {
    prisma.user.findUnique = mock.fn(async () => null);

    await assert.rejects(
        loginUser({ email: "nobody@example.com", password: PASSWORD }),
        unauthorized("INVALID_CREDENTIALS"),
    );
});

test("loginUser rejects a wrong password", async () => {
    await assert.rejects(
        loginUser({ email: MOCK_USER.email, password: "Wr0ng!Pass" }),
        unauthorized("INVALID_CREDENTIALS"),
    );
    assert.equal(prisma.refreshToken.create.mock.callCount(), 0);
});

test("loginUser issues tokens and stores the refresh token", async () => {
    const result = await loginUser({ email: MOCK_USER.email, password: PASSWORD });

    assert.deepEqual(verifyAccessToken(result.accessToken), {
        userId: MOCK_USER.userId,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
    });
    assert.equal(result.user.id, MOCK_USER.userId);
    assert.equal("password" in result.user, false);

    const [args] = prisma.refreshToken.create.mock.calls[0]!.arguments as [
        { data: { tokenId: string; tokenHash: string; userId: string } },
    ];
    assert.equal(args.data.tokenId, verifyRefreshToken(result.refreshToken).jti);
    assert.equal(args.data.userId, MOCK_USER.userId);
    assert.ok(await argon2.verify(args.data.tokenHash, result.refreshToken));
});

async function storedTokenFor(
    refreshToken: string,
    tokenId: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        tokenId,
        tokenHash: await argon2.hash(refreshToken),
        userId: MOCK_USER.userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: MOCK_USER,
        ...overrides,
    };
}

test("refreshAccessToken rejects a revoked token (reuse)", async () => {
    const { refreshToken, tokenId } = generateRefreshToken(MOCK_USER.userId);
    const stored = await storedTokenFor(refreshToken, tokenId, { revokedAt: new Date() });
    prisma.refreshToken.findUnique = mock.fn(async () => stored);

    await assert.rejects(refreshAccessToken(refreshToken), unauthorized());
    assert.equal(prisma.refreshToken.create.mock.callCount(), 0);
});

test("refreshAccessToken rejects an expired token", async () => {
    const { refreshToken, tokenId } = generateRefreshToken(MOCK_USER.userId);
    const stored = await storedTokenFor(refreshToken, tokenId, {
        expiresAt: new Date(Date.now() - 1000),
    });
    prisma.refreshToken.findUnique = mock.fn(async () => stored);

    await assert.rejects(refreshAccessToken(refreshToken), unauthorized());
});

test("refreshAccessToken rejects a token missing from the database", async () => {
    const { refreshToken } = generateRefreshToken(MOCK_USER.userId);
    prisma.refreshToken.findUnique = mock.fn(async () => null);

    await assert.rejects(refreshAccessToken(refreshToken), unauthorized());
});

test("refreshAccessToken rotates the refresh token", async () => {
    const { refreshToken, tokenId } = generateRefreshToken(MOCK_USER.userId);
    const stored = await storedTokenFor(refreshToken, tokenId);
    prisma.refreshToken.findUnique = mock.fn(async () => stored);

    const result = await refreshAccessToken(refreshToken);

    const [revokeArgs] = prisma.refreshToken.updateMany.mock.calls[0]!.arguments as [
        { where: { tokenId: string; revokedAt: null } },
    ];
    assert.deepEqual(revokeArgs.where, { tokenId, revokedAt: null });

    const newJti = verifyRefreshToken(result.refreshToken).jti;
    assert.notEqual(newJti, tokenId);
    const [createArgs] = prisma.refreshToken.create.mock.calls[0]!.arguments as [
        { data: { tokenId: string } },
    ];
    assert.equal(createArgs.data.tokenId, newJti);
    assert.equal(verifyAccessToken(result.accessToken).userId, MOCK_USER.userId);
});

test("refreshAccessToken rejects when a concurrent request already revoked it", async () => {
    const { refreshToken, tokenId } = generateRefreshToken(MOCK_USER.userId);
    const stored = await storedTokenFor(refreshToken, tokenId);
    prisma.refreshToken.findUnique = mock.fn(async () => stored);
    prisma.refreshToken.updateMany = mock.fn(async () => ({ count: 0 }));

    await assert.rejects(refreshAccessToken(refreshToken), unauthorized());
    assert.equal(prisma.refreshToken.create.mock.callCount(), 0);
});
