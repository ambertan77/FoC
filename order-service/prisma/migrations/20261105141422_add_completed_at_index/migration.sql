-- CreateIndex
CREATE INDEX "Order_status_completedAt_idx" ON "Order"("status", "completedAt");
