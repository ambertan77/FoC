// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Admin routes for creating, updating, deactivating and activating suppliers.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { Role } from "../types/auth.types.js";
import { upload } from "../middleware/upload.middleware.js";
import { uploadSupplierImage, serveAsset } from "../controllers/supplier.asset.controller.js"
import { countSuppliersForType, createSupplierType, deleteSupplierType, getAllSupplierTypes } from "../controllers/supplier.type.controller.js";
import {
    createSupplier,
    updateSupplier,
    getSuppliers,
    getActiveSuppliers,
    getSuppliersByIds,
    deactivateSupplier,
    activateSupplier
} from "../controllers/supplier.controller.js";


const supplierRouter = Router();

// Get a supplier image based on its file name (no authentication)
supplierRouter.get("/assets/images/:filename", serveAsset);

// All supplier endpoints require authentication
supplierRouter.use(authenticate);


// --------------------- Supplier Types -----------------------
// Query supplier types
supplierRouter.get("/types", getAllSupplierTypes);

// Count the number of suppliers with a specified typeId
supplierRouter.get("/types/count", authorize(Role.ADMIN), countSuppliersForType);

// Create new supplier type
supplierRouter.post("/types", authorize(Role.ADMIN), createSupplierType);

// Delete existing supplier type
supplierRouter.delete("/types/:typeId", authorize(Role.ADMIN), deleteSupplierType);


// ------------------------ Suppliers -------------------------
// Query the ALL suppliers listed based on the current page number, search key and filters
supplierRouter.get("", authorize(Role.ADMIN), getSuppliers);

// Query the ACTIVE suppliers listed based on the current page number, search key and filters
supplierRouter.get("/active", getActiveSuppliers);

// Query the suppliers by providing a list of supplier ids we want to retrieve (name, id, type) information for
supplierRouter.get("/by-ids", getSuppliersByIds);

// Create a new supplier (by admin)
supplierRouter.post("", authorize(Role.ADMIN), createSupplier);

// Update an existing supplier (by admin)
supplierRouter.patch("/:supplierId", authorize(Role.ADMIN), updateSupplier);

// Deactivate an existing supplier (by admin)
supplierRouter.patch("/:supplierId/deactivation", authorize(Role.ADMIN), deactivateSupplier);

// Activate an existing supplier (by admin)
supplierRouter.patch("/:supplierId/activation", authorize(Role.ADMIN), activateSupplier);


// ------------------------- Assets -------------------------
// Upload a new supplier image (by admin)
supplierRouter.post("/assets/images", authorize(Role.ADMIN), upload.single("image"), uploadSupplierImage);


export default supplierRouter;
