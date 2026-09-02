// 优酷商业化 Banner 去广告 - v1
// Quantumult X script-response-body
//
// 依据 2026-09-02 的 youku.har / youku1.har：
// un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1
//
// 已确认商业化视频同时满足：
// 1) data.data.video.username 或 data.data.uploader.username == "商业化页面banner素材专用"
// 2) data.data.video.title 以 "创意中心-" 开头
//
// 仅在两个条件同时满足时清空播放流；普通视频原样放行。
// JSON 解析失败、结构变化或条件不完整时均 fail-open 原样放行。

(() => {
  const originalBody = $response?.body;

  console.log("youku-commercial-v1 2026-09-02");

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

  let changed = 0;
  const streamCount = Array.isArray(data.stream) ? data.stream.length : 0;

  // 清空真正承载 m3u8 / 分片播放地址的播放流。
  if (Array.isArray(data.stream) && data.stream.length > 0) {
    data.stream = [];
    changed++;
  }

  // 同步清空播放器声明的默认可用清晰度，避免继续按旧 stream_type 选择播放源。
  if (
    data.video?.stream_types &&
    typeof data.video.stream_types === "object" &&
    Array.isArray(data.video.stream_types.default) &&
    data.video.stream_types.default.length > 0
  ) {
    data.video.stream_types.default = [];
    changed++;
  }

  // 清除播放器响应中的视频预览图；页面商业封面另由 Advertising-2.list
  // 对 youku-crm-product.youku.com/creative-center/ 做精确 REJECT。
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
    `优酷商业化广告: 已拦截 title=${title || "unknown"} stream=${streamCount}->0 changed=${changed}`
  );

  $done({ body: JSON.stringify(body) });
})();
