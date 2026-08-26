// 百度主 App 搜索广告同步插入事件清理实验 - v1
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wise_exposure_intersection-*-chunk.js
//
// 已确认链路：
// 1) wise_exposure_intersection 暴露 window.ecom.wise.eventEmitterInstance；
// 2) wiseSearchHasAd 监听 ps:baikan:adsDomInserted；
// 3) 该事件在广告 DOM 已插入后同步触发；
// 4) 原 emit 为同步调用监听器，因此本脚本在原 emit 返回后立即清理本次 insertedNodes，
//    理论上仍处于同一 JS 调用栈，可避开 MutationObserver 的下一轮回调闪现。
//
// 本脚本不扫描整个 document，不使用 MutationObserver / setTimeout，
// 只处理 ps:baikan:adsDomInserted 本次事件携带的节点。

const TAG = "baidu-app-search-insert-v1";
const SIGNATURE = "__QX_BAIDU_SEARCH_INSERT_V1__";

(() => {
  const originalBody = $response?.body;

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log(`[${TAG}] no-string-body fail-open`);
    $done({});
    return;
  }

  if (originalBody.includes(SIGNATURE)) {
    console.log(`[${TAG}] already-injected`);
    $done({ body: originalBody });
    return;
  }

  const injection = `\n;/* ${SIGNATURE} */\n(function(){\n  try {\n    var EVENT = 'ps:baikan:adsDomInserted';\n    var bus = window.ecom && window.ecom.wise && window.ecom.wise.eventEmitterInstance;\n    if (!bus || typeof bus.emit !== 'function' || bus.__qxBaiduSearchInsertV1) return;\n\n    var originalEmit = bus.emit;\n    bus.__qxBaiduSearchInsertV1 = true;\n\n    function hideNode(node) {\n      if (!node || node.nodeType !== 1 || !node.style) return;\n      try {\n        node.setAttribute('data-qx-baidu-search-ad-hidden', 'insert-v1');\n        node.style.setProperty('display', 'none', 'important');\n        node.style.setProperty('visibility', 'hidden', 'important');\n      } catch (_) {}\n    }\n\n    function hideMarkerCard(marker) {\n      if (!marker || !marker.closest) return;\n      var card = marker.closest('.c-container') ||\n                 marker.closest('.ec-result-inner') ||\n                 marker.closest('.ec_wise_ad') ||\n                 marker.closest('[class^="ec_r_"]');\n      if (card) hideNode(card);\n    }\n\n    function cleanElement(root) {\n      if (!root || root.nodeType !== 1) return;\n\n      try {\n        if (root.matches && root.matches('.ec_wise_ad,[class^="ec_r_"]')) hideNode(root);\n        if (root.matches && root.matches('.ecfc-tuiguang')) hideMarkerCard(root);\n\n        if (root.querySelectorAll) {\n          var ads = root.querySelectorAll('.ec_wise_ad,[class^="ec_r_"]');\n          for (var i = 0; i < ads.length; i++) hideNode(ads[i]);\n\n          var markers = root.querySelectorAll('.ecfc-tuiguang');\n          for (var j = 0; j < markers.length; j++) hideMarkerCard(markers[j]);\n        }\n      } catch (_) {}\n    }\n\n    function cleanPayload(payload) {\n      if (!payload) return;\n\n      if (payload.nodeType === 1) {\n        cleanElement(payload);\n        return;\n      }\n\n      if (Array.isArray(payload) || (typeof payload.length === 'number' && typeof payload !== 'string')) {\n        for (var i = 0; i < payload.length; i++) cleanElement(payload[i]);\n      }\n    }\n\n    bus.emit = function(){\n      var eventName = arguments[0];\n      var result = originalEmit.apply(this, arguments);\n\n      if (eventName === EVENT) {\n        for (var i = 1; i < arguments.length; i++) cleanPayload(arguments[i]);\n      }\n\n      return result;\n    };\n  } catch (e) {\n    try { console.debug('[QX Baidu Search Insert v1] fail-open', e); } catch (_) {}\n  }\n})();\n`;

  console.log(`[${TAG}] injected event=ps:baikan:adsDomInserted phase=post-emit observer=0 domscan=0`);
  $done({ body: originalBody + injection });
})();
