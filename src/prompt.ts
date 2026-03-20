import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ParsedFeature } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildPrompt(options: {
  features: ParsedFeature[];
  scenarioFilter: string | null;
  configContent: string;
  screenshotsDir: string;
}): string {
  const templatePath = resolve(__dirname, "..", "prompt-template.md");
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

  template = template
    .replaceAll("{FEATURE_CONTENT}", featureContent)
    .replaceAll("{SCENARIOS_TO_EXECUTE}", scenariosToExecute)
    .replaceAll("{CONFIG_CONTEXT}", options.configContent)
    .replaceAll("{SCREENSHOTS_DIR}", options.screenshotsDir);

  return template;
}
