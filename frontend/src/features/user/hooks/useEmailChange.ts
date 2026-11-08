// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the hook combining start, resend and verify email-change mutations and refreshing the profile on success.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import type { ApiUser } from '@/features/auth/types/auth.types';
import useAuthStore from '@/store/authStore';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import type {
    EmailChangePayload,
    ResendEmailChangeOtpPayload,
    VerifyEmailChangePayload,
} from '../schemas/email-change.schema';
import {
    resendEmailChangeOtpService,
    startEmailChangeService,
    verifyEmailChangeService,
} from '../services/user.service';
import type {
    EmailChangeChallenge,
    ProfileResult,
} from '../types/user.types';
import { PROFILE_QUERY_KEY } from './useProfile';

const useEmailChange = () => {
    const queryClient = useQueryClient();
    const setUser = useAuthStore(state => state.setUser);

    const startMutation = useMutation<EmailChangeChallenge, ParsedError, EmailChangePayload>({
        mutationFn: async payload => {
            try {
                return await startEmailChangeService(payload);
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: (challenge, payload) => {
            queryClient.setQueryData<ProfileResult>(PROFILE_QUERY_KEY, current => (
                current
                    ? {
                        ...current,
                        pendingEmailChange: {
                            ...challenge,
                            email: payload.email,
                        },
                    }
                    : current
            ));
            toast.success('Verification code sent to your new email.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    const resendMutation = useMutation<
        EmailChangeChallenge,
        ParsedError,
        ResendEmailChangeOtpPayload
    >({
        mutationFn: async payload => {
            try {
                return await resendEmailChangeOtpService(payload);
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: challenge => {
            queryClient.setQueryData<ProfileResult>(PROFILE_QUERY_KEY, current => (
                current?.pendingEmailChange
                    ? {
                        ...current,
                        pendingEmailChange: {
                            ...current.pendingEmailChange,
                            ...challenge,
                        },
                    }
                    : current
            ));
            toast.success('A new verification code has been sent.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    const verifyMutation = useMutation<ApiUser, ParsedError, VerifyEmailChangePayload>({
        mutationFn: async payload => {
            try {
                const result = await verifyEmailChangeService(payload);
                return result.user;
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: user => {
            queryClient.setQueryData<ProfileResult>(PROFILE_QUERY_KEY, current => (
                current
                    ? {
                        ...current,
                        user,
                        pendingEmailChange: null,
                    }
                    : current
            ));
            setUser(user);
            toast.success('Email address updated successfully.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        startEmailChange: startMutation.mutate,
        startEmailChangeAsync: startMutation.mutateAsync,
        isStarting: startMutation.isPending,
        resendEmailChangeOtp: resendMutation.mutate,
        isResending: resendMutation.isPending,
        verifyEmailChange: verifyMutation.mutate,
        isVerifying: verifyMutation.isPending,
    };
};

export default useEmailChange;
