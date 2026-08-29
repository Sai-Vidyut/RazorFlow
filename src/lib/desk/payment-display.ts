export type CapturedPaymentView = {
  orderId: string;
  orderLabel: string;
  paymentId: string;
  razorpayPaymentId: string;
  razorpayPaymentIdMasked: string;
  amountInr: number;
  capturedAt: string;
  productName: string;
  status: "CAPTURED";
};

export function formatOrderLabel(orderId: string): string {
  const compact = orderId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `RF-${compact.slice(-6).padStart(6, "0")}`;
}

export function maskRazorpayPaymentId(paymentId: string): string {
  if (paymentId.length <= 7) return paymentId;
  return `${paymentId.slice(0, 4)}••••${paymentId.slice(-2)}`;
}

export function formatPaidWhen(iso: string, now = Date.now()): string {
  const capturedMs = new Date(iso).getTime();
  if (Number.isNaN(capturedMs)) return "Paid recently";
  const deltaMs = Math.max(0, now - capturedMs);
  if (deltaMs < 60_000) return "Paid just now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `Paid ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Paid ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Paid ${days}d ago`;
}

export function primaryProductName(names: string[]): string {
  if (names.length === 0) return "Your order";
  if (names.length === 1) return names[0]!;
  return `${names[0]!} + ${names.length - 1} more`;
}
