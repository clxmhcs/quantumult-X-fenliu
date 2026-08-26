// 百度主 App 搜索广告探针 - v1
// Quantumult X script-response-body
// 目标：定位 m.baidu.com/s 搜索结果中“广告”卡片的真实网络标志。
// 注意：本脚本只记录有限结构信息，绝不修改响应正文。

(() => {
  const originalBody = $response?.body;
  const url = $request?.url || "";

  if (typeof originalBody !== "string") {
    console.log("[baidu-app-search-probe-v1] 无文本响应正文，原样放行");
    $done({ body: originalBody });
    return;
  }

  const contentType = getHeader($response?.headers, "content-type") || "unknown";
  const bodyLength = originalBody.length;
  const looksHtml = /<!doctype\s+html|<html\b|<body\b|<div\b/i.test(originalBody);

  console.log("========== baidu-app-search-probe-v1 ==========");
  console.log(`[probe] url=${safeUrl(url)}`);
  console.log(`[probe] content-type=${contentType}`);
  console.log(`[probe] body-length=${bodyLength}`);
  console.log(`[probe] looks-html=${looksHtml}`);

  const markers = [
    { name: "literal-ad-label", value: "广告" },
    { name: "unicode-ad-label", value: "\\u5e7f\\u544a" },
    { name: "sourceType", value: "sourceType" },
    { name: "source_type", value: "source_type" },
    { name: "plan_id", value: "plan_id" },
    { name: "planId", value: "planId" },
    { name: "shopId", value: "shopId" },
    { name: "shop_id", value: "shop_id" },
    { name: "srcid", value: "srcid" },
    { name: "solutionIds", value: "solutionIds" },
    { name: "is_ad", value: "is_ad" },
    { name: "isAd", value: "isAd" },
    { name: "ad_type", value: "ad_type" },
    { name: "adType", value: "adType" },
    { name: "commercial", value: "commercial" },
    { name: "promotion", value: "promotion" },
    // 2026-08-26 当前“装修”样本中肉眼确认的广告商，仅用于对照定位。
    { name: "sample-green-harbor", value: "绿港装饰" },
    { name: "sample-yenova", value: "业之峰装饰" },
    { name: "sample-dianping", value: "大众点评精选家居商家" }
  ];

  for (const marker of markers) {
    const indexes = findIndexes(originalBody, marker.value, 3);
    console.log(`[probe] marker=${marker.name} count>=${indexes.length}${indexes.length === 3 ? " (capped)" : ""}`);

    indexes.forEach((index, i) => {
      const context = extractContext(originalBody, index, marker.value.length, 420);
      console.log(`[probe-context] ${marker.name}#${i + 1} @${index}: ${context}`);
    });
  }

  // 如果 HTML 中直接存在“广告”文字，额外尝试提取其最近的父级起始标签片段，
  // 用于下一阶段判断是否能稳定删除整个结果卡而不是只删除标签。
  const adIndexes = findIndexes(originalBody, "广告", 8);
  adIndexes.forEach((index, i) => {
    const parentHint = nearestContainerHint(originalBody, index);
    if (parentHint) {
      console.log(`[probe-parent] ad#${i + 1}: ${parentHint}`);
    }
  });

  console.log("[probe] response unchanged=true");
  console.log("========== /baidu-app-search-probe-v1 ==========");

  $done({ body: originalBody });
})();

function getHeader(headers, wantedName) {
  if (!headers || typeof headers !== "object") return "";
  const wanted = wantedName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value);
  }
  return "";
}

function safeUrl(rawUrl) {
  // 不记录搜索词、Cookie、token 等值，只记录路径和 query 参数名。
  try {
    const match = rawUrl.match(/^(https?):\/\/([^/]+)(\/[^?#]*)?(?:\?([^#]*))?/i);
    if (!match) return rawUrl.split("?")[0];
    const scheme = match[1];
    const host = match[2];
    const path = match[3] || "/";
    const query = match[4] || "";
    const keys = query
      .split("&")
      .filter(Boolean)
      .map(pair => pair.split("=", 1)[0])
      .filter(Boolean)
      .slice(0, 40);
    return `${scheme}://${host}${path}${keys.length ? `?keys=${keys.join(",")}` : ""}`;
  } catch (_) {
    return rawUrl.split("?")[0];
  }
}

function findIndexes(text, needle, maxCount) {
  const result = [];
  if (!needle) return result;

  let from = 0;
  while (result.length < maxCount) {
    const index = text.indexOf(needle, from);
    if (index === -1) break;
    result.push(index);
    from = index + Math.max(needle.length, 1);
  }
  return result;
}

function extractContext(text, index, needleLength, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needleLength + radius);
  return sanitize(text.slice(start, end));
}

function nearestContainerHint(text, index) {
  const start = Math.max(0, index - 1800);
  const prefix = text.slice(start, index);

  const candidates = ["<div", "<section", "<article", "<li"];
  let best = -1;
  for (const tag of candidates) {
    best = Math.max(best, prefix.lastIndexOf(tag));
  }

  if (best === -1) return "";

  const absoluteStart = start + best;
  const close = text.indexOf(">", absoluteStart);
  if (close === -1 || close > index) return "";

  return sanitize(text.slice(absoluteStart, Math.min(close + 1, absoluteStart + 800)));
}

function sanitize(value) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    // 避免日志被超长 data URI / base64 / token 类值淹没。
    .replace(/data:[^\s"']{120,}/gi, "data:[redacted]")
    .replace(/[A-Za-z0-9+/_=-]{180,}/g, "[long-value-redacted]")
    .slice(0, 1000);
}
