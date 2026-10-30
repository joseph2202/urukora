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

## Reminders (v0.3)

- Only authenticated Bot API private-chat messages create, list and cancel reminders; private chat ID must equal Telegram user ID. There are no unauthenticated Mini App reminder endpoints.
- A user can cancel only their own pending reminder. Jobs already leased for send cannot be cancelled.
- SQLite stores reminder text in plaintext locally; secure local disks, directory permissions and backups. Never commit a real SQLite database to GitHub.
- Delivery uses bounded batches and atomic leases to avoid concurrent sends, with up to five retries. An unusual crash after Telegram accepts a message but before DB confirmation could trigger a duplicate later.
- The bot must run continuously for on-time delivery. Without permanent hosting, delayed or missed notifications are possible.

## Mini App reminder access (v0.4)

- Every `/api/v1/reminders/*` request must include **Telegram-signed initData** in the JSON body. Data are HMAC-validated against the server-only bot token and must be fresh (within one hour).
- The Telegram user ID is derived only from the validated signed payload; caller-supplied IDs and client-side `initDataUnsafe` are never trusted.
- The server enforces owner-only reads/deletes and 20 active reminders per user. Private chat ID equals the authenticated user's Telegram ID.
- A random client-side request key ensures retried identical create calls don't insert duplicates; it is stored in SQLite with a per-user uniqueness index. This is not a substitute for HTTPS, anti-abuse controls or rate limits.
- Logged-in status shown in UI is only informational. The server still verifies every reminder operation.
- Close and reopen the Mini App after one hour to refresh Telegram launch credentials. Do not send `initData` via URL parameters or to third-party hosts.
- Cloudflare Quick Tunnel publishes the app on a temporary public HTTPS address. Keep secrets off the frontend and do not deploy this development build to strangers.
