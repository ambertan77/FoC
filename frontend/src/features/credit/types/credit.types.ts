// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Suggested the credit balance, provisioning and transaction types and the CREDIT_TRANSACTION_TYPES list.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

export type CreditProvisioningResponse = {
    success: true;
    data: { status: "PROVISIONING" };
};

export type CreditBalanceReadyResponse = {
    success: true;
    data: {
        status: "READY";
        availableCredits: number;
        reservedCredits: number;
        updatedAt: string;
    };
};

export type CreditBalanceResponse = CreditBalanceReadyResponse | CreditProvisioningResponse;

export type CreditBalance = CreditBalanceResponse["data"];

export const CREDIT_TRANSACTION_TYPES = [
    "INITIAL_ALLOCATION",
    "RESERVATION",
    "TRANSFER_SENT",
    "TRANSFER_RECEIVED",
    "RELEASE",
    "REFUND",
] as const;

export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
export type CreditTransactionSort = "asc" | "desc";

export interface CreditTransaction {
    id: string;
    type: CreditTransactionType;
    amount: number;
    availableDelta: number;
    reservedDelta: number;
    createdAt: string;
    orderId: string | null;
}

export interface CreditTransactionParams {
    sort: CreditTransactionSort;
    type?: CreditTransactionType;
    limit: number;
    cursor?: string;
}

export type CreditTransactions =
    | { status: "PROVISIONING" }
    | { status: "READY"; items: CreditTransaction[]; nextCursor: string | null };
