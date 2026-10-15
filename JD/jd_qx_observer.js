/*
 * JD Global Discovery Observer for Quantumult X
 *
 * TEMPORARY diagnostic mode.
 * - The companion snippet asks QX to MITM all HTTPS hostnames.
 * - This script records metadata only when the request looks like JD App traffic.
 * - It never modifies requests/responses.
 * - It intentionally does NOT log request/response bodies or sensitive headers.
 *
 * Goal: discover non-*.jd.com hosts used by JD search.
 */

var PREFIX = "[JD-DISCOVERY]";

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
  var out = { scheme: "", host: "", path: "" };
  try {
    var m = raw.match(/^(https?):\/\/([^\/?#]+)([^?#]*)/i);
    if (m) {
      out.scheme = m[1].toLowerCase();
      out.host = m[2];
      out.path = m[3] || "/";
    }
  } catch (_) {}
  return out;
}

function looksLikeJD(req, parsed) {
  if (!req) return false;

  var headers = req.headers || {};
  var ua = getHeader(headers, "User-Agent");
  var jdApp = getHeader(headers, "JD-APP");
  var jdStd = getHeader(headers, "JD-STD");
  var host = String(parsed.host || "").toLowerCase();
  var raw = String(req.url || "");

  if (/(JD4iPhone|jdmall|jdapp|com\.360buy\.jdmobile)/i.test(ua)) return true;
  if (jdApp || jdStd) return true;
  if (/(^|\.)jd\.com(?::\d+)?$/i.test(host)) return true;
  if (/com\.360buy\.jdmobile/i.test(raw)) return true;

  return false;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
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
      var reqHeaders = req.headers || {};
      var resHeaders = res && res.headers ? res.headers : {};
      var session = req.sessionIndex !== undefined ? req.sessionIndex : (res && res.sessionIndex !== undefined ? res.sessionIndex : "?");
      var method = req.method || "";
      var ua = getHeader(reqHeaders, "User-Agent");
      var reqType = getHeader(reqHeaders, "Content-Type");
      var reqLen = getHeader(reqHeaders, "Content-Length");
      var phase = res ? "RESPONSE" : "REQUEST";

      var status = res ? safeNumber(res.statusCode || res.status) : "";
      var resType = res ? getHeader(resHeaders, "Content-Type") : "";
      var resLen = res ? (getHeader(resHeaders, "Content-Length") || getHeader(resHeaders, "Transfer-Encoding")) : "";

      var uaTag = "other";
      if (/JD4iPhone/i.test(ua)) uaTag = "JD4iPhone";
      else if (/jdmall/i.test(ua)) uaTag = "jdmall";
      else if (/jdapp/i.test(ua)) uaTag = "jdapp";
      else if (/com\.360buy\.jdmobile/i.test(ua)) uaTag = "bundle";
      else if (getHeader(reqHeaders, "JD-APP") || getHeader(reqHeaders, "JD-STD")) uaTag = "JD-header";
      else if (/(^|\.)jd\.com(?::\d+)?$/i.test(String(parsed.host || "").toLowerCase())) uaTag = "jd-host";

      var line = PREFIX + " " + phase +
        " session=" + session +
        " method=" + method +
        " host=" + parsed.host +
        " path=" + parsed.path +
        " ua=" + uaTag +
        " reqType=" + reqType +
        " reqLen=" + reqLen;

      if (res) {
        line += " status=" + status +
          " resType=" + resType +
          " resLen=" + resLen;
      }

      console.log(line);
      $done({});
    }
  }
} catch (error) {
  console.log(PREFIX + " ERROR " + (error && error.stack ? error.stack : error));
  $done({});
}
