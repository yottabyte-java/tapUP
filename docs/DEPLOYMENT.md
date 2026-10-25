# tapUP hackathon deployment

## 1. Git and release controls (Layer 1)

1. The verified default branch is `main`. Continue PR #2 from
   `review/coderabbit-final-fixes` into `main`; it was OPEN at
   `3b35445dea401a010dbcedc6cdf91dad0d9481a4` when this task began.
2. CI runs on `pull_request`, pushes to `main`, and `workflow_dispatch`. It uses
   `contents: read`, no production secrets, and checkout without persisted credentials.
   There are no `pull_request_target` jobs or automatic deployment/migration steps.
   Fork PRs can run these unprivileged checks; never approve a secret-bearing preview
   build of unreviewed fork code.
3. In GitHub Settings → Rules → Rulesets (or Branches → Branch protection), target
   `main`, require pull requests and the successful `verify` check, require an
   up-to-date branch, and disallow force pushes/deletion. Add the security check
   after its first successful run. Review the plan's available protection features
   for this private repository. These settings were not changed; the protection
   API returned HTTP 403, so enforcement is unverified.
4. Review the final diff, CI and CodeRabbit findings before approving a merge.
   **PR #2 must be merged before a normal main-branch release includes its fixes.**
   An explicitly approved preview of the PR branch can include them before merging.
5. Record the approved commit, deployment URL and database migration version. If a
   release fails, select a known-good Vercel deployment after checking database
   compatibility, or revert the offending commit through a new PR and rerun CI.
   Never force-push, reset shared history, or reverse SQL blindly. Rollback requires
   explicit approval.

### Known release blockers

The prior verification reproduced full/split cash confirmation after expiry during
SQL row-lock waits. This pipeline task does not change payment semantics. Full
Supabase/Auth/OTP/UI checks are still outstanding. Keep production release on hold
until those are resolved or explicitly assessed by the owner.

## 2. Continuous integration (Layer 2)

1. Use Node 24 and npm with the committed `package-lock.json`. Run:

   ```sh
   npm ci --no-audit --no-fund
   npm run lint
   npx next typegen && npx tsc --noEmit
   TAPUP_TEST_POSTGRES_CONTAINER=<existing-disposable-postgres-container> npm test
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
   ```

   The container name is a placeholder, not a command to copy literally. Reuse the
   existing PostgreSQL 17 test fixture; this app does not publish a container image.
   With a non-default Docker Unix socket, also set `DOCKER_HOST` for the test process.
2. The existing `CI / verify` job caches npm downloads keyed by the lockfile. Checkout
   and setup-node are pinned to the commit SHAs returned by their official repositories'
   `v5` refs during this task. Review release changes before updating these pins.
3. Next.js route types must be generated before standalone TypeScript. Build placeholders
   provide configuration only; they do not prove database connectivity. CI never loads
   production Supabase keys or applies production SQL.
4. The PostgreSQL suite creates a new unique database with real schema/RLS/migration and
   synthetic Auth stubs. The 12 opt-in full Supabase tests require a separate disposable
   Supabase stack; see the existing final-verification section in `docs/HANDOFF.md`.
   Do not interpret skips or the SQL stub suite as live GoTrue/PostgREST/OTP verification.
5. Open PR #2 → Checks → `verify` to inspect the current commit's actual run, or use
   `gh pr checks 2 --repo yottabyte-java/tapUP`. A passing earlier commit is insufficient
   if relevant code has changed. See `docs/VERIFICATION.md` for the original CI history.

Reference: Romano Roth's verified
[GitHub: Build a DevSecOps Pipeline playlist](https://www.youtube.com/playlist?list=PLrsbMazVPK_pt9u_PiTGAb3s9aw8ashvQ).
Its workflow/security stages inform this small pipeline; no course or extra platform
infrastructure is required.

## 3. Security and software supply chain (Layer 3)

1. Require both `verify` and `security` in the main branch protection rule once
   each has run successfully. No setting is changed by this repository patch.
2. The `security` job runs on the same unprivileged events as CI:

   | Check | Policy | Scope/limits |
   |---|---|---|
   | `npm audit --audit-level=moderate` | Blocking for moderate/high/critical vulnerabilities or audit errors | Includes development dependencies; registry advisories change over time |
   | Gitleaks 8.30.1 | Blocking, redacted output | Full fetched Git history; official release archive checked against a committed SHA-256 digest |
   | Semgrep OSS 1.182.1 | Blocking on rule findings or scan errors | Local `.semgrep/security.yml`: dynamic code, raw React HTML, public privileged-key names and direct admin-client imports into client modules; a small static gate, not a complete security audit |
   | Rule positive controls | Blocking | `bash scripts/check-security-rules.sh` verifies all four rules catch synthetic unsafe examples |
   | License inventory | Advisory | `node scripts/license-inventory.mjs` reports lockfile production license declarations to the Actions summary; it does not validate bundled notices or provide legal clearance |

3. The inspected lockfile has LGPL and attribution-bearing components. Review their
   obligations before distributing application artifacts. A successful inventory
   command means the report was produced, not that every license was approved.
4. Review GitHub Settings → Security → Code security and analysis for secret scanning,
   push protection and dependency alerts available to this private repo's plan.
   These were not enabled or verified. Do not buy GitHub Code Security/Secret Protection
   for this task; standalone OSS checks run without those paid features.
5. No container image is built/published, so no container scanner is added. There is
   no authorized deployed preview yet, so dynamic scanning has not run. Authorize a
   specific synthetic-data preview URL before any active dynamic scanner is used.
6. Tool installs are CI utilities, not application dependencies. Semgrep uses reviewed
   local rules with metrics/version checks disabled; no SEMGREP token is required.
   Its pinned CLI still resolves Python dependencies at installation time; review
   upgrades and install failures. Ubuntu 24.04 is explicit to avoid runner-image drift.
