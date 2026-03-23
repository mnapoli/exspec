import { spawn } from "child_process";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { createRequire } from "module";
import type { DomainResult, ScenarioResult } from "./types.js";

const require = createRequire(import.meta.url);
const playwrightBin = join(
  dirname(require.resolve("@playwright/mcp/package.json")),
  "cli.js",
);

function truncate(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function getMcpConfigPath(headed: boolean): string {
  const config = {
    mcpServers: {
      playwright: {
        type: "stdio",
        command: playwrightBin,
        args: headed ? [] : ["--headless"],
      },
    },
  };
  const suffix = headed ? "-headed" : "";
  const configPath = join(tmpdir(), `exspec-mcp${suffix}.json`);
  const json = JSON.stringify(config);
  if (!existsSync(configPath) || readFileSync(configPath, "utf-8") !== json) {
    writeFileSync(configPath, json);
  }
  return configPath;
}

export interface RunOptions {
  headed?: boolean;
}

export async function runDomain(
  prompt: string,
  domain: string,
  projectRoot: string,
  expectedScenarioNames: string[],
  options: RunOptions = {},
): Promise<DomainResult> {
  const mcpConfigPath = getMcpConfigPath(options.headed ?? false);
  try {
    const { result, cost, duration } = await invokeClaude(
      prompt,
      projectRoot,
      mcpConfigPath,
    );
    const reported = parseScenarioResults(result);
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
  }
}

interface ClaudeOutput {
  result: string;
  cost?: number;
  duration?: number;
}

function invokeClaude(
  prompt: string,
  cwd: string,
  mcpConfigPath: string,
): Promise<ClaudeOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        "mcp__playwright__*",
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
          const message = event.message as Record<string, unknown> | undefined;
          const content = message?.content as
            | Array<Record<string, unknown>>
            | undefined;
          if (content) {
            for (const block of content) {
              if (block.type === "text") {
                process.stderr.write(".");
              }
            }
          }
          break;
        }
        case "tool_use": {
          const toolName = event.tool_name as string | undefined;
          if (toolName) {
            const short = toolName.replace("mcp__playwright__browser_", "");
            process.stderr.write(`  [${short}]`);
          }
          break;
        }
        case "tool_result": {
          process.stderr.write(".");
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

      process.stderr.write("\n");

      if (code !== 0) {
        const detail = resultText || truncate(stderr) || `exit code ${code}`;
        reject(new Error(detail));
      } else {
        resolve({ result: resultText, cost, duration });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

export function parseScenarioResults(output: string): ScenarioResult[] {
  const results: ScenarioResult[] = [];
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^### (PASS|FAIL|SKIP):\s*(.+)/);
    if (match) {
      const status = match[1].toLowerCase() as "pass" | "fail" | "skip";
      const details = collectDetails(lines, i + 1);
      results.push({ name: match[2].trim(), status, details });
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

  const reason = inferNotExecutedReason(known, missingNames, rawOutput);
  const missing = missingNames.map((name) => ({
    name,
    status: "not_executed" as const,
    details: reason,
  }));
  return [...known, ...missing];
}

function inferNotExecutedReason(
  reported: ScenarioResult[],
  missingNames: string[],
  rawOutput: string,
): string {
  if (!rawOutput.trim()) {
    return "Agent returned empty output";
  }
  if (reported.length === 0) {
    // Agent produced output but no parseable scenario results
    const excerpt = truncate(rawOutput.trim());
    return `Agent did not report any scenario results. Output excerpt:\n${excerpt}`;
  }
  // Some scenarios were reported but not these ones
  return `Agent completed ${reported.length} scenario(s) but did not report results for this one`;
}

function collectDetails(lines: string[], startIndex: number): string {
  const detailLines: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i].match(/^### (PASS|FAIL|SKIP):/)) break;
    if (lines[i].match(/^## /)) break;
    detailLines.push(lines[i]);
  }

  return detailLines.join("\n").trim();
}
