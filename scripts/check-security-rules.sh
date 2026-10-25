#!/usr/bin/env bash
set -euo pipefail
# WHY: Positive controls prove the local rules detect each prohibited construct; no real secret is used.
fixture_dir="$(mktemp -d)"
cat > "$fixture_dir/fixture.tsx" <<'TS'
"use client";
import { createAdminClient } from "@/lib/supabase/admin";
eval(input);
const view = <div dangerouslySetInnerHTML={value} />;
const exposed = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
TS
cat > "$fixture_dir/server.ts" <<'TS'
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
export const client = createAdminClient;
TS
semgrep scan --config .semgrep/security.yml --metrics=off --disable-version-check --json "$fixture_dir" > "$fixture_dir/results.json"
python3 - "$fixture_dir/results.json" <<'PY'
import json,sys
result=json.load(open(sys.argv[1]))
expected={'tapup-no-dynamic-code','tapup-no-raw-html','tapup-no-public-privileged-key','tapup-no-admin-client-import'}
found={entry['check_id'].split('.')[-1] for entry in result['results']}
assert not result['errors'], 'Security rule parse/scan errors'
assert not any(entry['path'].endswith('server.ts') for entry in result['results']), 'Server-only negative control was flagged'
assert expected <= found, f'Missing positive controls: {expected-found}'
print('All four security rule positive controls passed')
PY
