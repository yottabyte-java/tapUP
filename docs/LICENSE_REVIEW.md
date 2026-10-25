# Dependency license review — hackathon baseline

The license inventory flagged 15 entries for review among 68 production entries. All
15 are transitive; none has unknown license metadata. A license review item is not
evidence of a violation or an npm vulnerability. This is not an npm vulnerability count. No dependency was removed or upgraded for licensing.

Evidence: `npm explain sharp caniuse-lite --json`, the committed lockfile, installed
`@img/sharp-libvips-linux-x64/README.md` licensing table, its package metadata, and
`caniuse-lite/LICENSE`. Next depends optionally on Sharp; Sharp selects the platform
binary. Caniuse-lite is reached through Next and Browserslist. Entries for other
platforms are present in the cross-platform lockfile, not all installed or shipped.

| Dependency | Version | Declared license | Relationship | Practical implication / further review |
|---|---|---|---|---|
| `@img/sharp-libvips-darwin-arm64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-darwin-x64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-arm` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-arm64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-ppc64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-riscv64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-s390x` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linux-x64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-libvips-linuxmusl-x64` | 1.3.4 | LGPL-3.0-or-later | Transitive | Optional native library for the named platform; Linux x64 is installed here. Retain notices; review corresponding-source/relinking obligations if distributing its binary. |
| `@img/sharp-wasm32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Transitive | Optional platform binary, not installed on this Linux host. Preserve all listed licenses/notices if that target is distributed. |
| `@img/sharp-win32-arm64` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Transitive | Optional platform binary, not installed on this Linux host. Preserve all listed licenses/notices if that target is distributed. |
| `@img/sharp-win32-ia32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Transitive | Optional platform binary, not installed on this Linux host. Preserve all listed licenses/notices if that target is distributed. |
| `@img/sharp-win32-x64` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Transitive | Optional platform binary, not installed on this Linux host. Preserve all listed licenses/notices if that target is distributed. |
| `caniuse-lite` | 1.0.30001816 | CC-BY-4.0 | Transitive | Browser compatibility data used by Next/Browserslist; retain attribution, license link and any modification notice when sharing the data. |

## Release handling

1. Keep original third-party license/notice files when packaging dependencies.
   The Linux libvips README identifies bundled LGPL components (including glib,
   libexif, libheif and libvips), plus other licenses; its summary uses the
   “any later version” permission. Do not reduce this to “Sharp is Apache only”.
2. A hosted demonstration does not itself give judges a copy of server native
   libraries. Review the actual Vercel build artifact, platform and distribution
   arrangement before shipping downloadable bundles, containers or offline apps.
   If conveying LGPL binaries, assess corresponding source, replacement/relinking
   and notice obligations for those exact versions. This task does not certify
   legal clearance or provide those distribution materials.
3. Caniuse-lite attribution: **Can I use**, browser support data,
   https://caniuse.com/, compact distribution
   https://github.com/browserslist/caniuse-lite, licensed under
   https://creativecommons.org/licenses/by/4.0/. No dataset modifications were made
   by this task. Preserve its notice/license if redistributed.
4. Review remains required for an actual distributed artifact. No known license
   incompatibility with a hosted hackathon demo was established by this inventory.
   Re-run `node scripts/license-inventory.mjs` after dependency updates.

References: https://sharp.pixelplumbing.com/install/ and
https://www.gnu.org/licenses/lgpl-3.0.html. No paid compliance service is used.
