// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the student credits page combining the shared balance and the transaction history.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { CoinsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import CreditHistory from "@/features/credit/components/CreditHistory";
import { formatCredits } from "@/features/credit/credit.presentation";
import useCreditBalance from "@/features/credit/hooks/useCreditBalance";
import useAuth from "@/hooks/useAuth";

const CreditsPage = () => {
    const { user } = useAuth();
    const credit = useCreditBalance();
    const busy = credit.fetchStatus !== "idle";
    const denied = credit.error?.statusCode === 401 || credit.error?.statusCode === 403;
    const balance = !denied && credit.data?.status === "READY" ? credit.data : undefined;
    const { state } = credit;

    if (!credit.isEligible || !user) return null;

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 md:px-10 md:py-10">
            <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-900">
                    <CoinsIcon className="size-5" aria-hidden="true" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">My credits</h1>
                    <p className="text-sm text-slate-600">View your balances and credit activity.</p>
                </div>
            </div>

            <section aria-label="Credit balances" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="bg-white">
                        <CardHeader>
                            <h2 className="font-medium text-slate-700">Available credits</h2>
                            <CardDescription>Ready to spend.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-indigo-900 tabular-nums" aria-label="Available credit balance">
                                {balance ? formatCredits(balance.availableCredits) : "—"}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-white">
                        <CardHeader>
                            <h2 className="font-medium text-slate-700">Reserved credits</h2>
                            <CardDescription>Held for pending errands.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-slate-900 tabular-nums" aria-label="Reserved credit balance">
                                {balance ? formatCredits(balance.reservedCredits) : "—"}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {state.status === "loading" && (
                    <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
                        <Spinner />{credit.fetchStatus === "paused" ? "Waiting for a connection…" : "Loading credit balances…"}
                    </p>
                )}
                {(state.status === "provisioning" || state.status === "delayed") && (
                    <div role="status" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                        <p className="font-medium text-slate-900">
                            {state.status === "delayed" ? "Credit setup is taking longer than expected" : "Setting up credits"}
                        </p>
                        <p className="text-slate-600">Your credit account is not ready yet. You can continue using the app and check again later.</p>
                        {state.status === "delayed" && (
                            <Button variant="outline" disabled={busy} onClick={() => { void credit.retry(); }}>Retry credit setup</Button>
                        )}
                    </div>
                )}
                {state.status === "unavailable" && (
                    <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
                        <p className="font-medium text-slate-900">Unable to load credit balances</p>
                        <p className="text-slate-700">{state.error.message}</p>
                        {balance && <p className="text-slate-700">Showing previously loaded balances. They may be outdated.</p>}
                        <Button variant="outline" disabled={busy} onClick={() => { void credit.retry(); }}>Retry credit balances</Button>
                    </div>
                )}
            </section>

            <Card className="bg-white">
                <CardHeader className="border-b border-slate-200 pb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Transaction history</h2>
                    <CardDescription>See how each transaction changes your available and reserved credits.</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* A new account starts with fresh history controls and cursors. */}
                    {balance ? <CreditHistory key={user.id} userId={user.id} /> : (
                        <p className="py-8 text-center text-sm text-slate-600">
                            {state.status === "unavailable"
                                ? "Retry loading your balances to check transaction history."
                                : "History will be available once your credit account is ready."}
                        </p>
                    )}
                </CardContent>
            </Card>
        </main>
    );
};

export default CreditsPage;
