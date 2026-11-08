// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-25
// Scope: Generated the 6-digit registration OTP form with verify and resend actions.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useForm } from '@tanstack/react-form';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/routes/routes';
import { registrationOtpSchema } from '../schemas/register.schema';
import useVerifyRegistration from '../hooks/useVerifyRegistration';
import useResendRegistrationOtp from '../hooks/useResendRegistrationOtp';
import type { RegistrationChallenge } from '../types/auth.types';

interface RegistrationOtpFormProps {
    challengeId: string;
    email: string;
    onChallengeUpdated: (challenge: RegistrationChallenge) => void;
    onChangeDetails: () => void;
}

const RegistrationOtpForm = ({
    challengeId,
    email,
    onChallengeUpdated,
    onChangeDetails,
}: RegistrationOtpFormProps) => {
    const { verifyRegistration, isPending: isVerifying } = useVerifyRegistration();
    const { resendRegistrationOtp, isPending: isResending } = useResendRegistrationOtp();
    const isSubmitting = isVerifying || isResending;
    const form = useForm({
        defaultValues: { otp: '' },
        validators: {
            onBlur: registrationOtpSchema,
            onSubmit: registrationOtpSchema,
        },
        onSubmit: async ({ value }) => {
            const { otp } = registrationOtpSchema.parse(value);
            verifyRegistration({ challengeId, otp });
        },
    });

    const handleResend = () => {
        resendRegistrationOtp({ challengeId }, {
            onSuccess: challenge => {
                form.reset();
                onChallengeUpdated(challenge);
            },
        });
    };

    return (
        <form
            aria-label="Verify your email"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.handleSubmit();
            }}
        >
            <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold text-indigo-900">Verify your email</h2>
                <p className="text-sm text-slate-600">
                    Enter the 6-digit code sent to <span className="font-medium">{email}</span>.
                </p>
            </div>
            <form.Field name="otp">
                {field => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                        <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor="registration-otp">Verification Code</FieldLabel>
                            <Input
                                id="registration-otp"
                                name={field.name}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                required
                                disabled={isSubmitting}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={event => field.handleChange(event.target.value)}
                                aria-invalid={isInvalid}
                                aria-describedby={`otp-expiry${isInvalid ? ' registration-otp-error' : ''}`}
                                placeholder="123456"
                                className="h-9 border-slate-300 text-center tracking-widest"
                            />
                            {isInvalid && <FieldError id="registration-otp-error" errors={field.state.meta.errors} />}
                        </Field>
                    );
                }}
            </form.Field>
            <p id="otp-expiry" className="text-center text-sm text-slate-600">
                Codes expire after 10 minutes.
            </p>
            <div className="flex flex-col items-center gap-3">
                <Button
                    type="submit"
                    variant="indigo"
                    size="lg"
                    isLoading={isVerifying}
                    disabled={isSubmitting}
                >
                    Verify Email
                </Button>
                <Button
                    type="button"
                    variant="linkIndigo"
                    isLoading={isResending}
                    disabled={isSubmitting}
                    onClick={handleResend}
                >
                    Resend code
                </Button>
                <Button
                    type="button"
                    variant="linkIndigo"
                    disabled={isSubmitting}
                    onClick={onChangeDetails}
                >
                    Change registration details
                </Button>
            </div>
            <Link to={ROUTES.LOGIN} className="text-center text-sm text-slate-600 underline hover:text-indigo-500">
                Back to login
            </Link>
        </form>
    );
};

export default RegistrationOtpForm;
