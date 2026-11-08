// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-13
// Scope: Generated presentation helpers: transactionLabels, transactionDescriptions, formatCredits, formatCreditDelta and formatCreditTimestamp.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { CreditTransactionType } from "./types/credit.types";

export const transactionLabels: Record<CreditTransactionType, string> = {
    INITIAL_ALLOCATION: "Initial allocation",
    RESERVATION: "Credits reserved",
    TRANSFER_SENT: "Transfer sent",
    TRANSFER_RECEIVED: "Transfer received",
    RELEASE: "Reserved credits released",
    REFUND: "Refund",
};

export const transactionDescriptions: Partial<Record<CreditTransactionType, string>> = {
    INITIAL_ALLOCATION: "Starting credits for your account.",
    RESERVATION: "Moved from available to reserved for an errand.",
    RELEASE: "Previously reserved credits made available again.",
};

const numberFormatter = new Intl.NumberFormat();
const deltaFormatter = new Intl.NumberFormat(undefined, { signDisplay: "exceptZero" });
const timestampFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Singapore",
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
});

export const formatCredits = (value: number) => numberFormatter.format(value);
export const formatCreditDelta = (value: number) => deltaFormatter.format(value);
export const formatCreditTimestamp = (value: string) => timestampFormatter.format(new Date(value));
