// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the authenticate middleware that parses Bearer access tokens and attaches req.user.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { NextFunction, Response } from "express";
import { AppError } from "../errors/errors.js";
import { verifyAccessToken } from "../libs/accessToken.js";
import type { AuthenticatedRequest } from "../types/auth.types.js";

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  req.user = verifyAccessToken(token);
  next();
}
