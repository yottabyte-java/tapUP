import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const statusFile = process.env.TAPUP_E2E_STATUS_FILE;
if (!statusFile) throw new Error("Set TAPUP_E2E_STATUS_FILE to private local Supabase CLI status JSON");
const status = JSON.parse(readFileSync(statusFile, "utf8"));
// WHY: Fail closed before either build or browser can contact a hosted database.
const apiUrl = new URL(status.API_URL);
if (apiUrl.protocol !== "http:" || apiUrl.hostname !== "127.0.0.1"
  || !/^\d{1,5}$/.test(apiUrl.port) || Number(apiUrl.port) < 1024 || Number(apiUrl.port) > 65535
  || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  throw new Error("Only disposable loopback Supabase configuration is accepted");
}
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY };
async function run(args) {
  const windows = process.platform === "win32";
  // WHY: Invoke npm's JavaScript CLI directly on Windows instead of shelling through npm.cmd.
  const npmCli = process.env.npm_execpath
    ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const child = windows && existsSync(npmCli)
    ? spawn(process.execPath, [npmCli, ...args], { env, stdio: "inherit" })
    : spawn("npm", args, { env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  if (code !== 0) process.exit(Number(code) || 1);
}
await run(["run", "build"]);
if (process.argv.includes("--build-only")) process.exit(0);
await run(["run", "start", "--", "--hostname", "0.0.0.0", "--port", "3100"]);
