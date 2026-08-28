import { describe, expect, it } from "vitest";
import { parseBudgetInr } from "@/lib/agent/budget-parse";
import { parseIntent } from "@/lib/agent/parse-intent";

describe("parseBudgetInr", () => {
  it("parses under 3k", () => {
    expect(parseBudgetInr("good headphones under 3k")).toBe(3000);
  });

  it("parses under ₹8,389", () => {
    expect(parseBudgetInr("Northline Halo ANC under ₹8,389")).toBe(8389);
  });

  it("parses budget ₹8,500", () => {
    expect(parseBudgetInr("halo-anc Halo ANC for a 14-hour flight, budget ₹8,500")).toBe(8500);
  });

  it("parses less than 3000", () => {
    expect(parseBudgetInr("headphones less than 3000")).toBe(3000);
  });

  it("parses max 3000", () => {
    expect(parseBudgetInr("max 3000")).toBe(3000);
  });

  it("parses 3 thousand", () => {
    expect(parseBudgetInr("budget of 3 thousand")).toBe(3000);
  });

  it("returns null when no budget cue exists", () => {
    expect(parseBudgetInr("show me headphones")).toBeNull();
  });
});

describe("parseIntent budget integration", () => {
  it("sets maxPricePaise for under 3k queries", () => {
    const intent = parseIntent("good headphones under 3k");
    expect(intent.constraints.maxPricePaise).toBe(300_000);
    expect(intent.category).toBe("headphones");
  });
});
