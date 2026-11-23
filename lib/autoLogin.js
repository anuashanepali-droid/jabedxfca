"use strict";
/**
 * lib/autoLogin.js — session recovery for jabed-fca.
 *
 * loginViaGraph() and helpers are taken from Nexus-fCA's src/autoLogin.js (MIT).
 * Credentials are sent ONLY to Facebook (b-graph.facebook.com).
 * createRecovery() below is new code for jabed-fca.
 */
/**
 * autoLogin.js - Session Recovery via Graph API
 * 
 * This module provides automatic session recovery when cookies expire.
 * Nexus-fCA auto-login subsystem with self-healing enhancements.
 */

const crypto = require("crypto");
let uuidv4, axios, CookieJar, wrapper;
function loadDeps() {
  if (axios) return;
  try {
    uuidv4 = require("uuid").v4;
    axios = require("axios");
    CookieJar = require("tough-cookie").CookieJar;
    wrapper = require("axios-cookiejar-support").wrapper;
  } catch (e) {
    throw new Error("jabed-fca autoLogin needs: axios, axios-cookiejar-support, tough-cookie, uuid, totp-generator (" + e.message + ")");
  }
}
const qs = require("querystring");
const fs = require("fs");
const path = require("path");
const log = require("npmlog");

// Try to import TOTP generator
let TOTP;
try {
  TOTP = require("totp-generator").TOTP;
} catch (_) {
  try {
    const totpGen = require("totp-generator");
    TOTP = { generate: totpGen.TOTP ? totpGen.TOTP.generate : totpGen };
  } catch (__) {
    TOTP = null;
  }
}

const MESSENGER_USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 12; Pixel 6 Build/SP2A.220505.002) [FBAN/Orca-Android;FBAV/420.0.0.28.106;FBPN/com.facebook.orca;FBLC/en_US;FBBV/520000000;FBCR/T-Mobile;FBMF/Google;FBBD/Google;FBDV/Pixel 6;FBSV/12;FBCA/arm64-v8a:armeabi-v7a;FBDM/{density=2.625,width=1080,height=2400};FB_FW/1;]";

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function randomString(length = 24) {
  let s = "abcdefghijklmnopqrstuvwxyz";
  let out = s.charAt(Math.floor(Math.random() * s.length));
  for (let i = 1; i < length; i++) out += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(36 * Math.random()));
  return out;
}

function sortObject(o) {
  const keys = Object.keys(o).sort();
  const x = {};
  for (const k of keys) x[k] = o[k];
  return x;
}

