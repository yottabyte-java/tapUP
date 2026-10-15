# Prompt 38: public/manifest.webmanifest and public/icons/
Agent: 6 Release  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create the PWA manifest (name tapUP, short_name tapUP, theme and background #111A1E, display standalone, start_url /, icons 192 and 512).
Generate simple icons from the tapUP wordmark (teal on dark). Link the manifest in the layout.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Chrome on Android offers 'Install app'.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
