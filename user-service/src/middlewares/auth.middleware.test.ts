// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated unit tests for authenticate, authorize role enforcement and errorHandler mapping.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { authenticate } from "./auth.middleware.js";
import { authorize } from "./authorize.middleware.js";
import { errorHandler } from "./error.middleware.js";
import { generateAccessToken } from "../libs/accessToken.js";
import { AppError } from "../errors/errors.js";
import { Role } from "../generated/prisma/client.js";
import type { AuthenticatedRequest } from "../types/auth.types.js";

const res = {} as Response;

function requestWith(fields: Partial<AuthenticatedRequest>) {
    return { headers: {}, ...fields } as AuthenticatedRequest;
}

function hasStatus(statusCode: number, code?: string) {
    return (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, statusCode);
        if (code) assert.equal(error.code, code);
        return true;
    };
}

test("authenticate rejects a missing or non-Bearer header", () => {
    const next = mock.fn();

    for (const authorization of [undefined, "Basic abc", "Bearer   "]) {
        const req = requestWith({ headers: { authorization } });
        assert.throws(
            () => authenticate(req, res, next),
            hasStatus(401, "AUTHENTICATION_REQUIRED"),
        );
    }
    assert.equal(next.mock.callCount(), 0);
});

test("authenticate attaches the user for a valid token", () => {
    const user = { userId: "user_1", email: "a@example.com", role: Role.STUDENT };
    const req = requestWith({
        headers: { authorization: `Bearer ${generateAccessToken(user)}` },
    });
    const next = mock.fn();

    authenticate(req, res, next);

    assert.deepEqual(req.user, user);
    assert.equal(next.mock.callCount(), 1);
});

test("authorize enforces roles", () => {
    const adminOnly = authorize(Role.ADMIN);
    const next = mock.fn();
    const student = { userId: "u1", email: "s@example.com", role: Role.STUDENT };
    const admin = { userId: "u2", email: "a@example.com", role: Role.ADMIN };

    assert.throws(() => adminOnly(requestWith({}), res, next), hasStatus(401));
    assert.throws(
        () => adminOnly(requestWith({ user: student }), res, next),
        hasStatus(403),
    );
    assert.equal(next.mock.callCount(), 0);

    adminOnly(requestWith({ user: admin }), res, next);
    assert.equal(next.mock.callCount(), 1);
});

function createMockResponse() {
    const captured = { status: 0, body: undefined as unknown };
    const response = {
        status(code: number) {
            captured.status = code;
            return response;
        },
        json(body: unknown) {
            captured.body = body;
            return response;
        },
    };
    return { response: response as unknown as Response, captured };
}

test("errorHandler maps AppError and unknown errors", () => {
    mock.method(console, "error", () => {});
    const req = {} as Request;
    const next = (() => {}) as NextFunction;

    const appError = createMockResponse();
    errorHandler(new AppError("Nope", 409, "USERNAME_TAKEN"), req, appError.response, next);
    assert.equal(appError.captured.status, 409);
    assert.deepEqual(appError.captured.body, {
        success: false,
        code: "USERNAME_TAKEN",
        message: "Nope",
    });

    const unknown = createMockResponse();
    errorHandler(new Error("db exploded"), req, unknown.response, next);
    assert.equal(unknown.captured.status, 500);
    assert.deepEqual(unknown.captured.body, {
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
    });
});
