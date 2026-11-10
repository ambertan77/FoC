import type { Request } from "express";

export enum Role {
    STUDENT = "STUDENT",
    ADMIN = "ADMIN",
}

export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: Role;
}

export interface AuthRequest extends Request {
    user?: AuthenticatedUser;
}