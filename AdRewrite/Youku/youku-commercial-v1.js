// Youku UPS ad filtering - pre-roll ads + commercial Banner handling
// Quantumult X script-response-body
//
// Evidence:
// 1) 2026-09-02 youku.har / youku1.har / youku3.har / youku4.har:
//    Commercial Banner videos can be identified precisely by the owner + title pair,
//    then their playback streams can be cleared.
// 2) 2026-09-03 Youku(1).har:
//    data.data.ad.seats[].bids[] in a normal episode UPS response directly carries
//    the complete pre-roll ad plan; data.data.ad.BFSTREAM provides fallback ad streams,
//    and vip_tips belongs to the ad UI.
//
// Stable behavior:
// - For normal episodes/videos, clear only the pre-roll ad payload:
//   ad.seats=[], ad.BFSTREAM={}, and remove ad.vip_tips.
// - Do not modify main-content data.stream / data.video / playback permissions.
// - Keep the verified stream-clearing logic for commercial Banner videos.
// - Fail open and return the original response on JSON parse or structure errors.

(() => {
  const originalBody = $response?.body;

  console.log("youku-commercial-v1 pread-test 2026-09-03");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("Youku UPS ad filter: no text response body, passing through unchanged");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`Youku UPS ad filter: JSON parse failed, passing through unchanged: ${error}`);
    $done({ body: originalBody });
    return;
  }

  const data = body?.data?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("Youku UPS ad filter: data.data not found, passing through unchanged");
    $done({ body: originalBody });
    return;
  }

  const videoUsername = data?.video?.username;
  const uploaderUsername = data?.uploader?.username;
  const title = data?.video?.title;

  // These two literals are exact server payload values. Do not translate them.
  const commercialOwner =
    videoUsername === "商业化页面banner素材专用" ||
    uploaderUsername === "商业化页面banner素材专用";

  const commercialTitle =
    typeof title === "string" &&
    title.startsWith("创意中心-");

  let changed = 0;

  // ===== UPS pre-roll ads for normal episodes/videos =====
  // Youku(1).har confirmed that seats[].bids[] is the complete pre-roll ad sequence,
  // BFSTREAM is the fallback ad stream, and vip_tips is ad UI metadata.
  // Keep the outer ad object and fields such as reqid / algoBuckets to reduce
  // compatibility risk.
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
        `Youku pre-roll ads: cleaned title=${title || "unknown"} ` +
        `seats=${summary.seatCount}->0 bids=${summary.bidCount}->0 ` +
        `duration=${summary.totalDuration}s changed=${preAdChanged}`
      );
    } else {
      console.log(`Youku pre-roll ads: no changes needed title=${title || "unknown"}`);
    }
  }

  // ===== Commercial Banner sub-video =====
  // Keep the previously verified exact matching and playback-stream clearing logic.
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
        `Youku commercial ad: blocked title=${title || "unknown"} ` +
        `stream=${streamCount}->0 changed=${commercialChanged}`
      );
    } else {
      console.log(
        `Youku commercial ad: commercial asset matched but no changes needed ` +
        `title=${title || "unknown"} stream=${streamCount}`
      );
    }
  } else {
    console.log(`Youku commercial ad: normal video title=${title || "unknown"}`);
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
