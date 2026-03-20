import { describe, test, expect } from "vitest";
import { filterScenarios, groupByDomain } from "./gherkin.js";
import type { ParsedFeature } from "./types.js";

function feature(overrides: Partial<ParsedFeature> = {}): ParsedFeature {
  return {
    name: "Test Feature",
    filePath: "/features/Test/test.feature",
    domain: "Test",
    rawContent: "",
    scenarios: [{ name: "Scenario A" }, { name: "Scenario B" }],
    ...overrides,
  };
}

describe("filterScenarios", () => {
  test("filters scenarios by name (case-insensitive)", () => {
    const features = [feature()];
    const result = filterScenarios(features, "scenario a");
    expect(result).toHaveLength(1);
    expect(result[0].scenarios).toEqual([{ name: "Scenario A" }]);
  });

  test("removes features with no matching scenarios", () => {
    const features = [feature()];
    const result = filterScenarios(features, "nonexistent");
    expect(result).toHaveLength(0);
  });

  test("partial match works", () => {
    const features = [feature({ scenarios: [{ name: "User can login" }] })];
    const result = filterScenarios(features, "login");
    expect(result).toHaveLength(1);
  });
});

describe("groupByDomain", () => {
  test("groups features by domain", () => {
    const features = [
      feature({ domain: "Auth" }),
      feature({ domain: "Billing" }),
      feature({ domain: "Auth", name: "Other" }),
    ];
    const groups = groupByDomain(features);
    expect(groups.size).toBe(2);
    expect(groups.get("Auth")).toHaveLength(2);
    expect(groups.get("Billing")).toHaveLength(1);
  });

  test("returns empty map for no features", () => {
    expect(groupByDomain([]).size).toBe(0);
  });
});
