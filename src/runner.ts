import { spawn } from "child_process";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { createRequire } from "module";
import type { DomainResult, ScenarioResult } from "./types.js";

const require = createRequire(import.meta.url);
const playwrightBin = join(dirname(require.resolve("@playwright/mcp/package.json")), "cli.js");

function getMcpConfigPath(): string {
  const config = {
    mcpServers: {
      playwright: {
        type: "stdio",
        command: playwrightBin,
        args: ["--headless"],
      },
    },
  };
  const configPath = join(tmpdir(), "exspec-mcp.json");
  const json = JSON.stringify(config);
  // Only write if content changed
  if (!existsSync(configPath) || readFileSync(configPath, "utf-8") !== json) {
    writeFileSync(configPath, json);
  }
  return configPath;
}

const mcpConfigPath = getMcpConfigPath();

export async function runDomain(
  prompt: string,
  domain: string,
  projectRoot: string,
): Promise<DomainResult> {
  try {
    const { result, cost, duration } = await invokeClaude(prompt, projectRoot);
    const scenarios = parseScenarioResults(result);

    return {
      domain,
      scenarios,
      rawOutput: result,
      isError: scenarios.length === 0,
      cost,
      duration,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      domain,
      scenarios: [],
      rawOutput: message.slice(0, 500),
      isError: true,
    };
  }
}

interface ClaudeOutput {
  result: string;
  cost?: number;
  duration?: number;
}

function invokeClaude(prompt: string, cwd: string): Promise<ClaudeOutput> {
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

    child.stdout.on("data", (data) => {
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
          // Assistant message with text content
          const message = event.message as Record<string, unknown> | undefined;
          const content = message?.content as Array<Record<string, unknown>> | undefined;
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
          // Tool being called
          const toolName = event.tool_name as string | undefined;
          if (toolName) {
            const short = toolName.replace("mcp__playwright__browser_", "");
            process.stderr.write(`  [${short}]`);
          }
          break;
        }
        case "tool_result": {
          // Tool returned
          process.stderr.write(".");
          break;
        }
        case "result": {
          // Final result
          resultText = (event.result as string) ?? "";
          cost = event.cost_usd as number | undefined;
          duration = event.duration_ms as number | undefined;
          break;
        }
      }
    }

    let stderr = "";
    child.stderr.on("data", (data) => {
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
        reject(
          new Error(
            `claude exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        );
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
    const line = lines[i];

    const passMatch = line.match(/^### PASS:\s*(.+)/);
    if (passMatch) {
      const details = collectDetails(lines, i + 1);
      results.push({ name: passMatch[1].trim(), status: "pass", details });
      continue;
    }

    const failMatch = line.match(/^### FAIL:\s*(.+)/);
    if (failMatch) {
      const details = collectDetails(lines, i + 1);
      results.push({ name: failMatch[1].trim(), status: "fail", details });
      continue;
    }

    const skipMatch = line.match(/^### SKIP:\s*(.+)/);
    if (skipMatch) {
      const details = collectDetails(lines, i + 1);
      results.push({ name: skipMatch[1].trim(), status: "skip", details });
      continue;
    }
  }

  return results;
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
