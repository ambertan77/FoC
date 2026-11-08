// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the create-admin-invitation mutation hook.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { parseError, type ParsedError } from '@/utils/errorHandler';
import type { CreateAdminInvitationPayload } from '../schemas/admin-invitation.schema';
import { createAdminInvitationService } from '../services/user.service';

const useCreateAdminInvitation = () => {
    const mutation = useMutation<void, ParsedError, CreateAdminInvitationPayload>({
        mutationFn: async payload => {
            try {
                await createAdminInvitationService(payload);
            } catch (error) {
                throw parseError(error);
            }
        },
        onSuccess: () => {
            toast.success('Administrator invitation sent.');
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        createAdminInvitation: mutation.mutate,
        isPending: mutation.isPending,
    };
};

export default useCreateAdminInvitation;
