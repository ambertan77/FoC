// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Suggested the AuthenticatedUser and AuthenticatedRequest type definitions.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { Request } from "express";
import type { Role } from "../generated/prisma/client.js";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
