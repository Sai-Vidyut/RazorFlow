# Architecture

RazorFlow is a Next.js App Router app with a server-side deterministic commerce agent, PostgreSQL persistence via Prisma, and Razorpay order creation on the server.

## Commerce pipeline

```
Merchant Context
      ↓
PostgreSQL Catalog
      ↓
Structured Buyer Intent          (Understand)
      ↓
Generic Product Retrieval/Ranking
      ↓
Deterministic Policy Engine    (Decide / Govern)
      ↓
Buyer Authorization
      ↓
Razorpay                       (Transact)
      ↓
Verified Payment
      ↓
Recovery (on failure)          (Recover)
      ↓
Audit + Admin metrics
```

**AI interprets buyer intent; the database is the source of truth for what can be sold; the deterministic policy engine is the financial authority.**

Phase 3B adds a server-side Gemini intent provider with deterministic fallback. Catalog retrieval, policy evaluation, checkout, and payment verification remain unchanged.

## Intent extraction (Phase 3B)

```
rawRequest
    ↓
extractIntent()  →  GeminiIntentProvider (structured JSON)
    ↓ (on failure / no key)
parse-intent.ts deterministic fallback
    ↓
StructuredIntent persisted on BuyerIntent
    ↓
matcher → policy → checkout → recovery
```

Gemini never receives the product catalog. Gemini never sets prices, discounts, or payment state.

## Surfaces

| Route | Job |
| --- | --- |
| `/` | Explain the product and send merchants to the desk |
| `/desk` | Run intent → recommendation → policy → payment UI |
| `/policies` | Show and adjust merchant guardrails (persisted) |
| `/admin` | Merchant control plane: overview, orders, payments, recovery, products, policies, activity, insights |

`GET /api/ledger` remains a merchant-authenticated JSON API used by the landing page for weekly GMV. There is no public `/ledger` UI.

## Merchant context

Demo merchant id resolves from `DEMO_MERCHANT_ID` (default `northline-audio`). Services receive `merchantId` from sessions or explicit config — not from hardcoded product names.

Buyer and merchant API routes enforce session/order ownership and merchant scoping on resource IDs.

## Catalog

`Product` rows are merchant-owned with:

- string `category` (not a fixed enum)
- integer paise pricing
- `inventory` and `active` flags
- flexible `metadata` JSON for attributes/features/use cases
- optional attach fields for cross-sell

`getAvailableCatalog(merchantId)` returns only active, in-stock products.

## Agent

`src/lib/agent/` is split into:

1. **Intent** (`intent.ts`, `gemini-intent-provider.ts`, `parse-intent.ts`, `structured-intent.ts`) — Gemini structured extraction with validated `StructuredIntent` JSON and deterministic fallback
2. **Matching** (`match-catalog.ts`) — ranks catalog products using category, metadata, tags, price constraints, and availability. Does not read raw natural language.
3. **Policy + decision** (`run-agent.ts`) — deterministic margin, budget, discount, order-cap, and attach guardrails

Execution runs on the server via `POST /api/agent/run`. Stored session intent is the source of truth at agent run and checkout re-check time.

## Persistence

PostgreSQL models: `Merchant`, `Product`, `Policy`, `BuyerSession`, `BuyerIntent`, `AgentDecision`, `Order`, `Payment`, `AuditEvent`.

Desk flow:

1. `POST /api/sessions` creates session + structured intent + audit events
2. `POST /api/agent/run` loads catalog/policies, ranks products, evaluates policy, persists decision + audit events
3. Admin dashboards and `/api/ledger` aggregate real session/decision data (GMV from verified captured payments only)

## Payments and recovery

| Step | Endpoint / service | State |
| --- | --- | --- |
| Checkout start | `POST /api/checkout` → `createCheckoutForSession` | Order `CREATED`, Payment `PENDING`, session `PAYMENT_PENDING` |
| Abandon (modal dismiss) | `POST /api/payments/abandon` → `abandonCheckout` | Order/Payment `CANCELLED`, session restored to `DECISION_MADE`, audit `CHECKOUT_ABANDONED` |
| Payment failure | `POST /api/payments/fail` or webhook | Order/Payment `FAILED`, session `PAYMENT_FAILED` |
| Capture | `POST /api/payments/verify` or webhook | Order `PAID`, Payment `CAPTURED`, session `PAYMENT_CAPTURED` |
| Recovery eval | `POST /api/recovery/evaluate` → `evaluateRecovery` | Policy + catalog re-check before retry |
| Recovery retry | `POST /api/checkout` (recovery context) | New order attempt, prior failures preserved |

GMV counts only `CAPTURED` payments with `razorpaySignatureVerified = true`.

Required env vars:

```
DATABASE_URL=
DEMO_MERCHANT_ID=northline-audio
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

## Data

Northline Audio seed data demonstrates the pipeline with a **40-product catalog** (headphones, earbuds, speakers, soundbars, cases, cables, chargers, adapters). Seed clears transactional runtime data on each run. New products and categories can be inserted into PostgreSQL without application code changes. The LLM (Phase 3B) must not be trusted with authoritative prices, payment amounts, policy decisions, or payment authorization.
