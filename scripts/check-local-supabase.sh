#!/usr/bin/env bash
set -euo pipefail
umask 077
# WHY: Only the repository's guarded disposable local project may be used; never link a hosted project.
project_dir="$(mktemp -d)"
mkdir -p "$project_dir/supabase"
cp supabase/config.toml "$project_dir/supabase/config.toml"
container="supabase_db_tapup-redteam-local-20261024"
started_here=false
stop_owned_stack() {
  if [ "$started_here" = true ]; then
    supabase stop --workdir "$project_dir" > "$project_dir/stop.log" 2>&1 || true
  fi
}
trap stop_owned_stack EXIT
if ! docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
  started_here=true
  network_args=()
  if [ -n "${TAPUP_SUPABASE_NETWORK:-}" ]; then network_args=(--network-id "$TAPUP_SUPABASE_NETWORK"); fi
  # No migration directory or demo seed is copied. CLI output includes local keys, so keep it private.
  if ! supabase start --workdir "$project_dir" "${network_args[@]}" \
    --exclude studio,postgres-meta,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor \
    > "$project_dir/start.log" 2>&1; then
    echo "Disposable Supabase startup failed; inspect private startup log locally. No tests passed." >&2
    docker ps --format '{{.Names}} {{.Status}}'
    exit 1
  fi
fi
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:54321/auth/v1/health > "$project_dir/health.json"
empty="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public')")"
if [ "$empty" = true ] || [ "$empty" = t ]; then
  cat supabase/schema.sql supabase/rls.sql supabase/migrations/*.sql | \
    docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U postgres -d postgres \
    > "$project_dir/schema.log" 2>&1
else
  echo "Reusing the guarded local database without resetting or applying schema; ensure its reviewed migrations are current."
fi
supabase status --workdir "$project_dir" -o json > "$project_dir/status.json" 2> "$project_dir/status.log"
node scripts/run-local-supabase-tests.mjs "$project_dir/status.json"
