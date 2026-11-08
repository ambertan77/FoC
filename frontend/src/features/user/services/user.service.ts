// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated API calls for listing and promoting users, admin invitations, profile read/update, email change and password change.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import authApi from '@/api/authApi';
import { ENDPOINTS } from '@/api/endpoints';
import { ROLES } from '@/features/auth/types/auth.types';
import type { ApiResponse } from '@/types/api.types';
import type { UpdateProfilePayload } from '../schemas/profile.schema';
import type {
    EmailChangePayload,
    ResendEmailChangeOtpPayload,
    VerifyEmailChangePayload,
} from '../schemas/email-change.schema';
import type { ChangePasswordPayload } from '../schemas/password-change.schema';
import type { CreateAdminInvitationPayload } from '../schemas/admin-invitation.schema';
import type {
    AdminUserListParams,
    AdminUserListResult,
    EmailChangeChallenge,
    EmailChangeVerificationResult,
    ProfileResult,
    UpdateUserRoleResult,
} from '../types/user.types';

export const listUsersService = async (
    params: AdminUserListParams,
): Promise<AdminUserListResult> => {
    const response = await authApi.get<ApiResponse<AdminUserListResult>>(
        ENDPOINTS.user.users,
        { params },
    );

    return response.data.data!;
};

export const createAdminInvitationService = async (
    payload: CreateAdminInvitationPayload,
): Promise<void> => {
    await authApi.post(ENDPOINTS.user.adminInvitations, payload);
};

export const promoteUserService = async (
    userId: string,
): Promise<UpdateUserRoleResult> => {
    const response = await authApi.patch<ApiResponse<UpdateUserRoleResult>>(
        ENDPOINTS.user.userRole(userId),
        { role: ROLES.ADMIN },
    );

    return response.data.data!;
};

export const getMyProfileService = async (): Promise<ProfileResult> => {
    const response = await authApi.get<ApiResponse<ProfileResult>>(
        ENDPOINTS.user.profile,
    );

    return response.data.data!;
};

export const updateMyProfileService = async (
    payload: UpdateProfilePayload,
): Promise<ProfileResult> => {
    const response = await authApi.patch<ApiResponse<ProfileResult>>(
        ENDPOINTS.user.profile,
        payload,
    );

    return response.data.data!;
};

export const startEmailChangeService = async (
    payload: EmailChangePayload,
): Promise<EmailChangeChallenge> => {
    const response = await authApi.post<ApiResponse<EmailChangeChallenge>>(
        ENDPOINTS.user.emailChange,
        payload,
    );

    return response.data.data!;
};

export const resendEmailChangeOtpService = async (
    payload: ResendEmailChangeOtpPayload,
): Promise<EmailChangeChallenge> => {
    const response = await authApi.post<ApiResponse<EmailChangeChallenge>>(
        ENDPOINTS.user.resendEmailChangeOtp,
        payload,
    );

    return response.data.data!;
};

export const verifyEmailChangeService = async (
    payload: VerifyEmailChangePayload,
): Promise<EmailChangeVerificationResult> => {
    const response = await authApi.post<ApiResponse<EmailChangeVerificationResult>>(
        ENDPOINTS.user.verifyEmailChange,
        payload,
    );

    return response.data.data!;
};

export const changePasswordService = async (
    payload: ChangePasswordPayload,
): Promise<void> => {
    await authApi.post(ENDPOINTS.user.passwordChange, payload);
};
