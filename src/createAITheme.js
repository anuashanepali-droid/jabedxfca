"use strict";

// jabed-fca: alias with the name other fca libraries (and many GoatBot commands) use.
// Same as api.createThemeAI(prompt, numThemes?, callback?)
module.exports = function (defaultFuncs, api, ctx) {
	return function createAITheme(prompt, numThemes, callback) {
		return api.createThemeAI(prompt, numThemes, callback);
	};
};
