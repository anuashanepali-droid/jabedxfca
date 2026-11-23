"use strict";

const log = require("npmlog");

// jabed-fca: api.fetchThemeData(themeID, callback?)
// Looks a chat theme up (api.getThemePictures) and returns ONE flat object:
// { id, name, accessibility_label, gradient_colors, primary_color, preview_image_urls,
//   background_asset, icon_asset, alternative_themes, backgroundImage, iconImage, raw }
// Best effort: Facebook's response layout changes, so the theme object is searched for, not read from a fixed path.

function urlOf(x) {
	if (!x) return null;
	if (typeof x === "string") return x;
	return x.uri || x.url || null;
}

function looksLikeTheme(o) {
	return o && typeof o === "object" && !Array.isArray(o) &&
		(o.background_asset || o.gradient_colors || o.accessibility_label || o.icon_asset || o.preview_image_urls);
}

function findTheme(node, id, depth) {
	if (!node || typeof node !== "object" || depth > 12) return null;
	let fallback = null;
	if (looksLikeTheme(node)) {
		if (String(node.id) === id || String(node.theme_fbid) === id) return node;
		fallback = node;
	}
	const kids = Array.isArray(node) ? node : Object.values(node);
	for (const k of kids) {
		const f = findTheme(k, id, depth + 1);
		if (f && (String(f.id) === id || String(f.theme_fbid) === id)) return f;
		if (f && !fallback) fallback = f;
	}
	return fallback;
}

module.exports = function (defaultFuncs, api, ctx) {
	return function fetchThemeData(themeID, callback) {
		let resolveFunc, rejectFunc;
		const returnPromise = new Promise((res, rej) => { resolveFunc = res; rejectFunc = rej; });
		const done = (err, data) => {
			if (typeof callback === "function") { callback(err, data); if (err) returnPromise.catch(() => { }); }
			return err ? rejectFunc(err) : resolveFunc(data);
		};
		if (themeID === undefined || themeID === null || themeID === "") {
			done({ error: "fetchThemeData: themeID is required" });
			return returnPromise;
		}
		const id = String(themeID);
		api.getThemePictures(id).then(function (res) {
			const t = findTheme(res, id, 0);
			if (!t) return done({ error: "fetchThemeData: theme not found in Facebook's response", res });
			const out = Object.assign({}, t);
			out.id = t.id || t.theme_fbid || id;
			out.name = t.name || t.accessibility_label || null;
			out.backgroundImage = urlOf(t.background_asset && t.background_asset.image) || urlOf(t.background_asset) || null;
			out.iconImage = urlOf(t.icon_asset && t.icon_asset.image) || urlOf(t.icon_asset) || null;
			out.raw = res;
			return done(null, out);
		}).catch(function (err) {
			log.error("fetchThemeData", err && err.message ? err.message : err);
			return done(err);
		});
		return returnPromise;
	};
};
