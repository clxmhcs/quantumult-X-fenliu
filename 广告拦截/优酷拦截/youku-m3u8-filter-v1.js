// 优酷 M3U8 动态广告块过滤 - v1 实验版
// Quantumult X script-response-body
//
// 实机依据：2026-09-03 优酷.har + 1615.log
// - 免费内容广告被动态拼入 pl-ali.youku.com/playlist/m3u8；
// - 广告时长不固定，已观察 34s / 54s，历史实机还出现过更长组合；
// - 广告 block 可由显式 /ad/，或 ccode=0902 + 内部 vid != 外层正片 vid 识别；
// - 本脚本删除完整广告 block，而不是 REJECT 广告媒体 URL。
//
// 安全策略：
// 1) 非 M3U8、结构异常、识别不确定时 fail-open；
// 2) ccode=0902 判定必须同时满足内部 vid 与主 vid 不同；
// 3) 删除后必须仍保留正片主 vid，否则整份响应回退原样；
// 4) 不写死广告秒数、广告 vid、剧集 vid。

(() => {
  const originalBody = $response?.body;
  const requestUrl = $request?.url || "";

  console.log("youku-m3u8-filter-v1 2026-09-03");

  if (typeof originalBody !== "string" || !originalBody.includes("#EXTM3U")) {
    console.log("优酷M3U8过滤: 非文本M3U8，原样放行");
    $done({ body: originalBody });
    return;
  }

  const mainVid = getQueryParam(requestUrl, "vid") || "";
  const streamType = getQueryParam(requestUrl, "type") || "-";
  const advInfoCount = getAdvInfoCount(requestUrl);
  const hadTrailingNewline = /(?:\r\n|\r|\n)$/.test(originalBody);

  const lines = originalBody
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  // split 后最后一个空行只用于恢复尾换行，不参与 block 判断。
  if (hadTrailingNewline && lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const blocks = splitDiscontinuityBlocks(lines);
  if (blocks.length === 0) {
    console.log("优酷M3U8过滤: 未形成有效 block，原样放行");
    $done({ body: originalBody });
    return;
  }

  const removed = [];
  const kept = [];

  for (const block of blocks) {
    const info = inspectBlock(block, mainVid);

    if (info.isAd) {
      removed.push(info);
    } else {
      kept.push(block);
    }
  }

  if (removed.length === 0) {
    console.log(
      `优酷M3U8过滤: mainVid=${mainVid || "-"} type=${streamType} advInfo=${advInfoCount} ` +
      "未识别到广告 block，原样放行"
    );
    $done({ body: originalBody });
    return;
  }

  if (kept.length === 0) {
    console.log("优酷M3U8过滤: 所有 block 均被判为广告，触发安全回退");
    $done({ body: originalBody });
    return;
  }

  let modifiedBody = kept.map(block => block.join("\n")).join("\n");
  if (hadTrailingNewline) modifiedBody += "\n";

  // 基础完整性保护。
  if (!modifiedBody.includes("#EXTM3U") || !hasAnyMediaUri(modifiedBody)) {
    console.log("优酷M3U8过滤: 删除后播放列表完整性检查失败，触发安全回退");
    $done({ body: originalBody });
    return;
  }

  // 只要请求提供了主 vid，删除后必须还能在媒体 URI 中找到该主 vid。
  if (mainVid && !bodyContainsVid(modifiedBody, mainVid)) {
    console.log(`优酷M3U8过滤: 删除后未发现正片 mainVid=${mainVid}，触发安全回退`);
    $done({ body: originalBody });
    return;
  }

  const removedTotal = removed.reduce((sum, item) => {
    if (Number.isFinite(item.extinfDuration) && item.extinfDuration > 0) {
      return sum + item.extinfDuration;
    }
    if (Number.isFinite(item.declaredDuration) && item.declaredDuration > 0) {
      return sum + item.declaredDuration;
    }
    return sum;
  }, 0);

  console.log(
    `优酷M3U8过滤: mainVid=${mainVid || "-"} type=${streamType} advInfo=${advInfoCount} ` +
    `removed=${removed.length} removedTotal=${removedTotal.toFixed(3)}s blocks=${blocks.length}->${kept.length}`
  );

  removed.forEach((item, index) => {
    console.log(
      `优酷M3U8已删除广告#${index + 1}: vid=${item.vid || "-"} ` +
      `ccode=${item.ccode || "-"} extinf=${formatNumber(item.extinfDuration)}s ` +
      `declared=${formatNumber(item.declaredDuration)}s reason=${item.reason}`
    );
  });

  $done({ body: modifiedBody });
})();

function splitDiscontinuityBlocks(lines) {
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (line === "#EXT-X-DISCONTINUITY") {
      if (current.length > 0) blocks.push(current);
      // 把分界标记保留在新 block 开头。
      // 删除广告 block 时会一起删掉它自己的起始分界；
      // 下一段正片仍保留自己的 DISCONTINUITY。
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current);
  return blocks;
}

function inspectBlock(block, mainVid) {
  const uris = collectUris(block);
  const vids = unique(uris.map(uri => getQueryParam(uri, "vid")).filter(Boolean));
  const ccodes = unique(uris.map(uri => getQueryParam(uri, "ccode")).filter(Boolean));
  const hasAdPath = uris.some(uri => /\/ad\//i.test(uri));
  const ccodeAd = ccodes.includes("0902");

  // 为避免把正片中的混合 URI 误删，要求这个 block 中所有可识别 vid 都不是主 vid。
  const vidMismatch =
    Boolean(mainVid) &&
    vids.length > 0 &&
    vids.every(vid => vid !== mainVid);

  const isAd = hasAdPath || (ccodeAd && vidMismatch);
  const probeUri = uris[0] || "";

  return {
    isAd,
    vid: vids[0] || "",
    ccode: ccodes[0] || "",
    extinfDuration: sumExtinf(block),
    declaredDuration: toFiniteNumber(getQueryParam(probeUri, "duration")),
    reason: hasAdPath ? "ad-path" : (ccodeAd && vidMismatch ? "ccode0902+vid-mismatch" : "none")
  };
}

function collectUris(block) {
  const uris = [];

  for (const line of block) {
    if (/^https?:\/\//i.test(line)) {
      uris.push(line);
      continue;
    }

    if (line.startsWith("#EXT-X-MAP:")) {
      const match = line.match(/URI="([^"]+)"/i);
      if (match) uris.push(match[1]);
    }
  }

  return uris;
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
    if (!/^https?:\/\//i.test(line) && !line.startsWith("#EXT-X-MAP:")) continue;
    const uris = collectUris([line]);
    if (uris.some(uri => getQueryParam(uri, "vid") === vid)) return true;
  }
  return false;
}

function hasAnyMediaUri(body) {
  return body.split("\n").some(line => /^https?:\/\//i.test(line));
}

function unique(values) {
  return [...new Set(values)];
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
