import { readFileSync } from "node:fs";

// WHY: Lockfile metadata makes the production dependency inventory reproducible without another package.
// This reports declared licenses; it is not a legal determination or an audit of bundled notices.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const entries = Object.entries(lock.packages)
  .filter(([path, dependency]) => path && !dependency.dev)
  .map(([path, dependency]) => ({ path, version: dependency.version, license: dependency.license ?? "UNKNOWN" }))
  .sort((a, b) => a.path.localeCompare(b.path));
console.log("# Production dependency license inventory\n");
console.log("Advisory only: review obligations and shipped notices before distributing artifacts.\n");
console.log("| Dependency path | Version | Declared license |\n|---|---|---|");
for (const entry of entries) console.log(`| ${entry.path} | ${entry.version} | ${entry.license} |`);
const review = entries.filter(({ license }) => /UNKNOWN|GPL|AGPL|LGPL|CC-BY/i.test(license));
console.log(`\n${entries.length} entries; ${review.length} require review for unknown, copyleft or attribution terms.`);
