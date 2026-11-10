// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-10-28
// Scope: Added .trim().min(1) to line 10 to ensure invalid strings will be rejected. 
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { z } from "zod";

export const supplierTypeSchema = z.object({
    type: z.string().trim().min(1).toUpperCase() // ensure all types are saved in upper case
});

export type supplierTypeInput = z.infer<typeof supplierTypeSchema>;
