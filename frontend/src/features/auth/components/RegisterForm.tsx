// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-25
// Scope: Generated the student registration form with React Hook Form and Zod validation for username, email, Singapore phone and password.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { Link } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ROUTES } from '@/routes/routes';
import { registerSchema, type RegistrationDetails } from '../schemas/register.schema';
import useRegister from '../hooks/useRegister';
import type { PendingRegistrationChallenge } from '../types/auth.types';

const registrationFields = [
    { name: 'username', label: 'Username', placeholder: 'student123', type: 'text', autoComplete: 'username' },
    { name: 'email', label: 'Email Address', placeholder: 'example@email.com', type: 'email', autoComplete: 'email' },
    { name: 'phoneNumber', label: 'Phone Number', placeholder: '81234567', type: 'tel', autoComplete: 'tel' },
] as const;

interface RegisterFormProps {
    initialValues?: RegistrationDetails;
    onRegistrationStarted: (
        challenge: PendingRegistrationChallenge,
        details: RegistrationDetails,
    ) => void;
}

const RegisterForm = ({ initialValues, onRegistrationStarted }: RegisterFormProps) => {
    const [showPassword, setShowPassword] = useState(false);
    const { register, isPending } = useRegister();
    const form = useForm({
        defaultValues: {
            username: initialValues?.username ?? '',
            email: initialValues?.email ?? '',
            phoneNumber: initialValues?.phoneNumber ?? '',
            password: '',
        },
        validators: {
            onBlur: registerSchema,
            onSubmit: registerSchema,
        },
        onSubmit: async ({ value }) => {
            const payload = registerSchema.parse(value);

            register(payload, {
                onSuccess: challenge => {
                    form.reset();
                    onRegistrationStarted(
                        {
                            ...challenge,
                            email: payload.email,
                        },
                        {
                            username: payload.username,
                            email: payload.email,
                            phoneNumber: payload.phoneNumber,
                        },
                    );
                },
            });
        },
    });

    return (
        <form
            aria-label="Create an account"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.handleSubmit();
            }}
        >
            <FieldGroup className="gap-2.5">
                {registrationFields.map(({ name, label, placeholder, type, autoComplete }) => (
                    <form.Field key={name} name={name}>
                        {field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            const id = `register-${name}`;
                            return (
                                <Field className="gap-1" data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                                    <Input
                                        id={id}
                                        name={name}
                                        type={type}
                                        autoComplete={autoComplete}
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        required
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={event => field.handleChange(event.target.value)}
                                        aria-invalid={isInvalid}
                                        aria-describedby={isInvalid ? `${id}-error` : undefined}
                                        placeholder={placeholder}
                                        className="h-9 border-slate-300 placeholder:italic"
                                    />
                                    {isInvalid && <FieldError id={`${id}-error`} errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    </form.Field>
                ))}
                <form.Field name="password">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                            <Field className="gap-1" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="register-password">Password</FieldLabel>
                                <InputGroup className="h-9 border-slate-300">
                                    <InputGroupInput
                                        id="register-password"
                                        name={field.name}
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        required
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={event => field.handleChange(event.target.value)}
                                        aria-invalid={isInvalid}
                                        aria-describedby={`register-password-help${isInvalid ? ' register-password-error' : ''}`}
                                        placeholder="Enter a password"
                                        className="placeholder:italic"
                                    />
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton
                                            size="icon-xs"
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            aria-pressed={showPassword}
                                            onClick={() => setShowPassword(previous => !previous)}
                                        >
                                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                </InputGroup>
                                <p id="register-password-help" className="text-xs text-slate-500">
                                    At least 8 characters with uppercase and lowercase letters, a number, and a special character.
                                </p>
                                {isInvalid && <FieldError id="register-password-error" errors={field.state.meta.errors} />}
                            </Field>
                        );
                    }}
                </form.Field>
            </FieldGroup>
            <div className="flex flex-col items-center gap-4">
                <Button
                    type="submit"
                    variant="indigo"
                    size="lg"
                    className="px-4"
                    isLoading={isPending}
                >
                    Sign Up
                </Button>
                <p className="text-center text-sm text-slate-600">
                    Already an existing user? Log in{' '}
                    <Link to={ROUTES.LOGIN} className="underline hover:text-indigo-500">here!</Link>
                </p>
            </div>
        </form>
    );
};

export default RegisterForm;
