import { readFileSync, writeFileSync } from "fs";

const file = "dist/cli.js";
const content = readFileSync(file, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(file, "#!/usr/bin/env node\n" + content);
}
