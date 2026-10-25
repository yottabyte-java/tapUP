import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// WHY: Read local CLI output privately; generated keys must never be printed or passed as command arguments.
const status = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (status.API_URL !== "http://127.0.0.1:54321" || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  throw new Error("Expected disposable loopback Supabase status with local keys");
}
const result = spawnSync("npx", ["vitest", "run", "tests/redteam/localSupabase.test.ts", ...process.argv.slice(3)], {
  stdio: "inherit",
  env: {
    ...process.env,
    TAPUP_REDTEAM_LOCAL: "1",
    TAPUP_REDTEAM_PROJECT_ID: "tapup-redteam-local-20261024",
    TAPUP_REDTEAM_SUPABASE_URL: status.API_URL,
    TAPUP_REDTEAM_ANON_KEY: status.ANON_KEY,
    TAPUP_REDTEAM_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  },
});
process.exitCode = result.status ?? 1;
