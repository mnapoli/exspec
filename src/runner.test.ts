import { describe, test, expect } from "vitest";
import { parseScenarioResults } from "./runner.js";

describe("parseScenarioResults", () => {
  test("parses PASS scenarios", () => {
    const output = `## Feature: Login

### PASS: User can login
Login succeeded with correct credentials.`;

    const results = parseScenarioResults(output);
    expect(results).toEqual([
      {
        name: "User can login",
        status: "pass",
        details: "Login succeeded with correct credentials.",
      },
    ]);
  });

  test("parses FAIL scenarios with details", () => {
    const output = `### FAIL: User sees dashboard
**Failed step**: Then I should see the dashboard
**Error**: Element not found
**Expected**: Dashboard page
**Observed**: Login page`;

    const results = parseScenarioResults(output);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("fail");
    expect(results[0].name).toBe("User sees dashboard");
    expect(results[0].details).toContain("Element not found");
  });

  test("parses SKIP scenarios", () => {
    const output = `### SKIP: Admin panel
**Reason**: Setup step failed`;

    const results = parseScenarioResults(output);
    expect(results).toEqual([
      {
        name: "Admin panel",
        status: "skip",
        details: "**Reason**: Setup step failed",
      },
    ]);
  });

  test("parses mixed results", () => {
    const output = `## Feature: Auth

### PASS: Login
OK

### FAIL: Logout
Button not found

### SKIP: MFA
Not configured`;

    const results = parseScenarioResults(output);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ name: "Login", status: "pass" });
    expect(results[1]).toMatchObject({ name: "Logout", status: "fail" });
    expect(results[2]).toMatchObject({ name: "MFA", status: "skip" });
  });

  test("returns empty array for no matches", () => {
    expect(parseScenarioResults("random text")).toEqual([]);
  });

  test("stops collecting details at next scenario header", () => {
    const output = `### PASS: First
Detail line 1
Detail line 2

### PASS: Second
Other detail`;

    const results = parseScenarioResults(output);
    expect(results[0].details).toBe("Detail line 1\nDetail line 2");
    expect(results[1].details).toBe("Other detail");
  });

  test("stops collecting details at feature header", () => {
    const output = `### PASS: First
Some detail

## Feature: Other`;

    const results = parseScenarioResults(output);
    expect(results[0].details).toBe("Some detail");
  });
});
