import {
  AstBuilder,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { readFileSync } from "fs";
import type { ParsedFeature, ParsedScenario } from "./types.js";
import { getDomain } from "./discovery.js";

export function parseFeature(
  filePath: string,
  projectRoot: string,
): ParsedFeature {
  const rawContent = readFileSync(filePath, "utf-8");
  const uuidFn = IdGenerator.uuid();
  const builder = new AstBuilder(uuidFn);
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);

  const document = parser.parse(rawContent);
  const feature = document.feature;

  const scenarios: ParsedScenario[] = (feature?.children ?? [])
    .filter((child) => child.scenario)
    .map((child) => ({ name: child.scenario!.name }));

  return {
    name: feature?.name ?? "Unknown",
    filePath,
    domain: getDomain(filePath, projectRoot),
    rawContent,
    scenarios,
  };
}

export function filterScenarios(
  features: ParsedFeature[],
  filter: string,
): ParsedFeature[] {
  const lowerFilter = filter.toLowerCase();

  return features
    .map((f) => ({
      ...f,
      scenarios: f.scenarios.filter((s) =>
        s.name.toLowerCase().includes(lowerFilter),
      ),
    }))
    .filter((f) => f.scenarios.length > 0);
}

export function groupByDomain(
  features: ParsedFeature[],
): Map<string, ParsedFeature[]> {
  const groups = new Map<string, ParsedFeature[]>();

  for (const feature of features) {
    const existing = groups.get(feature.domain) ?? [];
    existing.push(feature);
    groups.set(feature.domain, existing);
  }

  return groups;
}
