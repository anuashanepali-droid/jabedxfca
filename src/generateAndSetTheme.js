"use strict";

const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
    return function generateAndSetTheme(prompt, threadID, callback) {
        if (!callback) {
            callback = function (err, data) {
                if (err) log.error("generateAndSetTheme", err);
            };
        }

        // jabed-fca: logs go through npmlog (verbose) instead of a file inside node_modules
        const logToFile = (message) => {
            log.verbose("generateAndSetTheme", message);
        };

        // Helper to send log/status to chat
        const sendLogToChat = (message) => {
            if (api.sendMessage) {
                api.sendMessage(message, threadID);
            }
        };

        const startMsg = `🎨 Starting theme generation for prompt: "${prompt}"...`;
        logToFile(startMsg);
        sendLogToChat(startMsg); 

        api.createThemeAI(prompt, (err, themeData) => {
            if (err) {
                const errorMsg = `❌ Error generating theme: ${err.error || JSON.stringify(err)}`;
                logToFile(errorMsg);
                sendLogToChat(errorMsg);
                return callback(err);
            }

            const genMsg = `✅ Theme generated (ID: ${themeData.id}). Applying to thread...`;
            logToFile(genMsg);
            sendLogToChat(genMsg);

            api.changeThreadColor(themeData.id, threadID, (err) => {
                if (err) {
                    const applyError = `❌ Error setting theme: ${err.error || JSON.stringify(err)}`;
                    logToFile(applyError);
                    sendLogToChat(applyError);
                    return callback(err);
                }

                const successMsg = `🎉 Theme "${prompt}" generated and applied successfully!`;
                logToFile(successMsg);
                sendLogToChat(successMsg);
                
                callback(null, themeData);
            });
        });
    };
};
