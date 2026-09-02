// 爱奇艺 App 广告拦截 - v1
// Quantumult X script-response-body
// 依据 2026-09-02 iqiyi.har：
// 1) kjp.cupid.iqiyi.com/mixer / t7z.cupid.iqiyi.com/mixer
//    - 开屏 azt=101（实时 + 未来预缓存）
//    - 巨幕 azt=600、Banner azt=700，以及其它 Cupid 广告槽
//    - 清空 adSlots / bkcrs / futureSlots，保留其它非广告配置字段
// 2) cards.iqiyi.com/views_home/3.0/qy_home
//    - 删除 cards[*].blocks 中 statistics.is_cupid == 1 的广告块
//    - 若某 card 的 blocks 因广告过滤变空，则删除该空 card
//    - 净化 base.statistics.ad_str / ad_str_map 中嵌套的 Cupid JSON
// 3) iface2.iqiyi.com/video_feed/3.0/feed
//    - 删除 data.feeds 中带 ad 对象的广告 Feed
//    - 净化 data.ad.adstr 中嵌套的 Cupid JSON
//
// 设计原则：只修改 HAR 已确认结构；解析失败或结构不匹配时 fail-open 原样放行。

(() => {
  const url = $request?.url || "";
  const originalBody = $response?.body;

  console.log("iqiyi-app-json-v1 2026-09-02");

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("爱奇艺 v1: 无文本响应体，原样放行");
    $done({ body: originalBody });
    return;
  }

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`爱奇艺 v1: JSON 解析失败，原样放行: ${error}`);
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
      console.log(`爱奇艺 v1: 未匹配处理器，原样放行: ${url}`);
    }

    if (!changed) {
      $done({ body: originalBody });
      return;
    }

    $done({ body: JSON.stringify(body) });
  } catch (error) {
    console.log(`爱奇艺 v1: 处理异常，原样放行: ${error}`);
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
      `爱奇艺 v1 / Cupid mixer: ` +
      `adSlots ${result.adSlots}->0, ` +
      `bkcrs ${result.bkcrs}->0, ` +
      `futureSlots ${result.futureSlots}`
    );
  } else {
    console.log("爱奇艺 v1 / Cupid mixer: 未发现需要清理的广告数据");
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

      // 只删除“本次因广告过滤而变空”的 card；原本为空的正常 card 保持不动。
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
    `爱奇艺 v1 / 首页: 删除广告 block=${removedBlocks}, ` +
    `空广告 card=${removedCards}, 净化嵌套 Cupid=${sanitizedEmbedded}`
  );

  return changed;
}

function handleVideoFeed(obj) {
  let changed = false;
  let removedFeeds = 0;
  let sanitizedEmbedded = 0;

  const data = obj?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("爱奇艺 v1 / video_feed: 未发现 data，原样放行");
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
    `爱奇艺 v1 / video_feed: 删除广告 Feed=${removedFeeds}, ` +
    `净化嵌套 Cupid=${sanitizedEmbedded}`
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
    console.log(`爱奇艺 v1: 嵌套 Cupid JSON 解析失败，保持原值: ${error}`);
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

  // HAR 中 futureSlots 同时出现过 object 和 array，必须保持原类型。
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
