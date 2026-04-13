#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadDotenv, expandVars } from "./env.js";
import { parseConfigFile } from "./config.js";
import { runSetupCommands } from "./setup.js";
import { discoverFeatures } from "./discovery.js";
import { parseFeature, filterScenarios, groupByDomain } from "./gherkin.js";
import { buildPrompt, buildScenarioMappings } from "./prompt.js";
import { runDomain, type RunCallbacks } from "./runner.js";
import {
  generateRunId,
  initResultsFile,
  appendDomainHeader,
  appendScenarioResult,
  appendActivity,
  appendDomainResults,
  appendSummary,
} from "./reporter.js";
import type { RunTotals } from "./types.js";

const projectRoot = resolve(process.cwd());

// ANSI color helpers (respect NO_COLOR standard)
const nc = "NO_COLOR" in process.env;
const green = (s: string) => (nc ? s : `\x1b[32m${s}\x1b[0m`);
const red = (s: string) => (nc ? s : `\x1b[31m${s}\x1b[0m`);
const dim = (s: string) => (nc ? s : `\x1b[38;2;150;150;150m${s}\x1b[0m`);
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

if (args.includes("--version") || args.includes("-v")) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"),
  );
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: exspec [path] [options]

Options:
  --filter <name>   Run only scenarios matching <name>
  --fail-fast       Stop after first failure
  --headed          Run with visible browser
  --verbose         Show detailed setup output
  -v, --version     Show version
  -h, --help        Show this help`);
  process.exit(0);
}

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

const startTime = Date.now();

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
  `Suite: ${totalScenarios} scenario(s) in ${domains.size} domain(s)`,
);

// Execute tests domain by domain
const totals: RunTotals = { passed: 0, failed: 0, skipped: 0, notExecuted: 0 };

const recommendations: { name: string; recommendation: string }[] = [];

function printScenarioResult(s: {
  name: string;
  status: string;
  details?: string;
  recommendation?: string;
}) {
  if (s.recommendation) {
    recommendations.push({ name: s.name, recommendation: s.recommendation });
  }
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

for (const [domain, domainFeatures] of domains) {
  const count = domainFeatures.reduce((sum, f) => sum + f.scenarios.length, 0);
  console.log(`\n  ${bold(domain)} (${count} scenarios)`);

  const scenarioMappings = buildScenarioMappings(domainFeatures);

  const prompt = buildPrompt({
    features: domainFeatures,
    scenarioFilter: filter,
    configContent,
    screenshotsDir,
    scenarioMappings,
    headed,
  });

  // Track scenarios displayed in real-time to avoid duplication
  const displayedScenarios = new Set<string>();

  appendDomainHeader(resultsPath, domain);

  const callbacks: RunCallbacks = {
    onScenarioResult: (s) => {
      displayedScenarios.add(s.name);
      printScenarioResult(s);
      appendScenarioResult(resultsPath, s);
    },
    onActivity: (message) => {
      appendActivity(resultsPath, message);
      if (verbose) {
        console.log(`      ${dim(message)}`);
      }
    },
  };

  const result = await runDomain(
    prompt,
    domain,
    projectRoot,
    scenarioMappings,
    callbacks,
    config.domainTimeout,
  );
  appendDomainResults(resultsPath, result);

  if (result.cost) {
    totals.cost = (totals.cost ?? 0) + result.cost;
  }

  // Show scenarios not already displayed in real-time (not_executed from reconciliation, errors)
  for (const s of result.scenarios) {
    if (!displayedScenarios.has(s.name)) {
      printScenarioResult(s);
      appendScenarioResult(resultsPath, s);
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
const elapsed = Math.round((Date.now() - startTime) / 1000);
const minutes = Math.floor(elapsed / 60);
const seconds = elapsed % 60;
const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
console.log(`Duration: ${duration}`);
if (recommendations.length > 0) {
  console.log(`\nRecommendations:`);
  for (const r of recommendations) {
    console.log(`  ${r.name}`);
    console.log(`    ${dim(r.recommendation)}`);
  }
}
console.log(`\nDetailed results in features/exspec/${runId}.md`);

const hasFailures = totals.failed > 0 || totals.notExecuted > 0;
const nothingPassed = totals.passed === 0;
process.exit(hasFailures || nothingPassed ? 1 : 0);
