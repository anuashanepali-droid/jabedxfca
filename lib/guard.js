"use strict";
/**
 * lib/guard.js — duplicate-event filter + send queue (new code for jabed-fca, MIT)
 *
 * 1) createDedupe(): drops events that were already delivered once
 *    (same messageID arriving twice after an MQTT reconnect, etc.).
 * 2) createSendQueue(): puts a human-like gap between outgoing messages
 *    so bursts of replies do not look like a flood to Facebook.
 */

const DEFAULT_DEDUPE = { enabled: true, ttlMs: 10 * 60 * 1000, maxEntries: 10000 };
const DEFAULT_QUEUE = {
	enabled: true,
	threadGapMin: 700, // ms between two messages to the same thread
	threadGapMax: 1600,
	globalGap: 250, // ms between any two messages
	maxPerMinute: 0, // 0 = no per-minute cap
	maxQueue: 500 // new messages are rejected when this many are waiting
};

/* ---------------------------------------------------------------- dedupe */

function eventKey(ev) {
	if (!ev || typeof ev !== "object") return null;
	switch (ev.type) {
		case "message":
		case "message_reply":
			return ev.messageID ? "m:" + ev.messageID : null;
		case "message_unsend":
			return ev.messageID ? "u:" + ev.messageID : null;
		case "message_reaction":
			return ev.messageID ? "r:" + ev.messageID + ":" + ev.userID + ":" + ev.reaction : null;
		default:
			return null; // other events are never filtered
	}
}

function createDedupe(options) {
	const opts = Object.assign({}, DEFAULT_DEDUPE, options || {});
	const seen = new Map(); // key -> expiry timestamp

	function prune(now) {
		for (const [k, exp] of seen) {
			if (exp > now) break; // Map keeps insertion order, oldest first
			seen.delete(k);
		}
		while (seen.size > opts.maxEntries) seen.delete(seen.keys().next().value);
	}

	/** true when this event was already seen (and should be dropped) */
	function isDuplicate(ev) {
		if (!opts.enabled) return false;
		const key = eventKey(ev);
		if (!key) return false;
		const now = Date.now();
		prune(now);
		if (seen.has(key)) return true;
		seen.set(key, now + opts.ttlMs);
		return false;
	}

	/** wraps a listen callback: callback(err, event) */
	function wrap(callback) {
		return function dedupedCallback(err, ev) {
			if (!err && isDuplicate(ev)) return;
			return callback.apply(this, arguments);
		};
	}

	return { isDuplicate, wrap, size: () => seen.size, options: opts };
}

/* ------------------------------------------------------------ send queue */

function createSendQueue(rawSend, options) {
	const opts = Object.assign({}, DEFAULT_QUEUE, options || {});
	const queue = [];
	const threadReady = new Map(); // threadKey -> earliest next send time
	const sentTimes = []; // timestamps of recent sends (for maxPerMinute)
	let globalReady = 0;
	let timer = null;
	let inflight = 0;
	const idleWaiters = [];

	function checkIdle() {
		if (queue.length === 0 && inflight === 0) {
			while (idleWaiters.length) idleWaiters.shift()(true);
		}
	}

	const rand = (a, b) => a + Math.random() * Math.max(0, b - a);
	const keyOf = t => (Array.isArray(t) ? t.join(",") : String(t));

	function readyAt(job, now) {
		let at = Math.max(threadReady.get(job.key) || 0, globalReady);
		if (opts.maxPerMinute > 0) {
			while (sentTimes.length && sentTimes[0] <= now - 60000) sentTimes.shift();
			if (sentTimes.length >= opts.maxPerMinute) at = Math.max(at, sentTimes[0] + 60000);
		}
		return at;
	}

	function pump() {
		if (timer || !queue.length) return;
		const now = Date.now();
		let best = 0;
		let bestAt = Infinity;
		for (let i = 0; i < queue.length; i++) {
			const at = readyAt(queue[i], now);
			if (at < bestAt) { bestAt = at; best = i; }
			if (at <= now) break; // first job that is ready wins (keeps order)
		}
		timer = setTimeout(function () {
			timer = null;
			const job = queue.splice(best, 1)[0];
			if (job) {
				const t = Date.now();
				threadReady.set(job.key, t + rand(opts.threadGapMin, opts.threadGapMax));
				globalReady = t + opts.globalGap;
				if (opts.maxPerMinute > 0) sentTimes.push(t);
				inflight++;
				try { job.run(); } catch (e) { job.fail(e); }
			}
			pump();
		}, Math.max(0, bestAt - now));
	}

	function sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
		// bypass for invalid call shapes — the original function reports them
		if (!opts.enabled || typeof threadID === "function" || threadID === undefined || threadID === null) {
			return rawSend.apply(this, arguments);
		}
		const userCb = typeof callback === "function" ? callback : null;
		const replyTo = typeof callback === "string" ? callback : replyToMessage;
		const self = this;

		return new Promise(function (resolve, reject) {
			let counted = false; // in-flight is counted only once the job really started
			const finish = function (err, info) {
				if (counted) { counted = false; inflight--; setImmediate(checkIdle); }
				if (userCb) {
					try { userCb(err, info); } catch (e) { /* user callback errors are theirs */ }
					return resolve(err ? undefined : info); // never reject callback-style calls
				}
				return err ? reject(err) : resolve(info);
			};
			if (queue.length >= opts.maxQueue) {
				return finish({ error: "jabed-fca: send queue is full (" + opts.maxQueue + ")" });
			}
			queue.push({
				key: keyOf(threadID),
				run: () => { counted = true; return rawSend.call(self, msg, threadID, finish, replyTo, isGroup); },
				fail: e => finish(e)
			});
			// a newly queued job may be ready sooner than the one the timer waits for
			if (timer) { clearTimeout(timer); timer = null; }
			pump();
		});
	}

	sendMessage.queueSize = () => queue.length;
	/** resolves true when everything queued has been sent, false after timeoutMs */
	sendMessage.drain = function (timeoutMs) {
		return new Promise(function (resolve) {
			if (queue.length === 0 && inflight === 0) return resolve(true);
			const to = setTimeout(function () {
				const i = idleWaiters.indexOf(done);
				if (i >= 0) idleWaiters.splice(i, 1);
				resolve(false);
			}, timeoutMs || 5000);
			function done(v) { clearTimeout(to); resolve(v); }
			idleWaiters.push(done);
		});
	};
	/** drops every message that has not been sent yet (their callbacks get an error) */
	sendMessage.clear = function () {
		const dropped = queue.splice(0, queue.length);
		dropped.forEach(j => j.fail({ error: "jabed-fca: send queue cleared" }));
		if (timer) { clearTimeout(timer); timer = null; }
		checkIdle();
		return dropped.length;
	};
	sendMessage.options = opts;
	return sendMessage;
}

module.exports = { createDedupe, createSendQueue, eventKey, DEFAULT_DEDUPE, DEFAULT_QUEUE };
