// 百度主 App 广告拦截 - v1 实验重写
// Quantumult X script-response-body
// 依据 2026-08-25 HAR：
// 1) afdconf.baidu.com/afd/platform -> data.global 广告控制开关
// 2) mbd.baidu.com/searchbox?action=splash&cmd=2010 -> data.mt / data.ukey / final_backup_realtime_info

(() => {
  const url = $request.url;
  const originalBody = $response.body;

  console.log("baidu-app-json-v1 2026-08-25");

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`百度App v1: JSON解析失败，保持原响应: ${error}`);
    $done({ body: originalBody });
    return;
  }

  if (url.includes("afdconf.baidu.com/afd/platform")) {
    handleAfdConfig(body);
  } else if (
    url.includes("mbd.baidu.com/searchbox") &&
    hasQueryParam(url, "action", "splash") &&
    hasQueryParam(url, "cmd", "2010")
  ) {
    handleSplash(body);
  } else {
    console.log(`百度App v1: 未匹配处理器，保持响应: ${url}`);
  }

  $done({ body: JSON.stringify(body) });
})();

function handleAfdConfig(obj) {
  const globalConfig = obj?.data?.global;

  if (!globalConfig || typeof globalConfig !== "object" || Array.isArray(globalConfig)) {
    console.log("百度App v1 / afd: 未发现 data.global，保持原响应");
    return;
  }

  // v1 只关闭 HAR 已确认存在的高层广告控制开关。
  // 暂不批量修改 data.global 中其余广告/实验字段，也不改 data.sign。
  const switches = [
    "ad_control_search_ad_switch",
    "ad_search_flow_request_with_query",
    "ad_control_feed_ab_switch",
    "flow_ad_active_recommendation_request_switch",
    "flow_ad_autoplay_ad_request_switch",
    "flow_ad_coll_insert_ad_update_switch",
    "flow_ad_recommend_parallel_request_switch",
    "flow_ad_req_realtime_eshow_switch",
    "splash_double_check_list_switch"
  ];

  let changed = 0;

  for (const key of switches) {
    if (!(key in globalConfig)) {
      console.log(`百度App v1 / afd: 未发现字段 ${key}`);
      continue;
    }

    const oldValue = globalConfig[key];
    const newValue = zeroLike(oldValue);

    if (oldValue !== newValue) {
      globalConfig[key] = newValue;
      changed++;
      console.log(`百度App v1 / afd: ${key} ${String(oldValue)} -> ${String(newValue)}`);
    }
  }

  console.log(`百度App v1 / afd: 共修改 ${changed} 个广告控制字段`);
}

function handleSplash(obj) {
  const data = obj?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("百度App v1 / splash: 未发现 data，保持原响应");
    return;
  }

  let changed = 0;

  // HAR 中真实实时开屏广告完整对象位于 data.mt；无实时广告样本中该字段不存在。
  if ("mt" in data) {
    delete data.mt;
    changed++;
    console.log("百度App v1 / splash: 已删除实时开屏广告 data.mt");
  }

  // 无实时广告样本仍会返回 ukey，可能用于本地缓存/候选广告选择，因此置空防止回退。
  if (typeof data.ukey === "string" && data.ukey.length > 0) {
    data.ukey = "";
    changed++;
    console.log("百度App v1 / splash: 已清空 data.ukey");
  }

  // 保留字段类型，仅清空可能的实时回退内容。
  if (
    "final_backup_realtime_info" in data &&
    data.final_backup_realtime_info &&
    typeof data.final_backup_realtime_info === "object" &&
    Object.keys(data.final_backup_realtime_info).length > 0
  ) {
    data.final_backup_realtime_info = {};
    changed++;
    console.log("百度App v1 / splash: 已清空 final_backup_realtime_info");
  }

  console.log(`百度App v1 / splash: 共修改 ${changed} 个开屏字段`);
}

function hasQueryParam(url, name, expectedValue) {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return false;

  const query = url.slice(queryIndex + 1).split("#", 1)[0];
  for (const pair of query.split("&")) {
    const equalIndex = pair.indexOf("=");
    const rawName = equalIndex === -1 ? pair : pair.slice(0, equalIndex);
    const rawValue = equalIndex === -1 ? "" : pair.slice(equalIndex + 1);

    if (decodeSafe(rawName) === name && decodeSafe(rawValue) === expectedValue) {
      return true;
    }
  }

  return false;
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch (_) {
    return value;
  }
}

function zeroLike(value) {
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "0";
}
