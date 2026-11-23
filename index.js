"use strict";

const utils = require("./utils");
const log = require("npmlog");

let checkVerified = null;

const defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;

function setOptions(globalOptions, options) {
	Object.keys(options).map(function (key) {
		switch (key) {
			case 'online':
				globalOptions.online = Boolean(options.online);
				break;
			case 'logLevel':
				log.level = options.logLevel;
				globalOptions.logLevel = options.logLevel;
				break;
			case 'logRecordSize':
				log.maxRecordSize = options.logRecordSize;
				globalOptions.logRecordSize = options.logRecordSize;
				break;
			case 'selfListen':
				globalOptions.selfListen = Boolean(options.selfListen);
				break;
			case 'selfListenEvent':
				globalOptions.selfListenEvent = options.selfListenEvent;
				break;
			case 'listenEvents':
				globalOptions.listenEvents = Boolean(options.listenEvents);
				break;
			case 'pageID':
				globalOptions.pageID = options.pageID.toString();
				break;
			case 'updatePresence':
				globalOptions.updatePresence = Boolean(options.updatePresence);
				break;
			case 'forceLogin':
				globalOptions.forceLogin = Boolean(options.forceLogin);
				break;
			case 'userAgent':
				globalOptions.userAgent = options.userAgent;
				break;
			case 'autoMarkDelivery':
				globalOptions.autoMarkDelivery = Boolean(options.autoMarkDelivery);
				break;
			case 'autoMarkRead':
				globalOptions.autoMarkRead = Boolean(options.autoMarkRead);
				break;
			case 'listenTyping':
				globalOptions.listenTyping = Boolean(options.listenTyping);
				break;
			case 'proxy':
				if (typeof options.proxy != "string") {
					delete globalOptions.proxy;
					utils.setProxy();
				} else {
					globalOptions.proxy = options.proxy;
					utils.setProxy(globalOptions.proxy);
				}
				break;
			case 'autoReconnect':
				globalOptions.autoReconnect = Boolean(options.autoReconnect);
				break;
			case 'emitReady':
				globalOptions.emitReady = Boolean(options.emitReady);
				break;
			// ---- jabed-fca options ----
			case 'sendQueue': // false to disable, or { threadGapMin, threadGapMax, globalGap, maxPerMinute, maxQueue }
				globalOptions.sendQueue = options.sendQueue === false ? { enabled: false } : (options.sendQueue || {});
				break;
			case 'dedupe': // false to disable, or { ttlMs, maxEntries }
				globalOptions.dedupe = options.dedupe === false ? { enabled: false } : (options.dedupe || {});
				break;
			case 'reconnect': // { baseDelay, maxDelay } in ms
				globalOptions.reconnect = options.reconnect || {};
				break;
			case 'autoLogin': // true | { email, password, twofactor, appStatePath }
				globalOptions.autoLogin = options.autoLogin;
				break;
			case 'handleSignals': // true = SIGINT/SIGTERM trigger api.shutdown()
				globalOptions.handleSignals = Boolean(options.handleSignals);
				break;
			case 'deliveryReceipts': // true = emit "delivery_receipt" events
				globalOptions.deliveryReceipts = Boolean(options.deliveryReceipts);
				break;
			case 'emitUnknownDeltas': // true = emit raw "unknown_delta" events (to capture new Facebook event formats)
				globalOptions.emitUnknownDeltas = Boolean(options.emitUnknownDeltas);
				break;
			default:
				log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
				break;
		}
	});
}

