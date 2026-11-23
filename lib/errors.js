"use strict";
/**
 * lib/errors.js — turns the many error shapes of fca calls into one small, predictable object.
 * Matching is best-effort (Facebook changes its wording); unknown errors are never marked retryable.
 */

const NETWORK_CODES = ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ENETUNREACH", "EHOSTUNREACH"];
const TIMEOUT_CODES = ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNABORTED"];

function textOf(err) {
	if (err === null || err === undefined) return "";
	if (typeof err === "string") return err;
	const parts = [err.error, err.errorSummary, err.errorDescription, err.message, err.reason, err.code, err.type];
	return parts.filter(p => typeof p === "string" || typeof p === "number").join(" | ");
}

/**
 * @returns {{ type: string, retryable: boolean, retryAfterMs: number, message: string }}
 * type: logged_out | checkpoint | rate_limited | timeout | network | permission | unknown
 */
function classifyError(err) {
	const text = textOf(err);
	const lower = text.toLowerCase();
	const code = String((err && (err.code || err.errno)) || "").toUpperCase();
	const out = (type, retryable, retryAfterMs) => ({ type, retryable, retryAfterMs: retryAfterMs || 0, message: text });

	if (/not logged in|login_required|log in to continue|session (has )?(expired|invalid)|account_inactive/.test(lower)) return out("logged_out", false);
	if (/checkpoint|confirm your identity|verify (your )?(account|identity)|account (is )?(locked|disabled|suspended)/.test(lower)) return out("checkpoint", false);
	if (/rate.?limit|too many (requests|messages)|temporarily blocked|slow down|going too fast/.test(lower)) return out("rate_limited", true, 60000);
	if (TIMEOUT_CODES.includes(code) || /timed? ?out/.test(lower)) return out("timeout", true, 3000);
	if (NETWORK_CODES.includes(code) || /socket hang up|network (error|is unreachable)|getaddrinfo/.test(lower)) return out("network", true, 3000);
	if (/not allowed|permission|can.?t (send|message|reply)|cannot (send|message|reply)|you are blocked|not part of (the|this) conversation/.test(lower)) return out("permission", false);
	return out("unknown", false);
}

module.exports = { classifyError };
