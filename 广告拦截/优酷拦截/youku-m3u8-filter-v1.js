// 优酷免费内容 M3U8 动态广告块过滤 - v1 实验版
// Quantumult X script-response-body
//
// 依据 2026-09-03 优酷.har + 1615.log：
// - 免费内容广告会作为独立 #EXT-X-DISCONTINUITY block 拼入 pl-ali.youku.com/playlist/m3u8；
// - 广告时长动态变化，不能写死固定秒数；
// - 实机已验证广告 block 稳定表现为：ccode=0902 且内部 vid != 外层正片 vid；
// - 个别广告 URI 还可能显式包含 /ad/。
//
// 本脚本只删除满足强证据的完整广告 block；任何关键条件不满足时 fail-open 原样放行。

(() => {
  const originalBody = $response?.body;
  const requestUrl = $request?.url || "";

  console.log("youku-m3u8-filter-v1 2026-09-03");

  if (typeof originalBody !== "string" || !originalBody.includes("#EXTM3U")) {
    console.log("优酷M3U8过滤: 非文本M3U8，原样放行");
    $done({ body: originalBody });
    return;
  }

  const mainVid = getQueryParam(requestUrl, "vid");
  const streamType = getQueryParam(requestUrl, "type") || "-";
  const advInfoCount = getAdvInfoCount(requestUrl);

  if (!mainVid) {
    console.log("优酷M3U8过滤: 请求缺少主 vid，原样放行");
    $done({ body: originalBody });
    return;
  }

  const normalized = originalBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const hadTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  const blocks = splitDiscontinuityBlocks(lines);
  const analyses = blocks.map(block => analyzeBlock(block, mainVid));

  const adIndexes = [];
  let mainBlockCount = 0;

  analyses.forEach((item, index) => {
    if (item.hasMainVid) mainBlockCount++;
    if (item.isAd) adIndexes.push(index);
  });

  if (adIndexes.length === 0) {
    console.log(
      `优酷M3U8过滤: mainVid=${mainVid} type=${streamType} advInfo=${advInfoCount} ` +
      "未发现强证据广告块，原样放行"
    );
    $done({ body: originalBody });
    return;
  }

  // 安全护栏：至少必须看到一个明确属于主视频的 block，避免误处理 master playlist 或异常结构。
  if (mainBlockCount === 0) {
    console.log(`优酷M3U8过滤: mainVid=${mainVid} 未发现主视频 block，原样放行`);
    $done({ body: originalBody });
    return;
  }

  // 全局头和 ENDLIST 不属于某个媒体 block。
  // 单独提取后重建，可以避免“首段就是广告”时删掉 #EXTM3U，
  // 以及“尾段是广告”时误删 #EXT-X-ENDLIST。
  const globalHeaders = collectGlobalHeaders(lines);
  const hadEndList = lines.includes("#EXT-X-ENDLIST");
  const keptBlocks = [];
  const removedAds = [];

  blocks.forEach((block, index) => {
    const analysis = analyses[index];

    if (analysis.isAd) {
      removedAds.push(analysis);
      return;
    }

    const content = stripGlobalLines(block);
    trimBlankLines(content);
    if (content.length > 0) keptBlocks.push(content);
  });

  if (keptBlocks.length === 0) {
    console.log("优酷M3U8过滤: 删除候选后无正常媒体块，触发 fail-open");
    $done({ body: originalBody });
    return;
  }

  const output = [...globalHeaders];

  keptBlocks.forEach((block, index) => {
    // 原始播放列表以 DISCONTINUITY 分块。广告块删除后，正常块之间仍保留一个边界，
    // 让播放器安全重置时间戳/初始化段，同时不会保留广告自身的 EXTINF 时间轴。
    if (index > 0) output.push("#EXT-X-DISCONTINUITY");
    output.push(...block);
  });

  if (hadEndList && !output.includes("#EXT-X-ENDLIST")) {
    output.push("#EXT-X-ENDLIST");
  }

  let body = output.join("\n");
  if (hadTrailingNewline) body += "\n";

  // 删除后仍必须保留 M3U8 头、媒体 URI 和主视频 vid，否则回退原响应。
  if (!body.includes("#EXTM3U") || !hasAnyMediaUri(body) || !bodyContainsVid(body, mainVid)) {
    console.log("优酷M3U8过滤: 删除后完整性检查失败，触发 fail-open");
    $done({ body: originalBody });
    return;
  }

  const removedTotal = removedAds.reduce((sum, item) => {
    const duration = Number.isFinite(item.extinfDuration) && item.extinfDuration > 0
      ? item.extinfDuration
      : item.declaredDuration;
    return sum + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);

  console.log(
    `优酷M3U8过滤: mainVid=${mainVid} type=${streamType} advInfo=${advInfoCount} ` +
    `removed=${removedAds.length} removedTotal=${removedTotal.toFixed(3)}s ` +
    `mainBlocks=${mainBlockCount}`
  );

  removedAds.forEach((item, index) => {
    console.log(
      `优酷M3U8删除广告#${index + 1}: vid=${item.blockVid || "-"} ` +
      `ccode=${item.ccode || "-"} declared=${formatNumber(item.declaredDuration)}s ` +
      `extinf=${formatNumber(item.extinfDuration)}s reason=${item.reason}`
    );
  });

  $done({ body });
})();

function splitDiscontinuityBlocks(lines) {
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (line === "#EXT-X-DISCONTINUITY") {
      blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }

  blocks.push(current);
  return blocks;
}

function analyzeBlock(block, mainVid) {
  const uris = getBlockUris(block);
  const vids = new Set();
  const ccodes = new Set();
  let hasAdPath = false;

  for (const uri of uris) {
    const vid = getQueryParam(uri, "vid");
    const ccode = getQueryParam(uri, "ccode");
    if (vid) vids.add(vid);
    if (ccode) ccodes.add(ccode);
    if (/\/ad\//i.test(getUrlPath(uri))) hasAdPath = true;
  }

  const hasMainVid = vids.has(mainVid);
  const otherVids = [...vids].filter(vid => vid !== mainVid);
  const has0902 = ccodes.has("0902");

  // 强证据广告判定：
  // A. block 内出现明确 /ad/ 路径，且没有主视频 vid；
  // B. block 内出现 ccode=0902，且至少一个内部 vid 与主视频不同，同时没有主视频 vid。
  const isAd = !hasMainVid && (hasAdPath || (has0902 && otherVids.length > 0));

  const mapUri = getMapUri(block);
  const probeUri = mapUri || uris[0] || "";
  const blockVid = getQueryParam(probeUri, "vid") || otherVids[0] || "";
  const ccode = getQueryParam(probeUri, "ccode") || (has0902 ? "0902" : "");
  const declaredDuration = toFiniteNumber(getQueryParam(probeUri, "duration"));
  const extinfDuration = sumExtinf(block);

  return {
    isAd,
    hasMainVid,
    blockVid,
    ccode,
    declaredDuration,
    extinfDuration,
    reason: hasAdPath ? "ad-path" : "ccode0902+vid-mismatch"
  };
}

function getBlockUris(block) {
  const uris = [];

  for (const line of block) {
    if (line.startsWith("#EXT-X-MAP:")) {
      const match = line.match(/URI="([^"]+)"/i);
      if (match) uris.push(match[1]);
      continue;
    }

    if (line && !line.startsWith("#")) {
      uris.push(line);
    }
  }

  return uris;
}

function getMapUri(block) {
  for (const line of block) {
    if (!line.startsWith("#EXT-X-MAP:")) continue;
    const match = line.match(/URI="([^"]+)"/i);
    if (match) return match[1];
  }
  return "";
}

