// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the profile update mutation hook with conflict error handling.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import type { ApiUser } from '@/features/auth/types/auth.types';
import useAuthStore from '@/store/authStore';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import type { UpdateProfilePayload } from '../schemas/profile.schema';
import { updateMyProfileService } from '../services/user.service';
import { PROFILE_QUERY_KEY } from './useProfile';
import type { ProfileResult } from '../types/user.types';

const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    const setUser = useAuthStore(state => state.setUser);

    const mutation = useMutation<ApiUser, ParsedError, UpdateProfilePayload>({
        mutationFn: async payload => {
            try {
                const result = await updateMyProfileService(payload);
                return result.user;
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: user => {
            queryClient.setQueryData<ProfileResult>(
                PROFILE_QUERY_KEY,
                current => current ? { ...current, user } : current,
            );
            setUser(user);
            toast.success('Profile updated successfully.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        updateProfile: mutation.mutate,
        updateProfileAsync: mutation.mutateAsync,
        isPending: mutation.isPending,
    };
};

export default useUpdateProfile;
