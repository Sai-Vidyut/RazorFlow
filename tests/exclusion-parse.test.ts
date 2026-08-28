import { describe, expect, it } from "vitest";
import {
  parseExclusionReferences,
  queryHasExclusionCue,
  stripExclusionClauses,
} from "@/lib/agent/exclusion-parse";

describe("parseExclusionReferences", () => {
  it("parses except phrasing", () => {
    expect(parseExclusionReferences("good headphones under 3k except northline commute lite")).toEqual([
      "northline commute lite",
    ]);
  });

  it("parses but not phrasing", () => {
    expect(parseExclusionReferences("give me the cheapest earbuds under 2k but not Daily Wired")).toEqual([
      "Daily Wired",
    ]);
  });

  it("parses multiple exclusions joined by and", () => {
    expect(
      parseExclusionReferences("show me headphones under 6k except Commute Lite and Bassline Over"),
    ).toEqual(["Commute Lite", "Bassline Over"]);
  });

  it("parses without and other-than phrasing", () => {
    expect(parseExclusionReferences("show me headphones without Commute Lite")).toEqual(["Commute Lite"]);
    expect(parseExclusionReferences("show me headphones other than Commute Lite")).toEqual(["Commute Lite"]);
  });

  it("returns empty when no exclusion cue exists", () => {
    expect(parseExclusionReferences("show me headphones under 3k")).toEqual([]);
  });
});

describe("stripExclusionClauses", () => {
  it("removes trailing exclusion clauses for entity resolution", () => {
    expect(stripExclusionClauses("good headphones under 3k except northline commute lite")).toBe(
      "good headphones under 3k",
    );
  });

  it("removes but-not clauses", () => {
    expect(stripExclusionClauses("earbuds under 2k but not Daily Wired")).toBe("earbuds under 2k");
  });
});

describe("queryHasExclusionCue", () => {
  it("detects exclusion language", () => {
    expect(queryHasExclusionCue("except Commute Lite")).toBe(true);
    expect(queryHasExclusionCue("show me headphones")).toBe(false);
  });
});
