/*
 * Quantumult X global HTTP(S) metadata observer
 *
 * TEMPORARY diagnostic mode for JD search investigation.
 * - No host/User-Agent filtering.
 * - No request/response body logging.
 * - No Cookie, token, authorization, signature, query-string, or other
 *   sensitive header values are logged.
 * - Never modifies traffic.
 */

var PREFIX = "[QX-GLOBAL]";

function getHeader(headers, name) {
  headers = headers || {};
  var target = String(name || "").toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === target) {
      return String(headers[keys[i]] || "");
    }
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
    $done({});
  }
} catch (error) {
  console.log(PREFIX + " ERROR " + String(error));
  $done({});
}
