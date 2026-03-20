import { describe, test, expect } from "vitest";
import { getDomain } from "./discovery.js";

describe("getDomain", () => {
  const root = "/project";

  test("extracts domain from subdirectory", () => {
    expect(getDomain("/project/features/Auth/login.feature", root)).toBe(
      "Auth",
    );
  });

  test("extracts domain from nested subdirectory", () => {
    expect(getDomain("/project/features/Auth/Admin/users.feature", root)).toBe(
      "Auth",
    );
  });

  test("returns 'default' for files directly in features/", () => {
    expect(getDomain("/project/features/login.feature", root)).toBe("default");
  });
});