function buildAPI(globalOptions, html, jar) {
	const maybeCookie = jar.getCookies("https://www.facebook.com").filter(function (val) {
		return val.cookieString().split("=")[0] === "c_user";
	});

	const objCookie = jar.getCookies("https://www.facebook.com").reduce(function (obj, val) {
		obj[val.cookieString().split("=")[0]] = val.cookieString().split("=")[1];
		return obj;
	}, {});

	if (maybeCookie.length === 0) {
		throw { error: "Error retrieving userID. This can be caused by a lot of things, including getting blocked by Facebook for logging in from an unknown location. Try logging in with a browser to verify." };
	}

	if (html.indexOf("/checkpoint/block/?next") > -1) {
		log.warn("login", "Checkpoint detected. Please log in with a browser to verify.");
	}

	const userID = maybeCookie[0].cookieString().split("=")[1].toString();
	const i_userID = objCookie.i_user || null;
	log.info("login", `Logged in as ${userID}`);

	try {
		clearInterval(checkVerified);
	} catch (_) { }

	const clientID = (Math.random() * 2147483648 | 0).toString(16);


	const oldFBMQTTMatch = html.match(/irisSeqID:"(.+?)",appID:219994525426954,endpoint:"(.+?)"/);
	let mqttEndpoint = null;
	let region = null;
	let irisSeqID = null;
	let noMqttData = null;

	if (oldFBMQTTMatch) {
		irisSeqID = oldFBMQTTMatch[1];
		mqttEndpoint = oldFBMQTTMatch[2];
		region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
		log.info("login", `Got this account's message region: ${region}`);
	} else {
		const newFBMQTTMatch = html.match(/{"app_id":"219994525426954","endpoint":"(.+?)","iris_seq_id":"(.+?)"}/);
		if (newFBMQTTMatch) {
			irisSeqID = newFBMQTTMatch[2];
			mqttEndpoint = newFBMQTTMatch[1].replace(/\\\//g, "/");
			region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
			log.info("login", `Got this account's message region: ${region}`);
		} else {
			const legacyFBMQTTMatch = html.match(/(\["MqttWebConfig",\[\],{fbid:")(.+?)(",appID:219994525426954,endpoint:")(.+?)(",pollingEndpoint:")(.+?)(3790])/);
			if (legacyFBMQTTMatch) {
				mqttEndpoint = legacyFBMQTTMatch[4];
				region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
				log.warn("login", `Cannot get sequence ID with new RegExp. Fallback to old RegExp (without seqID)...`);
				log.info("login", `Got this account's message region: ${region}`);
				log.info("login", `[Unused] Polling endpoint: ${legacyFBMQTTMatch[6]}`);
			} else {
				log.warn("login", "Cannot get MQTT region & sequence ID.");
				noMqttData = html;
			}
		}
	}

	// All data available to api functions
	const ctx = {
		userID: userID,
		i_userID: i_userID,
		jar: jar,
		clientID: clientID,
		globalOptions: globalOptions,
		loggedIn: true,
		access_token: 'NONE',
		clientMutationId: 0,
		mqttClient: undefined,
		lastSeqId: irisSeqID,
		syncToken: undefined,
		mqttEndpoint,
		region,
		firstListen: true
	};

	// jabed-fca: take the token straight from the page (the old single pattern returned "" on current Facebook pages,
	// which made every request fail with error 1357004)
	const pageDtsg = utils.extractDtsg(html);
	if (pageDtsg) {
		ctx.fb_dtsg = pageDtsg;
		ctx.ttstamp = utils.dtsgToJazoest(pageDtsg);
		log.info('jabed-fca', 'fb_dtsg found (length ' + pageDtsg.length + ')');
	} else {
		log.warn('jabed-fca', 'fb_dtsg NOT found in the Facebook page: sending and other requests will fail (error 1357004). The cookies are probably expired, or the account needs a checkpoint check in a browser.');
	}

	const api = {
		setOptions: setOptions.bind(null, globalOptions),
		getAppState: function getAppState() {
			const appState = utils.getAppState(jar);
			// filter duplicate
			return appState.filter((item, index, self) => self.findIndex((t) => { return t.key === item.key }) === index);
		}
	};

	if (noMqttData) {
		api["htmlData"] = noMqttData;
	}

	const apiFuncNames = [
		'addExternalModule',
		'addUserToGroup',
		'changeAdminStatus',
		'changeArchivedStatus',
		'changeAvatar',
		'changeBio',
		'changeBlockedStatus',
		'changeGroupImage',
		'changeNickname',
		'changeThreadColor',
		'changeThreadEmoji',
		'createNewGroup',
		'createPoll',
		'deleteMessage',
		'deleteThread',
		'forwardAttachment',
		'getCurrentUserID',
		'getEmojiUrl',
		'getFriendsList',
		'getMessage',
		'getThreadHistory',
		'getThreadInfo',
		'getThreadList',
		'getThreadPictures',
		'getUserID',
		'getUserInfo',
		'handleMessageRequest',
		'listenMqtt',
		'logout',
		'markAsDelivered',
		'markAsRead',
		'markAsReadAll',
		'markAsSeen',
		'muteThread',
		'refreshFb_dtsg',
		'removeUserFromGroup',
		'resolvePhotoUrl',
		'searchForThread',
		'sendMessage',
		'sendTypingIndicator',
		'setMessageReaction',
		'setPostReaction',
		'setTitle',
		'threadColors',
		'unsendMessage',
		'unfriend',

		// ported from ST-FCA (MIT)
		'changeAvatarV2',
		'changeBlockedStatusMqtt',
		'changeCover',
		'changeName',
		'changeUsername',
		'createCommentPost',
		'createPost',
		'follow',
		'friendList',
		'getAccess',
		'getAvatarUser',
		'getRegion',
		'getThreadTheme',
		'metaTheme',
		'note',
		'removeSuspiciousAccount',
		'searchFriends',
		'searchStickers',
		'sendButtons',
		'sendFriendRequest',
		'setActiveStatus',
		'setMessageReactionMqtt',
		'setProfileLock',
		'setStoryReaction',
		'setStorySeen',
		'setThreadTheme',
		'shareContact',
		'shareLink',
		'stopListenMqtt',
		'storyManager',
		'suggestFriend',

		// ported from ws3-fca / Nexus-fCA (MIT)
		'GetBotInfo',
		'comment',
		'emoji',
		'friend',
		'gcmember',
		'gcname',
		'gcrule',
		'nickname',
		'stickers',
		'story',
		'theme',
		'editMessage',
		'createThemeAI',
		'generateAndSetTheme',
		'getThemePictures',
		'scheduler',
		'stickerStore',
		'sendComment',
		'setProfileGuard',
		'pinMessage',
		'enableAutoSaveAppState',
		'getUID',

		// jabed-fca own
		'sendSticker',
		'createAITheme',
		'fetchThemeData',
		'downloadSticker',

		// HTTP
		'httpGet',
		'httpPost',
		'httpPostFormData',

		'uploadAttachment'
	];

	const defaultFuncs = utils.makeDefaults(html, i_userID || userID, ctx);

	// jabed-fca: session recovery (used by listenMqtt when the session dies)
	ctx._recoverSession = require('./lib/autoLogin').createRecovery({ ctx, defaultFuncs, jar, globalOptions });

	// Load all api functions in a loop
	apiFuncNames.map(function (v) {
		api[v] = require('./src/' + v)(defaultFuncs, api, ctx);
	});

	// jabed-fca: human-like send queue (configure with api.sendQueue.options)
	const guard = require('./lib/guard');
	api._rawSendMessage = api.sendMessage;
	api.sendMessage = guard.createSendQueue(api._rawSendMessage, ctx.globalOptions.sendQueue);
	api.sendQueue = api.sendMessage;

	ctx._startedAt = Date.now();
	api.classifyError = require('./lib/errors').classifyError;

	// jabed-fca: quick status for dashboards / health checks (Render, uptime monitors)
	api.getHealth = function () {
		const mq = ctx.mqttClient;
		return {
			loggedIn: ctx.loggedIn !== false,
			userID: ctx.userID,
			dtsgOk: Boolean(ctx.fb_dtsg),
			mqttConnected: Boolean(mq && mq.connected),
			reconnectAttempt: ctx._reconnectAttempt || 0,
			lastEventAt: ctx._lastEventAt || null,
			queueSize: api.sendQueue.queueSize ? api.sendQueue.queueSize() : 0,
			dedupeEntries: ctx._dedupe ? ctx._dedupe.size() : 0,
			uptimeMs: Date.now() - ctx._startedAt
		};
	};

	// jabed-fca: graceful shutdown. flush=true sends what is already queued (up to timeout ms), then stops listening.
	api.shutdown = function (opts, callback) {
		if (typeof opts === 'function') { callback = opts; opts = {}; }
		opts = Object.assign({ flush: true, timeout: 5000 }, opts || {});
		return (async function () {
			let flushed = true;
			if (api.sendQueue.drain && opts.flush) flushed = await api.sendQueue.drain(opts.timeout);
			if (api.sendQueue.clear) api.sendQueue.clear();
			ctx._listenStopped = true;
			if (ctx._reconnectTimer) { clearTimeout(ctx._reconnectTimer); ctx._reconnectTimer = null; }
			if (api.scheduler && typeof api.scheduler.destroy === 'function') { try { api.scheduler.destroy(); } catch (e) { /* ignore */ } }
			if (typeof api.stopListeningAsync === 'function') {
				try { await Promise.race([api.stopListeningAsync(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
			}
			const result = { ok: true, flushed };
			if (typeof callback === 'function') callback(null, result);
			return result;
		})();
	};

	// jabed-fca: opt-in { handleSignals: true } — SIGINT/SIGTERM (Render/Railway redeploys) shut down cleanly
	if (globalOptions.handleSignals && !process.__jabedFcaSignals) {
		process.__jabedFcaSignals = true;
		const onSignal = function (sig) {
			log.info('jabed-fca', 'received ' + sig + ', shutting down');
			api.shutdown({ timeout: 4000 }).then(() => process.exit(0), () => process.exit(1));
		};
		process.once('SIGTERM', () => onSignal('SIGTERM'));
		process.once('SIGINT', () => onSignal('SIGINT'));
	}

	//Removing original `listen` that uses pull.
	//Map it to listenMqtt instead for backward compatibly.
	api.listen = api.listenMqtt;

	return [ctx, defaultFuncs, api];
}

// Helps the login
function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
	let mainPromise = null;
	const jar = utils.getJar();

	// If we're given an appState we loop through it and save each cookie
	// back into the jar.
	if (appState) {
		// check and convert cookie to appState
		if (utils.getType(appState) === 'Array' && appState.some(c => c.name)) {
			appState = appState.map(c => {
				c.key = c.name;
				delete c.name;
				return c;
			})
		}
		else if (utils.getType(appState) === 'String') {
			const arrayAppState = [];
			appState.split(';').forEach(c => {
				const [key, value] = c.split('=');

				arrayAppState.push({
					key: (key || "").trim(),
					value: (value || "").trim(),
					domain: "facebook.com",
					path: "/",
					expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365
				});
			});
			appState = arrayAppState;
		}

		appState.map(function (c) {
			const str = c.key + "=" + c.value + "; expires=" + c.expires + "; domain=" + c.domain + "; path=" + c.path + ";";
			jar.setCookie(str, "http://" + c.domain);
		});

		// Load the main page.
		mainPromise = utils
			.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true })
			.then(utils.saveCookies(jar));
	} else {
		if (email) {
			throw { error: "Currently, the login method by email and password is no longer supported, please use the login method by appState" };
		}
		else {
			throw { error: "No appState given." };
		}
	}

	let ctx = null;
	let _defaultFuncs = null;
	let api = null;

	mainPromise = mainPromise
		.then(function (res) {
			// Hacky check for the redirection that happens on some ISPs, which doesn't return statusCode 3xx
			const reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
			const redirect = reg.exec(res.body);
			if (redirect && redirect[1]) {
				return utils
					.get(redirect[1], jar, null, globalOptions)
					.then(utils.saveCookies(jar));
			}
			return res;
		})
		.then(function (res) {
			const html = res.body;
			const stuff = buildAPI(globalOptions, html, jar);
			ctx = stuff[0];
			_defaultFuncs = stuff[1];
			api = stuff[2];
			return res;
		});

	// given a pageID we log in as a page
	if (globalOptions.pageID) {
		mainPromise = mainPromise
			.then(function () {
				return utils
					.get('https://www.facebook.com/' + ctx.globalOptions.pageID + '/messages/?section=messages&subsection=inbox', ctx.jar, null, globalOptions);
			})
			.then(function (resData) {
				let url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
				url = url.substring(0, url.length - 1);

				return utils
					.get('https://www.facebook.com' + url, ctx.jar, null, globalOptions);
			});
	}

	// At the end we call the callback or catch an exception
	mainPromise
		.then(function () {
			log.info("login", 'Done logging in.');
			return callback(null, api);
		})
		.catch(function (e) {
			log.error("login", e.error || e);
			callback(e);
		});
}

function login(loginData, options, callback) {
	if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
		callback = options;
		options = {};
	}

	const globalOptions = {
		selfListen: false,
		selfListenEvent: false,
		listenEvents: false,
		listenTyping: false,
		updatePresence: false,
		forceLogin: false,
		autoMarkDelivery: true,
		autoMarkRead: false,
		autoReconnect: true,
		logRecordSize: defaultLogRecordSize,
		online: true,
		emitReady: false,
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
	};

	setOptions(globalOptions, options);

	let prCallback = null;
	if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
		let rejectFunc = null;
		let resolveFunc = null;
		var returnPromise = new Promise(function (resolve, reject) {
			resolveFunc = resolve;
			rejectFunc = reject;
		});
		prCallback = function (error, api) {
			if (error) {
				return rejectFunc(error);
			}
			return resolveFunc(api);
		};
		callback = prCallback;
	}
	loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
	return returnPromise;
}

login._buildAPI = buildAPI; // for tests
module.exports = login;