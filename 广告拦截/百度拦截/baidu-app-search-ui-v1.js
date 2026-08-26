// 百度主 App 搜索广告 UI 清理实验 - v1
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wiseSearchHasAd-*-chunk.js
//
// 百度搜索3.har 已确认该前端模块使用：
// - .ecfc-tuiguang 作为商业推广标志
// - .c-container / .ec-result-inner 作为结果卡容器
// - .ec_wise_ad 作为广告结果相关节点
//
// 本脚本不改百度搜索数据，只在该 JS chunk 末尾注入一个最小 DOM 清理器：
// 发现 .ecfc-tuiguang 后向上寻找确认过的结果卡容器并隐藏整卡；
// MutationObserver 用于处理下拉加载/异步插入的后续广告卡。

const TAG = "baidu-app-search-ui-v1";
const SIGNATURE = "__QX_BAIDU_SEARCH_UI_V1__";

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

  const injection = `\n;/* ${SIGNATURE} */\n(function(){\n  try {\n    if (window.__qxBaiduSearchUiV1) return;\n    window.__qxBaiduSearchUiV1 = true;\n\n    var markerSelector = '.ecfc-tuiguang';\n    var cardSelectors = ['.c-container', '.ec-result-inner', '.ec_wise_ad'];\n    var scheduled = false;\n\n    function hideByMarker(marker) {\n      if (!marker || !marker.closest) return false;\n      for (var i = 0; i < cardSelectors.length; i++) {\n        var card = marker.closest(cardSelectors[i]);\n        if (card) {\n          card.setAttribute('data-qx-baidu-search-ad-hidden', '1');\n          card.style.setProperty('display', 'none', 'important');\n          card.style.setProperty('visibility', 'hidden', 'important');\n          return true;\n        }\n      }\n      return false;\n    }\n\n    function clean(root) {\n      var scope = root && root.querySelectorAll ? root : document;\n      if (root && root.matches && root.matches(markerSelector)) hideByMarker(root);\n      var markers = scope.querySelectorAll ? scope.querySelectorAll(markerSelector) : [];\n      for (var i = 0; i < markers.length; i++) hideByMarker(markers[i]);\n    }\n\n    function scheduleClean() {\n      if (scheduled) return;\n      scheduled = true;\n      setTimeout(function(){\n        scheduled = false;\n        clean(document);\n      }, 0);\n    }\n\n    function start() {\n      clean(document);\n      var target = document.documentElement || document.body;\n      if (!target) {\n        setTimeout(start, 50);\n        return;\n      }\n      var observer = new MutationObserver(scheduleClean);\n      observer.observe(target, { childList: true, subtree: true });\n    }\n\n    if (document.readyState === 'loading') {\n      document.addEventListener('DOMContentLoaded', start, { once: true });\n    } else {\n      start();\n    }\n  } catch (e) {\n    try { console.debug('[QX Baidu Search UI v1] fail-open', e); } catch (_) {}\n  }\n})();\n`;

  console.log(`[${TAG}] injected marker=.ecfc-tuiguang parent=.c-container/.ec-result-inner/.ec_wise_ad`);
  $done({ body: originalBody + injection });
})();
