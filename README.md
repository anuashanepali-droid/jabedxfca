# jabed-fca

Unofficial Facebook Messenger API for Node.js (a "fca"), built on **ntkhang's fb-chat-api** and merged with features from **ST-FCA**, **ws3-fca** and **Nexus-fCA** (all MIT — see `CREDITS.md`).

> ⚠️ This is an **unofficial** API. Facebook can restrict or ban accounts that automate Messenger. Use a spare account, keep message rates low, and use it at your own risk.

## Install

```json
"dependencies": { "jabed-fca": "^0.2.0" }
```

Until it is on npm you can install straight from GitHub:

```json
"dependencies": { "jabed-fca": "github:anuashanepali-droid/jabed-fca" }
```

In your bot (for example GoatBot v2's `login.js`) the only change is the require:

```js
const login = require("jabed-fca");
```

`login(...)`, `api.sendMessage`, `api.listenMqtt`, … work the same as in fb-chat-api.

## Quick start

```js
const login = require("jabed-fca");
const appState = require("./appstate.json");

login({ appState }, { listenEvents: true }, (err, api) => {
  if (err) return console.error(err);
  api.listenMqtt((err, event) => {
    if (err) return console.error(err);
    if (event.type === "message" && event.body === "ping") {
      api.sendMessage("pong", event.threadID);
    }
  });
});
```

## What is new compared with plain fb-chat-api

| Feature | What it does |
|---|---|
| **Duplicate filter** | The same `messageID` / reaction / unsend is delivered only once (fixes double replies after reconnects). |
| **Send queue** | `api.sendMessage` waits a human-like gap between messages (per thread and global). Same `callback`/`Promise` behaviour as before. |
| **Safe reconnect** | Growing delay (2s → 60s) instead of instant retry loops; reconnects after silent closes; stops after `stopListening()`. |
| **Session check + auto-login** | After repeated failures the session is checked; if it is dead, auto-login (opt-in) logs in again and refreshes tokens. A checkpoint stops all retries. |
| **Delivery receipts** | `delivery_receipt` events (opt-in). |
| **Unknown-event capture** | `unknown_delta` events (opt-in) to see event formats the library does not parse yet. |
| **Health + graceful shutdown** | `api.getHealth()` for monitors, `api.shutdown()` flushes queued messages and stops cleanly (`handleSignals: true` does it on SIGTERM). |
| **Error classes** | `api.classifyError(err)` → `logged_out`, `checkpoint`, `rate_limited`, `timeout`, `network`, `permission`, `unknown`. |
| **Stickers** | search, packs, store, AI stickers, `sendSticker`, `downloadSticker`. |
| **TypeScript** | `index.d.ts` included. |
| **100+ API functions** | Posts, comments, stories, notes, themes (incl. AI themes), stickers, polls/pins, group rules/members/names, friends, profile lock, buttons, scheduler, … |

## Options (second argument of `login`)

```js
login({ appState }, {
  listenEvents: true,
  autoReconnect: true,
  sendQueue: { threadGapMin: 700, threadGapMax: 1600, globalGap: 250, maxPerMinute: 0 }, // or false
  dedupe: { ttlMs: 600000, maxEntries: 10000 },                                         // or false
  reconnect: { baseDelay: 2000, maxDelay: 60000 },
  autoLogin: true,              // see below
  handleSignals: true,          // clean shutdown on SIGTERM/SIGINT
  deliveryReceipts: false,      // emit "delivery_receipt"
  emitUnknownDeltas: false      // emit "unknown_delta"
}, callback);
```

All standard fb-chat-api options (`selfListen`, `listenEvents`, `autoMarkDelivery`, `proxy`, …) still work.

## Auto-login

Opt-in. Give credentials **through environment variables** (do not commit them to GitHub):

```
FCA_EMAIL=...   FCA_PASSWORD=...   FCA_2FA_SECRET=...   # secret key of your authenticator app, optional
```

then pass `autoLogin: true` (or `{ email, password, twofactor, appStatePath }`). When a session is recovered, your listen callback receives:

```js
{ type: "session_recovered", appState: [...] }   // save it if you keep an appstate file
```

If recovery fails you get `{ type: "account_inactive", reason }` (`checkpoint`, `rate_limited`, `login_failed`, `disabled`, …). At most 3 recovery attempts run per hour, and a checkpoint is never retried — fix it in a browser first. Credentials are sent only to Facebook.

## Events

`message`, `message_reply`, `message_reaction`, `message_unsend`, `event` (join / leave / name / theme / nickname / admin changes …), `typ`, `read_receipt`, `read`, `presence`, plus the new `session_recovered`, `account_inactive`, `delivery_receipt` (opt-in), `unknown_delta` (opt-in).

**Message-edit events** are not parsed yet. Turn on `emitUnknownDeltas`, edit a message from another account, and open an issue with the printed `unknown_delta` so the parser can be written from real data.

## Not included

* End-to-end-encrypted chats (E2EE). ST-FCA's native binaries were deliberately left out.
* Anything from ST-FCA that silently uploaded chat images to third-party hosts or auto-installed packages.

## Documentation

See `DOCS.md` for every option, event and function.

## License

MIT. Original copyright notices are kept in `LICENSE-MIT` and `CREDITS.md`.
