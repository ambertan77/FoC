// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the admin activation page that validates the token from the URL hash and shows an error for missing or invalid links.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMemo, useState } from 'react';
import { CircleAlertIcon, CircleCheckBigIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import Logo from '@/assets/logo.png';
import { Card } from '@/components/ui/card';
import AdminActivationForm from '@/features/auth/components/AdminActivationForm';
import { adminActivationTokenSchema } from '@/features/auth/schemas/admin-activation.schema';
import { ROUTES } from '@/routes/routes';

const AdminActivationPage = () => {
    const token = useMemo(() => {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const result = adminActivationTokenSchema.safeParse(hashParams.get('token'));
        return result.success ? result.data : null;
    }, []);
    const [isActivated, setIsActivated] = useState(false);
    const [unavailableMessage, setUnavailableMessage] = useState<string | null>(
        token ? null : 'This administrator activation link is missing or invalid.',
    );

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-10">
            <div className="flex items-center gap-2" aria-hidden="true">
                <img src={Logo} alt="" />
                <p className="text-2xl font-bold text-indigo-900">Aaron</p>
            </div>

            <Card className="w-full max-w-md rounded-2xl p-6!">
                {unavailableMessage ? (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <CircleAlertIcon className="size-10 text-destructive" />
                        <div className="flex flex-col gap-1">
                            <h1 className="text-xl font-semibold">Activation link unavailable</h1>
                            <p className="text-sm text-muted-foreground">{unavailableMessage}</p>
                            <p className="text-sm text-muted-foreground">
                                Contact an administrator and ask them to send a new invitation.
                            </p>
                        </div>
                        <Link to={ROUTES.LOGIN} className="text-sm text-indigo-600 underline underline-offset-4">
                            Go to sign in
                        </Link>
                    </div>
                ) : isActivated ? (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <CircleCheckBigIcon className="size-10 text-emerald-600" />
                        <div className="flex flex-col gap-1">
                            <h1 className="text-xl font-semibold">Administrator account activated</h1>
                            <p className="text-sm text-muted-foreground">
                                Your password has been set. You can now sign in to your account.
                            </p>
                        </div>
                        <Link to={ROUTES.LOGIN} className="text-sm text-indigo-600 underline underline-offset-4">
                            Sign in
                        </Link>
                    </div>
                ) : token ? (
                    <AdminActivationForm
                        token={token}
                        onSuccess={() => setIsActivated(true)}
                        onLinkUnavailable={setUnavailableMessage}
                    />
                ) : null}
            </Card>
        </main>
    );
};

export default AdminActivationPage;
