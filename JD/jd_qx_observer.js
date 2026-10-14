/*
 * JD Traffic Observer for Quantumult X
 *
 * Purpose:
 * - Observe JD HTTP(S) traffic that has already entered Quantumult X's MITM/rewrite layer.
 * - Log request/response metadata and body previews for search/price investigation.
 * - Never modifies request or response content.
 *
 * Notes:
 * - This script cannot expose traffic that never reaches QX's HTTP MITM/rewrite layer
 *   (for example, an un-intercepted TLS tunnel, QUIC/custom socket, or pinned connection).
 * - Sensitive headers are redacted before logging.
 */

const PREFIX = "[JD-QX]";
const MAX_BODY = 20000;
const CHUNK = 3500;

function safeString(value) {
  if (value === null || value === undefined) return "";
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function redactHeaders(headers) {
  const output = {};
  const sensitive = new Set([
    "cookie",
    "authorization",
    "proxy-authorization",
    "set-cookie",
    "x-api-key"
  ]);

  for (const key of Object.keys(headers || {})) {
    output[key] = sensitive.has(key.toLowerCase()) ? "<redacted>" : headers[key];
  }
  return output;
}

function bodyPreview(body) {
  let text = safeString(body);
  if (!text) return "";

  if (text.length > MAX_BODY) {
    const omitted = text.length - MAX_BODY;
    text = text.slice(0, MAX_BODY) + `\n...<truncated ${omitted} chars>`;
  }
  return text;
}

function logChunks(label, text) {
  const value = safeString(text);
  if (!value) return;

  for (let i = 0; i < value.length; i += CHUNK) {
    console.log(`${PREFIX} ${label} ${value.slice(i, i + CHUNK)}`);
  }
}

function isInteresting(text) {
  if (!text) return false;
  return /(?:Search_ProductList|Searchlist_Productid|activitySearch|functionId|wareId|skuId|sku_id|jdPrice|purchasePrice|doublePrice|priceInfo|finalPrice|keyword|keyWord|search|product|ware)/i.test(text);
}

function querySummary(url) {
  try {
    const q = url.split("?")[1] || "";
    if (!q) return "";
    const decoded = decodeURIComponent(q.replace(/\+/g, " "));
    return bodyPreview(decoded);
  } catch (_) {
    return "";
  }
}

try {
  const request = typeof $request !== "undefined" ? $request : null;
  const response = typeof $response !== "undefined" ? $response : null;

  if (!request && !response) {
    console.log(`${PREFIX} no request/response context`);
    $done({});
  } else {
    const url = request ? request.url || "" : "";
    const method = request ? request.method || "" : "";
    const reqHeaders = request ? redactHeaders(request.headers || {}) : {};
    const reqBody = request ? bodyPreview(request.body) : "";
    const query = querySummary(url);

    if (response) {
      const status = response.statusCode || response.status || "";
      const resHeaders = redactHeaders(response.headers || {});
      const resBody = bodyPreview(response.body);
      const haystack = [url, query, reqBody, resBody].join("\n");
      const hit = isInteresting(haystack) ? " HIT" : "";

      console.log(`${PREFIX}${hit} RESPONSE status=${status} ${method} ${url}`);
      if (query) logChunks("QUERY", query);
      logChunks("REQ_HEADERS", JSON.stringify(reqHeaders));
      if (reqBody) logChunks("REQ_BODY", reqBody);
      logChunks("RES_HEADERS", JSON.stringify(resHeaders));
      if (resBody) logChunks("RES_BODY", resBody);
    } else {
      const haystack = [url, query, reqBody].join("\n");
      const hit = isInteresting(haystack) ? " HIT" : "";

      console.log(`${PREFIX}${hit} REQUEST ${method} ${url}`);
      if (query) logChunks("QUERY", query);
      logChunks("REQ_HEADERS", JSON.stringify(reqHeaders));
      if (reqBody) logChunks("REQ_BODY", reqBody);
    }

    $done({});
  }
} catch (error) {
  console.log(`${PREFIX} ERROR ${error && error.stack ? error.stack : error}`);
  $done({});
}
