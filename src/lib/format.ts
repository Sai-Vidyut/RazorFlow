export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  notation: "standard",
});

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

export function formatInr(rupees: number) {
  return inr.format(rupees);
}

export function formatDelta(rupees: number) {
  const sign = rupees >= 0 ? "+" : "";
  return `${sign}${inr.format(rupees)}`;
}
