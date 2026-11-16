# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- Use **Report a vulnerability** on this repository's Security tab (GitHub private vulnerability reporting), or
- email the address on [the support page](public/support.html).

Include what you found, how to reproduce it, and what it affects. You'll get a reply within a few days. Please don't access other people's data, run denial-of-service tests or use automated scanners against the live app while investigating.

## Scope

- **In scope:** the Lift web app and API in this repository: sign-in and sessions, the iOS sign-in flow, the Claude and ChatGPT connector (OAuth and MCP), sync, friends and profiles, billing, and account deletion.
- **Out of scope:** Apple, Google, GitHub, Stripe, Anthropic, OpenAI, Vercel and Neon themselves.

## What isn't in this repository

No secrets live here. Every key, OAuth credential, database URL and session secret comes from the deployment's environment variables, which are listed in the README by name only. Values in the tests and in `vite.config.ts` are local test values that don't work anywhere else.

`npm run check:secrets` scans the tracked files, and `node scripts/check-secrets.mjs --history` scans every past version, for keys, tokens and personal data.
