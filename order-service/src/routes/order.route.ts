import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { Role } from "../types/auth.types.js";
import {
    acceptOrder,
    completeOrder,
    dropOrder,
    getCourierOrderHistory,
    getOpenOrders,
    pickUpOrder
} from "../controllers/order.courier.controller.js";
import { getAllOrders } from "../controllers/order.controller.js";
import { 
    cancelRequest,
    createRequest,
    failRequest,
    getRequesterOrderHistory,
    receiveRequest,
    renewExpiredRequest,
    updateRequest 
} from "../controllers/order.requester.controller.js";

const orderRouter = Router();

// All order endpoints require authentication
orderRouter.use(authenticate);

// ----------- Orders -----------
// Create a new order
orderRouter.post("", authorize(Role.STUDENT), createRequest);

// Get all orders with OPEN status 
orderRouter.get("", getOpenOrders);

// All requests made by the authenticated requester
// Can be filtered by status, sorted by createdAt or expiryAt, and paginated
orderRouter.get("/me/requester", authorize(Role.STUDENT), getRequesterOrderHistory);

// Orders accepted by the authenticated courier
orderRouter.get("/me/courier", authorize(Role.STUDENT), getCourierOrderHistory);

// Update a specific order by ID
orderRouter.patch("/:orderId", authorize(Role.STUDENT), updateRequest);

// Get all orders for admin dashboard
orderRouter.get("/all", authorize(Role.ADMIN), getAllOrders);

// Get a specific order by ID
// orderRouter.get("/:orderId");

// ----------- Order lifecycle -----------
// Cancel an order (by requester)
orderRouter.post("/:orderId/cancellation", authorize(Role.STUDENT), cancelRequest);

// Mark an order as received (by requester)
orderRouter.post("/:orderId/receipt", authorize(Role.STUDENT), receiveRequest);

// Mark an order as failed (by requester)
orderRouter.post("/:orderId/failure", authorize(Role.STUDENT), failRequest);

// Mark an order as renewed (by requester)
orderRouter.post("/:orderId/renewal", authorize(Role.STUDENT), renewExpiredRequest);

// Accept an order (by courier)
orderRouter.post("/:orderId/acceptance", authorize(Role.STUDENT), acceptOrder);

// Drop acceptance (by courier)
orderRouter.delete("/:orderId/acceptance", authorize(Role.STUDENT), dropOrder);

// Mark an order as picked up (by courier)
orderRouter.post("/:orderId/pickup", authorize(Role.STUDENT), pickUpOrder);

// Mark an order as completed (by courier)
orderRouter.post("/:orderId/completion", authorize(Role.STUDENT), completeOrder);

export default orderRouter;
