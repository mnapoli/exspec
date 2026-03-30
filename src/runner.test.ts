import { describe, test, expect, vi } from "vitest";
import { readJsonlResults, reconcileScenarios } from "./runner.js";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

function tmpFile(content: string): string {
  const path = join(
    tmpdir(),
    `exspec-test-${randomBytes(4).toString("hex")}.jsonl`,
  );
  writeFileSync(path, content);
  return path;
}

describe("readJsonlResults", () => {
  test("parses valid JSONL", () => {
    const path = tmpFile(
      '{"name":"Login","status":"pass","details":"OK"}\n{"name":"Logout","status":"fail","details":"Error"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toEqual([
      { name: "Login", status: "pass", details: "OK" },
      { name: "Logout", status: "fail", details: "Error" },
    ]);
    unlinkSync(path);
  });

  test("returns empty array for missing file", () => {
    expect(readJsonlResults("/tmp/nonexistent-file.jsonl")).toEqual([]);
  });

  test("returns empty array for empty file", () => {
    const path = tmpFile("");
    expect(readJsonlResults(path)).toEqual([]);
    unlinkSync(path);
  });

  test("skips malformed lines", () => {
    const path = tmpFile(
      '{"name":"Login","status":"pass"}\nnot json\n{"name":"Logout","status":"fail"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Login");
    expect(results[1].name).toBe("Logout");
    unlinkSync(path);
  });

  test("skips lines missing required fields", () => {
    const path = tmpFile(
      '{"name":"Login"}\n{"status":"pass"}\n{"name":"Valid","status":"pass"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toEqual([
      { name: "Valid", status: "pass", details: undefined },
    ]);
    unlinkSync(path);
  });

  test("handles optional details field", () => {
    const path = tmpFile('{"name":"Login","status":"pass"}\n');
    const results = readJsonlResults(path);
    expect(results).toEqual([
      { name: "Login", status: "pass", details: undefined },
    ]);
    unlinkSync(path);
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
    expect(result[0].details!.length).toBeLessThan(600);
  });
});
