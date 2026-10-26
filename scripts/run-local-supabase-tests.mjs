import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// WHY: Read local CLI output privately; generated keys must never be printed or passed as command arguments.
const status = JSON.parse(readFileSync(process.argv[2], "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || url.hostname !== "127.0.0.1"
  || !/^\d{1,5}$/.test(url.port) || Number(url.port) < 1024 || Number(url.port) > 65535
  || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  throw new Error("Expected disposable loopback Supabase status with local keys");
}
const projectId = process.env.TAPUP_REDTEAM_PROJECT_ID ?? "tapup-redteam-local-20261024";
if (!/^tapup-[a-z0-9-]+$/.test(projectId)) throw new Error("Expected a disposable local test project identifier");
const vitestCli = resolve("node_modules/vitest/vitest.mjs");
const result = spawnSync(process.execPath, [vitestCli, "run", "tests/redteam/localSupabase.test.ts", ...process.argv.slice(3)], {
  stdio: "inherit",
  env: {
    ...process.env,
    TAPUP_REDTEAM_LOCAL: "1",
    TAPUP_REDTEAM_PROJECT_ID: projectId,
    TAPUP_REDTEAM_SUPABASE_URL: status.API_URL,
    TAPUP_REDTEAM_ANON_KEY: status.ANON_KEY,
    TAPUP_REDTEAM_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  },
});
process.exitCode = result.status ?? 1;
