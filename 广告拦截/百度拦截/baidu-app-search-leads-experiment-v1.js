// 百度主 App 搜索商业卡 leads 空响应实验 - v1
// Quantumult X script-response-body
//
// 数据依据：百度搜索1.har
// - POST https://leads.baidu.com/internal/virtualPhone/getPhone
// - 请求体为 application/json
// - 商业样本稳定特征：channel === "4" && extraInfo.sourceType === 2003
// - extraInfo.lpUrl 查询参数同时包含 srcid=51006 / source=51006
//
// 实验目的：仅对上述商业样本把响应 data 改为空数组，观察整张“广告”卡是否消失。
// 其余 sourceType=19002 / channel=0 等请求全部原样放行。

(() => {
  const originalBody = $response?.body;
  const requestBody = $request?.body;

  if (typeof originalBody !== "string" || typeof requestBody !== "string") {
    $done({ body: originalBody });
    return;
  }

  try {
    const req = JSON.parse(requestBody);

    if (!isTargetCommercialRequest(req)) {
      $done({ body: originalBody });
      return;
    }

    const resp = JSON.parse(originalBody);
    const before = Array.isArray(resp?.data) ? resp.data.length : -1;

    // 最小实验：只清空电话接口返回的数据，不改变 status / errors 等协议外壳。
    resp.data = [];

    const meta = getCommercialMeta(req);
    console.log(
      `[baidu-app-search-leads-experiment-v1] matched ` +
      `sourceType=2003 channel=4 srcid=51006 ` +
      `rank=${meta.rank || "?"} data ${before}->0`
    );

    $done({ body: JSON.stringify(resp) });
  } catch (error) {
    console.log(`[baidu-app-search-leads-experiment-v1] parse-error fail-open: ${error}`);
    $done({ body: originalBody });
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
    rank: params.srcrank || "",
    srcid: params.srcid || params.source || ""
  };
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
