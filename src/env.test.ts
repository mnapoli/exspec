import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { expandVars } from "./env.js";

describe("expandVars", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.SECRET = "s3cret";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  test("expands $VAR syntax", () => {
    expect(expandVars("URL: $APP_URL")).toBe("URL: http://localhost:3000");
  });

  test("expands ${VAR} syntax", () => {
    expect(expandVars("URL: ${APP_URL}")).toBe("URL: http://localhost:3000");
  });

  test("expands multiple variables", () => {
    expect(expandVars("$APP_URL with $SECRET")).toBe(
      "http://localhost:3000 with s3cret",
    );
  });

  test("leaves undefined variables as-is", () => {
    expect(expandVars("$UNDEFINED_VAR")).toBe("$UNDEFINED_VAR");
    expect(expandVars("${UNDEFINED_VAR}")).toBe("${UNDEFINED_VAR}");
  });

  test("returns text without variables unchanged", () => {
    expect(expandVars("no variables here")).toBe("no variables here");
  });
});
