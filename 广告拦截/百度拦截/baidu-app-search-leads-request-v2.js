// 百度主 App 搜索商业卡 leads 两阶段实验 - request v2
// Quantumult X script-request-body
//
// 仅识别 HAR 已重复确认的商业样本：
// channel === "4"
// extraInfo.sourceType === 2003
// extraInfo.lpUrl 中 srcid=51006 或 source=51006
//
// 命中后不修改 POST Body，只增加一个临时请求头，供 response v2 精确识别。
// 普通 channel=0 / sourceType=19002 等请求完全原样放行。

const TAG = "baidu-app-search-leads-request-v2";
const MARKER_HEADER = "X-QX-Baidu-Search-Commercial";

(() => {
  const originalBody = $request?.body;

  if (typeof originalBody !== "string") {
    console.log(`[${TAG}] no-string-body fail-open`);
    $done({});
    return;
  }

  try {
    const req = JSON.parse(originalBody);

    if (!isTargetCommercialRequest(req)) {
      $done({});
      return;
    }

    const meta = getCommercialMeta(req);
    const headers = { ...($request.headers || {}) };
    setHeader(headers, MARKER_HEADER, `1|${meta.rank || "?"}`);

    console.log(
      `[${TAG}] marked sourceType=2003 channel=4 srcid=51006 ` +
      `rank=${meta.rank || "?"}`
    );

    // POST Body 不改，只把本次商业身份传递给 response v2。
    $done({ headers, body: originalBody });
  } catch (error) {
    console.log(`[${TAG}] parse-error fail-open: ${error}`);
    $done({});
  }
})();

function isTargetCommercialRequest(req) {
  if (!req || typeof req !== "object") return false;
  if (String(req.channel ?? "") !== "4") return false;

  const extra = req.extraInfo;
  if (!extra || typeof extra !== "object") return false;
  if (Number(extra.sourceType) !== 2003) return false;

  const params = parseQuery(extra.lpUrl);
  return params.srcid === "51006" || params.source === "51006";
}

function getCommercialMeta(req) {
  const params = parseQuery(req?.extraInfo?.lpUrl);
  return {
    rank: params.srcrank || ""
  };
}

function setHeader(headers, name, value) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) delete headers[key];
  }
  headers[name] = value;
}

function parseQuery(rawUrl) {
  const result = Object.create(null);
  if (typeof rawUrl !== "string") return result;

  const qIndex = rawUrl.indexOf("?");
  if (qIndex < 0) return result;

  const hashIndex = rawUrl.indexOf("#", qIndex + 1);
  const query = rawUrl.slice(qIndex + 1, hashIndex >= 0 ? hashIndex : undefined);

  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : "";

    let key = rawKey;
    let value = rawValue;
    try { key = decodeURIComponent(rawKey.replace(/\+/g, "%20")); } catch (_) {}
    try { value = decodeURIComponent(rawValue.replace(/\+/g, "%20")); } catch (_) {}

    if (!(key in result)) result[key] = value;
  }

  return result;
}
