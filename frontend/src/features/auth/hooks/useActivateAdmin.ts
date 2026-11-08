// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the TanStack Query mutation hook for admin activation.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import type { AdminActivationPayload } from '../schemas/admin-activation.schema';
import { activateAdminService } from '../services/auth.service';
import type { AdminActivationResult } from '../types/auth.types';

const useActivateAdmin = () => {
    const mutation = useMutation<
        AdminActivationResult,
        ParsedError,
        AdminActivationPayload
    >({
        mutationFn: async payload => {
            try {
                return await activateAdminService(payload);
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: () => {
            toast.success('Administrator account activated.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        activateAdmin: mutation.mutate,
        isPending: mutation.isPending,
        error: mutation.error,
    };
};

export default useActivateAdmin;
