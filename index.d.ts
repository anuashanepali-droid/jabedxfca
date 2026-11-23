// Type definitions for jabed-fca
// Project: https://github.com/anuashanepali-droid/jabed-fca
// Most API functions follow the fb-chat-api style: (args..., callback?) and also return a Promise.

/// <reference types="node" />

declare namespace login {
  type Callback<T = any> = (err: any, result?: T) => void;

  interface Credentials {
    appState?: Array<{ key: string; value: string; domain?: string; path?: string; [k: string]: any }>;
    email?: string;
    password?: string;
    [k: string]: any;
  }

  interface SendQueueOptions {
    enabled?: boolean;
    /** minimum ms between two messages to the same thread (default 700) */
    threadGapMin?: number;
    /** maximum ms between two messages to the same thread (default 1600) */
    threadGapMax?: number;
    /** ms between any two messages (default 250) */
    globalGap?: number;
    /** 0 = no cap (default) */
    maxPerMinute?: number;
    /** messages waiting beyond this are rejected (default 500) */
    maxQueue?: number;
  }

  interface DedupeOptions {
    enabled?: boolean;
    ttlMs?: number;
    maxEntries?: number;
  }

  interface AutoLoginOptions {
    /** falls back to env FCA_EMAIL */
    email?: string;
    /** falls back to env FCA_PASSWORD */
    password?: string;
    /** authenticator secret; falls back to env FCA_2FA_SECRET */
    twofactor?: string;
    /** if set, the recovered appstate is written here (file mode 600) */
    appStatePath?: string;
  }

  interface LoginOptions {
    online?: boolean;
    logLevel?: 'silly' | 'verbose' | 'info' | 'http' | 'warn' | 'error' | 'silent';
    logRecordSize?: number;
    selfListen?: boolean;
    selfListenEvent?: boolean | string;
    /** needed for join/leave/rename/theme/... events */
    listenEvents?: boolean;
    pageID?: string;
    updatePresence?: boolean;
    forceLogin?: boolean;
    userAgent?: string;
    autoMarkDelivery?: boolean;
    autoMarkRead?: boolean;
    listenTyping?: boolean;
    proxy?: string;
    autoReconnect?: boolean;
    emitReady?: boolean;
    // ---- jabed-fca ----
    sendQueue?: false | SendQueueOptions;
    dedupe?: false | DedupeOptions;
    reconnect?: { baseDelay?: number; maxDelay?: number };
    autoLogin?: true | AutoLoginOptions;
    /** SIGINT/SIGTERM call api.shutdown() */
    handleSignals?: boolean;
    /** emit "delivery_receipt" events (needs listenEvents) */
    deliveryReceipts?: boolean;
    /** emit raw "unknown_delta" events to capture formats the library cannot parse yet */
    emitUnknownDeltas?: boolean;
  }

  // ------------------------------------------------------------------ events
  interface BaseEvent { type: string; [k: string]: any }

  interface Attachment { type: string; ID?: string; url?: string; [k: string]: any }

  interface MessageEvent extends BaseEvent {
    type: 'message';
    senderID: string;
    threadID: string;
    messageID: string;
    body: string;
    attachments: Attachment[];
    mentions: { [userID: string]: string };
    isGroup: boolean;
    timestamp: string;
  }
  interface MessageReplyEvent extends Omit<MessageEvent, 'type'> {
    type: 'message_reply';
    messageReply: Omit<MessageEvent, 'type'> & { type?: string };
  }
  interface MessageReactionEvent extends BaseEvent {
    type: 'message_reaction';
    threadID: string; messageID: string; reaction: string; senderID: string; userID: string;
  }
  interface MessageUnsendEvent extends BaseEvent {
    type: 'message_unsend';
    threadID: string; messageID: string; senderID: string; deletionTimestamp?: number;
  }
  interface ThreadEvent extends BaseEvent {
    type: 'event';
    threadID: string;
    /** e.g. "log:subscribe", "log:unsubscribe", "log:thread-name", "log:thread-color", "log:user-nickname" */
    logMessageType: string;
    logMessageData: any;
    logMessageBody?: string;
    author: string;
  }
  interface TypingEvent extends BaseEvent { type: 'typ'; isTyping: boolean; from: string; threadID: string }
  interface ReadReceiptEvent extends BaseEvent { type: 'read_receipt'; reader: string; time: number; threadID: string }
  interface ReadEvent extends BaseEvent { type: 'read'; threadID: string; time: number }
  interface PresenceEvent extends BaseEvent { type: 'presence'; userID: string; timestamp: number; statuses: number }
  interface DeliveryReceiptEvent extends BaseEvent {
    type: 'delivery_receipt'; userID: string; threadID: string; messageIDs: string[]; time: string | number | null;
  }
  interface UnknownDeltaEvent extends BaseEvent { type: 'unknown_delta'; deltaClass: string; deltaKeys?: string[]; delta: any }
  interface SessionRecoveredEvent extends BaseEvent { type: 'session_recovered'; appState: Credentials['appState'] }
  /** delivered as the *error* argument of the listen callback */
  interface AccountInactiveError extends BaseEvent {
    type: 'account_inactive';
    reason: 'disabled' | 'no_credentials' | 'in_progress' | 'rate_limited' | 'blocked' | 'login_failed' | 'checkpoint' | 'refresh_failed' | string;
    /** always "Not logged in." (same text as the original fca) */
    error: string;
    /** readable explanation */
    detail?: string;
  }

