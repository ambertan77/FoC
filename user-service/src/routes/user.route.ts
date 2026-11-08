// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated route wiring for /me profile, email-change and password-change endpoints, plus admin-only list and role-promotion routes guarded by authorize(Role.ADMIN).
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { Router } from "express";
import {
  changePassword,
  createAdminInvitation,
  getMyProfile,
  getUserById,
  listUsers,
  resendEmailChangeOtp,
  startEmailChange,
  updateMyProfile,
  updateUserRole,
  verifyEmailChange,
} from "../controllers/user.controller.js";
import { Role } from "../generated/prisma/client.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";

const userRouter = Router();

userRouter.use(authenticate);
userRouter.get("/me", getMyProfile);
userRouter.patch("/me", updateMyProfile);
userRouter.post("/me/email-change", startEmailChange);
userRouter.post("/me/email-change/resend", resendEmailChangeOtp);
userRouter.post("/me/email-change/verify", verifyEmailChange);
userRouter.post("/me/password-change", changePassword);

userRouter.post(
  "/admin-invitations",
  authorize(Role.ADMIN),
  createAdminInvitation,
);
userRouter.get("/", authorize(Role.ADMIN), listUsers);
userRouter.patch("/:userId/role", authorize(Role.ADMIN), updateUserRole);

userRouter.get("/:userId", getUserById);
export default userRouter;
