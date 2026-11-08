// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the confirmation dialog for promoting a student to administrator.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { ShieldCheckIcon } from 'lucide-react';
import type { ApiUser } from '@/features/auth/types/auth.types';
import { Button } from '@/components/ui/button';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PromoteUserDialogProps {
    user: ApiUser;
    isPending: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

const PromoteUserDialog = ({
    user,
    isPending,
    onConfirm,
    onClose,
}: PromoteUserDialogProps) => {

    return (
        <DialogContent className="w-full md:max-w-xl! max-h-[85vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle> Make user an admin</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-5 p-4">
                <div className="flex items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-100">
                        <ShieldCheckIcon className="size-4 text-indigo-800" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-sm">
                            Promote <span className="font-medium">{user.username}</span> to admin?
                        </p>
                        <p className="text-sm text-muted-foreground">
                            This will give {user.email} access to administrator functions.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="indigo"
                        isLoading={isPending}
                        onClick={onConfirm}
                    >
                        Make admin
                    </Button>
                </div>
            </div>
        </DialogContent>
    );
};

export default PromoteUserDialog;
