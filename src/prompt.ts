import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ParsedFeature } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(__dirname, "..", "prompt-template.md");

export interface ScenarioMapping {
  id: string;
  name: string;
}

export function buildScenarioMappings(
  features: ParsedFeature[],
): ScenarioMapping[] {
  let index = 1;
  return features.flatMap((f) =>
    f.scenarios.map((s) => ({ id: `s${index++}`, name: s.name })),
  );
}

export function buildPrompt(options: {
  features: ParsedFeature[];
  scenarioFilter: string | null;
  configContent: string;
  screenshotsDir: string;
  scenarioMappings: ScenarioMapping[];
}): string {
  let template = readFileSync(templatePath, "utf-8");

  const featureContent = options.features
    .map((f) => f.rawContent)
    .join("\n\n---\n\n");

  const scenarioList = options.scenarioMappings
    .map((m) => `- ${m.id}: ${m.name}`)
    .join("\n");

  const scenariosToExecute = options.scenarioFilter
    ? scenarioList
    : `ALL\n\n${scenarioList}`;

  template = template
    .replaceAll("{FEATURE_CONTENT}", featureContent)
    .replaceAll("{SCENARIOS_TO_EXECUTE}", scenariosToExecute)
    .replaceAll("{CONFIG_CONTEXT}", options.configContent)
    .replaceAll("{SCREENSHOTS_DIR}", options.screenshotsDir);

  return template;
}
