ALTER TYPE "OrderEventType" RENAME VALUE 'CREDIT_RESERVATION_REQUEST' TO 'RESERVE_CREDITS';

UPDATE "OutboxEvent"
SET "payload" = jsonb_set("payload"::jsonb, '{eventType}', '"RESERVE_CREDITS"')
WHERE "status" IN ('PENDING', 'PROCESSING')
  AND "payload"->>'eventType' = 'CREDIT_RESERVATION_REQUEST';