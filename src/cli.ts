#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadDotenv, expandVars } from "./env.js";
import { parseConfigFile } from "./config.js";
import { runSetupCommands } from "./setup.js";
import { discoverFeatures } from "./discovery.js";
import { parseFeature, filterScenarios, groupByDomain } from "./gherkin.js";
import { buildPrompt } from "./prompt.js";
import { runDomain } from "./runner.js";
import {
  generateRunId,
  initResultsFile,
  appendDomainResults,
  appendSummary,
} from "./reporter.js";
import type { RunTotals } from "./types.js";

const projectRoot = resolve(process.cwd());

// ANSI color helpers (respect NO_COLOR standard)
const nc = "NO_COLOR" in process.env;
const green = (s: string) => (nc ? s : `\x1b[32m${s}\x1b[0m`);
const red = (s: string) => (nc ? s : `\x1b[31m${s}\x1b[0m`);
const dim = (s: string) => (nc ? s : `\x1b[2m${s}\x1b[0m`);
const bold = (s: string) => (nc ? s : `\x1b[1m${s}\x1b[0m`);

function extractFailInfo(details?: string): {
  step?: string;
  error?: string;
} {
  if (!details) return {};
  const stepMatch = details.match(/\*\*Failed step\*\*:\s*(.+)/);
  const errorMatch = details.match(/\*\*Error\*\*:\s*(.+)/);
  if (stepMatch || errorMatch) {
    return { step: stepMatch?.[1]?.trim(), error: errorMatch?.[1]?.trim() };
  }
  // Fallback: first 2 non-empty lines
  const lines = details
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { step: lines[0], error: lines[1] };
}

// Parse arguments
const args = process.argv.slice(2);
let target: string | undefined;
let filter: string | null = null;
let failFast = false;
let headed = false;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--filter" && args[i + 1]) {
    filter = args[++i];
  } else if (args[i] === "--fail-fast") {
    failFast = true;
  } else if (args[i] === "--headed") {
    headed = true;
  } else if (args[i] === "--verbose") {
    verbose = true;
  } else if (!args[i].startsWith("--")) {
    target = args[i];
  }
}

// Load .env if it exists (populates process.env)
loadDotenv(projectRoot);

// Load config
const configPath = resolve(projectRoot, "features", "exspec.md");
if (!existsSync(configPath)) {
  console.error("features/exspec.md not found.");
  console.error("Create a features/exspec.md file with your QA configuration.");
  process.exit(1);
}
// Parse frontmatter config and markdown content separately
const { config, content: markdownContent } = parseConfigFile(
  readFileSync(configPath, "utf-8"),
);
// Resolve $VAR and ${VAR} references only in the markdown content
const configContent = expandVars(markdownContent);

// Discover and parse features
let featureFiles: string[];
try {
  featureFiles = discoverFeatures(projectRoot, target);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (featureFiles.length === 0) {
  console.error("No .feature files found.");
  process.exit(1);
}

let features = featureFiles.map((f) => parseFeature(f, projectRoot));

if (filter) {
  features = filterScenarios(features, filter);
  if (features.length === 0) {
    console.error(`No scenarios matching filter "${filter}".`);
    process.exit(1);
  }
}

const domains = groupByDomain(features);
const totalScenarios = features.reduce((sum, f) => sum + f.scenarios.length, 0);

// Initialize results
const runId = generateRunId();
const { resultsPath, screenshotsDir } = initResultsFile(projectRoot, runId);
console.log(`Results: features/exspec/${runId}.md\n`);

// Run setup commands (after validation, before test execution)
if (config.setup && config.setup.length > 0) {
  console.log("Running setup commands...\n");
  try {
    await runSetupCommands(config.setup, projectRoot, { verbose });
  } catch (error) {
    console.error(
      `\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  console.log();
}

// Display test plan
console.log(
  `Suite: ${totalScenarios} scenario(s) in ${domains.size} domain(s)\n`,
);
for (const [domain, domainFeatures] of domains) {
  const count = domainFeatures.reduce((sum, f) => sum + f.scenarios.length, 0);
  console.log(`  ${domain} (${count} scenarios)`);
}

// Execute tests domain by domain
const totals: RunTotals = { passed: 0, failed: 0, skipped: 0, notExecuted: 0 };

for (const [domain, domainFeatures] of domains) {
  const prompt = buildPrompt({
    features: domainFeatures,
    scenarioFilter: filter,
    configContent,
    screenshotsDir,
  });

  const expectedScenarioNames = domainFeatures.flatMap((f) =>
    f.scenarios.map((s) => s.name),
  );
  const result = await runDomain(
    prompt,
    domain,
    projectRoot,
    expectedScenarioNames,
    { headed },
  );
  appendDomainResults(resultsPath, result);

  if (result.cost) {
    totals.cost = (totals.cost ?? 0) + result.cost;
  }

  if (result.isError) {
    totals.notExecuted += result.scenarios.length;
    for (const s of result.scenarios) {
      console.log(`    ${red("✗")} ${s.name}`);
      console.log(`      ${dim("Error: Agent crashed or returned no results")}`);
    }
  } else {
    for (const s of result.scenarios) {
      if (s.status === "pass") {
        totals.passed++;
        console.log(`    ${green("✓")} ${s.name}`);
      } else if (s.status === "fail") {
        totals.failed++;
        console.log(`    ${red("✗")} ${s.name}`);
        const { step, error } = extractFailInfo(s.details);
        if (step) console.log(`      ${dim(`> ${step}`)}`);
        if (error) console.log(`      ${red(`${bold("Error:")} ${error}`)}`);
      } else if (s.status === "skip") {
        totals.skipped++;
        console.log(`    ${dim(`○ ${s.name}`)}`);
      } else {
        totals.notExecuted++;
        console.log(`    ${dim(`- ${s.name} (not executed)`)}`);
      }
    }
  }

  if (
    failFast &&
    (result.isError || result.scenarios.some((s) => s.status === "fail"))
  ) {
    console.log("\n--fail-fast: stopping after first failure.");
    break;
  }
}

// Summary
appendSummary(resultsPath, totals, screenshotsDir);

console.log("\n" + "─".repeat(40));
console.log(
  `Total: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.notExecuted} not executed`,
);
console.log(`\nDetailed results in features/exspec/${runId}.md`);

const hasFailures = totals.failed > 0 || totals.notExecuted > 0;
const nothingPassed = totals.passed === 0;
process.exit(hasFailures || nothingPassed ? 1 : 0);
