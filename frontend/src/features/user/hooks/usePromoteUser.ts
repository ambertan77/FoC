// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the role-promotion mutation hook that invalidates the admin users list.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import type { ApiUser } from '@/features/auth/types/auth.types';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import { promoteUserService } from '../services/user.service';
import { ADMIN_USERS_QUERY_KEY } from './useAdminUsers';

const usePromoteUser = () => {
    const queryClient = useQueryClient();

    const mutation = useMutation<ApiUser, ParsedError, string>({
        mutationFn: async userId => {
            try {
                const result = await promoteUserService(userId);
                return result.user;
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
            toast.success('User promoted to admin.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        promoteUser: mutation.mutate,
        isPending: mutation.isPending,
    };
};

export default usePromoteUser;
