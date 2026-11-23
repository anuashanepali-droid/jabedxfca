"use strict";

// jabed-fca: shortcut for sending a sticker by its ID.
// Usage: api.sendSticker("369239263222822", threadID, callback?)
module.exports = function (defaultFuncs, api, ctx) {
	return function sendSticker(stickerID, threadID, callback, replyToMessage, isGroup) {
		if (stickerID === undefined || stickerID === null || stickerID === "") {
			const err = { error: "sendSticker: stickerID is required" };
			if (typeof callback === "function") return callback(err);
			return Promise.reject(err);
		}
		// api.sendMessage is read at call time so the send queue is used
		return api.sendMessage({ sticker: String(stickerID) }, threadID, callback, replyToMessage, isGroup);
	};
};
