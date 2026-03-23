import { spawn } from "child_process";

const TIMEOUT_MS = 120_000; // 2 minutes

export interface SetupOptions {
  verbose?: boolean;
}

export async function runSetupCommands(
  commands: string[],
  cwd: string,
  options: SetupOptions = {},
): Promise<void> {
  for (const command of commands) {
    console.log(`  $ ${command}`);
    await runCommand(command, cwd, options.verbose ?? false);
  }
}

function runCommand(
  command: string,
  cwd: string,
  verbose: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: [
        "ignore",
        verbose ? "inherit" : "ignore",
        verbose ? "inherit" : "ignore",
      ],
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `Setup command timed out after ${TIMEOUT_MS / 1000}s: ${command}`,
        ),
      );
    }, TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Setup command failed (exit ${code}): ${command}`));
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to run setup command: ${err.message}`));
    });
  });
}
