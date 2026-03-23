import { describe, test, expect } from "vitest";
import { tmpdir } from "os";
import { mkdirSync, rmSync, readFileSync, realpathSync } from "fs";
import { join } from "path";
import { runSetupCommands } from "./setup.js";

describe("runSetupCommands", () => {
  const tmpRoot = join(tmpdir(), `exspec-setup-test-${Date.now()}`);

  function setup() {
    mkdirSync(tmpRoot, { recursive: true });
  }

  function cleanup() {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  test("runs a successful command", async () => {
    setup();
    try {
      await runSetupCommands(["echo hello"], tmpRoot);
    } finally {
      cleanup();
    }
  });

  test("throws on failed command", async () => {
    setup();
    try {
      await expect(runSetupCommands(["exit 1"], tmpRoot)).rejects.toThrow(
        "Setup command failed (exit 1): exit 1",
      );
    } finally {
      cleanup();
    }
  });

  test("stops at first failure in sequence", async () => {
    setup();
    const marker = join(tmpRoot, "marker.txt");
    try {
      await expect(
        runSetupCommands(
          ["exit 1", `echo should-not-run > "${marker}"`],
          tmpRoot,
        ),
      ).rejects.toThrow();
      expect(() => readFileSync(marker)).toThrow();
    } finally {
      cleanup();
    }
  });

  test("runs commands in the specified cwd", async () => {
    setup();
    const output = join(tmpRoot, "cwd.txt");
    try {
      await runSetupCommands([`pwd > "${output}"`], tmpRoot);
      const cwd = readFileSync(output, "utf-8").trim();
      expect(cwd).toBe(realpathSync(tmpRoot));
    } finally {
      cleanup();
    }
  });
});
