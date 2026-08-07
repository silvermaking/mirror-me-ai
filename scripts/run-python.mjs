import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write("Usage: node scripts/run-python.mjs <script.py> [...args]\n");
  process.exit(2);
}

const candidates = process.platform === "win32"
  ? [["py", "-3"], ["python", ""], ["python3", ""]]
  : [["python3", ""], ["python", ""]];

for (const [command, launcherArgument] of candidates) {
  const prefix = launcherArgument ? [launcherArgument] : [];
  const result = spawnSync(command, [...prefix, ...args], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

process.stderr.write("Python 3 was not found. Use the Dev Container or install Python 3.11.\n");
process.exit(127);
