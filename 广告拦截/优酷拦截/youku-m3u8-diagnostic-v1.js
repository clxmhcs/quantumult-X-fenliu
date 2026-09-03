// 优酷 M3U8 广告编排诊断 - v1（只记录，不修改）
// Quantumult X script-response-body
//
// 依据 2026-09-03 优酷.har：
// - 免费内容的广告可直接拼入 pl-ali.youku.com/playlist/m3u8；
// - 广告时长动态变化，不可写死固定秒数；
// - 已观察到广告 block 常同时具备：ccode=0902、内部 vid 与外层正片 vid 不一致；
// - 某些广告路径还可能直接包含 /ad/。
//
// 本阶段仅输出诊断日志，绝不修改 M3U8 响应。

(() => {
  const originalBody = $response?.body;
  const requestUrl = $request?.url || "";

  console.log("youku-m3u8-diagnostic-v1 2026-09-03");

  if (typeof originalBody !== "string" || !originalBody.includes("#EXTM3U")) {
    console.log("优酷M3U8诊断: 非文本M3U8，原样放行");
    $done({ body: originalBody });
    return;
  }

  const mainVid = getQueryParam(requestUrl, "vid") || "-";
  const streamType = getQueryParam(requestUrl, "type") || "-";
  const requestDuration = toFiniteNumber(getQueryParam(requestUrl, "duration"));
  const advInfoCount = getAdvInfoCount(requestUrl);

  const lines = originalBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = splitDiscontinuityBlocks(lines);
  const adBlocks = [];

  for (const block of blocks) {
    const mapUri = getMapUri(block);
    const mediaUris = block.filter(line => /^https?:\/\//i.test(line));
    const probeUri = mapUri || mediaUris[0] || "";

    if (!probeUri) continue;

    const blockVid = getQueryParam(probeUri, "vid") || "-";
    const ccode = getQueryParam(probeUri, "ccode") || "-";
    const declaredDuration = toFiniteNumber(getQueryParam(probeUri, "duration"));
    const extinfDuration = sumExtinf(block);
    const hasAdPath = [mapUri, ...mediaUris].some(uri => /\/ad\//i.test(uri));
    const vidMismatch = mainVid !== "-" && blockVid !== "-" && blockVid !== mainVid;
    const ccodeAd = ccode === "0902";

    // 诊断判定必须有较强证据：显式 /ad/，或 ccode=0902 且内部 vid 与正片 vid 不一致。
    if (!(hasAdPath || (ccodeAd && vidMismatch))) continue;

    adBlocks.push({
      vid: blockVid,
      ccode,
      declaredDuration,
      extinfDuration,
      reason: hasAdPath ? "ad-path" : "ccode0902+vid-mismatch"
    });
  }

  const adTotal = adBlocks.reduce((sum, item) => {
    if (Number.isFinite(item.extinfDuration) && item.extinfDuration > 0) {
      return sum + item.extinfDuration;
    }
    if (Number.isFinite(item.declaredDuration) && item.declaredDuration > 0) {
      return sum + item.declaredDuration;
    }
    return sum;
  }, 0);

  console.log(
    `优酷M3U8诊断: mainVid=${mainVid} type=${streamType} ` +
    `requestDuration=${formatNumber(requestDuration)} advInfo=${advInfoCount} ` +
    `adBlocks=${adBlocks.length} adTotal=${adTotal.toFixed(3)}s`
  );

  adBlocks.forEach((item, index) => {
    console.log(
      `优酷M3U8广告#${index + 1}: vid=${item.vid} ccode=${item.ccode} ` +
      `declared=${formatNumber(item.declaredDuration)}s extinf=${formatNumber(item.extinfDuration)}s ` +
      `reason=${item.reason}`
    );
  });

  // 诊断阶段绝不修改播放列表。
  $done({ body: originalBody });
})();

function splitDiscontinuityBlocks(lines) {
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (line === "#EXT-X-DISCONTINUITY") {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current);
  return blocks;
}

function getMapUri(block) {
  for (const line of block) {
    if (!line.startsWith("#EXT-X-MAP:")) continue;
    const match = line.match(/URI="([^"]+)"/i);
    if (match) return match[1];
  }
  return "";
}

function sumExtinf(block) {
  let total = 0;
  let found = false;

  for (const line of block) {
    if (!line.startsWith("#EXTINF:")) continue;
    const raw = line.slice("#EXTINF:".length).split(",", 1)[0];
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) continue;
    total += value;
    found = true;
  }

  return found ? total : NaN;
}

function getQueryParam(url, name) {
  if (typeof url !== "string" || url.length === 0) return "";
  const qIndex = url.indexOf("?");
  if (qIndex < 0) return "";

  const query = url.slice(qIndex + 1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : "";
    if (safeDecode(rawKey) === name) return safeDecode(rawValue);
  }
  return "";
}

function getAdvInfoCount(url) {
  const raw = getQueryParam(url, "advInfo");
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
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

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "-";
}
