#!/usr/bin/env bash
set -euo pipefail
# WHY: A secret introduced only by a merge resolution is absent from ordinary git log -p.
fixture_dir="$(mktemp -d)"
git -C "$fixture_dir" init -q -b main
git -C "$fixture_dir" config user.name 'yottabyte-java'
git -C "$fixture_dir" config user.email '294890825+yottabyte-java@users.noreply.github.com'
commit_fixture() {
  git -C "$fixture_dir" add .
  git -C "$fixture_dir" commit -qm "$1" -m 'Co-authored-by: coderabbitai[bot] <136622811+coderabbitai[bot]@users.noreply.github.com>'
}
printf 'baseline\n' > "$fixture_dir/base.txt"
commit_fixture baseline
git -C "$fixture_dir" checkout -qb side
printf 'side\n' > "$fixture_dir/side.txt"
commit_fixture side
git -C "$fixture_dir" checkout -q main
printf 'main\n' > "$fixture_dir/main.txt"
commit_fixture main
git -C "$fixture_dir" merge -q --no-ff --no-commit side
# This random fixture is not a credential and never leaves the temporary repository.
node -e 'require("node:fs").writeFileSync(process.argv[1], `api_key="${require("node:crypto").randomBytes(24).toString("hex")}"\n`)' "$fixture_dir/merge.env"
commit_fixture merge
set +e
gitleaks git --redact=100 --no-banner --log-opts="--all --diff-merges=first-parent" "$fixture_dir" > "$fixture_dir/scan.log" 2>&1
scan_status=$?
set -e
if [ "$scan_status" -ne 1 ]; then
  echo "Merge-only secret control was not detected (scanner status $scan_status)" >&2
  exit 1
fi
echo "Merge-only synthetic secret detected with redacted output"
