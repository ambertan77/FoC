// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Supplier creation and update form validation.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { z } from "zod";

export const supplierDayValues = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
] as const;

export const supplierFormSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z
        .string()
        .min(1, "Please select a supplier type"),
    description: z.string().min(1, "Description is required"),
    address: z.string().min(1, "Address is required"),
    building: z.string().min(1, "Building is required"),
    floor: z.string().min(1, "Floor is required"),
    latitude: z.string(),
    longitude: z.string(),
    imageUrl: z.string(),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const supplierDayLabels: Record<typeof supplierDayValues[number], string> = {
    MONDAY: "Monday",
    TUESDAY: "Tuesday",
    WEDNESDAY: "Wednesday",
    THURSDAY: "Thursday",
    FRIDAY: "Friday",
    SATURDAY: "Saturday",
    SUNDAY: "Sunday",
};

export const supplierTypeFormSchema = z.object({
    type: z.string().toUpperCase(),
})
