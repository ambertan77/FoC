// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-25
// Scope: Generated the test setup that provides deterministic env vars and PEM keys before any module is imported.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

// Loaded via `node --import` before any test file. config.ts throws on missing
// env vars and accessToken.ts reads PEM files at import time, so provide
// deterministic values here. dotenv never overrides variables already set,
// so a local .env and keys/ are ignored and runs match CI.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "user-service-test-"));
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
});
fs.writeFileSync(path.join(keyDir, "private.pem"), privateKey);
fs.writeFileSync(path.join(keyDir, "public.pem"), publicKey);

Object.assign(process.env, {
    PORT: "3000",
    NODE_ENV: "test",
    FRONTEND_URL: "http://localhost:5173",
    // PrismaClient never connects in unit tests; the URL only has to exist.
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_PRIVATE_KEY_PATH: path.join(keyDir, "private.pem"),
    JWT_PUBLIC_KEY_PATH: path.join(keyDir, "public.pem"),
    JWT_REFRESH_TOKEN_KEY: "test-refresh-token-key",
    COOKIE_SECRET: "test-cookie-secret",
});
