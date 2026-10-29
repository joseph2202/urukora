# URUKORA v0.2 — File Studio

### Included now

| Tool | Input | Output | Notes |
|---|---|---|---|
| PDF Merge | 2–5 local PDFs | One merged PDF | Original order from file picker |
| PDF Extract | One local PDF; page list `1-3,5,8` | PDF of selected pages | 1-based indices; duplicate pages removed |
| Image Studio | One JPG, PNG or WebP | JPG, PNG or WebP | Resize to <=640 / 1280 / 1920 / 2560 px, quality for JPG/WebP |
| QR generator | text / URL | PNG | Previously available in v0.1 |
| Activity | local metadata | Local history | Does not retain original filenames or file content |

### Constraints and expected failures

- Files stay in browser memory. They are not uploaded and there are no server-side conversion endpoints.
- Max **12 MiB** per PDF or image; at most **36 MiB** total PDFs; at most **200 output PDF pages**.
- Max **24 MP** image dimensions to reduce resource spikes.
- Password-protected, damaged or unusually complex PDFs may fail gracefully.
- PNG is lossless, so the quality slider is disabled for PNG.
- Animated images become a single frame; transparent images flattened to JPG use white.
- On browsers that cannot export WebP, the tool reports an error instead of silently producing the wrong format.
- Memory usage can be temporarily much greater than file size; mobile browser limits still apply. No guarantee of processing files close to the maximum on low-RAM phones.
- This release does **not** include OCR, image-to-PDF, PDF compression, remote uploads, scheduled tasks or cloud storage.

### Update your local Mac

```bash
cd ~/Documents/urukora
git pull --ff-only
cd miniapp
npm install
npm run test
npm run build
```

If you are running FastAPI, restart it so it serves the rebuilt `miniapp/dist`. The Telegram bot does not need a new token or username. The existing HTTPS tunnel works as long as the original processes still run.

### Future backend-driven File Studio

When demand justifies it, first implement secure per-user sessions, ownership checks, quotas, expiring private storage and isolated processing before offering server-side document conversion. Never expose anonymous PDF-processing endpoints on a public tunnel.
