// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the profile form for username, phone and email change with OTP verification; helped debug the +65 phone prefix display.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { MailIcon, PhoneIcon, UserIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ApiUser } from '@/features/auth/types/auth.types';
import useEmailChange from '../hooks/useEmailChange';
import useUpdateProfile from '../hooks/useUpdateProfile';
import { emailChangeOtpSchema } from '../schemas/email-change.schema';
import { profileDetailsSchema } from '../schemas/profile.schema';
import type { PendingEmailChange } from '../types/user.types';

interface ProfileDetailsFormProps {
    user: ApiUser;
    pendingEmailChange: PendingEmailChange | null;
}

const toLocalPhoneNumber = (phoneNumber: string) =>
    phoneNumber.replace(/^\+65/, '');

const ProfileDetailsForm = ({
    user,
    pendingEmailChange,
}: ProfileDetailsFormProps) => {
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState<string>();
    const { updateProfileAsync, isPending: isUpdating } = useUpdateProfile();
    const {
        startEmailChangeAsync,
        isStarting,
        verifyEmailChange,
        isVerifying,
        resendEmailChangeOtp,
        isResending,
    } = useEmailChange();
    const isSaving = isUpdating || isStarting;
    const isHandlingOtp = isVerifying || isResending;
    const form = useForm({
        defaultValues: {
            email: pendingEmailChange?.email ?? user.email,
            username: user.username,
            phoneNumber: toLocalPhoneNumber(user.phoneNumber),
        },
        validators: {
            onBlur: profileDetailsSchema,
            onSubmit: profileDetailsSchema,
        },
        onSubmit: async ({ value }) => {
            const details = profileDetailsSchema.parse(value);
            const profileChanged = details.username !== user.username
                || details.phoneNumber !== user.phoneNumber;
            const emailChanged = details.email !== user.email
                && details.email !== pendingEmailChange?.email;

            if (!profileChanged && !emailChanged) {
                toast.info('No profile changes to save.');
                return;
            }

            try {
                if (profileChanged) {
                    await updateProfileAsync({
                        username: details.username,
                        phoneNumber: details.phoneNumber,
                    });
                }

                if (emailChanged) {
                    await startEmailChangeAsync({ email: details.email });
                    setOtp('');
                    setOtpError(undefined);
                }

                form.reset({
                    ...details,
                    phoneNumber: toLocalPhoneNumber(details.phoneNumber),
                });
            } catch {
                // Mutation hooks display the API error message.
            }
        },
    });

    const handleVerifyEmail = () => {
        if (!pendingEmailChange) {
            return;
        }

        const result = emailChangeOtpSchema.safeParse({ otp });

        if (!result.success) {
            setOtpError(result.error.issues.at(0)?.message ?? 'Invalid verification code');
            return;
        }

        setOtpError(undefined);
        verifyEmailChange(
            {
                challengeId: pendingEmailChange.challengeId,
                otp: result.data.otp,
            },
            {
                onSuccess: () => setOtp(''),
            },
        );
    };

    const handleResendEmail = () => {
        if (!pendingEmailChange) {
            return;
        }

        resendEmailChangeOtp(
            { challengeId: pendingEmailChange.challengeId },
            {
                onSuccess: () => {
                    setOtp('');
                    setOtpError(undefined);
                },
            },
        );
    };

    return (
        <form
            aria-label="Profile details"
            noValidate
            className="flex flex-col gap-5"
            onSubmit={event => {
                event.preventDefault();
                form.handleSubmit();
            }}
        >
            <FieldGroup className="gap-4">
                <form.Field name="email">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
                                <div className="relative">
                                    <MailIcon
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                                    />
                                    <Input
                                        id="profile-email"
                                        name={field.name}
                                        type="email"
                                        autoComplete="email"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        required
                                        disabled={isSaving || isHandlingOtp}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={event => field.handleChange(event.target.value)}
                                        aria-invalid={isInvalid}
                                        aria-describedby={isInvalid ? 'profile-email-error' : 'profile-email-help'}
                                        className="h-10 border-slate-300 pl-9"
                                    />
                                </div>
                                <p id="profile-email-help" className="text-xs text-slate-500">
                                    Changing this address sends a verification code before it is applied.
                                </p>
                                {isInvalid && (
                                    <FieldError
                                        id="profile-email-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>

                <form.Field name="username">
                    {field => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                        return (
                            <Field className="gap-1.5" data-invalid={isInvalid}>
                                <FieldLabel htmlFor="profile-username">Username</FieldLabel>
                                <div className="relative">
                                    <UserIcon
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                                    />
                                    <Input
                                        id="profile-username"
                                        name={field.name}
                                        type="text"
                                        autoComplete="username"
                                        required
                                        disabled={isSaving || isHandlingOtp}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={event => field.handleChange(event.target.value)}
                                        aria-invalid={isInvalid}
                                        aria-describedby={isInvalid ? 'profile-username-error' : undefined}
                                        className="h-10 border-slate-300 pl-9"
                                    />
                                </div>
                                {isInvalid && (
                                    <FieldError
                                        id="profile-username-error"
                                        errors={field.state.meta.errors}
                                    />
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
                                <FieldLabel htmlFor="profile-phone">Phone number</FieldLabel>
                                <div className="relative">
                                    <PhoneIcon
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                                    />
                                    <Input
                                        id="profile-phone"
                                        name={field.name}
                                        type="tel"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        required
                                        disabled={isSaving || isHandlingOtp}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={event => field.handleChange(event.target.value)}
                                        aria-invalid={isInvalid}
                                        aria-describedby={`profile-phone-help${isInvalid ? ' profile-phone-error' : ''}`}
                                        className="h-10 border-slate-300 pl-9"
                                    />
                                </div>
                                <p id="profile-phone-help" className="text-xs text-slate-500">
                                    Singapore mobile number starting with 8 or 9.
                                </p>
                                {isInvalid && (
                                    <FieldError
                                        id="profile-phone-error"
                                        errors={field.state.meta.errors}
                                    />
                                )}
                            </Field>
                        );
                    }}
                </form.Field>
            </FieldGroup>

            {pendingEmailChange && (
                <div className="flex flex-col gap-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                    <div>
                        <p className="text-sm text-slate-700">
                            Enter the code sent to{' '}
                            <span className="font-semibold text-slate-900">
                                {pendingEmailChange.email}
                            </span>.
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Your current email, {user.email}, remains active until verification succeeds.
                        </p>
                    </div>

                    <Field className="gap-1.5" data-invalid={Boolean(otpError)}>
                        <FieldLabel htmlFor="email-change-otp">Verification code</FieldLabel>
                        <Input
                            id="email-change-otp"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            disabled={isSaving || isHandlingOtp}
                            value={otp}
                            onChange={event => {
                                setOtp(event.target.value);
                                setOtpError(undefined);
                            }}
                            aria-invalid={Boolean(otpError)}
                            aria-describedby={otpError ? 'email-change-otp-error' : undefined}
                            placeholder="123456"
                            className="h-10 border-slate-300 bg-white text-center tracking-[0.3em]"
                        />
                        {otpError && (
                            <FieldError id="email-change-otp-error">{otpError}</FieldError>
                        )}
                    </Field>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                            type="button"
                            variant="linkIndigo"
                            isLoading={isResending}
                            disabled={isSaving || isHandlingOtp}
                            onClick={handleResendEmail}
                        >
                            Resend code
                        </Button>
                        <Button
                            type="button"
                            variant="indigo"
                            size="lg"
                            isLoading={isVerifying}
                            disabled={isSaving || isHandlingOtp}
                            onClick={handleVerifyEmail}
                        >
                            Verify email
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                <Button
                    type="submit"
                    variant="indigo"
                    size="lg"
                    isLoading={isSaving}
                    disabled={isHandlingOtp}
                >
                    Save changes
                </Button>
            </div>
        </form>
    );
};

export default ProfileDetailsForm;