function encodeSig(obj) {
  let data = "";
  for (const k of Object.keys(obj)) data += `${k}=${obj[k]}`;
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

/**
 * Generate TOTP code from secret
 * @param {string} secret - TOTP secret (with or without spaces)
 * @returns {Promise<string|null>} 6-digit code or null
 */
async function genTotp(secret) {
  if (!secret || !TOTP) return null;
  try {
    const cleaned = String(secret).replace(/\s+/g, "").toUpperCase();
    if (typeof TOTP.generate === "function") {
      const r = await TOTP.generate(cleaned);
      return typeof r === "object" ? r.otp : r;
    }
    return null;
  } catch (e) {
    log.warn("autoLogin", `TOTP generation failed: ${e.message}`);
    return null;
  }
}

/**
 * Set cookies from appstate into jar
 * @param {CookieJar} j - Cookie jar
 * @param {Array} appstate - Array of cookie objects
 */
async function setJarCookies(j, appstate) {
  const tasks = [];
  for (const c of appstate) {
    const cookieName = c.name || c.key;
    const cookieValue = c.value;
    if (!cookieName || cookieValue === undefined) continue;

    const cookieDomain = c.domain || ".facebook.com";
    const cookiePath = c.path || "/";
    const dom = cookieDomain.replace(/^\./, "");

    let expiresStr = "";
    if (c.expires) {
      const expiresDate = typeof c.expires === "number" ? new Date(c.expires) : new Date(c.expires);
      expiresStr = `; expires=${expiresDate.toUTCString()}`;
    } else {
      // Default to 1 year expiry
      const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expiresStr = `; expires=${oneYear.toUTCString()}`;
    }

    const str = `${cookieName}=${cookieValue}${expiresStr}; Domain=${cookieDomain}; Path=${cookiePath};`;

    const urls = [
      `http://${dom}${cookiePath}`,
      `https://${dom}${cookiePath}`,
      `http://www.${dom}${cookiePath}`,
      `https://www.${dom}${cookiePath}`
    ];

    for (const url of urls) {
      tasks.push(j.setCookie(str, url).catch(() => { }));
    }
  }
  await Promise.all(tasks);
}

/**
 * Login via Facebook Graph API (Android app flow)
 * @param {string} username - Facebook email/phone
 * @param {string} password - Facebook password
 * @param {string|null} twofactorSecretOrCode - 2FA secret or 6-digit code
 * @param {string|null} i_user - Optional i_user cookie value
 * @param {CookieJar|null} externalJar - Optional existing jar
 * @returns {Promise<Object>} Login result
 */
async function loginViaGraph(username, password, twofactorSecretOrCode = null, i_user = null, externalJar = null) {
  loadDeps();
  const cookieJar = externalJar instanceof CookieJar ? externalJar : new CookieJar();
  const client = wrapper(axios.create({ jar: cookieJar, withCredentials: true, timeout: 30000, validateStatus: () => true }));
  
  const device_id = uuidv4();
  const family_device_id = device_id;
  const machine_id = randomString(24);
  
  const base = {
    adid: uuidv4(),
    format: "json",
    device_id,
    email: username,
    password,
    generate_analytics_claim: "1",
    community_id: "",
    cpl: "true",
    try_num: "1",
    family_device_id,
    secure_family_device_id: "",
    credentials_type: "password",
    enroll_misauth: "false",
    generate_session_cookies: "1",
    source: "login",
    generate_machine_id: "1",
    jazoest: "22297",
    meta_inf_fbmeta: "NO_FILE",
    advertiser_id: uuidv4(),
    currently_logged_in_userid: "0",
    locale: "en_US",
    client_country_code: "US",
    fb_api_req_friendly_name: "authenticate",
    fb_api_caller_class: "AuthOperations$PasswordAuthOperation",
    api_key: "256002347743983",
    access_token: "256002347743983|374e60f8b9bb6b8cbb30f78030438895"
  };
  
  const headers = {
    "User-Agent": MESSENGER_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-connection-quality": "EXCELLENT",
    "x-fb-sim-hni": "45204",
    "x-fb-net-hni": "45204",
    "x-fb-connection-type": "WIFI",
    "x-tigon-is-retry": "False",
    "x-fb-friendly-name": "authenticate",
    "x-fb-request-analytics-tags": '{"network_tags":{"retry_attempt":"0"},"application_tags":"unknown"}',
    "x-fb-http-engine": "Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    authorization: `OAuth ${base.access_token}`
  };
  
  const form1 = { ...base };
  form1.sig = encodeSig(sortObject(form1));
  
  log.info("autoLogin", "Attempting Graph API login...");
  
  const res1 = await client.request({
    url: "https://b-graph.facebook.com/auth/login",
    method: "post",
    data: qs.stringify(form1),
    headers
  });
  
  // Success - got session cookies
  if (res1.status === 200 && res1.data && res1.data.session_cookies) {
    const appstate = res1.data.session_cookies.map(c => ({
      key: c.name,
      value: c.value,
      domain: c.domain || ".facebook.com",
      path: c.path || "/"
    }));
    
    const cUserCookie = appstate.find(c => c.key === "c_user");
    if (i_user) {
      appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
    } else if (cUserCookie) {
      appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
    }
    
    await setJarCookies(cookieJar, appstate);
    
    log.info("autoLogin", "Login successful!");
    
    return {
      ok: true,
      cookies: appstate,
      jar: cookieJar,
      access_token: res1.data.access_token || null,
      uid: res1.data.uid || cUserCookie?.value || null,
      session_key: res1.data.session_key || null
    };
  }
  
  // Check for 2FA requirement
  const err = res1.data?.error || {};
  if (err.code === 406) {
    log.info("autoLogin", "2FA required, attempting authentication...");
    
    const data = err.error_data || {};
    let code = null;
    
    // Check if provided value is already a 6-digit code
    if (twofactorSecretOrCode && /^\d{6}$/.test(String(twofactorSecretOrCode))) {
      code = String(twofactorSecretOrCode);
    } else if (twofactorSecretOrCode) {
      // Generate TOTP from secret
      code = await genTotp(twofactorSecretOrCode);
    }
    
    if (!code) {
      log.error("autoLogin", "2FA required but no valid code/secret provided");
      return { ok: false, message: "2FA required but no code provided" };
    }
    
    const form2 = {
      ...base,
      credentials_type: "two_factor",
      twofactor_code: code,
      userid: data.uid || username,
      first_factor: data.login_first_factor || "",
      machine_id: data.machine_id || machine_id
    };
    form2.sig = encodeSig(sortObject(form2));
    
    const res2 = await client.request({
      url: "https://b-graph.facebook.com/auth/login",
      method: "post",
      data: qs.stringify(form2),
      headers
    });
    
    if (res2.status === 200 && res2.data && res2.data.session_cookies) {
      const appstate = res2.data.session_cookies.map(c => ({
        key: c.name,
        value: c.value,
        domain: c.domain || ".facebook.com",
        path: c.path || "/"
      }));
      
      const cUserCookie = appstate.find(c => c.key === "c_user");
      if (i_user) {
        appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
      } else if (cUserCookie) {
        appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
      }
      
      await setJarCookies(cookieJar, appstate);
      
      log.info("autoLogin", "2FA login successful!");
      
      return {
        ok: true,
        cookies: appstate,
        jar: cookieJar,
        access_token: res2.data.access_token || null,
        uid: res2.data.uid || cUserCookie?.value || null,
        session_key: res2.data.session_key || null
      };
    }
    
    log.error("autoLogin", "2FA authentication failed");
    return { ok: false, message: "2FA authentication failed" };
  }
  
  log.error("autoLogin", `Login failed: ${err.message || "Unknown error"}`);
  return { ok: false, message: err.message || "Login failed" };
}


/* ===================================================================
 * jabed-fca: recovery controller
 * =================================================================== */

const MAX_ATTEMPTS_PER_HOUR = 3;

/**
 * options.autoLogin = true | { email, password, twofactor, appStatePath }
 * Credentials come from that object, else env FCA_EMAIL / FCA_PASSWORD / FCA_2FA_SECRET,
 * else fca-config.json ({ "credentials": { "email", "password", "twofactor" } }).
 * Auto-login is OFF unless the autoLogin option is set — a fca-config.json alone never enables it.
 */
function resolveConfig(globalOptions) {
  const opt = globalOptions && globalOptions.autoLogin;
  if (!opt) return null;
  const o = typeof opt === "object" ? opt : {};
  let email = o.email || process.env.FCA_EMAIL;
  let password = o.password || process.env.FCA_PASSWORD;
  let twofactor = o.twofactor || process.env.FCA_2FA_SECRET || null;
  let appStatePath = o.appStatePath || null;
  if (!email || !password) {
    try {
      const p = path.join(process.cwd(), "fca-config.json");
      if (fs.existsSync(p)) {
        const c = JSON.parse(fs.readFileSync(p, "utf8"));
        const cr = c && c.credentials;
        if (cr && cr.email && cr.password) {
          email = cr.email; password = cr.password; twofactor = twofactor || cr.twofactor || null;
          appStatePath = appStatePath || c.appStatePath || null;
        }
      }
    } catch (_) { /* ignore broken config */ }
  }
  if (!email || !password) return null;
  return { email, password, twofactor, appStatePath };
}

function fbDtsgFrom(html) {
  let m = /name="fb_dtsg" value="([^"]+)"/.exec(html) || /"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(html) || /"dtsg":\{"token":"([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

/**
 * Returns an async function: () => { ok, reason, appState? }
 * reason: disabled | no_credentials | in_progress | rate_limited | blocked | login_failed | checkpoint | refresh_failed
 */
function createRecovery({ ctx, defaultFuncs, jar, globalOptions }) {
  const attempts = [];
  let running = false;
  let blocked = false;

  return async function recoverSession() {
    const cfg = resolveConfig(globalOptions);
    if (!cfg) return { ok: false, reason: globalOptions && globalOptions.autoLogin ? "no_credentials" : "disabled" };
    if (blocked) return { ok: false, reason: "blocked" };
    if (running) return { ok: false, reason: "in_progress" };

    const now = Date.now();
    while (attempts.length && attempts[0] < now - 3600 * 1000) attempts.shift();
    if (attempts.length >= MAX_ATTEMPTS_PER_HOUR) {
      log.warn("autoLogin", "rate limit: max " + MAX_ATTEMPTS_PER_HOUR + " recovery attempts per hour reached");
      return { ok: false, reason: "rate_limited" };
    }

    running = true;
    attempts.push(now);
    try {
      log.info("autoLogin", "session expired — trying to log in again");
      const result = await loginViaGraph(cfg.email, cfg.password, cfg.twofactor, ctx.i_userID || null);
      if (!result.ok) {
        const msg = String(result.message || "");
        if (/checkpoint|confirm|verify|suspend|disabled|locked/i.test(msg)) {
          blocked = true; // never retry against a checkpoint — it only makes things worse
          log.error("autoLogin", "Facebook asked for verification (" + msg + "). Fix it in a browser, then restart the bot.");
          return { ok: false, reason: "checkpoint", message: msg };
        }
        log.error("autoLogin", "login failed: " + msg);
        return { ok: false, reason: "login_failed", message: msg };
      }

      // put the fresh cookies into the live jar
      for (const c of result.cookies) {
        const str = `${c.key}=${c.value}; Domain=${c.domain || ".facebook.com"}; Path=${c.path || "/"};`;
        try { await Promise.resolve(jar.setCookie(str, "https://www.facebook.com")); } catch (_) { /* skip bad cookie */ }
      }

      // refresh the page tokens (fb_dtsg) the API uses for every request
      try {
        const res = await require("../utils").get("https://www.facebook.com/", jar, null, globalOptions, ctx);
        const dtsg = fbDtsgFrom(String(res && res.body || ""));
        if (!dtsg) throw new Error("fb_dtsg not found after login");
        ctx.fb_dtsg = dtsg;
        let ts = "2"; for (let i = 0; i < dtsg.length; i++) ts += dtsg.charCodeAt(i);
        ctx.ttstamp = ts;
      } catch (e) {
        log.error("autoLogin", "logged in, but could not refresh tokens: " + e.message);
        return { ok: false, reason: "refresh_failed", message: e.message };
      }

      if (cfg.appStatePath) {
        try { fs.writeFileSync(cfg.appStatePath, JSON.stringify(result.cookies, null, 2), { mode: 0o600 }); log.info("autoLogin", "new appstate saved to " + cfg.appStatePath); }
        catch (e) { log.warn("autoLogin", "could not save appstate: " + e.message); }
      }
      log.info("autoLogin", "session recovered");
      return { ok: true, appState: result.cookies };
    } catch (e) {
      log.error("autoLogin", "recovery error: " + e.message);
      return { ok: false, reason: "login_failed", message: e.message };
    } finally {
      running = false;
    }
  };
}

module.exports = { loginViaGraph, genTotp, setJarCookies, resolveConfig, createRecovery };
