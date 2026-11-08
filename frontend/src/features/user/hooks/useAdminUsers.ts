// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the paginated, searchable admin users query hook.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useQuery } from '@tanstack/react-query';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import { listUsersService } from '../services/user.service';
import type {
    AdminUserListParams,
    AdminUserListResult,
} from '../types/user.types';

export const ADMIN_USERS_QUERY_KEY = ['admin-users'] as const;

const useAdminUsers = (params: AdminUserListParams) =>
    useQuery<AdminUserListResult, ParsedError>({
        queryKey: [...ADMIN_USERS_QUERY_KEY, params],
        queryFn: async () => {
            try {
                return await listUsersService(params);
            } catch (error) {
                throw parseError(error);
            }
        },
    });

export default useAdminUsers;
