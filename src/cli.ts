#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadDotenv, expandVars } from "./env.js";
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

// Parse arguments
const args = process.argv.slice(2);
let target: string | undefined;
let filter: string | null = null;
let failFast = false;
let headed = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--filter" && args[i + 1]) {
    filter = args[++i];
  } else if (args[i] === "--fail-fast") {
    failFast = true;
  } else if (args[i] === "--headed") {
    headed = true;
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
// Resolve $VAR and ${VAR} references in the config using process.env
const configContent = expandVars(readFileSync(configPath, "utf-8"));

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

// Display test plan
console.log(
  `\nSuite: ${totalScenarios} scenario(s) in ${domains.size} domain(s)\n`,
);
for (const [domain, domainFeatures] of domains) {
  const count = domainFeatures.reduce((sum, f) => sum + f.scenarios.length, 0);
  console.log(`  ${domain} (${count} scenarios)`);
  for (const f of domainFeatures) {
    for (const s of f.scenarios) {
      console.log(`    · ${s.name}`);
    }
  }
}
console.log();

// Initialize results
const runId = generateRunId();
const { resultsPath, screenshotsDir } = initResultsFile(projectRoot, runId);
console.log(`Results: features/exspec/${runId}.md\n`);

// Execute tests domain by domain
const totals: RunTotals = { passed: 0, failed: 0, skipped: 0, notExecuted: 0 };

for (const [domain, domainFeatures] of domains) {
  console.log(`▶ ${domain}...`);

  const prompt = buildPrompt({
    features: domainFeatures,
    scenarioFilter: filter,
    configContent,
    screenshotsDir,
  });

  const expectedScenarioNames = domainFeatures.flatMap((f) =>
    f.scenarios.map((s) => s.name),
  );
  const result = await runDomain(prompt, domain, projectRoot, expectedScenarioNames, { headed });
  appendDomainResults(resultsPath, result);

  if (result.isError) {
    totals.notExecuted += result.scenarios.length;
    console.log(`  ✗ ERROR (${result.scenarios.length} not executed)`);
  } else {
    for (const s of result.scenarios) {
      if (s.status === "pass") totals.passed++;
      else if (s.status === "fail") totals.failed++;
      else if (s.status === "not_executed") totals.notExecuted++;
      else totals.skipped++;
    }
    const p = result.scenarios.filter((s) => s.status === "pass").length;
    const f = result.scenarios.filter((s) => s.status === "fail").length;
    const sk = result.scenarios.filter((s) => s.status === "skip").length;
    const ne = result.scenarios.filter((s) => s.status === "not_executed").length;
    console.log(`  ${p} passed, ${f} failed, ${sk} skipped, ${ne} not executed`);
  }

  if (result.cost) {
    totals.cost = (totals.cost ?? 0) + result.cost;
    console.log(`  Cost: $${result.cost.toFixed(4)}`);
  }
  console.log();

  if (
    failFast &&
    (result.isError || result.scenarios.some((s) => s.status === "fail"))
  ) {
    console.log("--fail-fast: stopping after first failure.");
    break;
  }
}

// Summary
appendSummary(resultsPath, totals, screenshotsDir);

console.log("─".repeat(40));
console.log(
  `Total: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.notExecuted} not executed`,
);
if (totals.cost) {
  console.log(`Total cost: $${totals.cost.toFixed(4)}`);
}
console.log(`\nResults written to features/exspec/${runId}.md`);

const hasFailures = totals.failed > 0 || totals.notExecuted > 0;
const nothingPassed = totals.passed === 0;
process.exit(hasFailures || nothingPassed ? 1 : 0);
