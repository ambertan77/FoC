// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the dialog for inviting an administrator by email, including cooldown and conflict error handling.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useForm } from '@tanstack/react-form';
import { MailPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    createAdminInvitationSchema,
    type CreateAdminInvitationPayload,
} from '../schemas/admin-invitation.schema';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CreateAdminInvitationDialogProps {
    isPending: boolean;
    onSubmit: (payload: CreateAdminInvitationPayload) => void;
    onClose: () => void;
}

const CreateAdminInvitationDialog = ({
    isPending,
    onSubmit,
    onClose,
}: CreateAdminInvitationDialogProps) => {
    const form = useForm({
        defaultValues: { email: '' },
        validators: {
            onBlur: createAdminInvitationSchema,
            onSubmit: createAdminInvitationSchema,
        },
        onSubmit: async ({ value }) => {
            onSubmit(createAdminInvitationSchema.parse(value));
        },
    });

    return (
        <DialogContent className="w-full md:max-w-xl! max-h-[85vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle> Create administrator</DialogTitle>
            </DialogHeader>

            <form
                noValidate
                className="flex flex-col gap-5 p-4"
                onSubmit={event => {
                    event.preventDefault();
                    form.handleSubmit();
                }}
            >
                <div className="flex items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-100">
                        <MailPlusIcon className="size-4 text-indigo-800" />
                    </div>
                    <p id="create-admin-description" className="text-sm text-muted-foreground">
                        An activation link will be emailed to the new administrator.
                        <br />
                        Submit the same email again to send a replacement link.
                    </p>
                </div>

                <form.Field name="email">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="admin-invitation-email">
                                    Email address
                                </FieldLabel>
                                <Input
                                    id="admin-invitation-email"
                                    name={field.name}
                                    type="email"
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    required
                                    autoFocus
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={isInvalid ? 'admin-invitation-email-error' : undefined}
                                    placeholder="admin@example.com"
                                    className="h-10 border-slate-300"
                                />
                                {isInvalid && (
                                    <FieldError
                                        id="admin-invitation-email-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

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
                        type="submit"
                        variant="indigo"
                        isLoading={isPending}
                    >
                        Send invitation
                    </Button>
                </div>
            </form>
        </DialogContent>
    );
};

export default CreateAdminInvitationDialog;
