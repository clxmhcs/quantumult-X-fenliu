// Youku M3U8 request-side ad orchestration isolation - v1
// Quantumult X script-request-header
//
// Purpose: only replace advInfo in pl-ali.youku.com/playlist/m3u8 requests
// with an empty array [], while preserving the original byte sequence and order
// of every other query parameter.
//
// Evidence from 2026-09-03 Youku.har + 1625.log:
// - The player already carries dynamic advInfo before requesting the M3U8.
// - Removing ad blocks from the response can still leave the client waiting on
//   the ad state machine.
// - This stage tests whether advInfo directly controls server-side ad stitching.
//
// Safety policy:
// 1) Handle only /playlist/m3u8.
// 2) Pass through unchanged when advInfo is absent.
// 3) Replace only advInfo=value with advInfo=%5B%5D; do not reorder or re-encode
//    any other parameter.
// 4) Fail open and pass through unchanged on any exception.

(() => {
  const originalUrl = $request?.url || "";

  console.log("youku-m3u8-request-v1 2026-09-03");

  if (typeof originalUrl !== "string" || !/\/playlist\/m3u8(?:\?|$)/i.test(originalUrl)) {
    console.log("Youku M3U8 request: non-target URL, passing through unchanged");
    $done({});
    return;
  }

  const qIndex = originalUrl.indexOf("?");
  if (qIndex < 0) {
    console.log("Youku M3U8 request: no query string, passing through unchanged");
    $done({});
    return;
  }

  const base = originalUrl.slice(0, qIndex + 1);
  const query = originalUrl.slice(qIndex + 1);
  const pairs = query.split("&");

  let found = false;
  let beforeCount = -1;

  const modifiedPairs = pairs.map(pair => {
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : "";

    if (safeDecode(rawKey) !== "advInfo") return pair;

    found = true;
    beforeCount = getArrayCount(rawValue);

    // Replace only the value. Keep the key, parameter order, and every other
    // original character unchanged.
    return `${rawKey}=%5B%5D`;
  });

  if (!found) {
    console.log("Youku M3U8 request: advInfo not found, passing through unchanged");
    $done({});
    return;
  }

  const modifiedUrl = base + modifiedPairs.join("&");

  if (modifiedUrl === originalUrl) {
    console.log(`Youku M3U8 request: advInfo already empty before=${beforeCount}, no change needed`);
    $done({});
    return;
  }

  const mainVid = getRawQueryValue(query, "vid") || "-";
  const streamType = getRawQueryValue(query, "type") || "-";

  console.log(
    `Youku M3U8 request: mainVid=${safeDecode(mainVid)} type=${safeDecode(streamType)} ` +
    `advInfo=${beforeCount}->0`
  );

  $done({ url: modifiedUrl });
})();

function getRawQueryValue(query, name) {
  for (const pair of String(query).split("&")) {
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : "";
    if (safeDecode(rawKey) === name) return rawValue;
  }
  return "";
}

function getArrayCount(rawValue) {
  try {
    const decoded = safeDecode(rawValue);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed.length : -1;
  } catch (_) {
    return -1;
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20"));
  } catch (_) {
    return String(value);
  }
}
