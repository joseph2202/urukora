# Security baseline

- Never commit a BotFather token, `.env`, API keys or real user records, including to a public repository.
- Configure tokens in an ignored local `.env` or secure deployment secrets.
- Browser `initDataUnsafe` is not proof of identity. Server verifies Telegram-signed `initData`, timestamp, signature, and user ID.
- `/api/v1/auth/telegram` returns verification info, NOT a reusable session. Do not expose private user data without proper sessions.
- Restrict frontend CORS origin; deploy backend and Mini App on HTTPS for real Telegram use.
- Restrict uploads and scan/validate file types before enabling future file tools.
- If a bot token leaks, rotate it through BotFather immediately and invalidate any affected sessions.
- Do not log the raw `initData`, Bot Token, or private user files.

- For the temporary Telegram test, expose **only** FastAPI serving the built Mini App, not `npm run dev` or the Vite HMR server.
- A Cloudflare Quick Tunnel is a temporary **public** URL; anyone with it can access the published front page and public API endpoints. Do not send its URL to strangers.
- Local tunnels close when stopped and URL changes when restarted. They are not production hosting.

## Browser-only File Studio (v0.2)

PDF and image files are never sent to our HTTP API. They are read in the user's browser memory by pdf-lib or Canvas and downloaded as new files. The `Activity` page keeps only operation type, output file size and timestamp in that browser's localStorage; no input filename or document bytes are stored there. Anyone using the same browser profile can see this local activity metadata until cleared.

Current limits: up to 12MB per file; 36MB across selected PDF files; no more than 5 PDFs and 200 output pages per operation; up to 24 million input pixels per image. File names and MIME types are not sufficient by themselves: PDFs also require their magic signature before parsing. This is resource protection, **not malware scanning**. Avoid claiming malicious PDFs are harmless; use untrusted file sandboxing and scanning before adding any future server-side processing.

There is no multi-user persistent document storage or authenticated private file API in v0.2.
