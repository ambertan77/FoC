// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the admin activation form (username, phone, password, confirm password) with field-level API error mapping.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import {
    adminActivationFormSchema,
    type AdminActivationFormValues,
} from '../schemas/admin-activation.schema';
import useActivateAdmin from '../hooks/useActivateAdmin';

const INVALID_LINK_CODES = new Set([
    'ADMIN_ACTIVATION_INVALID',
    'ADMIN_ACTIVATION_EXPIRED',
    'ADMIN_ACTIVATION_NO_LONGER_VALID',
]);

interface AdminActivationFormProps {
    token: string;
    onSuccess: () => void;
    onLinkUnavailable: (message: string) => void;
}

const AdminActivationForm = ({
    token,
    onSuccess,
    onLinkUnavailable,
}: AdminActivationFormProps) => {
    const [showPassword, setShowPassword] = useState(false);
    const { activateAdmin, isPending, error } = useActivateAdmin();
    const form = useForm({
        defaultValues: {
            username: '',
            phoneNumber: '',
            password: '',
            confirmPassword: '',
        } satisfies AdminActivationFormValues,
        validators: {
            onBlur: adminActivationFormSchema,
            onSubmit: adminActivationFormSchema,
        },
        onSubmit: async ({ value }) => {
            const details = adminActivationFormSchema.parse(value);

            activateAdmin({
                token,
                username: details.username,
                phoneNumber: details.phoneNumber,
                password: details.password,
            }, {
                onSuccess,
                onError: activationError => {
                    if (INVALID_LINK_CODES.has(activationError.code)) {
                        onLinkUnavailable(activationError.message);
                    }
                },
            });
        },
    });

    return (
        <form
            aria-label="Activate administrator account"
            noValidate
            className="flex flex-col gap-5"
            onSubmit={event => {
                event.preventDefault();
                form.handleSubmit();
            }}
        >
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-xl font-semibold">Set up your administrator account</h1>
                <p className="text-sm text-muted-foreground">
                    Choose your account details before signing in.
                </p>
            </div>

            {error && !INVALID_LINK_CODES.has(error.code) && (
                <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error.message}
                </p>
            )}

            <FieldGroup className="gap-4">
                <form.Field name="username">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="activation-username">Username</FieldLabel>
                                <Input
                                    id="activation-username"
                                    name={field.name}
                                    type="text"
                                    autoComplete="username"
                                    required
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={isInvalid ? 'activation-username-error' : undefined}
                                    placeholder="admin123"
                                    className="h-10 border-slate-300"
                                />
                                {isInvalid && (
                                    <FieldError id="activation-username-error" errors={field.state.meta.errors} />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

                <form.Field name="phoneNumber">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="activation-phone">Phone number</FieldLabel>
                                <Input
                                    id="activation-phone"
                                    name={field.name}
                                    type="tel"
                                    autoComplete="tel"
                                    required
                                    disabled={isPending}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    aria-invalid={isInvalid}
                                    aria-describedby={isInvalid ? 'activation-phone-error' : undefined}
                                    placeholder="81234567"
                                    className="h-10 border-slate-300"
                                />
                                {isInvalid && (
                                    <FieldError id="activation-phone-error" errors={field.state.meta.errors} />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

                {(['password', 'confirmPassword'] as const).map(name => (
                    <form.Field key={name} name={name}>
                        {field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            const isPassword = name === 'password';
                            const id = `activation-${name}`;

                            return (
                                <Field className="gap-1.5" data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={id}>
                                        {isPassword ? 'Password' : 'Confirm password'}
                                    </FieldLabel>
                                    <InputGroup className="h-10 border-slate-300">
                                        <InputGroupInput
                                            id={id}
                                            name={field.name}
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            required
                                            disabled={isPending}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={event => field.handleChange(event.target.value)}
                                            aria-invalid={isInvalid}
                                            aria-describedby={isInvalid ? `${id}-error` : undefined}
                                            placeholder={isPassword ? 'Enter a password' : 'Enter it again'}
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton
                                                type="button"
                                                size="icon-xs"
                                                disabled={isPending}
                                                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                                                aria-pressed={showPassword}
                                                onClick={() => setShowPassword(previous => !previous)}
                                            >
                                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>
                                    {isPassword && (
                                        <p className="text-xs text-slate-500">
                                            At least 8 characters with uppercase and lowercase letters,
                                            a number, and a special character.
                                        </p>
                                    )}
                                    {isInvalid && (
                                        <FieldError id={`${id}-error`} errors={field.state.meta.errors} />
                                    )}
                                </Field>
                            );
                        }}
                    </form.Field>
                ))}
            </FieldGroup>

            <Button
                type="submit"
                variant="indigo"
                size="lg"
                className="self-center px-4"
                isLoading={isPending}
            >
                Activate account
            </Button>
        </form>
    );
};

export default AdminActivationForm;
