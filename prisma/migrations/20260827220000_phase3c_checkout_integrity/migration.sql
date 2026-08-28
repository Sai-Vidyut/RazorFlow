-- Prevent duplicate active or paid orders for the same session + decision.
-- FAILED orders are excluded so payment retries can create a new order.
CREATE UNIQUE INDEX "Order_active_session_decision_key"
ON "Order" ("sessionId", "decisionId")
WHERE "status" IN ('CREATED', 'PAID');
