// iQIYI App ad filtering - v1
// Quantumult X script-response-body
// Based on 2026-09-02 iqiyi.har:
// 1) kjp.cupid.iqiyi.com/mixer / t7z.cupid.iqiyi.com/mixer
//    - Splash ads azt=101 (real-time + future pre-cache)
//    - Masthead azt=600, Banner azt=700, and other Cupid ad slots
//    - Clear adSlots / bkcrs / futureSlots while preserving other non-ad configuration fields
// 2) cards.iqiyi.com/views_home/3.0/qy_home
//    - Remove ad blocks from cards[*].blocks where statistics.is_cupid == 1
//    - If a card becomes empty because of ad filtering, remove that empty card
//    - Sanitize nested Cupid JSON in base.statistics.ad_str / ad_str_map
// 3) iface2.iqiyi.com/video_feed/3.0/feed
//    - Remove ad feeds from data.feeds when an ad object is present
//    - Sanitize nested Cupid JSON in data.ad.adstr
//
// Design principle: modify only structures confirmed in the HAR; fail open and return
// the original response when parsing fails or the expected structure does not match.

(() => {
  const url = $request?.url || "";
  const originalBody = $response?.body;

  console.log("iqiyi-app-json-v1 2026-09-02");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("iQIYI v1: no text response body, passing through unchanged");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`iQIYI v1: JSON parse failed, passing through unchanged: ${error}`);
    $done({ body: originalBody });
    return;
  }

  try {
    let changed = false;

    if (isCupidMixer(url)) {
      changed = handleCupidMixer(body);
    } else if (url.includes("cards.iqiyi.com/views_home/3.0/qy_home")) {
      changed = handleHome(body);
    } else if (url.includes("iface2.iqiyi.com/video_feed/3.0/feed")) {
      changed = handleVideoFeed(body);
    } else {
      console.log(`iQIYI v1: no matching handler, passing through unchanged: ${url}`);
    }

    if (!changed) {
      $done({ body: originalBody });
      return;
    }

    $done({ body: JSON.stringify(body) });
  } catch (error) {
    console.log(`iQIYI v1: processing error, passing through unchanged: ${error}`);
    $done({ body: originalBody });
  }
})();

function isCupidMixer(url) {
  return /^https?:\/\/(?:kjp|t7z)\.cupid\.iqiyi\.com\/mixer(?:\?|$)/i.test(url);
}

function handleCupidMixer(obj) {
  const result = sanitizeCupidObject(obj);

  if (result.changed) {
    console.log(
      `iQIYI v1 / Cupid mixer: ` +
      `adSlots ${result.adSlots}->0, ` +
      `bkcrs ${result.bkcrs}->0, ` +
      `futureSlots ${result.futureSlots}`
    );
  } else {
    console.log("iQIYI v1 / Cupid mixer: no ad data needs cleanup");
  }

  return result.changed;
}

function handleHome(obj) {
  let changed = false;
  let removedBlocks = 0;
  let removedCards = 0;
  let sanitizedEmbedded = 0;

  if (Array.isArray(obj?.cards)) {
    const newCards = [];

    for (const card of obj.cards) {
      if (!card || typeof card !== "object" || !Array.isArray(card.blocks)) {
        newCards.push(card);
        continue;
      }

      const before = card.blocks.length;
      const filtered = card.blocks.filter(block => !isCupidAdBlock(block));
      const removed = before - filtered.length;

      if (removed > 0) {
        removedBlocks += removed;
        changed = true;
        card.blocks = filtered;
      }

      // Remove only cards that became empty because of this ad filtering pass.
      // Cards that were already empty are preserved unchanged.
      if (removed > 0 && before > 0 && filtered.length === 0) {
        removedCards++;
        continue;
      }

      newCards.push(card);
    }

    if (removedCards > 0) {
      obj.cards = newCards;
    }
  }

  const statistics = obj?.base?.statistics;
  if (statistics && typeof statistics === "object" && !Array.isArray(statistics)) {
    if (typeof statistics.ad_str === "string" && statistics.ad_str.length > 0) {
      const result = sanitizeCupidString(statistics.ad_str);
      if (result.changed) {
        statistics.ad_str = result.value;
        sanitizedEmbedded++;
        changed = true;
      }
    }

    if (
      statistics.ad_str_map &&
      typeof statistics.ad_str_map === "object" &&
      !Array.isArray(statistics.ad_str_map)
    ) {
      for (const key of Object.keys(statistics.ad_str_map)) {
        const value = statistics.ad_str_map[key];
        if (typeof value !== "string" || value.length === 0) continue;

        const result = sanitizeCupidString(value);
        if (result.changed) {
          statistics.ad_str_map[key] = result.value;
          sanitizedEmbedded++;
          changed = true;
        }
      }
    }
  }

  console.log(
    `iQIYI v1 / home: removed ad blocks=${removedBlocks}, ` +
    `empty ad cards=${removedCards}, sanitized nested Cupid=${sanitizedEmbedded}`
  );

  return changed;
}

