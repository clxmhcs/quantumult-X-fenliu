/*
 * JD Wide Traffic Observer for Quantumult X
 *
 * Read-only diagnostics. Never modifies requests or responses.
 * Designed to be called by all four QX rewrite hooks:
 *   script-request-header
 *   script-request-body
 *   script-response-header
 *   script-response-body
 *
 * Important: this can only observe traffic that has already entered
 * Quantumult X's HTTP(S) MITM/rewrite layer. It cannot expose raw QUIC,
 * custom sockets, or TLS connections that QX cannot MITM/parse as HTTP.
 */

var PREFIX = "[JD-WIDE]";
var MAX_BODY = 20000;
var CHUNK = 3500;

function safeString(value) {
  if (value === null || value === undefined) return "";
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function redactHeaders(headers) {
  var output = {};
  var sensitive = {
    "cookie": true,
    "authorization": true,
    "proxy-authorization": true,
    "set-cookie": true,
    "x-api-key": true
  };

  headers = headers || {};
  Object.keys(headers).forEach(function (key) {
    output[key] = sensitive[String(key).toLowerCase()] ? "<redacted>" : headers[key];
  });
  return output;
}

function previewBody(body) {
  var text = safeString(body);
  if (!text) return "";
  if (text.length > MAX_BODY) {
    var omitted = text.length - MAX_BODY;
    text = text.slice(0, MAX_BODY) + "\n...<truncated " + omitted + " chars>";
  }
  return text;
}

function logChunks(label, text) {
  var value = safeString(text);
  if (!value) return;
  for (var i = 0; i < value.length; i += CHUNK) {
    console.log(PREFIX + " " + label + " " + value.slice(i, i + CHUNK));
  }
}

function querySummary(url) {
  try {
    var parts = String(url || "").split("?");
    if (parts.length < 2) return "";
    return previewBody(decodeURIComponent(parts.slice(1).join("?").replace(/\+/g, " ")));
  } catch (_) {
    return "";
  }
}

function isInteresting(text) {
  if (!text) return false;
  return /(?:Search_ProductList|Searchlist_Productid|activitySearch|functionId|wareId|skuId|sku_id|jdPrice|purchasePrice|doublePrice|priceInfo|finalPrice|keyword|keyWord|search|product|ware|price)/i.test(text);
}

try {
  var req = typeof $request !== "undefined" ? $request : null;
  var res = typeof $response !== "undefined" ? $response : null;

  if (!req && !res) {
    console.log(PREFIX + " NO_CONTEXT");
    $done({});
  } else {
    var url = req && req.url ? req.url : "";
    var method = req && req.method ? req.method : "";
    var reqHeaders = req ? redactHeaders(req.headers || {}) : {};
    var reqBody = req ? previewBody(req.body) : "";
    var query = querySummary(url);
    var session = "?";

    if (req && req.sessionIndex !== undefined) session = req.sessionIndex;
    else if (res && res.sessionIndex !== undefined) session = res.sessionIndex;

    var reqBodyLength = reqBody ? reqBody.length : 0;
    var host = "";
    if (reqHeaders.Host) host = reqHeaders.Host;
    else if (reqHeaders.host) host = reqHeaders.host;

    if (res) {
      var status = res.statusCode || res.status || "";
      var resHeaders = redactHeaders(res.headers || {});
      var resBody = previewBody(res.body);
      var resBodyLength = resBody ? resBody.length : 0;
      var haystack = [url, query, reqBody, resBody].join("\n");
      var hit = isInteresting(haystack) ? " HIT" : "";

      console.log(PREFIX + hit + " RESPONSE session=" + session + " status=" + status + " method=" + method + " host=" + host + " reqBody=" + reqBodyLength + " resBody=" + resBodyLength + " url=" + url);
      if (query) logChunks("QUERY", query);
      logChunks("REQ_HEADERS", JSON.stringify(reqHeaders));
      if (reqBody) logChunks("REQ_BODY", reqBody);
      logChunks("RES_HEADERS", JSON.stringify(resHeaders));
      if (resBody) logChunks("RES_BODY", resBody);
    } else {
      var reqHaystack = [url, query, reqBody].join("\n");
      var reqHit = isInteresting(reqHaystack) ? " HIT" : "";

      console.log(PREFIX + reqHit + " REQUEST session=" + session + " method=" + method + " host=" + host + " reqBody=" + reqBodyLength + " url=" + url);
      if (query) logChunks("QUERY", query);
      logChunks("REQ_HEADERS", JSON.stringify(reqHeaders));
      if (reqBody) logChunks("REQ_BODY", reqBody);
    }

    $done({});
  }
} catch (error) {
  console.log(PREFIX + " ERROR " + (error && error.stack ? error.stack : error));
  $done({});
}
