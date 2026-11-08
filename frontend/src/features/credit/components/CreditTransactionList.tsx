// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the transaction list rendering labels, descriptions, signed deltas and timestamps.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import {
  formatCreditDelta,
  formatCredits,
  formatCreditTimestamp,
  transactionDescriptions,
  transactionLabels,
} from "../credit.presentation";
import type { CreditTransaction } from "../types/credit.types";

const Timestamp = ({ value }: { value: string }) => (
  <time dateTime={value}>{formatCreditTimestamp(value)}</time>
);

const TransactionType = ({
  transaction,
}: {
  transaction: CreditTransaction;
}) => (
  <>
    <p className="font-medium text-slate-900">
      {transactionLabels[transaction.type]}
    </p>
    {transactionDescriptions[transaction.type] && (
      <p className="mt-1 text-xs text-slate-600">
        {transactionDescriptions[transaction.type]}
      </p>
    )}
  </>
);

const BalanceDelta = ({ value }: { value: number }) => (
  <span
    className={
      value > 0
        ? "text-green-700"
        : value < 0
          ? "text-red-700"
          : "text-slate-600"
    }>
    {formatCreditDelta(value)}
  </span>
);

const Amount = ({ transaction }: { transaction: CreditTransaction }) => (
  <div className="tabular-nums">
    <p className="font-medium text-slate-900">
      {formatCredits(transaction.amount)} credits
    </p>
    <p className="mt-1 text-xs text-slate-600">
      Available <BalanceDelta value={transaction.availableDelta} />
    </p>
    <p className="text-xs text-slate-600">
      Reserved <BalanceDelta value={transaction.reservedDelta} />
    </p>
  </div>
);

const Errand = ({ orderId }: { orderId: string | null }) => (
  <span
    className="break-all text-slate-600"
    aria-label={orderId === null ? "No associated errand" : undefined}>
    {orderId ?? "—"}
  </span>
);

const CreditTransactionList = ({ items }: { items: CreditTransaction[] }) => (
  <>
    <table className="hidden w-full table-fixed text-left text-sm md:table">
      <caption className="sr-only">
        Credit transactions and their effects on your balances
      </caption>
      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
        <tr>
          <th
            scope="col"
            className="w-1/4 p-4 font-medium">
            Date and time
          </th>
          <th
            scope="col"
            className="w-1/4 p-4 font-medium">
            Type
          </th>
          <th
            scope="col"
            className="w-1/4 p-4 font-medium">
            Amount
          </th>
          <th
            scope="col"
            className="w-1/4 p-4 font-medium">
            Order ID
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((transaction) => (
          <tr
            key={transaction.id}
            className="align-top">
            <td className="p-4 text-slate-600">
              <Timestamp value={transaction.createdAt} />
            </td>
            <td className="p-4">
              <TransactionType transaction={transaction} />
            </td>
            <td className="p-4">
              <Amount transaction={transaction} />
            </td>
            <td className="p-4 text-xs">
              <Errand orderId={transaction.orderId} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <ul
      className="space-y-3 md:hidden"
      aria-label="Credit transactions">
      {items.map((transaction) => (
        <li
          key={transaction.id}
          className="rounded-lg border border-slate-200 p-4">
          <TransactionType transaction={transaction} />
          <p className="mt-2 text-xs text-slate-600">
            <Timestamp value={transaction.createdAt} />
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="mb-1 text-xs text-slate-500">Amount</dt>
              <dd>
                <Amount transaction={transaction} />
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-slate-500">Order ID</dt>
              <dd className="text-xs">
                <Errand orderId={transaction.orderId} />
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  </>
);

export default CreditTransactionList;
