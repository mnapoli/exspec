import { readdirSync, statSync, existsSync } from "fs";
import { resolve, relative } from "path";

export function discoverFeatures(
  projectRoot: string,
  target?: string,
): string[] {
  if (!target) {
    return globFeatures(resolve(projectRoot, "features"));
  }

  const fullPath = resolve(projectRoot, target);

  if (!existsSync(fullPath)) {
    throw new Error(`Path not found: ${fullPath}`);
  }

  if (statSync(fullPath).isDirectory()) {
    return globFeatures(fullPath);
  }

  return [fullPath];
}

function globFeatures(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".feature"))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
}

export function getDomain(featurePath: string, projectRoot: string): string {
  const rel = relative(resolve(projectRoot, "features"), featurePath);
  const parts = rel.split("/");
  return parts.length > 1 ? parts[0] : "default";
}
