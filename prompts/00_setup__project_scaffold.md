# Prompt 00: (setup) project scaffold
Agent: Setup  |  Read first: README.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create the Next.js project in this repo root.
- Run create-next-app with TypeScript, Tailwind, App Router, ESLint, src dir OFF, import alias @/*.
- Install: @supabase/supabase-js @supabase/ssr zod bcryptjs qrcode.react html5-qrcode ; dev: vitest @types/bcryptjs.
- Add DM Sans via next/font in app/layout.tsx and set Tailwind theme colours: bg #111A1E, card #1B2A30, teal #2DD4A0, amber #F5B83D.
- Create empty folders from docs/FILE_STRUCTURE.md. Add .gitignore entries for .env.local.
- Add npm scripts: "test": "vitest run".
Explain each dependency in one line and why we need it. Do not build any feature yet.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
npm run dev opens a page on localhost:3000. npm test runs (no tests yet is fine). .env.local is NOT tracked by git.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