function collectGlobalHeaders(lines) {
  const result = [];
  const seen = new Set();

  for (const line of lines) {
    if (!isGlobalHeader(line) || seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }

  return result;
}

function stripGlobalLines(block) {
  return block.filter(line => !isGlobalHeader(line) && line !== "#EXT-X-ENDLIST");
}

function isGlobalHeader(line) {
  return line === "#EXTM3U" ||
    line.startsWith("#EXT-X-VERSION:") ||
    line.startsWith("#EXT-X-TARGETDURATION:") ||
    line.startsWith("#EXT-X-MEDIA-SEQUENCE:") ||
    line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:") ||
    line.startsWith("#EXT-X-PLAYLIST-TYPE:") ||
    line === "#EXT-X-INDEPENDENT-SEGMENTS" ||
    line.startsWith("#EXT-X-START:");
}

function trimBlankLines(lines) {
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
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

function bodyContainsVid(body, vid) {
  if (!vid) return false;
  const lines = body.split("\n");
  for (const line of lines) {
    if (!line || (line.startsWith("#") && !line.startsWith("#EXT-X-MAP:"))) continue;
    const uris = getBlockUris([line]);
    if (uris.some(uri => getQueryParam(uri, "vid") === vid)) return true;
  }
  return false;
}

function hasAnyMediaUri(body) {
  return body.split("\n").some(line => line && !line.startsWith("#"));
}

function getUrlPath(url) {
  if (typeof url !== "string") return "";
  const withoutQuery = url.split("?", 1)[0];
  const schemeIndex = withoutQuery.indexOf("://");
  if (schemeIndex < 0) return withoutQuery;
  const pathIndex = withoutQuery.indexOf("/", schemeIndex + 3);
  return pathIndex >= 0 ? withoutQuery.slice(pathIndex) : "/";
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