  type Event =
    | MessageEvent | MessageReplyEvent | MessageReactionEvent | MessageUnsendEvent | ThreadEvent
    | TypingEvent | ReadReceiptEvent | ReadEvent | PresenceEvent | DeliveryReceiptEvent
    | UnknownDeltaEvent | SessionRecoveredEvent;

  // --------------------------------------------------------------------- api
  interface MessageObject {
    body?: string;
    sticker?: string | number;
    attachment?: NodeJS.ReadableStream | NodeJS.ReadableStream[];
    url?: string;
    emoji?: string;
    emojiSize?: 'small' | 'medium' | 'large';
    mentions?: Array<{ tag: string; id: string; fromIndex?: number }>;
    location?: { latitude: number; longitude: number; current?: boolean };
    [k: string]: any;
  }
  interface SentMessageInfo { threadID: string; messageID: string; timestamp: number }

  interface ErrorInfo {
    type: 'logged_out' | 'checkpoint' | 'rate_limited' | 'timeout' | 'network' | 'permission' | 'unknown';
    retryable: boolean;
    retryAfterMs: number;
    message: string;
  }

  interface Health {
    loggedIn: boolean;
    userID: string;
    /** false = no fb_dtsg token: sending and most requests will fail */
    dtsgOk: boolean;
    mqttConnected: boolean;
    reconnectAttempt: number;
    lastEventAt: number | null;
    queueSize: number;
    dedupeEntries: number;
    uptimeMs: number;
  }

  interface StickerLike { url?: string; animatedUrl?: string; ID?: string }

  interface SendMessageFunction {
    (message: string | MessageObject, threadID: string | string[], callback?: Callback<SentMessageInfo>, replyToMessage?: string, isGroup?: boolean): Promise<SentMessageInfo>;
    queueSize(): number;
    /** resolves true when everything queued was sent, false after timeoutMs */
    drain(timeoutMs?: number): Promise<boolean>;
    /** drops unsent messages; returns how many */
    clear(): number;
    options: SendQueueOptions;
  }

