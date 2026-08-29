import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureVerifiedBuyerForCheckout, runDeskAgentWithIntent } from "./baseline";
import { isRazorpayConfigured } from "./env";

async function resolveBuyerSessionId(request: APIRequestContext): Promise<string> {
  const ctxRes = await request.get("/api/desk/context");
  if (ctxRes.ok()) {
    const ctx = (await ctxRes.json()) as { auth?: { sessionId?: string | null } };
    if (ctx.auth?.sessionId) {
      return ctx.auth.sessionId;
    }
  }
  throw new Error("Buyer session cookie missing");
}

function signPayment(orderId: string, paymentId: string, secret: string) {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

export async function captureCurrentDeskSaleViaApi(page: Page) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) {
    throw new Error("RAZORPAY_KEY_SECRET is required to capture desk sales in E2E");
  }

  const sessionId = await resolveBuyerSessionId(page.request);
  const checkoutRes = await page.request.post("/api/checkout", {
    data: { sessionId, source: "cart" },
  });
  expect(checkoutRes.ok()).toBeTruthy();
  const checkout = (await checkoutRes.json()) as {
    orderId: string;
    razorpayOrderId: string;
  };

  const paymentId = `pay_e2e_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const signature = signPayment(checkout.razorpayOrderId, paymentId, secret);
  const verifyRes = await page.request.post("/api/payments/verify", {
    data: {
      orderId: checkout.orderId,
      razorpay_order_id: checkout.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    },
  });
  expect(verifyRes.ok()).toBeTruthy();
  const payload = (await verifyRes.json()) as { capturedPayment?: { orderLabel: string } };
  expect(payload.capturedPayment?.orderLabel).toMatch(/^RF-/);
  return payload;
}

export async function installRazorpaySuccessMock(page: Page) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) {
    throw new Error("RAZORPAY_KEY_SECRET is required for Razorpay UI mocks");
  }

  await page.exposeFunction("razorflowSignTestPayment", (orderId: string, paymentId: string) =>
    signPayment(orderId, paymentId, secret),
  );

  await page.addInitScript(() => {
    class MockRazorpay {
      options: {
        order_id: string;
        handler: (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => void | Promise<void>;
        modal?: { ondismiss?: () => void };
      };

      constructor(options: MockRazorpay["options"]) {
        this.options = options;
      }

      open() {
        void (async () => {
          const paymentId = `pay_ui_${Date.now()}`;
          const signature = await (
            window as unknown as {
              razorflowSignTestPayment: (orderId: string, paymentId: string) => Promise<string>;
            }
          ).razorflowSignTestPayment(this.options.order_id, paymentId);
          await this.options.handler({
            razorpay_order_id: this.options.order_id,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
          });
        })();
      }

      on() {}
    }

    (window as unknown as { Razorpay: typeof MockRazorpay }).Razorpay = MockRazorpay;
  });
}

export async function installRazorpayDismissMock(page: Page) {
  await page.addInitScript(() => {
    class MockRazorpay {
      options: { modal?: { ondismiss?: () => void } };

      constructor(options: MockRazorpay["options"]) {
        this.options = options;
      }

      open() {
        this.options.modal?.ondismiss?.();
      }

      on() {}
    }

    (window as unknown as { Razorpay: typeof MockRazorpay }).Razorpay = MockRazorpay;
  });
}

export async function prepareCapturedDeskSale(page: Page) {
  test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");
  await runDeskAgentWithIntent(page);
  await ensureVerifiedBuyerForCheckout(page);
  await captureCurrentDeskSaleViaApi(page);
}
