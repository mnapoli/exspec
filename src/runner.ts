import { spawn } from "child_process";
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { createRequire } from "module";
import type { DomainResult, ScenarioResult } from "./types.js";

const require = createRequire(import.meta.url);
const playwrightBin = join(
  dirname(require.resolve("@playwright/mcp/package.json")),
  "cli.js",
);

const __filename = fileURLToPath(import.meta.url);
const reporterBin = join(dirname(__filename), "mcp-reporter.js");

function truncate(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function writeMcpConfig(headed: boolean, resultsJsonlPath: string): string {
  const config = {
    mcpServers: {
      playwright: {
        type: "stdio",
        command: playwrightBin,
        args: headed ? [] : ["--headless"],
      },
      exspec: {
        type: "stdio",
        command: "node",
        args: [reporterBin, resultsJsonlPath],
      },
    },
  };
  const id = randomBytes(6).toString("hex");
  const configPath = join(tmpdir(), `exspec-mcp-${id}.json`);
  writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

export interface RunOptions {
  headed?: boolean;
}

export interface RunCallbacks {
  onScenarioResult?: (result: ScenarioResult) => void;
  onActivity?: (message: string) => void;
}

export async function runDomain(
  prompt: string,
  domain: string,
  projectRoot: string,
  expectedScenarioNames: string[],
  options: RunOptions = {},
  callbacks: RunCallbacks = {},
): Promise<DomainResult> {
  const id = randomBytes(6).toString("hex");
  const jsonlPath = join(tmpdir(), `exspec-results-${id}.jsonl`);
  const mcpConfigPath = writeMcpConfig(options.headed ?? false, jsonlPath);

  try {
    const { result, cost, duration, activityLog } = await invokeClaude(
      prompt,
      projectRoot,
      mcpConfigPath,
      callbacks,
    );
    const reported = readJsonlResults(jsonlPath);
    const scenarios = reconcileScenarios(
      reported,
      expectedScenarioNames,
      result,
    );

    return {
      domain,
      scenarios,
      rawOutput: result,
      isError: false,
      cost,
      duration,
      activityLog,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Even on error, check if partial results were recorded
    const reported = readJsonlResults(jsonlPath);
    if (reported.length > 0) {
      const scenarios = reconcileScenarios(
        reported,
        expectedScenarioNames,
        message,
      );
      return {
        domain,
        scenarios,
        rawOutput: message,
        isError: true,
        cost: undefined,
        duration: undefined,
      };
    }
    return {
      domain,
      scenarios: expectedScenarioNames.map((name) => ({
        name,
        status: "not_executed" as const,
        details: `Agent error: ${truncate(message)}`,
      })),
      rawOutput: truncate(message),
      isError: true,
    };
  } finally {
    // Clean up temp files
    try {
      unlinkSync(mcpConfigPath);
    } catch {
      // File may not exist
    }
    try {
      unlinkSync(jsonlPath);
    } catch {
      // File may not exist
    }
  }
}

interface ClaudeOutput {
  result: string;
  cost?: number;
  duration?: number;
  activityLog: string[];
}

function formatToolCall(name: string, input: Record<string, unknown>): string {
  // Strip MCP prefixes for readability
  const short = name
    .replace("mcp__playwright__", "")
    .replace("mcp__exspec__", "");

  // Pick the most useful arg to display
  const url = input.url as string | undefined;
  const ref = input.ref as string | undefined;
  const element = input.element as string | undefined;
  const value = input.value as string | undefined;
  const path = input.path as string | undefined;

  const hint = url || ref || element || path || value;
  return hint ? `${short} → ${truncate(String(hint), 80)}` : short;
}

function invokeClaude(
  prompt: string,
  cwd: string,
  mcpConfigPath: string,
  callbacks: RunCallbacks = {},
): Promise<ClaudeOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        "mcp__playwright__*",
        "mcp__exspec__*",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "sonnet",
        "--mcp-config",
        mcpConfigPath,
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );

    let buffer = "";
    let resultText = "";
    let cost: number | undefined;
    let duration: number | undefined;
    const activityLog: string[] = [];

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();

      // Process complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          handleStreamEvent(event);
        } catch {
          // Skip malformed lines
        }
      }
    });

    function handleStreamEvent(event: Record<string, unknown>) {
      switch (event.type) {
        case "assistant": {
          // tool_use blocks are nested inside assistant messages
          const message = event.message as Record<string, unknown> | undefined;
          const content = message?.content as
            | Array<Record<string, unknown>>
            | undefined;
          if (!content) break;

          for (const block of content) {
            if (block.type === "tool_use") {
              const toolName = block.name as string;
              const input = (block.input as Record<string, unknown>) ?? {};
              const entry = formatToolCall(toolName, input);
              activityLog.push(entry);
              callbacks.onActivity?.(entry);

              // Emit real-time scenario result
              if (
                toolName === "mcp__exspec__report_scenario_result" &&
                callbacks.onScenarioResult
              ) {
                callbacks.onScenarioResult({
                  name: input.name as string,
                  status: input.status as "pass" | "fail" | "skip",
                  details: input.details as string | undefined,
                });
              }
            }
          }
          break;
        }
        case "result": {
          resultText = (event.result as string) ?? "";
          cost = event.cost_usd as number | undefined;
          duration = event.duration_ms as number | undefined;
          if (event.is_error) {
            resultText = `Error: ${resultText}`;
          }
          break;
        }
      }
    }

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          handleStreamEvent(event);
        } catch {
          // ignore
        }
      }

      if (code !== 0) {
        const detail = resultText || truncate(stderr) || `exit code ${code}`;
        reject(new Error(detail));
      } else {
        resolve({ result: resultText, cost, duration, activityLog });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

export function readJsonlResults(path: string): ScenarioResult[] {
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];

  const results: ScenarioResult[] = [];
  for (const line of content.split("\n")) {
    try {
      const { name, status, details } = JSON.parse(line);
      if (name && status) {
        results.push({ name, status, details });
      }
    } catch {
      // Skip malformed lines
    }
  }
  return results;
}

export function reconcileScenarios(
  reported: ScenarioResult[],
  expectedNames: string[],
  rawOutput: string,
): ScenarioResult[] {
  const expectedSet = new Set(expectedNames);
  const reportedNames = new Set(reported.map((s) => s.name));

  // Warn about and discard unexpected scenario names from the agent
  for (const name of reportedNames) {
    if (!expectedSet.has(name)) {
      console.error(
        `  ⚠ Agent reported unknown scenario: "${name}" (ignoring)`,
      );
    }
  }
  const known = reported.filter((s) => expectedSet.has(s.name));

  const missingNames = expectedNames.filter((name) => !reportedNames.has(name));
  if (missingNames.length === 0) return known;

  const reason = inferNotExecutedReason(known, rawOutput);
  const missing = missingNames.map((name) => ({
    name,
    status: "not_executed" as const,
    details: reason,
  }));
  return [...known, ...missing];
}

function inferNotExecutedReason(
  reported: ScenarioResult[],
  rawOutput: string,
): string {
  if (!rawOutput.trim()) {
    return "Agent returned empty output";
  }
  if (reported.length === 0) {
    const excerpt = truncate(rawOutput.trim());
    return `Agent did not report any scenario results. Output excerpt:\n${excerpt}`;
  }
  return `Agent completed ${reported.length} scenario(s) but did not report results for this one`;
}
