import { describe, test, expect, vi } from "vitest";
import { parseScenarioResults, reconcileScenarios } from "./runner.js";

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

describe("reconcileScenarios", () => {
  test("returns reported as-is when all expected are present", () => {
    const reported = [
      { name: "Login", status: "pass" as const, details: "OK" },
      { name: "Logout", status: "fail" as const, details: "Error" },
    ];
    const result = reconcileScenarios(reported, ["Login", "Logout"], "output");
    expect(result).toEqual(reported);
  });

  test("adds not_executed for missing scenarios with empty output", () => {
    const result = reconcileScenarios([], ["Login", "Logout"], "");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Login", status: "not_executed" });
    expect(result[0].details).toBe("Agent returned empty output");
    expect(result[1]).toMatchObject({ name: "Logout", status: "not_executed" });
  });

  test("adds not_executed with output excerpt when agent produced no results", () => {
    const result = reconcileScenarios([], ["Login"], "Some agent rambling");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("not_executed");
    expect(result[0].details).toContain("Output excerpt:");
    expect(result[0].details).toContain("Some agent rambling");
  });

  test("adds not_executed for partially missing scenarios", () => {
    const reported = [
      { name: "Login", status: "pass" as const, details: "OK" },
    ];
    const result = reconcileScenarios(reported, ["Login", "Logout"], "output");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Login", status: "pass" });
    expect(result[1]).toMatchObject({ name: "Logout", status: "not_executed" });
    expect(result[1].details).toContain("completed 1 scenario(s)");
  });

  test("discards unknown scenarios and warns", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reported = [
      { name: "Login", status: "pass" as const, details: "OK" },
      { name: "Unexpected", status: "pass" as const, details: "?" },
    ];
    const result = reconcileScenarios(reported, ["Login"], "output");
    expect(result).toEqual([{ name: "Login", status: "pass", details: "OK" }]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('unknown scenario: "Unexpected"'),
    );
    spy.mockRestore();
  });

  test("truncates long output excerpt with ellipsis", () => {
    const longOutput = "x".repeat(600);
    const result = reconcileScenarios([], ["Login"], longOutput);
    expect(result[0].details).toContain("...");
    // 500 chars + "..." = excerpt is truncated
    expect(result[0].details!.length).toBeLessThan(600);
  });
});
