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
  test("parses valid JSONL with id-based results", () => {
    const path = tmpFile(
      '{"id":"s1","status":"pass","details":"OK"}\n{"id":"s2","status":"fail","details":"Error"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toEqual([
      { id: "s1", status: "pass", details: "OK" },
      { id: "s2", status: "fail", details: "Error" },
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
      '{"id":"s1","status":"pass"}\nnot json\n{"id":"s2","status":"fail"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("s1");
    expect(results[1].id).toBe("s2");
    unlinkSync(path);
  });

  test("skips lines missing required fields", () => {
    const path = tmpFile(
      '{"id":"s1"}\n{"status":"pass"}\n{"id":"s3","status":"pass"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toEqual([{ id: "s3", status: "pass", details: undefined }]);
    unlinkSync(path);
  });

  test("handles optional details field", () => {
    const path = tmpFile('{"id":"s1","status":"pass"}\n');
    const results = readJsonlResults(path);
    expect(results).toEqual([{ id: "s1", status: "pass", details: undefined }]);
    unlinkSync(path);
  });
});

describe("reconcileScenarios", () => {
  const mappings = [
    { id: "s1", name: "Login" },
    { id: "s2", name: "Logout" },
  ];

  test("returns reported as-is when all expected are present", () => {
    const reported = [
      { id: "s1", status: "pass" as const, details: "OK" },
      { id: "s2", status: "fail" as const, details: "Error" },
    ];
    const result = reconcileScenarios(reported, mappings, "output");
    expect(result).toEqual([
      { name: "Login", status: "pass", details: "OK" },
      { name: "Logout", status: "fail", details: "Error" },
    ]);
  });

  test("adds not_executed for missing scenarios with empty output", () => {
    const result = reconcileScenarios([], mappings, "");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Login", status: "not_executed" });
    expect(result[0].details).toBe("Agent returned empty output");
    expect(result[1]).toMatchObject({ name: "Logout", status: "not_executed" });
  });

  test("adds not_executed with output excerpt when agent produced no results", () => {
    const result = reconcileScenarios(
      [],
      [{ id: "s1", name: "Login" }],
      "Some agent rambling",
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("not_executed");
    expect(result[0].details).toContain("Output excerpt:");
    expect(result[0].details).toContain("Some agent rambling");
  });

  test("adds not_executed for partially missing scenarios", () => {
    const reported = [{ id: "s1", status: "pass" as const, details: "OK" }];
    const result = reconcileScenarios(reported, mappings, "output");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Login", status: "pass" });
    expect(result[1]).toMatchObject({ name: "Logout", status: "not_executed" });
    expect(result[1].details).toContain("completed 1 scenario(s)");
  });

  test("discards unknown scenario IDs and warns", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reported = [
      { id: "s1", status: "pass" as const, details: "OK" },
      { id: "s99", status: "pass" as const, details: "?" },
    ];
    const result = reconcileScenarios(
      reported,
      [{ id: "s1", name: "Login" }],
      "output",
    );
    expect(result).toEqual([{ name: "Login", status: "pass", details: "OK" }]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('unknown scenario ID: "s99"'),
    );
    spy.mockRestore();
  });

  test("truncates long output excerpt with ellipsis", () => {
    const longOutput = "x".repeat(600);
    const result = reconcileScenarios(
      [],
      [{ id: "s1", name: "Login" }],
      longOutput,
    );
    expect(result[0].details).toContain("...");
    expect(result[0].details!.length).toBeLessThan(600);
  });
});
