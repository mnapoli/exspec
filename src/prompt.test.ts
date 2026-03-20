import { describe, test, expect } from "vitest";
import { buildPrompt } from "./prompt.js";
import type { ParsedFeature } from "./types.js";

describe("buildPrompt", () => {
  const feature: ParsedFeature = {
    name: "Login",
    filePath: "/features/Auth/login.feature",
    domain: "Auth",
    rawContent: "Feature: Login\n  Scenario: Valid login",
    scenarios: [{ name: "Valid login" }],
  };

  test("includes feature content", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "URL: http://localhost",
      screenshotsDir: "/tmp/screenshots",
    });
    expect(prompt).toContain("Feature: Login");
  });

  test("includes config content", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "URL: http://localhost",
      screenshotsDir: "/tmp/screenshots",
    });
    expect(prompt).toContain("URL: http://localhost");
  });

  test("sets scenarios to ALL when no filter", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp",
    });
    expect(prompt).toContain("`ALL`");
  });

  test("lists filtered scenario names", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: "login",
      configContent: "",
      screenshotsDir: "/tmp",
    });
    expect(prompt).toContain("Valid login");
    expect(prompt).not.toContain("`ALL`");
  });

  test("replaces all occurrences of screenshots dir", () => {
    const prompt = buildPrompt({
      features: [feature],
      scenarioFilter: null,
      configContent: "",
      screenshotsDir: "/tmp/shots",
    });
    // The template has {SCREENSHOTS_DIR} in two places
    expect(prompt).not.toContain("{SCREENSHOTS_DIR}");
    const count = (prompt.match(/\/tmp\/shots/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
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
    });
    expect(prompt).toContain("Feature: Login");
    expect(prompt).toContain("Feature: Register");
    expect(prompt).toContain("---");
  });
});
