import { config } from "dotenv";
import dotenvExpand from "dotenv-expand";
import { existsSync } from "fs";
import { resolve } from "path";

export function loadDotenv(projectRoot: string): void {
  const envPath = resolve(projectRoot, ".env");
  if (!existsSync(envPath)) return;

  const env = config({ path: envPath });
  dotenvExpand.expand(env);
}

export function expandVars(text: string): string {
  return text.replace(/\$\{(\w+)\}|\$(\w+)/g, (match, braced, bare) => {
    const varName = braced ?? bare;
    return process.env[varName] ?? match;
  });
}
