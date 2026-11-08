// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated bootstrapAdmin: one-time first-admin creation from env config with a BootstrapState marker, BootstrapResult outcomes and conflict errors.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import argon2 from "argon2";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { registerSchema } from "../schemas/register.schema.js";

const BOOTSTRAP_KEY = "first-admin";
const fields = {
  email: "BOOTSTRAP_ADMIN_EMAIL",
  username: "BOOTSTRAP_ADMIN_USERNAME",
  phoneNumber: "BOOTSTRAP_ADMIN_PHONE_NUMBER",
  password: "BOOTSTRAP_ADMIN_PASSWORD",
} as const;

export type BootstrapResult = "disabled" | "already-completed" | "existing-admin" | "created";

// Keep the client and environment injectable without importing application config.
export async function bootstrapAdmin(
  db: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapResult> {
  if (Object.values(fields).every((name) => !env[name])) return "disabled";

  try {
    if (await db.bootstrapState.findUnique({ where: { key: BOOTSTRAP_KEY } })) {
      return "already-completed";
    }

    const parsed = registerSchema.safeParse(Object.fromEntries(
      Object.entries(fields).map(([field, name]) => [field, env[name]]),
    ));
    if (!parsed.success) {
      // Report field names only: never interpolate supplied values or raw errors.
      const invalid = [...new Set(parsed.error.issues.map((issue) =>
        fields[issue.path[0] as keyof typeof fields],
      ))];
      throw new BootstrapError(`Invalid or missing bootstrap configuration: ${invalid.join(", ")}`);
    }

    const { password, ...identity } = parsed.data;
    const passwordHash = await argon2.hash(password);

    return await db.$transaction(async (tx) => {
      // The unique key serializes contenders. A failed transaction releases its
      // claim; a successful one leaves a permanent marker for every later run.
      const claimed = await tx.$queryRaw<Array<{ key: string }>>`
        INSERT INTO "BootstrapState" ("key") VALUES (${BOOTSTRAP_KEY})
        ON CONFLICT ("key") DO NOTHING RETURNING "key"
      `;
      if (claimed.length === 0) return "already-completed";

      if (await tx.user.findFirst({ where: { role: "ADMIN" }, select: { userId: true } })) {
        return "existing-admin";
      }

      await tx.user.create({
        data: { ...identity, password: passwordHash, role: "ADMIN" },
      });
      return "created";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BootstrapError("Bootstrap identity conflicts with an existing email, username, or phone number; no account was changed.");
    }
    // Prisma errors can contain query arguments. Do not expose them at startup.
    throw new BootstrapError("Admin bootstrap failed; check database availability, applied migrations, and server configuration.");
  }
}

class BootstrapError extends Error {}
