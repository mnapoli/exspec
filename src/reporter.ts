import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import type { DomainResult, RunTotals } from "./types.js";

export function generateRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function formatTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function initResultsFile(
  projectRoot: string,
  runId: string,
): { resultsPath: string; screenshotsDir: string } {
  const resultsDir = resolve(projectRoot, "features/exspec");
  const screenshotsDir = resolve(resultsDir, runId);
  const resultsPath = resolve(resultsDir, `${runId}.md`);

  mkdirSync(screenshotsDir, { recursive: true });

  // Create .gitignore on first run
  const gitignorePath = join(resultsDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n!.gitignore\n");
  }

  writeFileSync(
    resultsPath,
    `# Test results — ${runId}\n\nStarted at ${formatTime()}\n`,
  );

  return { resultsPath, screenshotsDir };
}

export function appendDomainResults(
  resultsPath: string,
  result: DomainResult,
): void {
  const lines: string[] = [""];

  if (result.isError) {
    lines.push(`## ${result.domain} — ERREUR`, "");
    lines.push(`  Agent crashed or returned no results.`);
    if (result.rawOutput) {
      lines.push(`  Raw output: ${result.rawOutput.slice(0, 500)}`);
    }
  } else {
    const passed = result.scenarios.filter((s) => s.status === "pass").length;
    const failed = result.scenarios.filter((s) => s.status === "fail").length;
    const skipped = result.scenarios.filter((s) => s.status === "skip").length;

    lines.push(`## ${result.domain} — ${passed} passed, ${failed} failed, ${skipped} skipped`, "");

    for (const scenario of result.scenarios) {
      if (scenario.status === "pass") {
        lines.push(`  ✓ ${scenario.name}`);
        if (scenario.details) {
          lines.push(`    ${scenario.details.split("\n")[0]}`);
        }
      } else if (scenario.status === "fail") {
        lines.push(`  ✗ ${scenario.name}`);
        if (scenario.details) {
          lines.push(`    → ${scenario.details.split("\n").join("\n    ")}`);
        }
      } else {
        lines.push(`  ○ ${scenario.name}`);
        if (scenario.details) {
          lines.push(`    → ${scenario.details.split("\n")[0]}`);
        }
      }
      lines.push("");
    }
  }

  appendFileSync(resultsPath, lines.join("\n"));
}

export function appendSummary(
  resultsPath: string,
  totals: RunTotals,
): void {
  const content = [
    "---\n",
    "## Summary\n",
    `Total: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.errors} errors\n`,
    `Finished at ${formatTime()}\n`,
  ].join("\n");

  appendFileSync(resultsPath, content);
}
