// 优酷商业化 Banner 去广告 - v2 实验版
// 文件名保留 youku-commercial-v1.js，以兼容现有远程重写地址。
// Quantumult X script-response-body
//
// 依据 2026-09-02 的 youku.har / youku1.har / youku3.har / youku4.har：
// un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1
//
// 已确认商业化视频同时满足：
// 1) data.data.video.username 或 data.data.uploader.username == "商业化页面banner素材专用"
// 2) data.data.video.title 以 "创意中心-" 开头
//
// youku3/4.har 进一步确认“我的”页黑色商业广告位的 UPS 请求包含：
// spmid = a2h0f.8166709.kuflix_space.1
// 且 ad_params.needad = 0，说明 UPS 更像父级 Native 广告卡内部的播放器，而不是广告卡创建接口。
//
// v2 实验逻辑：
// - 仅当“kuflix_space.1 + 已确认商业视频”同时命中时，将顶层 data 置为空对象，
//   模拟“UPS 调用成功但没有有效视频数据”，观察父级广告卡是否自动塌缩。
// - 其它已确认商业视频仍沿用 v1：只清空播放流/清晰度/预览图。
// - 普通视频、解析失败、结构变化或识别条件不完整时全部 fail-open 原样放行。

(() => {
  const originalBody = $response?.body;
  const requestUrl = $request?.url || "";
  const requestBody = typeof $request?.body === "string" ? $request.body : "";

  console.log("youku-commercial-v2-exp 2026-09-02");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("优酷商业化广告: 无文本响应体，原样放行");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`优酷商业化广告: JSON解析失败，原样放行: ${error}`);
    $done({ body: originalBody });
    return;
  }

  const data = body?.data?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("优酷商业化广告: 未发现 data.data，原样放行");
    $done({ body: originalBody });
    return;
  }

  const videoUsername = data?.video?.username;
  const uploaderUsername = data?.uploader?.username;
  const title = data?.video?.title;

  const commercialOwner =
    videoUsername === "商业化页面banner素材专用" ||
    uploaderUsername === "商业化页面banner素材专用";

  const commercialTitle =
    typeof title === "string" &&
    title.startsWith("创意中心-");

  if (!(commercialOwner && commercialTitle)) {
    console.log(`优酷商业化广告: 正常视频原样放行 title=${title || "unknown"}`);
    $done({ body: originalBody });
    return;
  }

  const requestText = buildRequestText(requestUrl, requestBody);
  const isKuflixSpace = requestText.includes("a2h0f.8166709.kuflix_space.1");
  const streamCount = Array.isArray(data.stream) ? data.stream.length : 0;

  // 实验分支：只针对“我的”页 kuflix_space.1 商业广告位。
  // 不直接伪造 MTOP failure，先测试最温和的“SUCCESS + 无有效业务数据”。
  if (isKuflixSpace) {
    body.data = {};

    console.log(
      `优酷商业化广告: kuflix_space实验命中 title=${title || "unknown"} ` +
      `stream=${streamCount} -> top-level data={}`
    );

    $done({ body: JSON.stringify(body) });
    return;
  }

  // 非 kuflix_space 的商业视频继续沿用 v1 逻辑，作为第二层保险。
  let changed = 0;

  if (Array.isArray(data.stream) && data.stream.length > 0) {
    data.stream = [];
    changed++;
  }

  if (
    data.video?.stream_types &&
    typeof data.video.stream_types === "object" &&
    Array.isArray(data.video.stream_types.default) &&
    data.video.stream_types.default.length > 0
  ) {
    data.video.stream_types.default = [];
    changed++;
  }

  if (data.preview && typeof data.preview === "object" && !Array.isArray(data.preview)) {
    if (Array.isArray(data.preview.thumb) && data.preview.thumb.length > 0) {
      data.preview.thumb = [];
      changed++;
    }

    if (Array.isArray(data.preview.thumb_hd) && data.preview.thumb_hd.length > 0) {
      data.preview.thumb_hd = [];
      changed++;
    }
  }

  if (changed === 0) {
    console.log(
      `优酷商业化广告: 已命中商业素材但无需修改 title=${title || "unknown"} stream=${streamCount}`
    );
    $done({ body: originalBody });
    return;
  }

  console.log(
    `优酷商业化广告: 非kuflix商业视频已拦截 title=${title || "unknown"} ` +
    `stream=${streamCount}->0 changed=${changed}`
  );

  $done({ body: JSON.stringify(body) });
})();

function buildRequestText(url, body) {
  const parts = [url || "", body || ""];

  // MTop POST body 常为 URL-encoded；最多解码两层用于识别 spmid，失败则保留原值。
  let decoded = body || "";
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, "%20"));
      if (next === decoded) break;
      decoded = next;
      parts.push(decoded);
    } catch (_) {
      break;
    }
  }

  return parts.join("\n");
}
