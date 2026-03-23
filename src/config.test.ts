import { describe, test, expect } from "vitest";
import { parseConfigFile } from "./config.js";

describe("parseConfigFile", () => {
  test("parses setup as a list of commands", () => {
    const raw = `---
setup:
  - php artisan migrate:fresh
  - php artisan db:seed
---
URL: http://localhost`;

    const { config, content } = parseConfigFile(raw);
    expect(config.setup).toEqual([
      "php artisan migrate:fresh",
      "php artisan db:seed",
    ]);
    expect(content).toBe("URL: http://localhost");
  });

  test("parses setup as a single string", () => {
    const raw = `---
setup: php artisan migrate:fresh --seed
---
URL: http://localhost`;

    const { config, content } = parseConfigFile(raw);
    expect(config.setup).toEqual(["php artisan migrate:fresh --seed"]);
    expect(content).toBe("URL: http://localhost");
  });

  test("returns empty config when no frontmatter", () => {
    const raw = "URL: http://localhost\n\nSome content";
    const { config, content } = parseConfigFile(raw);
    expect(config).toEqual({});
    expect(content).toBe(raw);
  });

  test("throws on unknown frontmatter keys", () => {
    const raw = `---
seutp: echo hello
---
URL: http://localhost`;

    expect(() => parseConfigFile(raw)).toThrow(
      "Unknown key(s) in exspec.md frontmatter: seutp",
    );
  });

  test("returns empty config when frontmatter is empty", () => {
    const raw = `---
---
URL: http://localhost`;

    const { config, content } = parseConfigFile(raw);
    expect(config).toEqual({});
    expect(content).toBe("URL: http://localhost");
  });

  test("strips frontmatter from content", () => {
    const raw = `---
setup:
  - echo hello
---
# Config

URL: http://localhost`;

    const { content } = parseConfigFile(raw);
    expect(content).not.toContain("---");
    expect(content).not.toContain("echo hello");
    expect(content.startsWith("# Config")).toBe(true);
  });

  test("treats --- not at file start as regular content", () => {
    const raw = `Some text
---
setup:
  - echo hello
---
More text`;

    const { config, content } = parseConfigFile(raw);
    expect(config).toEqual({});
    expect(content).toBe(raw);
  });

  test("returns raw content when frontmatter has no closing delimiter", () => {
    const raw = `---
setup:
  - echo hello
URL: http://localhost`;

    const { config, content } = parseConfigFile(raw);
    expect(config).toEqual({});
    expect(content).toBe(raw);
  });

  test("filters out empty setup commands", () => {
    const raw = `---
setup:
  - ""
  - "  "
  - echo hello
---
content`;

    const { config } = parseConfigFile(raw);
    expect(config.setup).toEqual(["echo hello"]);
  });

  test("returns empty array for empty string setup", () => {
    const raw = `---
setup: ""
---
content`;

    const { config } = parseConfigFile(raw);
    expect(config.setup).toEqual([]);
  });

  test("throws on non-string setup entries", () => {
    const raw = `---
setup:
  - 123
  - echo hello
---
content`;

    expect(() => parseConfigFile(raw)).toThrow("expected string");
  });

  test("throws on invalid setup type", () => {
    const raw = `---
setup:
  key: value
---
content`;

    expect(() => parseConfigFile(raw)).toThrow("expected string or string[]");
  });
});
