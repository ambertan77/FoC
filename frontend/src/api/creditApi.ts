// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the axios instance for the credit service base URL.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import createApiClient from "./axios";

const creditApi = createApiClient(
    import.meta.env.VITE_CREDIT_API_BASE_URL,
);

export default creditApi;
