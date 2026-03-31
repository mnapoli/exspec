import { describe, test, expect, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateRunId,
  initResultsFile,
  appendDomainHeader,
  appendScenarioResult,
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

  test("streams scenario results as they arrive", () => {
    setup();
    appendDomainHeader(resultsPath, "Auth");
    appendScenarioResult(resultsPath, {
      name: "Login",
      status: "pass",
      details: "OK",
    });
    appendScenarioResult(resultsPath, {
      name: "Logout",
      status: "fail",
      details: "Button missing",
    });

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("## Auth");
    expect(content).toContain("✓ Login");
    expect(content).toContain("✗ Logout");
    expect(content).toContain("→ Button missing");
  });

  test("streams recommendation with scenario result", () => {
    setup();
    appendDomainHeader(resultsPath, "Auth");
    appendScenarioResult(resultsPath, {
      name: "Login",
      status: "pass",
      details: "OK",
      recommendation: "Consider splitting address into separate fields",
    });

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("✓ Login");
    expect(content).toContain(
      "**Recommendation**: Consider splitting address into separate fields",
    );
  });

  test("streams not_executed scenarios", () => {
    setup();
    appendDomainHeader(resultsPath, "OD");
    appendScenarioResult(resultsPath, {
      name: "Création d'une OD",
      status: "not_executed",
      details: "Agent returned empty output",
    });
    appendScenarioResult(resultsPath, {
      name: "Suppression d'une OD",
      status: "not_executed",
      details: "Agent returned empty output",
    });

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("## OD");
    expect(content).toContain("✗ Création d'une OD (not executed)");
    expect(content).toContain("→ Agent returned empty output");
    expect(content).toContain("✗ Suppression d'une OD (not executed)");
  });

  test("writes error info and metadata via appendDomainResults", () => {
    setup();
    appendDomainHeader(resultsPath, "Broken");
    const result: DomainResult = {
      domain: "Broken",
      scenarios: [],
      rawOutput: "some error output",
      isError: true,
    };

    appendDomainResults(resultsPath, result);
    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("Agent crashed or returned no results");
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
    const { resultsPath, screenshotsDir } = initResultsFile(
      tmpRoot,
      "test-run",
    );

    const totals: RunTotals = {
      passed: 5,
      failed: 2,
      skipped: 1,
      notExecuted: 0,
    };
    appendSummary(resultsPath, totals, screenshotsDir);

    const content = readFileSync(resultsPath, "utf-8");
    expect(content).toContain("5 passed, 2 failed, 1 skipped, 0 not executed");
  });
});