function handleVideoFeed(obj) {
  let changed = false;
  let removedFeeds = 0;
  let sanitizedEmbedded = 0;

  const data = obj?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("iQIYI v1 / video_feed: data not found, passing through unchanged");
    return false;
  }

  if (Array.isArray(data.feeds)) {
    const before = data.feeds.length;
    data.feeds = data.feeds.filter(item => !isVideoFeedAd(item));
    removedFeeds = before - data.feeds.length;

    if (removedFeeds > 0) {
      changed = true;
    }
  }

  if (
    data.ad &&
    typeof data.ad === "object" &&
    !Array.isArray(data.ad) &&
    typeof data.ad.adstr === "string" &&
    data.ad.adstr.length > 0
  ) {
    const result = sanitizeCupidString(data.ad.adstr);
    if (result.changed) {
      data.ad.adstr = result.value;
      sanitizedEmbedded++;
      changed = true;
    }
  }

  console.log(
    `iQIYI v1 / video_feed: removed ad feeds=${removedFeeds}, ` +
    `sanitized nested Cupid=${sanitizedEmbedded}`
  );

  return changed;
}

function isCupidAdBlock(block) {
  if (!block || typeof block !== "object") return false;
  const value = block?.statistics?.is_cupid;
  return String(value) === "1";
}

function isVideoFeedAd(item) {
  return Boolean(
    item &&
    typeof item === "object" &&
    item.ad &&
    typeof item.ad === "object" &&
    !Array.isArray(item.ad)
  );
}

function sanitizeCupidString(value) {
  try {
    const parsed = JSON.parse(value);
    const result = sanitizeCupidObject(parsed);

    return {
      changed: result.changed,
      value: result.changed ? JSON.stringify(parsed) : value
    };
  } catch (error) {
    console.log(`iQIYI v1: nested Cupid JSON parse failed, keeping original value: ${error}`);
    return { changed: false, value };
  }
}

function sanitizeCupidObject(obj) {
  const result = {
    changed: false,
    adSlots: 0,
    bkcrs: 0,
    futureSlots: "unchanged"
  };

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return result;
  }

  if (Array.isArray(obj.adSlots)) {
    result.adSlots = obj.adSlots.length;
    if (obj.adSlots.length > 0) {
      obj.adSlots = [];
      result.changed = true;
    }
  }

  if (Array.isArray(obj.bkcrs)) {
    result.bkcrs = obj.bkcrs.length;
    if (obj.bkcrs.length > 0) {
      obj.bkcrs = [];
      result.changed = true;
    }
  }

  // futureSlots appeared as both object and array in the HAR, so preserve its original type.
  if (Array.isArray(obj.futureSlots)) {
    const before = obj.futureSlots.length;
    result.futureSlots = `array:${before}->0`;
    if (before > 0) {
      obj.futureSlots = [];
      result.changed = true;
    }
  } else if (
    obj.futureSlots &&
    typeof obj.futureSlots === "object"
  ) {
    const before = Object.keys(obj.futureSlots).length;
    result.futureSlots = `object:${before}->0`;
    if (before > 0) {
      obj.futureSlots = {};
      result.changed = true;
    }
  }

  return result;
}
