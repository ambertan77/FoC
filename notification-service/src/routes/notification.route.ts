import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getNotifications, getUnreadCount, readAllNotifications, readNotification, streamNotifications } from "../controllers/notification.controller.js";

const router = Router();

router.use(authenticate);

router.get("/stream", streamNotifications);
router.get("/unread-count", getUnreadCount);
router.post("/read-all", readAllNotifications);

router.get("/", getNotifications);
router.patch("/:notificationId/read", readNotification);

export default router;
