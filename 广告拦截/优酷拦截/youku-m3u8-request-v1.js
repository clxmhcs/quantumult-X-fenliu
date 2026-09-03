// 优酷 M3U8 请求侧广告编排隔离 - v1 实验版
// Quantumult X script-request-header
//
// 目的：只把 pl-ali.youku.com/playlist/m3u8 请求中的 advInfo 改为空数组 []，
// 其它 query 参数保持原始字节序列和顺序不变。
//
// 依据 2026-09-03 优酷.har + 1625.log：
// - 播放器在请求 M3U8 前已经携带动态 advInfo；
// - response 端删除广告 block 后客户端仍可能等待广告状态机；
// - 本阶段验证 advInfo 是否直接控制服务端广告拼接。
//
// 安全策略：
// 1) 仅处理 /playlist/m3u8；
// 2) 无 advInfo 时原样放行；
// 3) 只替换 advInfo=value 为 advInfo=%5B%5D，不重排或重编码其它参数；
// 4) 任何异常均 fail-open 原样放行。

(() => {
  const originalUrl = $request?.url || "";

  console.log("youku-m3u8-request-v1 2026-09-03");

  if (typeof originalUrl !== "string" || !/\/playlist\/m3u8(?:\?|$)/i.test(originalUrl)) {
    console.log("优酷M3U8请求: 非目标URL，原样放行");
    $done({});
    return;
  }

  const qIndex = originalUrl.indexOf("?");
  if (qIndex < 0) {
    console.log("优酷M3U8请求: 无query，原样放行");
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

    // 只替换 value；key、参数顺序及其它所有原始字符保持不变。
    return `${rawKey}=%5B%5D`;
  });

  if (!found) {
    console.log("优酷M3U8请求: 未发现advInfo，原样放行");
    $done({});
    return;
  }

  const modifiedUrl = base + modifiedPairs.join("&");

  if (modifiedUrl === originalUrl) {
    console.log(`优酷M3U8请求: advInfo已为空 before=${beforeCount}，无需修改`);
    $done({});
    return;
  }

  const mainVid = getRawQueryValue(query, "vid") || "-";
  const streamType = getRawQueryValue(query, "type") || "-";

  console.log(
    `优酷M3U8请求: mainVid=${safeDecode(mainVid)} type=${safeDecode(streamType)} ` +
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
