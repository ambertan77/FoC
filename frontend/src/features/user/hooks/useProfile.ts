// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the profile query hook and PROFILE_QUERY_KEY.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useQuery } from '@tanstack/react-query';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import { getMyProfileService } from '../services/user.service';
import type { ProfileResult } from '../types/user.types';

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

const useProfile = () => useQuery<ProfileResult, ParsedError>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
        try {
            return await getMyProfileService();
        } catch (error) {
            throw parseError(error);
        }
    },
});

export default useProfile;
