// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-25
// Scope: Generated the registration page that switches between the details form and the OTP step.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useState } from 'react';
import Logo from '@/assets/logo.png';
import { Card } from '@/components/ui/card';
import RegisterForm from '@/features/auth/components/RegisterForm';
import RegistrationOtpForm from '@/features/auth/components/RegistrationOtpForm';
import type {
    PendingRegistrationChallenge,
    RegistrationChallenge,
} from '@/features/auth/types/auth.types';
import type { RegistrationDetails } from '@/features/auth/schemas/register.schema';

const RegisterPage = () => {
    const [pendingRegistration, setPendingRegistration] = useState<PendingRegistrationChallenge | null>(null);
    const [registrationDetails, setRegistrationDetails] = useState<RegistrationDetails>();

    const handleRegistrationStarted = (
        challenge: PendingRegistrationChallenge,
        details: RegistrationDetails,
    ) => {
        setPendingRegistration(challenge);
        setRegistrationDetails(details);
    };

    const handleChallengeUpdated = (challenge: RegistrationChallenge) => {
        setPendingRegistration(previous => previous
            ? { ...previous, ...challenge }
            : previous);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-10">
            <h1 className="sr-only">Create an Aaron account</h1>
            <div className="flex items-center gap-2" aria-hidden="true">
                <img src={Logo} alt="" />
                <p className="text-2xl font-bold text-indigo-900">Aaron</p>
            </div>
            <Card className="w-full max-w-sm rounded-2xl p-6!">
                {pendingRegistration ? (
                    <RegistrationOtpForm
                        challengeId={pendingRegistration.challengeId}
                        email={pendingRegistration.email}
                        onChallengeUpdated={handleChallengeUpdated}
                        onChangeDetails={() => setPendingRegistration(null)}
                    />
                ) : (
                    <RegisterForm
                        initialValues={registrationDetails}
                        onRegistrationStarted={handleRegistrationStarted}
                    />
                )}
            </Card>
        </main>
    );
};

export default RegisterPage;
