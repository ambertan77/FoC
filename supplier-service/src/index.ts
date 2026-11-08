import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import supplierRouter from "./routes/supplier.route.js";
import config from "./config/config.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { storage } from "./libs/storage.js";
import { AppError } from "./errors/errors.js";
import internalSupplierRouter from "./routes/internal-supplier.route.js";

const app = express();

await storage.init(); // initialise the storage class, based on how we are running this app

app.use(
    cors({
        origin: config.frontendUrl,
        credentials: true,
    }),
);

app.use(express.json());

app.use("/api/internal/suppliers", internalSupplierRouter);

// Health check endpoint
app.get("/healthz", (_req: Request, res: Response) => {
    res.send("Suppliers service is running");
});

app.use("/api/suppliers", supplierRouter);

// Catch all * not found routes
app.use((_req: Request, _res: Response) => {
    throw new AppError("Not found", 404);
});

app.use(errorHandler);

const PORT = config.port;

app.listen(PORT, () => {
    console.log(`Supplier service is running at http://localhost:${PORT}`);
});