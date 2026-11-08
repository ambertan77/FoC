// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Suggested types for the admin user list, role update, profile and email-change responses.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { ApiUser, Role } from '@/features/auth/types/auth.types';

export interface AdminUserListParams {
    search?: string;
    role?: Role;
    page: number;
    pageSize: number;
}

export interface AdminUserListResult {
    users: ApiUser[];
    page: number;
    pageSize: number;
    total: number;
}

export interface UpdateUserRoleResult {
    user: ApiUser;
}

export interface EmailChangeChallenge {
    challengeId: string;
    expiresAt: string;
}

export interface PendingEmailChange extends EmailChangeChallenge {
    email: string;
}

export interface ProfileResult {
    user: ApiUser;
    pendingEmailChange: PendingEmailChange | null;
}

export interface EmailChangeVerificationResult {
    user: ApiUser;
}
