export interface ParsedFeature {
  name: string;
  filePath: string;
  domain: string;
  rawContent: string;
  scenarios: ParsedScenario[];
}

export interface ParsedScenario {
  name: string;
  id?: string;
}

export interface ScenarioResult {
  name: string;
  status: "pass" | "fail" | "skip" | "not_executed";
  details?: string;
}

export interface DomainResult {
  domain: string;
  scenarios: ScenarioResult[];
  rawOutput: string;
  isError: boolean;
  cost?: number;
  duration?: number;
  activityLog?: string[];
  prompt?: string;
}

export interface RunTotals {
  passed: number;
  failed: number;
  skipped: number;
  notExecuted: number;
  cost?: number;
}
