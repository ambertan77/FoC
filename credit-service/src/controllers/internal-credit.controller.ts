// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Synchronous reservation create, lookup and abort HTTP handlers (router currently disabled in the running service).
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { abortReservation, getReservation, reserveCredits } from "../services/credit.service.js";
import {
    abortReservationSchema,
    reservationIdSchema,
    reservationSchema,
} from "../schemas/reservation.schema.js";

export const createReservationController = async (
    req: Request, res: Response
) => {
    const parsedBody = reservationSchema.safeParse(req.body);

    if (!parsedBody.success) {
        throw new AppError("Invalid reservation", 400);
    }

    const result = await reserveCredits(prisma, parsedBody.data);

    res.status(result.created ? 201 : 200).json({
        success: true,
        data: result.reservation,
    });
};

export const getReservationController = async (
    req: Request, res: Response
) => {
    const parsedId = reservationIdSchema.safeParse(req.params.reservationId);

    if (!parsedId.success) {
        throw new AppError("Invalid reservation ID", 400);
    }

    const reservation = await getReservation(prisma, parsedId.data);

    res.status(200).json({
        success: true,
        data: reservation,
    });
};

export const abortReservationController = async (
    req: Request, res: Response
) => {
    const parsedId = reservationIdSchema.safeParse(req.params.reservationId);
    const parsedBody = abortReservationSchema.safeParse(req.body);

    if (!parsedId.success || !parsedBody.success) {
        throw new AppError("Invalid reservation", 400);
    }

    if (parsedId.data !== parsedBody.data.reservationId) {
        throw new AppError("Reservation ID does not match request body", 400);
    }

    const result = await abortReservation(prisma, parsedBody.data);

    res.status(200).json({
        success: true,
        data: result.reservation,
    });
};
