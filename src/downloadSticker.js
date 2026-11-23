"use strict";

const fs = require("fs");
const request = require("request");

const ALLOWED_HOSTS = /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

// jabed-fca: download a sticker image.
// Usage: api.downloadSticker(stickerOrUrl, destPath?, { animated: true }?, callback?)
//  - stickerOrUrl: a sticker object from api.stickers.getStickersInPack(...) ({ url, animatedUrl, ID }) or a Facebook CDN URL
//  - destPath: file to write; leave out to get a Buffer back
module.exports = function (defaultFuncs, api, ctx) {
	return function downloadSticker(sticker, destPath, options, callback) {
		if (typeof destPath === "function") { callback = destPath; destPath = null; options = {}; }
		if (typeof options === "function") { callback = options; options = {}; }
		options = options || {};

		let resolveFn, rejectFn;
		const promise = new Promise((res, rej) => { resolveFn = res; rejectFn = rej; });
		const done = (err, data) => {
			if (typeof callback === "function") callback(err, data);
			return err ? rejectFn(err) : resolveFn(data);
		};
		if (typeof callback === "function") promise.catch(() => { }); // callback style: no unhandled rejection

		let url = null;
		if (typeof sticker === "string") url = sticker;
		else if (sticker && typeof sticker === "object") url = (options.animated && sticker.animatedUrl) || sticker.url || sticker.animatedUrl;
		if (!url) { done({ error: "downloadSticker: no sticker URL given" }); return promise; }

		let host;
		try {
			const u = new URL(url);
			if (u.protocol !== "https:") throw new Error("only https is allowed");
			host = u.hostname;
		} catch (e) { done({ error: "downloadSticker: invalid URL (" + e.message + ")" }); return promise; }
		if (!ALLOWED_HOSTS.test(host)) { done({ error: "downloadSticker: only Facebook CDN hosts are allowed (" + host + ")" }); return promise; }

		request({ url, encoding: null, timeout: 30000, followRedirect: false }, function (err, res, body) {
			if (err) return done(err);
			if (!res || res.statusCode !== 200) return done({ error: "downloadSticker: HTTP " + (res && res.statusCode) });
			const type = String(res.headers["content-type"] || "");
			if (!/^image\//i.test(type)) return done({ error: "downloadSticker: not an image (" + type + ")" });
			if (!Buffer.isBuffer(body) || body.length > MAX_BYTES) return done({ error: "downloadSticker: file empty or larger than 10 MB" });
			if (destPath) {
				fs.writeFile(destPath, body, function (e) { return e ? done(e) : done(null, { path: destPath, contentType: type, bytes: body.length }); });
			} else {
				done(null, { buffer: body, contentType: type, bytes: body.length });
			}
		});
		return promise;
	};
};
