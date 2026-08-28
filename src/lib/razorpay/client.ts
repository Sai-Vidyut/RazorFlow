import Razorpay from "razorpay";

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null;
}

export function getRazorpayKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET ?? null;
}

export function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
}

export function isRazorpayConfigured() {
  return Boolean(getRazorpayKeyId() && getRazorpayKeySecret());
}

export function getRazorpayClient() {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function getPublicRazorpayKeyId() {
  const keyId = getRazorpayKeyId();
  if (!keyId) {
    throw new Error("Razorpay key ID is not configured");
  }
  return keyId;
}
