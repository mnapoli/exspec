export interface ParsedFeature {
  name: string;
  filePath: string;
  domain: string;
  rawContent: string;
  scenarios: ParsedScenario[];
}

export interface ParsedScenario {
  name: string;
}

export interface ScenarioResult {
  name: string;
  status: "pass" | "fail" | "skip";
  details?: string;
}

export interface DomainResult {
  domain: string;
  scenarios: ScenarioResult[];
  rawOutput: string;
  isError: boolean;
  cost?: number;
  duration?: number;
}

export interface RunTotals {
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  cost?: number;
}
