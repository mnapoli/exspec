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
    id: z.string().describe("Scenario ID (e.g. s1, s2) from the scenario list"),
    status: z
      .enum(["pass", "fail", "skip"])
      .describe("Test result: pass, fail, or skip"),
    details: z
      .string()
      .optional()
      .describe(
        "Details: what was verified (pass), error info (fail), or reason (skip)",
      ),
    recommendation: z
      .string()
      .optional()
      .describe(
        "Optional suggestion to improve the test when you had to make assumptions or work around ambiguity",
      ),
  },
  async ({ id, status, details, recommendation }) => {
    appendFileSync(
      outputPath,
      JSON.stringify({ id, status, details, recommendation }) + "\n",
    );
    return {
      content: [{ type: "text", text: `Recorded: ${id} → ${status}` }],
    };
  },
);

await server.connect(new StdioServerTransport());
