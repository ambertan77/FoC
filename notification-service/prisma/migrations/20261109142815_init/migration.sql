-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "data" JSONB NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "eventId" UUID NOT NULL,
    "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_seq_key" ON "Notification"("seq");

-- CreateIndex
CREATE INDEX "Notification_userId_seq_idx" ON "Notification"("userId", "seq" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_eventId_key" ON "Notification"("userId", "eventId");
