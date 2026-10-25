#!/usr/bin/env python3
"""Export inspected screenshots, results and redacted traces; keep raw reports private."""
import argparse
import base64
import html
import json
import os
from pathlib import Path
import re
import shutil
import zipfile

os.umask(0o077)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("destination", type=Path)
args = parser.parse_args()
root = Path("test-results")
results = json.loads((root / "results.json").read_text())
if not results["stats"]["expected"] or results.get("errors") or results["stats"]["unexpected"] or results["stats"]["skipped"] or results["stats"]["flaky"]:
    raise SystemExit("Only export a complete passing run; inspect failed evidence privately")
destination = args.destination
if destination.exists():
    raise SystemExit("Choose a new destination; existing evidence will not be overwritten")
destination.mkdir(parents=True)
known = []
status_file = os.environ.get("TAPUP_E2E_STATUS_FILE")
if status_file:
    status = json.loads(Path(status_file).read_text())
    known = [status[key] for key in ("ANON_KEY", "SERVICE_ROLE_KEY") if status.get(key)]
secret_fields = {"authorization", "apikey", "cookie", "set-cookie", "access_token", "refresh_token", "password", "storagestate"}

def redact_text(value):
    for secret in known:
        value = value.replace(secret, "[REDACTED]")
    value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[JWT REDACTED]", value)
    value = re.sub(r"base64-[A-Za-z0-9_-]+", "[SESSION REDACTED]", value)
    value = re.sub(r"/pay/[^\s\"'<>?\\]+", "/pay/[REDACTED]", value)
    value = re.sub(r"\b[0-9a-f]{32}\b", "[TOKEN REDACTED]", value)
    # WHY: QR decoding parameters contain image bytes; removing URLs alone cannot redact a QR.
    value = re.sub(r"iVBORw0KGgo[A-Za-z0-9+/=]+", "[IMAGE REDACTED]", value)
    value = re.sub(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+", "[IMAGE REDACTED]", value)
    return value

def redact(value):
    if isinstance(value, dict):
        if str(value.get("name", "")).lower() in secret_fields and "value" in value:
            value = {**value, "value": "[REDACTED]"}
        return {key: "[REDACTED]" if key.lower() in secret_fields else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        # Preserve snapshot reference structure, but remove SVG geometry that can encode payment URLs.
        if value and isinstance(value[0], str) and value[0].lower() in {"path", "polygon"} and len(value) > 1 and isinstance(value[1], dict):
            value = [value[0], {key: "" if key in {"d", "points"} else item for key, item in value[1].items()}, *value[2:]]
        return [redact(item) for item in value]
    return redact_text(value) if isinstance(value, str) else value

blank_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")

def clean_trace(source, target):
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as cleaned:
        for name in original.namelist():
            data = original.read(name)
            if data.startswith(b"wOF2"):
                pass  # Self-hosted font data contains no application/session state.
            elif data.startswith((b"\x89PNG", b"\xff\xd8", b"\x00\x00\x01\x00")):
                data = blank_png
            else:
                try:
                    text = data.decode("utf8")
                except UnicodeDecodeError:
                    raise SystemExit("Unknown binary trace resource; inspect privately before export")
                if name.endswith((".trace", ".network")):
                    events = []
                    for line in text.splitlines():
                        event = json.loads(line)
                        if event.get("type") in {"screencast-frame", "screencastFrame"}:
                            continue
                        events.append(json.dumps(redact(event), separators=(",", ":")))
                    data = ("\n".join(events) + "\n").encode()
                else:
                    data = redact_text(text).encode()
            cleaned.writestr(name, data)

entries = []
def specs(suite):
    for spec in suite.get("specs", []):
        for test in spec["tests"]:
            entries.append({"title": spec["title"], "project": test["projectName"],
                            "status": test["status"], "seconds": sum(r["duration"] for r in test["results"]) / 1000})
    for child in suite.get("suites", []):
        specs(child)
for suite in results["suites"]:
    specs(suite)

traces_dir = destination / "traces"
traces_dir.mkdir()
for index, folder in enumerate(sorted(path for path in root.iterdir() if path.is_dir())):
    project = "mobile" if folder.name.endswith("-mobile") else "desktop"
    for picture in folder.glob("*.png"):
        if picture.name in {"owner-dashboard.png", "customer-buying-power.png", "repayment-0.png", "repayment-2500.png"}:
            (destination / project).mkdir(exist_ok=True)
            shutil.copyfile(picture, destination / project / picture.name)
    for trace in folder.glob("trace-*.zip"):
        clean_trace(trace, traces_dir / f"{index:02d}-{project}-{trace.name}")

with zipfile.ZipFile(destination / "sanitized-traces.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for trace in traces_dir.iterdir():
        bundle.write(trace, trace.name)
summary = {"stats": results["stats"], "tests": entries,
           "privacy": "Headers, credentials, QR URLs, SVG geometry and trace images redacted. Raw report remains private."}
(destination / "results.json").write_text(json.dumps(redact(summary), indent=2))
rows = "".join(f"<tr><td>{html.escape(entry['project'])}</td><td>{html.escape(entry['title'])}</td><td>{entry['status']}</td><td>{entry['seconds']:.1f}s</td></tr>" for entry in entries)
images = "".join(f'<figure><figcaption>{html.escape(str(picture.relative_to(destination)))}</figcaption><img width="390" src="{picture.relative_to(destination)}"></figure>' for picture in sorted(destination.glob("*/*.png")))
(destination / "report.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>tapUP Chromium verification</title><style>body{{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}}table{{border-collapse:collapse}}td,th{{border:1px solid #aaa;padding:.5rem}}figure{{display:inline-block;vertical-align:top}}img{{max-width:100%}}</style><h1>tapUP Chromium verification</h1><p>{len(entries)} passed; 0 failed; 0 skipped; 0 flaky. Synthetic local Supabase only.</p><table><tr><th>Viewport</th><th>Journey</th><th>Result</th><th>Duration</th></tr>{rows}</table><p><a href="sanitized-traces.zip">Sanitized Playwright traces</a> (images and session material removed; open locally with Playwright).</p>{images}</html>''')
print(f"Exported {len(entries)} passing scenarios and {len(list(traces_dir.iterdir()))} sanitized traces")
