// Baidu main App ad filtering - v1 experimental rewrite
// Quantumult X script-response-body
// Based on the 2026-08-25 HAR:
// 1) afdconf.baidu.com/afd/platform -> ad control switches under data.global
// 2) mbd.baidu.com/searchbox?action=splash&cmd=2010 -> data.mt / data.ukey / final_backup_realtime_info

(() => {
  const url = $request.url;
  const originalBody = $response.body;

  console.log("baidu-app-json-v1 2026-08-25");

  let body;
  try {
    body = JSON.parse(originalBody);
  } catch (error) {
    console.log(`Baidu App v1: JSON parse failed, keeping original response: ${error}`);
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
    console.log(`Baidu App v1: no matching handler, keeping response: ${url}`);
  }

  $done({ body: JSON.stringify(body) });
})();

function handleAfdConfig(obj) {
  const globalConfig = obj?.data?.global;

  if (!globalConfig || typeof globalConfig !== "object" || Array.isArray(globalConfig)) {
    console.log("Baidu App v1 / afd: data.global not found, keeping original response");
    return;
  }

  // v1 disables only the high-level ad control switches confirmed in the HAR.
  // Do not bulk-edit other ad/experiment fields under data.global or modify data.sign.
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
      console.log(`Baidu App v1 / afd: field not found ${key}`);
      continue;
    }

    const oldValue = globalConfig[key];
    const newValue = zeroLike(oldValue);

    if (oldValue !== newValue) {
      globalConfig[key] = newValue;
      changed++;
      console.log(`Baidu App v1 / afd: ${key} ${String(oldValue)} -> ${String(newValue)}`);
    }
  }

  console.log(`Baidu App v1 / afd: changed ${changed} ad-control fields`);
}

function handleSplash(obj) {
  const data = obj?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log("Baidu App v1 / splash: data not found, keeping original response");
    return;
  }

  let changed = 0;

  // In the HAR, the complete live splash-ad object is stored in data.mt.
  // The field is absent in samples with no live splash ad.
  if ("mt" in data) {
    delete data.mt;
    changed++;
    console.log("Baidu App v1 / splash: removed live splash ad data.mt");
  }

  // Samples without a live ad still return ukey, which may be used for local cache
  // or candidate selection, so clear it to prevent fallback.
  if (typeof data.ukey === "string" && data.ukey.length > 0) {
    data.ukey = "";
    changed++;
    console.log("Baidu App v1 / splash: cleared data.ukey");
  }

  // Preserve the field type and only clear possible live fallback content.
  if (
    "final_backup_realtime_info" in data &&
    data.final_backup_realtime_info &&
    typeof data.final_backup_realtime_info === "object" &&
    Object.keys(data.final_backup_realtime_info).length > 0
  ) {
    data.final_backup_realtime_info = {};
    changed++;
    console.log("Baidu App v1 / splash: cleared final_backup_realtime_info");
  }

  console.log(`Baidu App v1 / splash: changed ${changed} splash fields`);
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
