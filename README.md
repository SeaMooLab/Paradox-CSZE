# Paradox AntiCheat — CSZE Edition (Local / Realms)
 
A modified build of [Paradox AntiCheat](https://github.com/Visual1mpact/Paradox_AntiCheat) v6.10.1 that adds **StompZone Emojis (CSZE)** stickers and emoji to Paradox's chat system.
 
**Pack version:** 6.10.4
**Minecraft Bedrock:** 1.26.50 / 1.26.51 / 1.26.52
**Modified:** October 4, 2026
 
---
 
## Why this exists
 
Paradox takes over chat. It cancels every chat message and re-sends it itself as `[Rank] Name: message`. This happens even with ranks disabled, and regardless of whether another pack already handled the message. That breaks CSZE: its stickers and emoji get overwritten by Paradox's raw relay of what you typed.
 
This build moves CSZE's emoji and sticker handling *inside* Paradox, so the two stop fighting over chat.
 
---
 
## API Compatibility
 
| API Module | Version | Notes |
|---|---|---|
| `@minecraft/server` | 2.11.0-beta | Core scripting API |
| `@minecraft/server-ui` | 2.3.0-beta | Paradox menus and forms |
| `@minecraft/server-net` | — | **Removed.** BDS-only; local worlds can't load it |
| `@minecraft/server-admin` | — | **Removed.** BDS-only; local worlds can't load it |
| `@minecraft/debug-utilities` | — | **Removed.** Optional; Paradox runs without it |
 
Paradox's startup code already treats the removed modules as optional. Without them, you lose only BDS-specific features like remote logging and server secrets. This dependency list matches the official Paradox Realms build.
 
> **Running a Bedrock Dedicated Server?** Use the official BDS build instead. This one is meant for single-player worlds and Realms.
 
---
 
## Installation
 
1. **Remove any older Paradox copies** from Settings → Storage and from the world's own pack folders. Minecraft caches packs by UUID and version, so a stale copy can silently take precedence.
2. **Import this pack** and add it to your world's Behavior Packs.
3. **Move Paradox to the top** of the active behavior pack list.
4. **Turn on Beta APIs** in World Settings → Experiments.
5. **Turn on the CSZE resource pack.** It supplies the glyphs; without it, stickers and emoji appear as boxes.
6. **Turn off the CSZE behavior pack.** Its job is now handled here, and leaving it on doubles your messages.
7. In the world's Behavior Packs list, confirm the active version reads **6.10.4**.
### Checking that it works
 
Send any normal chat message. If it shows up as `[Member] YourName: ...`, Paradox is running. If it shows as plain `<YourName> ...`, Paradox isn't loading. See [Troubleshooting](#troubleshooting).
 
---
 
## Usage
 
### Stickers
 
```
~s <name>
!s <name>
.s <name>
~sticker <name>
```
 
For example, `~s pepepig` posts the sticker on its own, with no name or rank line.
 
- Unknown sticker names are sent as normal chat.
- Muted players' sticker commands go to Paradox, so mutes still apply.
### Emoji
 
Put an emoji code anywhere in a message:
 
```
gg :minecoin: nice
```
 
Known codes turn into glyphs, and unknown codes stay as plain text. The message is still relayed by Paradox with your rank.
 
The full sticker and emoji lists are in `scripts/csze-stickers.js` and `scripts/csze-newmoji.js`.
 
---
 
## What was changed
 
All changes are outside Paradox's obfuscated code.
 
| File | Change |
|---|---|
| `manifest.json` | Removed BDS-only module dependencies; bumped version to 6.10.4 |
| `scripts/paradox.js` | Two lines in the unobfuscated header: import the bridge, and hand Paradox a wrapped `@minecraft/server` |
| `scripts/csze-bridge.js` | **New.** Intercepts chat before Paradox: sends stickers directly and converts emoji in regular messages |
| `scripts/csze-newmoji.js` | **New.** CSZE emoji table (unchanged from CSZE) |
| `scripts/csze-stickers.js` | **New.** CSZE sticker table (unchanged from CSZE) |
 
### How the bridge works
 
`wrapServer()` gives Paradox a stand-in for the `@minecraft/server` module that is identical to the real one except for `world.beforeEvents.chatSend`. When Paradox subscribes to chat, its handler is wrapped:
 
1. **Sticker command** (and the player isn't muted): the bridge cancels the message, posts the bare sticker, and stops there. Paradox never sees it.
2. **Anything else:** Paradox gets the event with `message` reading as the emoji-converted text, then does its normal rank formatting, spam checks, and relay.
The wrappers are Proxies over empty objects that forward to the real ones. Bedrock locks some native properties as read-only, and a Proxy directly over a locked object throws `proxy: inconsistent get` when it tries to substitute a value.
 
---
 
## Troubleshooting
 
| Symptom | Likely cause / fix |
|---|---|
| Chat shows `<Name>` with no rank tag | Paradox isn't running. Check that Beta APIs is on, that the active version reads 6.10.4, and that your game is 1.26.50–1.26.52. |
| `run failed, no runtime or context available` | The script engine couldn't start. Usually a game version newer than the pack's beta API, or a BDS-only module in the manifest. Look at the log lines just *above* this one for the real cause. |
| Stickers or emoji show as boxes | The CSZE resource pack is missing or turned off. |
| Every message appears twice | The CSZE behavior pack is still on. Turn it off. |
| Changes don't take effect after importing | The old pack is cached. Delete all Paradox copies and re-import. |
 
To see errors in-game, turn on Settings → Creator → **Content Log GUI**, then rejoin the world.
 
---
 
## Known limitations
 
- **Not covered by Paradox's anti-spam:** stickers skip Paradox entirely, so its spam check doesn't apply to them. Mutes do still apply.
- **Untested against anti-spam:** how Paradox's spam check treats emoji glyphs in regular messages hasn't been verified.
- **Updates overwrite the patch:** a new Paradox release replaces `paradox.js` and `manifest.json`. To patch a new version:
  1. Copy in the three `csze-*.js` files.
  2. In `paradox.js`, add `import { wrapServer } from "./csze-bridge.js";` below the `@minecraft/server-ui` import.
  3. Change `"@minecraft/server": mcServer,` to `"@minecraft/server": wrapServer(mcServer),`.
  4. Remove the BDS-only dependencies from `manifest.json` (or start from the official Realms build) and bump the header version.
- **Game version locked:** beta APIs are tied to the exact game version. When Minecraft updates past 1.26.52, this pack will likely stop loading until it is rebuilt against the new beta.
---
 
## Credits & License
 
- **Paradox AntiCheat** by Visual1mpact, licensed under **GPLv3** (see `LICENSE`). This is a modified version, distributed under the same license. Upstream: <https://github.com/Visual1mpact/Paradox_AntiCheat>
- **StompZone Emojis (CSZE)** by DJ Stomp. The emoji and sticker tables are taken unchanged from CSZE.
Please report bugs in this edition to whoever gave you this pack, not to the upstream Paradox project. Upstream can't support modifications it didn't make.