import { describe, expect, it } from "vitest";
import {
  formatOrderLabel,
  formatPaidWhen,
  maskRazorpayPaymentId,
  primaryProductName,
} from "@/lib/desk/payment-display";

describe("desk payment display helpers", () => {
  it("formats order labels for desk display", () => {
    expect(formatOrderLabel("clxyz123abc456")).toMatch(/^RF-[A-Z0-9]{6}$/);
  });

  it("masks Razorpay payment ids", () => {
    expect(maskRazorpayPaymentId("pay_abcdefghij")).toBe("pay_••••ij");
  });

  it("formats recent capture timestamps", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    expect(formatPaidWhen("2026-08-29T11:59:30.000Z", now)).toBe("Paid just now");
  });

  it("summarizes product names", () => {
    expect(primaryProductName(["Northline Halo ANC"])).toBe("Northline Halo ANC");
    expect(primaryProductName(["Northline Halo ANC", "Commute Lite"])).toBe("Northline Halo ANC + 1 more");
  });
});
