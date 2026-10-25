# Pull request verification

The `CI / verify` GitHub Actions job runs on pull requests, pushes to `main`, and
manual dispatch. It installs the npm lockfile with Node 24, runs tests against an
isolated PostgreSQL 17 container, then runs lint, TypeScript, and the production
build. It generates Next.js route/layout types before standalone TypeScript
checks so fresh checkouts do not depend on a previous build. It needs no
production secrets and applies no production migrations.

Run the same checks locally:

```sh
npm ci --no-audit --no-fund
TAPUP_TEST_POSTGRES_CONTAINER=<local-postgres-container> npm test
npm run lint
npx next typegen && npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
```

The container must be disposable PostgreSQL 17, accessible through Docker and
`psql -U postgres`. The SQL suite creates a uniquely named database, installs the
real schema, RLS, and migration, and uses synthetic Auth stubs. It checks buying
power parity and payment transitions. It does not test GoTrue or PostgREST.
Without the container variable this suite is skipped. The separate 12-test
Supabase integration suite also stays skipped unless explicitly configured as
described in `docs/redteam/TEST_ENVIRONMENT.md`. A green CI job does not establish
full Supabase runtime coverage.

## Why PR #2 originally had no CI runs

At commit `5e7352c`, the repository had no `.github/workflows` files, and GitHub's
Actions workflows API returned zero workflows. The CodeRabbit commit status is
a review result; it does not run the application's tests, lint, or build. This
workflow supplies those checks on subsequent PR updates. GitHub Actions must be
enabled in repository settings. Whether `CI / verify` is a required merge check
depends on repository rules; the current integration cannot read the Actions
settings or branch protection endpoints (HTTP 403).

## CodeRabbit docstring coverage

PR #2's initial CodeRabbit review reported 0% documentation coverage against an
80% threshold for functions touched by the diff. This comes from CodeRabbit's
[pre-merge checks](https://docs.coderabbit.ai/pr-reviews/pre-merge-checks), not
ESLint, TypeScript, Vitest, or a repository documentation script. The documented
default threshold is 80% and default mode is `warning`, which does not block a
merge. The PR reported a warning and its CodeRabbit commit status succeeded.
Organization or repository settings can change enforcement; those settings
have not been verified here.

Document public contracts and non-obvious rules where useful, such as receipt
dates, preserving confirmed payments on rejection, and stable pagination under
concurrent sales. Do not add comments to inflate a percentage or change the
threshold merely to suppress a warning.
