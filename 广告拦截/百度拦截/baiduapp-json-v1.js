const url = $request.url;
const notifyTitle = "百度App广告拦截-v1";
console.log("baiduapp-json-v1 2026-08-25");

let body;
try {
  body = JSON.parse($response.body);
} catch (e) {
  console.log(`JSON解析失败: ${e}`);
  $done({ body: $response.body });
}

if (url.includes("afdconf.baidu.com/afd/platform")) {
  handleAfdConfig(body);
} else if (url.includes("mbd.baidu.com/searchbox") && url.includes("action=splash") && url.includes("cmd=2010")) {
  handleSplash(body);
} else {
  console.log(`未匹配路径: ${url}`);
}

$done({ body: JSON.stringify(body) });

function handleAfdConfig(obj) {
  const global = obj?.data?.global;
  if (!global || typeof global !== "object") {
    console.log("afd/platform: 未发现 data.global，保持原响应");
    return;
  }

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
    if (!(key in global)) {
      console.log(`afd/platform: 未发现字段 ${key}`);
      continue;
    }

    const oldValue = global[key];
    const newValue = zeroLike(oldValue);
    if (oldValue !== newValue) {
      global[key] = newValue;
      changed++;
      console.log(`afd/platform: ${key} ${String(oldValue)} -> ${String(newValue)}`);
    }
  }

  console.log(`afd/platform: 共修改 ${changed} 个广告控制字段`);
}

function handleSplash(obj) {
  const data = obj?.data;
  if (!data || typeof data !== "object") {
    console.log("splash: 未发现 data，保持原响应");
    return;
  }

  let changed = 0;

  if ("mt" in data && data.mt != null) {
    data.mt = null;
    changed++;
    console.log("splash: 已清空实时开屏广告 data.mt");
  }

  if ("ukey" in data && data.ukey) {
    data.ukey = "";
    changed++;
    console.log("splash: 已清空 data.ukey");
  }

  if ("final_backup_realtime_info" in data && data.final_backup_realtime_info) {
    data.final_backup_realtime_info = {};
    changed++;
    console.log("splash: 已清空 final_backup_realtime_info");
  }

  console.log(`splash: 共修改 ${changed} 个开屏字段`);
}

function zeroLike(value) {
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "0";
}
