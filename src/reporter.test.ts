import { describe, test, expect, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateRunId,
  initResultsFile,
  appendDomainResults,
  appendSummary,
} from "./reporter.js";
import type { DomainResult, RunTotals } from "./types.js";

describe("generateRunId", () => {
  test("returns YYYY-MM-DD-HHmm format", () => {
    expect(generateRunId()).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
  });
});

describe("initResultsFile", () => {
  const tmpRoot = join(tmpdir(), `exspec-test-${Date.now()}`);

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("creates results file and screenshots dir", () => {
    mkdirSync(tmpRoot, { recursive: true });
    const { resultsPath, screenshotsDir } = initResultsFile(
      tmpRoot,
      "2025-01-15-1430",
    );

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("# Test results — 2025-01-15-1430");
    expect(screenshotsDir).toContain("2025-01-15-1430");
  });
});

describe("appendDomainResults", () => {
  const tmpRoot = join(tmpdir(), `exspec-test-${Date.now()}`);
  let resultsPath: string;

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function setup() {
    mkdirSync(tmpRoot, { recursive: true });
    const result = initResultsFile(tmpRoot, "test-run");
    resultsPath = result.resultsPath;
  }

  test("writes passed/failed/skipped counts", () => {
    setup();
    const result: DomainResult = {
      domain: "Auth",
      scenarios: [
        { name: "Login", status: "pass", details: "OK" },
        { name: "Logout", status: "fail", details: "Button missing" },
      ],
      rawOutput: "",
      isError: false,
    };

    appendDomainResults(resultsPath, result);
    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("Auth — 1 passed, 1 failed, 0 skipped");
    expect(content).toContain("✓ Login");
    expect(content).toContain("✗ Logout");
  });

  test("writes error domain", () => {
    setup();
    const result: DomainResult = {
      domain: "Broken",
      scenarios: [],
      rawOutput: "some error output",
      isError: true,
    };

    appendDomainResults(resultsPath, result);
    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("Broken — ERROR");
    expect(content).toContain("some error output");
  });
});

describe("appendSummary", () => {
  const tmpRoot = join(tmpdir(), `exspec-test-${Date.now()}`);

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("writes totals", () => {
    mkdirSync(tmpRoot, { recursive: true });
    const { resultsPath, screenshotsDir } = initResultsFile(tmpRoot, "test-run");

    const totals: RunTotals = {
      passed: 5,
      failed: 2,
      skipped: 1,
      errors: 0,
    };
    appendSummary(resultsPath, totals, screenshotsDir);

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("5 passed, 2 failed, 1 skipped, 0 errors");
  });
});
