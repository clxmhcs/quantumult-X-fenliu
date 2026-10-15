/*
 * Quantumult X global metadata observer + targeted JD client.action diagnostics
 *
 * TEMPORARY diagnostic mode for JD search investigation.
 * - All HTTP(S) traffic: metadata only.
 * - api.m.jd.com/client.action: additionally logs functionId, form keys,
 *   a redacted request body preview, and a redacted response body preview.
 * - Never modifies traffic.
 */

var PREFIX = "[QX-GLOBAL]";
var TARGET = "[JD-CLIENT]";
var CHUNK = 3000;
var MAX_REQ_PREVIEW = 12000;
var MAX_RES_PREVIEW = 24000;

function getHeader(headers, name) {
  headers = headers || {};
  var target = String(name || "").toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === target) return String(headers[keys[i]] || "");
  }
  return "";
}

function parseUrl(raw) {
  raw = String(raw || "");
  var out = { scheme: "", host: "", path: "/" };
  try {
    var m = raw.match(/^(https?):\/\/([^\/?#]+)([^?#]*)/i);
    if (m) {
      out.scheme = String(m[1] || "").toLowerCase();
      out.host = m[2] || "";
      out.path = m[3] || "/";
    }
  } catch (_) {}
  return out;
}

function uaClass(ua) {
  ua = String(ua || "");
  if (/JD4iPhone/i.test(ua)) return "JD4iPhone";
  if (/jdmall/i.test(ua)) return "jdmall";
  if (/jdapp/i.test(ua)) return "jdapp";
  if (/Cronet/i.test(ua)) return "Cronet";
  if (/CFNetwork/i.test(ua)) return "CFNetwork";
  if (/AppleWebKit|Mobile\//i.test(ua)) return "WebKit";
  if (/okhttp/i.test(ua)) return "okhttp";
  if (/Mozilla/i.test(ua)) return "Mozilla";
  return ua ? "other" : "none";
}

function safeStatus(res) {
  if (!res) return "";
  return String(res.statusCode || res.status || "");
}

function isTarget(req, parsed) {
  if (!req) return false;
  var host = String(parsed.host || "").toLowerCase().replace(/:443$/, "");
  var method = String(req.method || "").toUpperCase();
  return method === "POST" && host === "api.m.jd.com" && parsed.path === "/client.action";
}

function decodePart(s) {
  s = String(s || "");
  try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (_) { return s; }
}

function redact(text) {
  var s = String(text || "");
  var names = "pin|eid|uuid|token|access_token|authorization|cookie|sign|jdkey|jmafinger|shshshfpa|whwswswws|sid|sessionId|deviceId|did";
  var reForm = new RegExp("((?:" + names + ")=)[^&\\s]*", "ig");
  var reJson = new RegExp("(\\\"(?:" + names + ")\\\"\\s*:\\s*\\\")[^\\\"]*(\\\")", "ig");
  s = s.replace(reForm, "$1<redacted>");
  s = s.replace(reJson, "$1<redacted>$2");
  return s;
}

function formInfo(body) {
  var raw = String(body || "");
  var out = { keys: [], functionId: "", bodyRawLen: 0, bodyDecoded: "" };
  if (!raw) return out;

  var pairs = raw.split("&");
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    var eq = p.indexOf("=");
    var key = decodePart(eq >= 0 ? p.slice(0, eq) : p);
    var val = eq >= 0 ? p.slice(eq + 1) : "";
    if (out.keys.indexOf(key) < 0) out.keys.push(key);
    if (/^functionId$/i.test(key)) out.functionId = decodePart(val);
    if (/^body$/i.test(key)) {
      out.bodyRawLen = val.length;
      out.bodyDecoded = decodePart(val);
    }
  }
  return out;
}

function logChunks(label, value, maxLen) {
  var s = redact(String(value || ""));
  if (!s) return;
  if (s.length > maxLen) s = s.slice(0, maxLen) + "...<truncated>";
  var total = Math.ceil(s.length / CHUNK);
  for (var i = 0; i < s.length; i += CHUNK) {
    console.log(TARGET + " " + label + " part=" + (Math.floor(i / CHUNK) + 1) + "/" + total + " " + s.slice(i, i + CHUNK));
  }
}

try {
  var req = typeof $request !== "undefined" ? $request : null;
  var res = typeof $response !== "undefined" ? $response : null;

  if (!req) {
    $done({});
  } else {
    var parsed = parseUrl(req.url || "");
    var reqHeaders = req.headers || {};
    var resHeaders = res && res.headers ? res.headers : {};
    var session = req.sessionIndex !== undefined
      ? req.sessionIndex
      : (res && res.sessionIndex !== undefined ? res.sessionIndex : "?");

    var line = PREFIX + " " + (res ? "RESPONSE" : "REQUEST") +
      " session=" + session +
      " method=" + String(req.method || "") +
      " scheme=" + parsed.scheme +
      " host=" + parsed.host +
      " path=" + parsed.path +
      " ua=" + uaClass(getHeader(reqHeaders, "User-Agent")) +
      " reqType=" + getHeader(reqHeaders, "Content-Type") +
      " reqLen=" + getHeader(reqHeaders, "Content-Length");

    if (res) {
      line += " status=" + safeStatus(res) +
        " resType=" + getHeader(resHeaders, "Content-Type") +
        " resLen=" + (getHeader(resHeaders, "Content-Length") || getHeader(resHeaders, "Transfer-Encoding"));
    }
    console.log(line);

    if (isTarget(req, parsed)) {
      var fi = formInfo(req.body);
      console.log(TARGET + " " + (res ? "RESPONSE" : "REQUEST") +
        " session=" + session +
        " functionId=" + (fi.functionId || "<none>") +
        " formKeys=" + fi.keys.join(",") +
        " formBodyRawLen=" + fi.bodyRawLen +
        (res ? (" status=" + safeStatus(res) +
                " resType=" + getHeader(resHeaders, "Content-Type") +
                " resBodyLen=" + String(res.body || "").length) : ""));

      if (fi.bodyDecoded) logChunks("REQ_BODY session=" + session, fi.bodyDecoded, MAX_REQ_PREVIEW);
      if (res && res.body) logChunks("RES_BODY session=" + session, res.body, MAX_RES_PREVIEW);
    }

    $done({});
  }
} catch (error) {
  console.log(PREFIX + " ERROR " + String(error));
  $done({});
}
