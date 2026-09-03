// 优酷 UPS 去广告 - 前置广告实验版 + 商业 Banner 稳定处理
// Quantumult X script-response-body
//
// 依据：
// 1) 2026-09-02 youku.har / youku1.har / youku3.har / youku4.har：
//    商业化 Banner 视频可由 owner + title 双条件精确识别，并清空其播放流。
// 2) 2026-09-03 优酷(1).har：
//    正常剧集 UPS 响应的 data.data.ad.seats[].bids[] 直接下发前置广告计划；
//    data.data.ad.BFSTREAM 提供广告备用播放流；vip_tips 属于广告 UI。
//
// 本轮实验：
// - 正常剧集仅清空前置广告 payload：ad.seats=[]、ad.BFSTREAM={}、删除 ad.vip_tips。
// - 不修改正片 data.stream / data.video / 播放权限。
// - 商业 Banner 视频继续沿用已验证的 stream 清空逻辑。
// - JSON 解析失败或结构异常时 fail-open 原样放行。

(() => {
  const originalBody = $response?.body;

  console.log("youku-commercial-v1 pread-test 2026-09-03");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("优酷UPS去广告: 无文本响应体，原样放行");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`优酷UPS去广告: JSON解析失败，原样放行: ${error}`);
    $done({ body: originalBody });
    return;
  }

  const data = body?.data?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("优酷UPS去广告: 未发现 data.data，原样放行");
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

  let changed = 0;

  // ===== 正常剧集 / 视频的 UPS 前置广告 =====
  // 优酷(1).har 已确认：seats[].bids[] 是完整前置广告序列；
  // BFSTREAM 是广告备用流；vip_tips 是广告 UI。
  // 这里不删除整个 ad 对象，保留 reqid / algoBuckets 等外围结构，降低兼容风险。
  const ad = data?.ad;
  if (ad && typeof ad === "object" && !Array.isArray(ad)) {
    const summary = summarizePreAd(ad);
    let preAdChanged = 0;

    if (Array.isArray(ad.seats) && ad.seats.length > 0) {
      ad.seats = [];
      preAdChanged++;
    }

    if (
      ad.BFSTREAM &&
      typeof ad.BFSTREAM === "object" &&
      !Array.isArray(ad.BFSTREAM) &&
      Object.keys(ad.BFSTREAM).length > 0
    ) {
      ad.BFSTREAM = {};
      preAdChanged++;
    }

    if (Object.prototype.hasOwnProperty.call(ad, "vip_tips")) {
      delete ad.vip_tips;
      preAdChanged++;
    }

    if (preAdChanged > 0) {
      changed += preAdChanged;
      console.log(
        `优酷前置广告: 已清理 title=${title || "unknown"} ` +
        `seats=${summary.seatCount}->0 bids=${summary.bidCount}->0 ` +
        `duration=${summary.totalDuration}s changed=${preAdChanged}`
      );
    } else {
      console.log(`优酷前置广告: 无需处理 title=${title || "unknown"}`);
    }
  }

  // ===== 商业化 Banner 子视频 =====
  // 继续保留此前已经实机验证过的精确识别与播放流清空逻辑。
  if (commercialOwner && commercialTitle) {
    let commercialChanged = 0;
    const streamCount = Array.isArray(data.stream) ? data.stream.length : 0;

    if (Array.isArray(data.stream) && data.stream.length > 0) {
      data.stream = [];
      commercialChanged++;
    }

    if (
      data.video?.stream_types &&
      typeof data.video.stream_types === "object" &&
      Array.isArray(data.video.stream_types.default) &&
      data.video.stream_types.default.length > 0
    ) {
      data.video.stream_types.default = [];
      commercialChanged++;
    }

    if (data.preview && typeof data.preview === "object" && !Array.isArray(data.preview)) {
      if (Array.isArray(data.preview.thumb) && data.preview.thumb.length > 0) {
        data.preview.thumb = [];
        commercialChanged++;
      }

      if (Array.isArray(data.preview.thumb_hd) && data.preview.thumb_hd.length > 0) {
        data.preview.thumb_hd = [];
        commercialChanged++;
      }
    }

    changed += commercialChanged;

    if (commercialChanged > 0) {
      console.log(
        `优酷商业化广告: 已拦截 title=${title || "unknown"} ` +
        `stream=${streamCount}->0 changed=${commercialChanged}`
      );
    } else {
      console.log(
        `优酷商业化广告: 已命中商业素材但无需修改 title=${title || "unknown"} stream=${streamCount}`
      );
    }
  } else {
    console.log(`优酷商业化广告: 正常视频 title=${title || "unknown"}`);
  }

  if (changed === 0) {
    $done({ body: originalBody });
    return;
  }

  $done({ body: JSON.stringify(body) });
})();

function summarizePreAd(ad) {
  let seatCount = 0;
  let bidCount = 0;
  let totalDuration = 0;

  if (!Array.isArray(ad?.seats)) {
    return { seatCount, bidCount, totalDuration };
  }

  seatCount = ad.seats.length;

  for (const seat of ad.seats) {
    if (!Array.isArray(seat?.bids)) continue;

    bidCount += seat.bids.length;

    for (const bid of seat.bids) {
      const rawDuration = bid?.ad0?.creative?.video?.duration;
      const duration = Number(rawDuration);
      if (Number.isFinite(duration) && duration > 0) {
        totalDuration += duration;
      }
    }
  }

  return { seatCount, bidCount, totalDuration };
}
