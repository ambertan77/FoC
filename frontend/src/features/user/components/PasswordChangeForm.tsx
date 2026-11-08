// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the change-password form (current, new, confirm) with field errors for a wrong current password.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useForm } from '@tanstack/react-form';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import useChangePassword from '../hooks/useChangePassword';
import { changePasswordSchema } from '../schemas/password-change.schema';

const PasswordChangeForm = () => {
    const { changePassword, isPending } = useChangePassword();
    const form = useForm({
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        },
        validators: {
            onBlur: changePasswordSchema,
            onSubmit: changePasswordSchema,
        },
        onSubmit: async ({ value }) => {
            const details = changePasswordSchema.parse(value);

            changePassword({
                currentPassword: details.currentPassword,
                newPassword: details.newPassword,
            }, {
                onSuccess: () => form.reset(),
            });
        },
    });

    return (
        <form
            aria-label="Change password"
            noValidate
            className="flex flex-col gap-5"
            onSubmit={event => {
                event.preventDefault();
                form.handleSubmit();
            }}
        >
            <FieldGroup className="gap-4">
                <form.Field name="currentPassword">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                                <Input
                                    id="current-password"
                                    name={field.name}
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={isInvalid ? 'current-password-error' : undefined}
                                    className="h-10 border-slate-300"
                                />
                                {isInvalid && (
                                    <FieldError
                                        id="current-password-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

                <form.Field name="newPassword">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                                <Input
                                    id="new-password"
                                    name={field.name}
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={`new-password-help${isInvalid ? ' new-password-error' : ''}`}
                                    className="h-10 border-slate-300"
                                />
                                <p id="new-password-help" className="text-xs text-slate-500">
                                    At least 8 characters with uppercase and lowercase letters, a number, and a special character.
                                </p>
                                {isInvalid && (
                                    <FieldError
                                        id="new-password-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

                <form.Field name="confirmPassword">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                                <Input
                                    id="confirm-password"
                                    name={field.name}
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={isInvalid ? 'confirm-password-error' : undefined}
                                    className="h-10 border-slate-300"
                                />
                                {isInvalid && (
                                    <FieldError
                                        id="confirm-password-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>
            </FieldGroup>

            <div className="flex justify-end">
                <Button
                    type="submit"
                    variant="indigo"
                    size="lg"
                    isLoading={isPending}
                >
                    Change password
                </Button>
            </div>
        </form>
    );
};

export default PasswordChangeForm;
