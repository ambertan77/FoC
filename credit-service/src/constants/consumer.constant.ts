// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Settlement message size and retry limits used by transfer, release and refund processing.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

export const MAX_REQUEST_BYTES = 65_536;
export const MAX_RETRIES = 5;

export const MAX_SETTLEMENT_BYTES = 65_536;