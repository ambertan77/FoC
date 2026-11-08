// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the credit history view with type filter, sort control and load-more pagination; later refactored to compact controls and a single footer.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creditKeys } from "../hooks/credit.keys";
import { transactionLabels } from "../credit.presentation";
import useCreditTransactions from "../hooks/useCreditTransactions";
import {
    CREDIT_TRANSACTION_TYPES,
    type CreditTransactionSort,
    type CreditTransactionType,
} from "../types/credit.types";
import CreditTransactionList from "./CreditTransactionList";

interface HistoryView {
    sort: CreditTransactionSort;
    type?: CreditTransactionType;
    cursors: (string | undefined)[];
}

const CreditHistory = ({ userId }: { userId: string }) => {
    const queryClient = useQueryClient();
    const [view, setView] = useState<HistoryView>({ sort: "desc", cursors: [undefined] });
    const cursor = view.cursors.at(-1);
    const query = useCreditTransactions({ sort: view.sort, type: view.type, cursor, limit: 20 });
    const busy = query.fetchStatus !== "idle";
    const firstPage = view.cursors.length === 1;
    // Never retain cached private rows beneath an authorization failure.
    const denied = query.error?.statusCode === 401 || query.error?.statusCode === 403;
    const page = !denied && query.data?.status === "READY" ? query.data : undefined;
    const cursorError = cursor !== undefined && query.error?.statusCode === 400;

    const restart = () => {
        if (!query.isEligible || busy) return;
        // Expire visited pages too: the API paginates live data, not a snapshot.
        void queryClient.invalidateQueries({ queryKey: creditKeys.transactions(userId), refetchType: "none" });
        setView(current => ({ ...current, cursors: [undefined] }));
        if (firstPage) void query.retry();
    };

    if (!query.isEligible) return null;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Select
                    value={view.sort}
                    onValueChange={value => {
                        if (value === null) return;
                        setView(current => ({ ...current, sort: value, cursors: [undefined] }));
                    }}
                >
                    <SelectTrigger aria-label="Sort by timestamp" className="w-full bg-white sm:w-48">
                        <SelectValue>Sort: {view.sort === "desc" ? "Newest first" : "Oldest first"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value="desc">Newest first</SelectItem>
                        <SelectItem value="asc">Oldest first</SelectItem>
                    </SelectContent>
                </Select>
                <Select<CreditTransactionType | "ALL">
                    value={view.type ?? "ALL"}
                    onValueChange={value => {
                        if (value === null) return;
                        setView(current => ({
                            ...current, type: value === "ALL" ? undefined : value, cursors: [undefined],
                        }));
                    }}
                >
                    <SelectTrigger aria-label="Transaction type" className="w-full bg-white sm:w-72">
                        <SelectValue>Type: {view.type ? transactionLabels[view.type] : "All transactions"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value="ALL">All transactions</SelectItem>
                        {CREDIT_TRANSACTION_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{transactionLabels[type]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="lg" className="sm:ml-auto" disabled={busy} onClick={restart}>
                    Refresh history
                </Button>
            </div>

            {busy && (
                <div role="status" aria-live="polite" className="text-sm text-slate-600">
                    {query.fetchStatus === "paused" ? "Waiting for a connection…" : (
                        <span className="inline-flex items-center gap-2"><Spinner />Loading transactions…</span>
                    )}
                </div>
            )}

            {query.isError && (
                <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
                    <p className="font-medium text-slate-900">Unable to load transactions</p>
                    <p className="text-slate-700">{query.error.message}</p>
                    {page && <p className="text-slate-700">Showing previously loaded transactions. They may be outdated.</p>}
                    <Button variant="outline" disabled={busy} onClick={cursorError ? restart : () => { void query.retry(); }}>
                        {cursorError ? "Return to first page" : "Retry transactions"}
                    </Button>
                </div>
            )}

            {!query.isError && query.data?.status === "PROVISIONING" && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-6 text-center text-sm" role="status">
                    <p className="font-medium text-slate-900">Transaction history is not ready yet</p>
                    <p className="text-slate-600">Your credit account is still being set up. You can check again later.</p>
                    <Button variant="outline" disabled={busy} onClick={() => { void query.retry(); }}>Retry transactions</Button>
                </div>
            )}

            {page && page.items.length > 0 && <CreditTransactionList items={page.items} />}
            {page && page.items.length === 0 && !query.isError && (
                <div className="space-y-3 rounded-lg bg-slate-50 px-4 py-10 text-center text-sm" role="status">
                    <p className="font-medium text-slate-900">
                        {!firstPage ? "No transactions on this page" : view.type ? "No transactions match this type" : "No transactions yet"}
                    </p>
                    {view.type && (
                        <Button variant="outline" onClick={() => setView(current => ({ ...current, type: undefined, cursors: [undefined] }))}>
                            Clear filter
                        </Button>
                    )}
                    {!firstPage && <Button variant="outline" disabled={busy} onClick={restart}>Return to first page</Button>}
                </div>
            )}

            {(page || !firstPage) && (
                <nav aria-label="Transaction pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <span className="text-sm text-slate-600">
                        Page {view.cursors.length}
                        {page && ` · Showing ${page.items.length} ${page.items.length === 1 ? "transaction" : "transactions"}`}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="outline" disabled={firstPage || busy} onClick={() => setView(current => ({
                            ...current, cursors: current.cursors.slice(0, -1),
                        }))}>Previous</Button>
                        <Button variant="outline" disabled={busy || query.isError || !page?.nextCursor} onClick={() => {
                            const nextCursor = page?.nextCursor;
                            if (nextCursor) setView(current => ({ ...current, cursors: [...current.cursors, nextCursor] }));
                        }}>Next</Button>
                    </div>
                </nav>
            )}
        </div>
    );
};

export default CreditHistory;
