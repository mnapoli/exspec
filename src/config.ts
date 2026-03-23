import { parse as parseYaml } from "yaml";

export interface ExspecConfig {
  setup?: string[];
}

const KNOWN_KEYS = new Set(["setup"]);

interface RawConfig {
  setup?: unknown;
  [key: string]: unknown;
}

export function parseConfigFile(raw: string): {
  config: ExspecConfig;
  content: string;
} {
  const lines = raw.split("\n");

  // Frontmatter must start at the very first line
  if (lines[0]?.trim() !== "---") {
    return { config: {}, content: raw };
  }

  // Find closing delimiter
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { config: {}, content: raw };
  }

  const yamlBlock = lines.slice(1, endIndex).join("\n");
  const content = lines
    .slice(endIndex + 1)
    .join("\n")
    .replace(/^\n+/, "");

  if (!yamlBlock.trim()) {
    return { config: {}, content };
  }

  const parsed = parseYaml(yamlBlock) as RawConfig | null;
  if (!parsed || typeof parsed !== "object") {
    return { config: {}, content };
  }

  const unknownKeys = Object.keys(parsed).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown key(s) in exspec.md frontmatter: ${unknownKeys.join(", ")}`,
    );
  }

  const config: ExspecConfig = {};

  if (parsed.setup !== undefined) {
    config.setup = normalizeSetup(parsed.setup);
  }

  return { config, content };
}

function normalizeSetup(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") {
        throw new Error(
          `Invalid setup command: expected string, got ${typeof item}`,
        );
      }
    }
    return (value as string[]).filter((s) => s.trim());
  }
  throw new Error(
    `Invalid setup value: expected string or string[], got ${typeof value}`,
  );
}
