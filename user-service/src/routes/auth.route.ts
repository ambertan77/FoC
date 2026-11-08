// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Suggested route wiring for /register, /register/resend and /register/verify alongside the admin activation route.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { Router } from "express";
import {
    activateAdmin,
    login,
    logout,
    refresh,
    register,
    resendRegistrationOtp,
    verifyRegistration,
} from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.post("/admin-activation", activateAdmin);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.post("/refresh", refresh);
authRouter.post("/register", register);
authRouter.post("/register/resend", resendRegistrationOtp);
authRouter.post("/register/verify", verifyRegistration);

export default authRouter;
