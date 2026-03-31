import { describe, test, expect } from "vitest";
import { buildPrompt, buildScenarioMappings } from "./prompt.js";
import type { ParsedFeature } from "./types.js";

describe("buildScenarioMappings", () => {
  test("assigns sequential IDs across features", () => {
    const features: ParsedFeature[] = [
      {
        name: "Login",
        filePath: "/features/login.feature",
        domain: "Auth",
        rawContent: "",
        scenarios: [{ name: "Valid login" }, { name: "Invalid login" }],
      },
      {
        name: "Register",
        filePath: "/features/register.feature",
        domain: "Auth",
        rawContent: "",
        scenarios: [{ name: "New user" }],
      },
    ];
    const mappings = buildScenarioMappings(features);
    expect(mappings).toEqual([
      { id: "s1", name: "Valid login" },
      { id: "s2", name: "Invalid login" },
      { id: "s3", name: "New user" },
    ]);
  });
});

describe("buildPrompt", () => {
  const feature: ParsedFeature = {
    name: "Login",
    filePath: "/features/Auth/login.feature",
    domain: "Auth",
    rawContent: "Feature: Login\n  Scenario: Valid login",
    scenarios: [{ name: "Valid login" }],
  };

  const mappings = [{ id: "s1", name: "Valid login" }];

  test("includes feature content", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "URL: http://localhost",
      screenshotsDir: "/tmp/screenshots",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("Feature: Login");
  });

  test("includes config content", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "URL: http://localhost",
      screenshotsDir: "/tmp/screenshots",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("URL: http://localhost");
  });

  test("includes scenario ID mapping when no filter", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("ALL");
    expect(prompt).toContain("s1: Valid login");
  });

  test("includes scenario ID mapping with filter", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: "login",
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("s1: Valid login");
    expect(prompt).not.toContain("ALL");
  });

  test("replaces all occurrences of screenshots dir", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp/shots",
      scenarioMappings: mappings,
    });
    expect(prompt).not.toContain("{SCREENSHOTS_DIR}");
    expect(prompt).toContain("/tmp/shots");
  });

  test("uses headless browser open by default", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("`playwright-cli open`");
    expect(prompt).not.toContain("open --headed`");
    expect(prompt).not.toContain("{BROWSER_OPEN}");
  });

  test("uses headed browser open when headed is true", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
      headed: true,
    });
    expect(prompt).toContain("playwright-cli open --headed");
  });

  test("includes playwright-cli command reference", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("playwright-cli snapshot");
    expect(prompt).toContain("playwright-cli click");
    expect(prompt).toContain("playwright-cli fill");
  });

  test("includes MCP tool reference for reporting", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("mcp__exspec__report_scenario_result");
  });

  test("joins multiple features with separator", () => {
    const feature2: ParsedFeature = {
      ...feature,
      name: "Register",
      rawContent: "Feature: Register\n  Scenario: New user",
    };
    const prompt = buildPrompt({
      features: [feature, feature2],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
      scenarioMappings: mappings,
    });
    expect(prompt).toContain("Feature: Login");
    expect(prompt).toContain("Feature: Register");
    expect(prompt).toContain("---");
  });
});
