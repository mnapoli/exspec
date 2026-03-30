import { describe, test, expect } from "vitest";
import { spawn } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const reporterPath = join(
  import.meta.dirname!,
  "..",
  "dist",
  "mcp-reporter.js",
);

function sendJsonRpc(
  child: ReturnType<typeof spawn>,
  msg: Record<string, unknown>,
) {
  child.stdin!.write(JSON.stringify(msg) + "\n");
}

function collectResponses(child: ReturnType<typeof spawn>): Promise<unknown[]> {
  return new Promise((resolve) => {
    const responses: unknown[] = [];
    let buffer = "";
    child.stdout!.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          responses.push(JSON.parse(line));
        } catch {
          // skip
        }
      }
    });
    child.on("close", () => resolve(responses));
  });
}

describe("mcp-reporter", () => {
  test("writes scenario results to JSONL file via tool call", async () => {
    const jsonlPath = join(
      tmpdir(),
      `exspec-mcp-test-${randomBytes(4).toString("hex")}.jsonl`,
    );

    const child = spawn("node", [reporterPath, jsonlPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const done = collectResponses(child);

    // Initialize
    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });

    // Wait a bit for the server to respond before sending more
    await new Promise((r) => setTimeout(r, 200));

    // Send initialized notification
    sendJsonRpc(child, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    // List tools
    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    await new Promise((r) => setTimeout(r, 200));

    // Call report_scenario_result
    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "report_scenario_result",
        arguments: {
          name: "User can login",
          status: "pass",
          details: "Login succeeded",
        },
      },
    });

    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "report_scenario_result",
        arguments: {
          name: "User sees dashboard",
          status: "fail",
          details:
            "**Failed step**: Then I see dashboard\n**Error**: Not found",
        },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    child.stdin!.end();
    const responses = await done;

    // Verify JSONL file was written
    const content = readFileSync(jsonlPath, "utf-8").trim();
    const lines = content.split("\n").map((l) => JSON.parse(l));

    expect(lines).toEqual([
      { name: "User can login", status: "pass", details: "Login succeeded" },
      {
        name: "User sees dashboard",
        status: "fail",
        details: "**Failed step**: Then I see dashboard\n**Error**: Not found",
      },
    ]);

    // Verify tool call responses
    const toolResponses = responses.filter(
      (r: unknown) =>
        (r as Record<string, unknown>).id === 3 ||
        (r as Record<string, unknown>).id === 4,
    );
    expect(toolResponses).toHaveLength(2);

    unlinkSync(jsonlPath);
  }, 10000);

  test("lists report_scenario_result tool", async () => {
    const jsonlPath = join(
      tmpdir(),
      `exspec-mcp-test-${randomBytes(4).toString("hex")}.jsonl`,
    );

    const child = spawn("node", [reporterPath, jsonlPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const done = collectResponses(child);

    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    await new Promise((r) => setTimeout(r, 200));

    child.stdin!.end();
    const responses = await done;

    const toolsList = responses.find(
      (r: unknown) => (r as Record<string, unknown>).id === 2,
    ) as Record<string, unknown>;
    const result = toolsList.result as Record<string, unknown>;
    const tools = result.tools as Array<Record<string, unknown>>;

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("report_scenario_result");

    try {
      unlinkSync(jsonlPath);
    } catch {
      // File may not exist if no tool calls were made
    }
  }, 10000);
});
