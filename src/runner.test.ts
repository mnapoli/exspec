import { describe, test, expect, vi } from "vitest";
import {
  readJsonlResults,
  reconcileScenarios,
  buildClaudeArgs,
} from "./runner.js";
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

describe("buildClaudeArgs", () => {
  const args = buildClaudeArgs("test prompt", "/tmp/mcp.json");

  test("uses prompt mode with strict MCP config", () => {
    expect(args).toContain("-p");
    expect(args[args.indexOf("-p") + 1]).toBe("test prompt");
    expect(args).toContain("--strict-mcp-config");
  });

  test("allows only playwright-cli bash and exspec MCP tools", () => {
    const allowed = args[args.indexOf("--allowedTools") + 1];
    expect(allowed).toBe("Bash(playwright-cli:*),mcp__exspec__*");
  });

  test("disallows dangerous tools but allows TodoWrite and TodoRead", () => {
    const disallowed = args[args.indexOf("--disallowedTools") + 1];
    expect(disallowed).toContain("Edit");
    expect(disallowed).toContain("Write");
    expect(disallowed).toContain("Agent");
    expect(disallowed).toContain("AskUserQuestion");
    expect(disallowed).toContain("Skill");
    expect(disallowed).not.toContain("TodoWrite");
    expect(disallowed).not.toContain("TodoRead");
  });

  test("passes MCP config path", () => {
    expect(args[args.indexOf("--mcp-config") + 1]).toBe("/tmp/mcp.json");
  });

  test("uses stream-json output format", () => {
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  });

  test("uses sonnet model", () => {
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });

  test("enables thinking tokens", () => {
    expect(args[args.indexOf("--max-thinking-tokens") + 1]).toBe("10000");
  });
});

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

  test("parses recommendation field", () => {
    const path = tmpFile(
      '{"id":"s1","status":"pass","details":"OK","recommendation":"Split address fields"}\n',
    );
    const results = readJsonlResults(path);
    expect(results).toEqual([
      {
        id: "s1",
        status: "pass",
        details: "OK",
        recommendation: "Split address fields",
      },
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
      {
        name: "Login",
        status: "pass",
        details: "OK",
        recommendation: undefined,
      },
      {
        name: "Logout",
        status: "fail",
        details: "Error",
        recommendation: undefined,
      },
    ]);
  });

  test("preserves recommendation in reconciled results", () => {
    const reported = [
      {
        id: "s1",
        status: "pass" as const,
        details: "OK",
        recommendation: "Split address fields",
      },
      { id: "s2", status: "pass" as const, details: "OK" },
    ];
    const result = reconcileScenarios(reported, mappings, "output");
    expect(result[0].recommendation).toBe("Split address fields");
    expect(result[1].recommendation).toBeUndefined();
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
