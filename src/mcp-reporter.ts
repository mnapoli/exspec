import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appendFileSync } from "fs";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: mcp-reporter <output-jsonl-path>");
  process.exit(1);
}

const server = new McpServer({ name: "exspec", version: "1.0.0" });

server.tool(
  "report_scenario_result",
  "Report the result of a scenario after executing it",
  {
    name: z.string().describe("Exact scenario name from the Feature file"),
    status: z
      .enum(["pass", "fail", "skip"])
      .describe("Test result: pass, fail, or skip"),
    details: z
      .string()
      .optional()
      .describe(
        "Details: what was verified (pass), error info (fail), or reason (skip)",
      ),
  },
  async ({ name, status, details }) => {
    appendFileSync(
      outputPath,
      JSON.stringify({ name, status, details }) + "\n",
    );
    return {
      content: [{ type: "text", text: `Recorded: ${name} → ${status}` }],
    };
  },
);

await server.connect(new StdioServerTransport());
