/**
 * CSZE bridge for Paradox.
 *
 * Paradox cancels every chat message and re-broadcasts it itself, so CSZE's own
 * chat handler can't coexist with it. This module sits between Paradox and the
 * native API:
 *   - Sticker commands (~s, !s, .s <name>) are cancelled and posted as a bare
 *     sticker, never reaching Paradox (muted players are handed to Paradox instead).
 *   - :emoji: codes are converted to CSZE glyphs before Paradox reads the message,
 *     so Paradox relays the converted text with its rank formatting.
 *
 * All wrappers are Proxies over blank targets that forward to the real objects.
 * Bedrock locks many native properties as non-writable/non-configurable, and a
 * Proxy over the real object can't return a different value for those without
 * throwing "proxy: inconsistent get". A blank target has no locked properties.
 *
 * Requires the CSZE resource pack for the glyphs to render.
 */
import { newmoji } from "./csze-newmoji.js";
import { stickers } from "./csze-stickers.js";

const EMOJI_RE = /:[a-z0-9_]+?:/gi;
const STICKER_PREFIXES = ["!s", "~s", ".s"];
const STICKER_WORDS = ["s", "sticker"];

/**
 * Looks up a sticker by name.
 *
 * Args:
 *   name: Sticker name as typed by the player.
 *
 * Returns:
 *   The sticker glyph padded with newlines, or null if no such sticker exists.
 */
function getSticker(name) {
    if (Object.prototype.hasOwnProperty.call(stickers, name)) {
        return `\n\n\n\n\n${String.fromCharCode(stickers[name])}\n\n\n\n\n`;
    }
    return null;
}

/**
 * Replaces known :emoji: codes with their CSZE glyphs.
 *
 * Args:
 *   msg: Chat message text.
 *
 * Returns:
 *   The message with recognized emoji codes replaced; unknown codes are left as-is.
 */
function parseMoji(msg) {
    let out = msg;
    for (const match of msg.match(EMOJI_RE) ?? []) {
        const code = newmoji[match.replace(/:/g, "").toLowerCase()];
        if (code) out = out.replace(match, String.fromCharCode(code));
    }
    return out;
}

/**
 * Pads raw sticker-range glyphs with newlines so they render at full size,
 * skipping characters that follow a § formatting code.
 *
 * Args:
 *   msg: Chat message text.
 *
 * Returns:
 *   The message with sticker glyphs padded.
 */
function padStickers(msg) {
    let out = "";
    let skip = false;
    for (const ch of Array.from(msg)) {
        const c = ch.charCodeAt(0);
        if (ch === "§") { skip = true; out += ch; continue; }
        if (skip) { skip = false; out += ch; continue; }
        out += (c > 59647 && c < 61550) ? `\n\n\n\n\n\n${ch}\n\n\n\n\n\n` : ch;
    }
    return out;
}

/**
 * Resolves a sticker command (~s, !s, .s, or the long "sticker" form) to its glyph.
 *
 * Args:
 *   message: Raw chat message.
 *
 * Returns:
 *   The padded sticker glyph string, or null if the message isn't a valid sticker command.
 */
export function stickerFor(message) {
    if (typeof message !== "string" || !STICKER_PREFIXES.includes(message.slice(0, 2).toLowerCase())) return null;
    const parts = message.slice(1).trim().split(/\s+/);
    if (!STICKER_WORDS.includes(parts[0].toLowerCase()) || parts.length !== 2) return null;
    return getSticker(parts[1]);
}

/**
 * Converts :emoji: codes to CSZE glyphs and pads raw sticker glyphs.
 *
 * Args:
 *   message: Raw chat message.
 *
 * Returns:
 *   The converted message (unchanged if nothing matched).
 */
export function translate(message) {
    if (typeof message !== "string" || message.length === 0) return message;
    return padStickers(message.includes(":") ? parseMoji(message) : message);
}

/**
 * Checks Paradox's mute flag on a player.
 *
 * Args:
 *   player: The chatting player.
 *
 * Returns:
 *   True if Paradox has the player muted; false otherwise or on any error.
 */
function isMuted(player) {
    try { return !!player?.getDynamicProperty?.("isMuted"); } catch { return false; }
}

/**
 * Creates a Proxy over a blank target that forwards to a real object.
 *
 * Args:
 *   real: The object to forward to.
 *   overrides: Properties to replace on the facade.
 *   bindMethods: If true, function values are bound to the real object so native
 *     methods keep their required `this`. Use false for module namespaces, where
 *     binding would strip static members from exported classes.
 *
 * Returns:
 *   A facade that behaves like `real` with `overrides` applied.
 */
function facade(real, overrides, bindMethods) {
    const own = (k) => Object.prototype.hasOwnProperty.call(overrides, k);
    const read = (k) => {
        if (own(k)) return overrides[k];
        const v = Reflect.get(real, k, real);
        return bindMethods && typeof v === "function" ? v.bind(real) : v;
    };
    return new Proxy({}, {
        get: (_, k) => read(k),
        set: (_, k, v) => Reflect.set(real, k, v, real),
        has: (_, k) => own(k) || Reflect.has(real, k),
        ownKeys: () => [...new Set([...Reflect.ownKeys(real), ...Reflect.ownKeys(overrides)])],
        getOwnPropertyDescriptor: (_, k) => {
            if (!own(k) && !Reflect.getOwnPropertyDescriptor(real, k)) return undefined;
            return { configurable: true, enumerable: true, writable: true, value: read(k) };
        },
        getPrototypeOf: () => Reflect.getPrototypeOf(real)
    });
}

/**
 * Wraps a chat event so `message` reads as the emoji-converted text.
 *
 * Args:
 *   ev: The native ChatSendBeforeEvent.
 *
 * Returns:
 *   The original event if nothing changed, otherwise a facade over it.
 */
function wrapChatEvent(ev) {
    let translated;
    try { translated = translate(ev.message); } catch { translated = ev.message; }
    if (translated === ev.message) return ev;
    return facade(ev, { message: translated }, true);
}

/**
 * Wraps the @minecraft/server module so Paradox's chatSend subscriptions pass
 * through the CSZE bridge.
 *
 * Args:
 *   mcServer: The native @minecraft/server module namespace.
 *
 * Returns:
 *   A module facade identical to the original except for world.beforeEvents.chatSend.
 */
export function wrapServer(mcServer) {
    const realWorld = mcServer.world;
    const realSystem = mcServer.system;
    const realBefore = realWorld.beforeEvents;
    const realChat = realBefore.chatSend;
    const wrappers = new Map();

    const chatSend = facade(realChat, {
        subscribe(cb) {
            const w = (ev) => {
                let stk = null;
                try { stk = stickerFor(ev.message); } catch { stk = null; }
                if (stk !== null && !isMuted(ev.sender)) {
                    ev.cancel = true;
                    realSystem.run(() => realWorld.sendMessage(stk));
                    return;
                }
                cb(wrapChatEvent(ev));
            };
            wrappers.set(cb, w);
            realChat.subscribe(w);
            return cb;
        },
        unsubscribe(cb) {
            const w = wrappers.get(cb);
            if (w) {
                realChat.unsubscribe(w);
                wrappers.delete(cb);
            }
        }
    }, true);

    const beforeEvents = facade(realBefore, { chatSend }, true);
    const world = facade(realWorld, { beforeEvents }, true);
    return facade(mcServer, { world }, false);
}
