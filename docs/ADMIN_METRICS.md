# Admin Portal metrics

All Admin Portal numbers are computed from PostgreSQL at request time. There are no hardcoded demo transaction values, random fallbacks, or seeded buyer/commerce activity.

Running `npx prisma db seed` keeps merchant/catalog/policy configuration and **clears** buyer sessions, agent decisions, orders, payments, and audit events for the demo merchant.

## Commerce

| Metric | Definition |
|--------|------------|
| **GMV / captured revenue** | Sum of `Order.amountPaise` for payments with `Payment.status = CAPTURED` only. |
| **Orders** | Count of `Order` rows scoped to the merchant. |
| **Successful payments** | Count of `Payment` rows with `status = CAPTURED`. |
| **Failed payments** | Count of `Payment` rows with `status = FAILED`. |
| **Pending payments** | Count of `Payment` rows with `status = PENDING`. |
| **Conversion rate** | `CAPTURED payment count ÷ CHECKOUT_STARTED audit event count`. Null when no checkout attempts exist. |

## Agent

| Metric | Definition |
|--------|------------|
| **Agent decisions** | Non-superseded `AgentDecision` rows for the merchant. |
| **Offers generated** | Non-superseded decisions with a `primaryProductId` (agent issued an offer). |
| **Policy blocks** | Non-superseded decisions with `policyAllowed = false`. |
| **Checkout attempts** | `AuditEvent` rows with `type = CHECKOUT_STARTED`. |
| **Payment failures** | Same as failed payments: `Payment.status = FAILED`. |
| **Attach rate** | Policy-allowed decisions with `attachProductId` ÷ policy-allowed decisions with `primaryProductId`. Null when none eligible. |

## Product performance

| Metric | Definition |
|--------|------------|
| **Times recommended** | Non-superseded decisions where `primaryProductId` matches the product. |
| **Times purchased** | `Order.status = PAID` where `decision.primaryProductId` matches the product. |
| **Revenue** | Sum of `Order.amountPaise` for those paid orders (primary attribution only). |

Products with zero recommendations, purchases, and revenue are omitted from Insights.

## Empty states

A freshly seeded database shows zeros and empty lists until real buyer desk, agent, checkout, or admin mutations occur.