  interface Api {
    sendMessage: SendMessageFunction;
    /** same function as sendMessage (queue controls: api.sendQueue.drain(), .clear(), .options) */
    sendQueue: SendMessageFunction;
    listenMqtt(callback: (err: AccountInactiveError | any, event?: Event) => void): { stopListening(cb?: Callback): void; stopListeningAsync(): Promise<void> };
    listen: Api['listenMqtt'];
    stopListening(cb?: Callback): void;
    stopListeningAsync(): Promise<void>;
    getAppState(): NonNullable<Credentials['appState']>;
    getCurrentUserID(): string;
    setOptions(options: LoginOptions): void;
    logout(callback?: Callback): Promise<void>;
    markAsRead(threadID: string, read?: boolean, callback?: Callback): Promise<void>;
    markAsDelivered(threadID: string, messageID: string, callback?: Callback): Promise<void>;
    markAsSeen(timestamp?: number, callback?: Callback): Promise<void>;
    sendTypingIndicator(threadID: string, callback?: Callback, isTyping?: boolean): Promise<any>;
    setMessageReaction(reaction: string, messageID: string, callback?: Callback, forceCustomReaction?: boolean): Promise<void>;
    unsendMessage(messageID: string, callback?: Callback): Promise<void>;
    getThreadInfo(threadID: string | string[], callback?: Callback): Promise<any>;
    getUserInfo(userID: string | string[], callback?: Callback): Promise<any>;
    // ---- jabed-fca
    sendSticker(stickerID: string | number, threadID: string, callback?: Callback<SentMessageInfo>, replyToMessage?: string, isGroup?: boolean): Promise<SentMessageInfo>;
    downloadSticker(sticker: string | StickerLike, destPath?: string | null, options?: { animated?: boolean }, callback?: Callback): Promise<{ path?: string; buffer?: Buffer; contentType: string; bytes: number }>;
    getHealth(): Health;
    shutdown(options?: { flush?: boolean; timeout?: number }, callback?: Callback<{ ok: boolean; flushed: boolean }>): Promise<{ ok: boolean; flushed: boolean }>;
    classifyError(err: any): ErrorInfo;
    // ---- groups of functions (see DOCS.md)
    stickers: { [method: string]: (...args: any[]) => Promise<any> };
    stickerStore: { [method: string]: (...args: any[]) => Promise<any> };
    story: { [method: string]: (...args: any[]) => Promise<any> };
    friend: { [method: string]: (...args: any[]) => Promise<any> };
    scheduler: { [method: string]: (...args: any[]) => any };
    notes: { [method: string]: (...args: any[]) => Promise<any> };
    // ---- everything else
    addExternalModule(...args: any[]): any;
    addUserToGroup(...args: any[]): any;
    changeAdminStatus(...args: any[]): any;
    changeArchivedStatus(...args: any[]): any;
    changeAvatar(...args: any[]): any;
    changeBio(...args: any[]): any;
    changeBlockedStatus(...args: any[]): any;
    changeGroupImage(...args: any[]): any;
    changeNickname(...args: any[]): any;
    changeThreadColor(...args: any[]): any;
    changeThreadEmoji(...args: any[]): any;
    createNewGroup(...args: any[]): any;
    createPoll(...args: any[]): any;
    deleteMessage(...args: any[]): any;
    deleteThread(...args: any[]): any;
    forwardAttachment(...args: any[]): any;
    getEmojiUrl(...args: any[]): any;
    getFriendsList(...args: any[]): any;
    getMessage(...args: any[]): any;
    getThreadHistory(...args: any[]): any;
    getThreadList(...args: any[]): any;
    getThreadPictures(...args: any[]): any;
    getUserID(...args: any[]): any;
    handleMessageRequest(...args: any[]): any;
    markAsReadAll(...args: any[]): any;
    muteThread(...args: any[]): any;
    refreshFb_dtsg(...args: any[]): any;
    removeUserFromGroup(...args: any[]): any;
    resolvePhotoUrl(...args: any[]): any;
    searchForThread(...args: any[]): any;
    setPostReaction(...args: any[]): any;
    setTitle(...args: any[]): any;
    threadColors(...args: any[]): any;
    unfriend(...args: any[]): any;
    changeAvatarV2(...args: any[]): any;
    changeBlockedStatusMqtt(...args: any[]): any;
    changeCover(...args: any[]): any;
    changeName(...args: any[]): any;
    changeUsername(...args: any[]): any;
    createCommentPost(...args: any[]): any;
    createPost(...args: any[]): any;
    follow(...args: any[]): any;
    friendList(...args: any[]): any;
    getAccess(...args: any[]): any;
    getAvatarUser(...args: any[]): any;
    getRegion(...args: any[]): any;
    getThreadTheme(...args: any[]): any;
    metaTheme(...args: any[]): any;
    removeSuspiciousAccount(...args: any[]): any;
    searchFriends(...args: any[]): any;
    searchStickers(...args: any[]): any;
    sendButtons(...args: any[]): any;
    sendFriendRequest(...args: any[]): any;
    setActiveStatus(...args: any[]): any;
    setMessageReactionMqtt(...args: any[]): any;
    setProfileLock(...args: any[]): any;
    setStoryReaction(...args: any[]): any;
    setStorySeen(...args: any[]): any;
    setThreadTheme(...args: any[]): any;
    shareContact(...args: any[]): any;
    shareLink(...args: any[]): any;
    stopListenMqtt(...args: any[]): any;
    storyManager(...args: any[]): any;
    suggestFriend(...args: any[]): any;
    GetBotInfo(...args: any[]): any;
    comment(...args: any[]): any;
    emoji(...args: any[]): any;
    gcmember(...args: any[]): any;
    gcname(...args: any[]): any;
    gcrule(...args: any[]): any;
    nickname(...args: any[]): any;
    theme(...args: any[]): any;
    editMessage(...args: any[]): any;
    createThemeAI(...args: any[]): any;
    generateAndSetTheme(...args: any[]): any;
    getThemePictures(...args: any[]): any;
    sendComment(...args: any[]): any;
    setProfileGuard(...args: any[]): any;
    pinMessage(...args: any[]): any;
    enableAutoSaveAppState(...args: any[]): any;
    getUID(...args: any[]): any;
    httpGet(...args: any[]): any;
    httpPost(...args: any[]): any;
    httpPostFormData(...args: any[]): any;
    uploadAttachment(...args: any[]): any;
    createAITheme(prompt: string, numThemes?: number, callback?: Callback): Promise<any[]>;
    fetchThemeData(themeID: string | number, callback?: Callback): Promise<{ id: string; name: string | null; backgroundImage: string | null; iconImage: string | null; [k: string]: any }>;
    [extra: string]: any;
  }
}

/**
 * login(credentials, [options], callback)
 */
declare function login(credentials: login.Credentials, callback: (err: any, api: login.Api) => void): void;
declare function login(credentials: login.Credentials, options: login.LoginOptions, callback: (err: any, api: login.Api) => void): void;

export = login;
