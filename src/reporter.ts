import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { resolve, join } from "path";
import type { DomainResult, RunTotals } from "./types.js";

const MAX_RUNS = 5;

const pad = (n: number) => String(n).padStart(2, "0");

export function generateRunId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function formatTime(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function initResultsFile(
  projectRoot: string,
  runId: string,
): { resultsPath: string; screenshotsDir: string } {
  const resultsDir = resolve(projectRoot, "features/exspec");
  const screenshotsDir = resolve(resultsDir, runId);
  const resultsPath = resolve(resultsDir, `${runId}.md`);

  mkdirSync(resultsDir, { recursive: true });

  // Create .gitignore on first run
  const gitignorePath = join(resultsDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n!.gitignore\n");
  }

  pruneOldRuns(resultsDir);

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
    lines.push(`## ${result.domain} — ERROR`, "");
    lines.push(`  Agent crashed or returned no results.`);
    if (result.rawOutput) {
      lines.push(`  Raw output: ${result.rawOutput.slice(0, 500)}`);
    }
  } else {
    const passed = result.scenarios.filter((s) => s.status === "pass").length;
    const failed = result.scenarios.filter((s) => s.status === "fail").length;
    const skipped = result.scenarios.filter((s) => s.status === "skip").length;

    lines.push(
      `## ${result.domain} — ${passed} passed, ${failed} failed, ${skipped} skipped`,
      "",
    );

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
  screenshotsDir: string,
): void {
  const content = [
    "---\n",
    "## Summary\n",
    `Total: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.errors} errors\n`,
    `Finished at ${formatTime()}\n`,
  ].join("\n");

  appendFileSync(resultsPath, content);

  cleanupEmptyDir(screenshotsDir);
}

function cleanupEmptyDir(dir: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  if (entries.length === 0) {
    rmSync(dir);
  }
}

function pruneOldRuns(resultsDir: string): void {
  const entries = readdirSync(resultsDir);
  const runIds = entries
    .filter((e) => e.match(/^\d{4}-\d{2}-\d{2}-\d{4}\.md$/))
    .map((e) => e.replace(/\.md$/, ""))
    .sort();

  while (runIds.length >= MAX_RUNS) {
    const oldest = runIds.shift()!;
    const mdPath = join(resultsDir, `${oldest}.md`);
    const dirPath = join(resultsDir, oldest);
    if (existsSync(mdPath)) rmSync(mdPath);
    if (existsSync(dirPath)) rmSync(dirPath, { recursive: true });
  }
}
