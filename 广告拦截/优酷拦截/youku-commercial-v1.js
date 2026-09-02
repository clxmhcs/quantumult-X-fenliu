// 优酷 UPS 商业化诊断 - v3 纯放行版
// 文件名保留 youku-commercial-v1.js，以兼容现有远程重写地址。
// Quantumult X script-response-body
//
// 2026-09-02 实机发现：电影可正常播放，但剧集在商业视频 stream 被清空后可能持续转圈。
// 因此本阶段彻底停止修改 UPS 响应，只记录安全的定位字段。
//
// 目标：
// 1) 先确认电影、剧集在 UPS 100% 原样放行后均恢复正常播放；
// 2) 对比页面广告与剧集播放时的 spmid / vid / needad / position / appstyle / player_source / open_cpm；
// 3) 不打印 Cookie、Token、完整请求体等敏感/高噪声信息。

(() => {
  const originalBody = $response?.body;
  const requestUrl = $request?.url || "";
  const requestBody = typeof $request?.body === "string" ? $request.body : "";

  console.log("youku-ups-diagnostic-v3-pass-through 2026-09-02");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("优酷UPS诊断: 无文本响应体，原样放行");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`优酷UPS诊断: JSON解析失败，原样放行: ${error}`);
    $done({ body: originalBody });
    return;
  }

  const data = body?.data?.data;
  const title = data?.video?.title || "unknown";
  const videoUsername = data?.video?.username;
  const uploaderUsername = data?.uploader?.username;
  const streamCount = Array.isArray(data?.stream) ? data.stream.length : -1;

  const commercialOwner =
    videoUsername === "商业化页面banner素材专用" ||
    uploaderUsername === "商业化页面banner素材专用";

  const commercialTitle =
    typeof title === "string" && title.startsWith("创意中心-");

  const kind = commercialOwner && commercialTitle ? "COMMERCIAL" : "NORMAL";
  const ctx = extractSafeContext(requestUrl, requestBody);

  console.log(
    `优酷UPS诊断: ${kind} title=${title} stream=${streamCount} ` +
    `spmid=${ctx.spmid} vid=${ctx.vid} needad=${ctx.needad} ` +
    `position=${ctx.position} appstyle=${ctx.appstyle} ` +
    `player_source=${ctx.player_source} open_cpm=${ctx.open_cpm}`
  );

  // 诊断阶段绝不修改 UPS 响应。
  $done({ body: originalBody });
})();

function extractSafeContext(url, body) {
  const wanted = [
    "spmid",
    "vid",
    "needad",
    "position",
    "appstyle",
    "player_source",
    "open_cpm"
  ];

  const found = {};
  const texts = buildDecodedTexts([url || "", body || ""]);

  for (const text of texts) {
    collectFromQueryLike(text, wanted, found);
    collectFromJsonCandidates(text, wanted, found);
    collectFromRawText(text, wanted, found);
    if (wanted.every(key => found[key] !== undefined)) break;
  }

  const result = {};
  for (const key of wanted) {
    result[key] = sanitizeValue(found[key]);
  }
  return result;
}

function buildDecodedTexts(inputs) {
  const out = [];
  for (const input of inputs) {
    if (typeof input !== "string" || input.length === 0) continue;
    let current = input;
    for (let i = 0; i < 3; i++) {
      if (!out.includes(current)) out.push(current);
      try {
        const next = decodeURIComponent(current.replace(/\+/g, "%20"));
        if (next === current) break;
        current = next;
      } catch (_) {
        break;
      }
    }
  }
  return out;
}

function collectFromQueryLike(text, wanted, found) {
  const query = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
  for (const pair of query.split("&")) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = safeDecode(pair.slice(0, index));
    const value = safeDecode(pair.slice(index + 1));
    if (wanted.includes(key) && found[key] === undefined) {
      found[key] = value;
    }
    if (key === "data" || key === "ad_params") {
      collectObjectLike(value, wanted, found, 0);
    }
  }
}

function collectFromJsonCandidates(text, wanted, found) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    collectObjectLike(trimmed, wanted, found, 0);
  }
}

function collectObjectLike(value, wanted, found, depth) {
  if (depth > 6 || value === null || value === undefined) return;

  if (typeof value === "string") {
    let text = safeDecode(value).trim();
    if (!(text.startsWith("{") || text.startsWith("["))) return;
    try {
      value = JSON.parse(text);
    } catch (_) {
      return;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) collectObjectLike(item, wanted, found, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (wanted.includes(key) && found[key] === undefined) {
      found[key] = child;
    }
    if (typeof child === "object" || typeof child === "string") {
      collectObjectLike(child, wanted, found, depth + 1);
    }
  }
}

function collectFromRawText(text, wanted, found) {
  for (const key of wanted) {
    if (found[key] !== undefined) continue;

    const quoted = new RegExp(`["']${escapeRegExp(key)}["']\\s*:\\s*["']?([^"'&,}\\s]+)`, "i");
    const query = new RegExp(`(?:^|[?&])${escapeRegExp(key)}=([^&]+)`, "i");
    const match = text.match(quoted) || text.match(query);
    if (match) found[key] = safeDecode(match[1]);
  }
}

function safeDecode(value) {
  if (typeof value !== "string") return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch (_) {
    return value;
  }
}

function sanitizeValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") {
    try {
      value = JSON.stringify(value);
    } catch (_) {
      return "[object]";
    }
  }
  value = String(value).replace(/[\r\n\t]/g, " ");
  return value.length > 120 ? value.slice(0, 117) + "..." : value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
