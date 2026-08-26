// 百度主 App 搜索广告 UI 清理实验 - v2
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wiseSearchHasAd-*-chunk.js
//
// v2 相比 v1：
// 1) 不再使用 MutationObserver / setTimeout / 全页面重复扫描；
// 2) 精确修改百度 wiseForceDisplay 的移动端强制展示样式；
// 3) 在原始 chunk 之前同步注入一次性 CSS，尽量避免广告卡先显示再消失；
// 4) CSS 自动作用于后续异步插入节点，无需 JS 持续扫描 DOM。

const TAG = "baidu-app-search-ui-v2";
const SIGNATURE = "__QX_BAIDU_SEARCH_UI_V2__";
const FORCE_SHOW = "display:block !important;visibility: visible !important;position: relative;";
const FORCE_HIDE = "display:none !important;visibility:hidden !important;position:relative;";

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

  const anchorCount = originalBody.split(FORCE_SHOW).length - 1;
  let body = originalBody;

  // HAR 已确认 wiseForceDisplay 中该字符串为移动端广告强制展示样式。
  // String.replace 只修改第一处；若百度后续改版导致锚点消失，则保留原 JS，仅使用 CSS 保险层。
  if (anchorCount > 0) {
    body = body.replace(FORCE_SHOW, FORCE_HIDE);
  }

  const bootstrap = `;/* ${SIGNATURE} */\n(function(){\n  try {\n    if (window.__qxBaiduSearchUiV2) return;\n    window.__qxBaiduSearchUiV2 = true;\n\n    var STYLE_ID = 'qx-baidu-search-ui-v2-style';\n    if (document.getElementById(STYLE_ID)) return;\n\n    var style = document.createElement('style');\n    style.id = STYLE_ID;\n    style.textContent = '.ec_wise_ad,.c-container:has(.ecfc-tuiguang),.ec-result-inner:has(.ecfc-tuiguang){display:none!important;visibility:hidden!important;}';\n\n    try {\n      var nonceNode = document.currentScript || document.querySelector('script[nonce]');\n      var nonce = nonceNode && (nonceNode.nonce || nonceNode.getAttribute('nonce'));\n      if (nonce) style.setAttribute('nonce', nonce);\n    } catch (_) {}\n\n    (document.head || document.documentElement).appendChild(style);\n  } catch (e) {\n    try { console.debug('[QX Baidu Search UI v2] css fail-open', e); } catch (_) {}\n  }\n})();\n`;

  console.log(`[${TAG}] patched wiseForceDisplay=${anchorCount > 0 ? 1 : 0} anchorCount=${anchorCount} css=1 observer=0`);
  $done({ body: bootstrap + body });
})();
