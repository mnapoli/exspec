import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ParsedFeature } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(__dirname, "..", "prompt-template.md");

export function buildPrompt(options: {
  features: ParsedFeature[];
  scenarioFilter: string | null;
  configContent: string;
  screenshotsDir: string;
  headed?: boolean;
}): string {
  let template = readFileSync(templatePath, "utf-8");

  const featureContent = options.features
    .map((f) => f.rawContent)
    .join("\n\n---\n\n");

  const scenariosToExecute = options.scenarioFilter
    ? options.features
        .flatMap((f) => f.scenarios)
        .map((s) => s.name)
        .join(", ")
    : "ALL";

  const headedMode = options.headed ? "headed (visible browser)" : "headless";

  template = template
    .replaceAll("{FEATURE_CONTENT}", featureContent)
    .replaceAll("{SCENARIOS_TO_EXECUTE}", scenariosToExecute)
    .replaceAll("{CONFIG_CONTEXT}", options.configContent)
    .replaceAll("{SCREENSHOTS_DIR}", options.screenshotsDir)
    .replaceAll("{HEADED_MODE}", headedMode);

  return template;
}
