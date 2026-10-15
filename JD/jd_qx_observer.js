/* JD Global Discovery + targeted api.m.jd.com diagnostics for Quantumult X */

var PREFIX = "[JD-DISCOVERY]";
var TARGET = "[JD-TARGET]";
var PREVIEW = 16000;
var CHUNK = 3000;

function getHeader(headers, name) {
  headers = headers || {};
  var n = String(name || "").toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === n) return String(headers[keys[i]] || "");
  }
  return "";
}

function parseUrl(raw) {
  raw = String(raw || "");
  var out = { host: "", path: "/", raw: raw };
  var m = raw.match(/^https?:\/\/([^\/?#]+)([^?#]*)/i);
  if (m) {
    out.host = m[1] || "";
    out.path = m[2] || "/";
  }
  return out;
}

function looksLikeJD(req, parsed) {
  if (!req) return false;
  var h = req.headers || {};
  var ua = getHeader(h, "User-Agent");
  var host = String(parsed.host || "").toLowerCase();
  return /(JD4iPhone|jdmall|jdapp|com\.360buy\.jdmobile)/i.test(ua) ||
         !!getHeader(h, "JD-APP") || !!getHeader(h, "JD-STD") ||
         /(^|\.)jd\.com(?::\d+)?$/i.test(host);
}

function isTarget(req, parsed) {
  return req && String(req.method || "").toUpperCase() === "POST" &&
         String(parsed.host || "").toLowerCase().replace(/:443$/, "") === "api.m.jd.com" &&
         String(parsed.path || "/") === "/";
}

function redactText(text) {
  var s = String(text || "");
  s = s.replace(/((?:pin|eid|uuid|token|access_token|authorization|cookie|sign)=)[^&\s]*/ig, "$1<redacted>");
  s = s.replace(/("(?:pin|eid|uuid|token|access_token|authorization|cookie|sign)"\s*:\s*")[^"]*(")/ig, "$1<redacted>$2");
  return s;
}

function formInfo(body) {
  var s = String(body || "");
  var info = { keys: [], functionId: "", bodyLen: 0, bodyPreview: "" };
  if (!s) return info;
  var pairs = s.split("&");
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    var eq = p.indexOf("=");
    var k = eq >= 0 ? p.slice(0, eq) : p;
    var v = eq >= 0 ? p.slice(eq + 1) : "";
    try { k = decodeURIComponent(k.replace(/\+/g, " ")); } catch (_) {}
    if (info.keys.indexOf(k) < 0) info.keys.push(k);
    if (/^functionId$/i.test(k)) {
      try { info.functionId = decodeURIComponent(v.replace(/\+/g, " ")); } catch (_) { info.functionId = v; }
    }
    if (/^body$/i.test(k)) {
      info.bodyLen = v.length;
      info.bodyPreview = redactText(v.slice(0, 2048));
    }
  }
  return info;
}

function logChunks(label, value) {
  var s = redactText(String(value || "")).slice(0, PREVIEW);
  if (!s) return;
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
    if (!looksLikeJD(req, parsed)) {
      $done({});
    } else {
      var rh = req.headers || {};
      var sh = res && res.headers ? res.headers : {};
      var session = req.sessionIndex !== undefined ? req.sessionIndex : (res && res.sessionIndex !== undefined ? res.sessionIndex : "?");
      var method = req.method || "";
      var ua = getHeader(rh, "User-Agent");
      var uaTag = /JD4iPhone/i.test(ua) ? "JD4iPhone" : (/jdmall/i.test(ua) ? "jdmall" : (/jdapp/i.test(ua) ? "jdapp" : "jd"));
      var line = PREFIX + " " + (res ? "RESPONSE" : "REQUEST") +
        " session=" + session +
        " method=" + method +
        " host=" + parsed.host +
        " path=" + parsed.path +
        " ua=" + uaTag +
        " reqType=" + getHeader(rh, "Content-Type") +
        " reqLen=" + getHeader(rh, "Content-Length");
      if (res) {
        line += " status=" + String(res.statusCode || res.status || "") +
          " resType=" + getHeader(sh, "Content-Type") +
          " resLen=" + (getHeader(sh, "Content-Length") || getHeader(sh, "Transfer-Encoding"));
      }
      console.log(line);

      if (isTarget(req, parsed)) {
        var fi = formInfo(req.body);
        console.log(TARGET + " " + (res ? "RESPONSE" : "REQUEST") +
          " session=" + session +
          " functionId=" + (fi.functionId || "<none>") +
          " formKeys=" + fi.keys.join(",") +
          " formBodyLen=" + fi.bodyLen +
          (res ? (" status=" + String(res.statusCode || res.status || "") +
                  " resType=" + getHeader(sh, "Content-Type") +
                  " resBodyLen=" + String(res.body || "").length) : ""));
        if (fi.bodyPreview) logChunks("FORM_BODY_PREVIEW session=" + session, fi.bodyPreview);
        if (res && res.body) logChunks("RES_BODY_PREVIEW session=" + session, res.body);
      }
      $done({});
    }
  }
} catch (e) {
  console.log(PREFIX + " ERROR " + String(e));
  $done({});
}
