// 百度主 App 搜索商业卡 leads 两阶段实验 - response v2
// Quantumult X script-response-body
//
// 不再依赖 response 阶段读取 POST Body。
// 只识别 request v2 写入的 X-QX-Baidu-Search-Commercial 标记。
// 命中标记后，仅把响应 data 清空，保留 status / errors 等协议外壳。

const TAG = "baidu-app-search-leads-response-v2";
const MARKER_HEADER = "X-QX-Baidu-Search-Commercial";

(() => {
  const originalBody = $response?.body;
  const marker = getHeader($request?.headers || {}, MARKER_HEADER);

  if (typeof originalBody !== "string") {
    console.log(`[${TAG}] no-string-response fail-open`);
    $done({});
    return;
  }

  if (!marker || !String(marker).startsWith("1|")) {
    $done({});
    return;
  }

  try {
    const resp = JSON.parse(originalBody);
    const before = Array.isArray(resp?.data) ? resp.data.length : -1;
    const rank = String(marker).split("|")[1] || "?";

    resp.data = [];

    console.log(
      `[${TAG}] commercial-marked rank=${rank} data ${before}->0`
    );

    $done({ body: JSON.stringify(resp) });
  } catch (error) {
    console.log(`[${TAG}] parse-error fail-open: ${error}`);
    $done({ body: originalBody });
  }
})();

function getHeader(headers, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}
