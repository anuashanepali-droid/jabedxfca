# Changelog

## 0.2.1
- **Fix: every HTTP request failed with error 1357004** (sendMessage, uploadAttachment, getThreadList ...) on current Facebook pages. The fb_dtsg token is now found in `DTSGInitialData` and the other current markups (the old single pattern returned an empty token).
- `refreshFb_dtsg` uses the same lookup and also updates jazoest.
- Default user agent is now a current desktop Chrome (was a 2015 Safari); `Accept-Language` header added. Your own `userAgent` option still wins.
- `getThreadList` returns a readable error on an empty Facebook response instead of crashing with a TypeError.
- `account_inactive` errors now carry `error: "Not logged in."` so GoatBot's built-in handling (retry / restart) reacts to them.
- `autoLogin` is opt-in only: a `fca-config.json` alone no longer turns it on.
- Added `api.createAITheme` (alias of `createThemeAI`) and `api.fetchThemeData(themeID)` for bots that use those names.
- Startup log tells whether the token was found; `api.getHealth()` has `dtsgOk`.

## 0.2.0
- Auto-login (opt-in) with session recovery, 2FA secret support, rate limit (3/hour) and checkpoint stop.
- Reconnect with growing delay (2s to 60s); reconnect after silent close; session check after repeated failures.
- `delivery_receipt` and `unknown_delta` events (opt-in); `session_recovered` / `account_inactive` events.
- `api.getHealth()`, `api.shutdown()`, `api.classifyError()`, `handleSignals` option.
- `api.sendSticker()`, `api.downloadSticker()`; sticker packs, store and AI stickers.
- Send queue got `drain()` and `clear()`.
- TypeScript definitions (`index.d.ts`), rewritten `DOCS.md`.
- Saved appstates are written with owner-only permissions; theme generation no longer writes a log file inside node_modules.

## 0.1.0
- Based on ntkhang's fb-chat-api; 52 API functions ported from ST-FCA, ws3-fca and Nexus-fCA.
- Duplicate-event filter and human-like send queue.
- Left out on purpose: ST-FCA's hidden image uploader, its self-updater and its native E2EE binaries.
