# Credits

jabed-fca is built from MIT-licensed projects. Their copyright notices must stay with the code.

- **fb-chat-api-temp** (base) — Avery, Benjamin, David, Maude; rebuilt by NTKhang — https://github.com/ntkhang03/fb-chat-api-temp
- **ST-FCA** — Sheikh Tamim — 30 API files ported (see `index.js`, "ported from ST-FCA")
- **ws3-fca** — gcmember, gcname, gcrule, nickname, emoji, friend, stickers, story, theme, comment, editMessage, GetBotInfo
- **Nexus-fCA** — autoLogin (`lib/autoLogin.js`), pinMessage, scheduler, stickerStore, theme AI, sendComment, setProfileGuard, enableAutoSaveAppState, getUID

## Deliberately NOT included from ST-FCA
- hidden uploader that sent chat photos to third-party image hosts
- `checkUpdate.js` (ran `npm install` on the host project by itself)
- prebuilt native E2EE binaries (`messagix.so/.dll`)

## New in jabed-fca
- reconnect with backoff, session check and recovery (`src/listenMqtt.js`), delivery receipts, unknown-delta capture
- `lib/guard.js`: duplicate-event filter (`ctx._dedupe`) and human-like send queue (`api.sendQueue.options`)
