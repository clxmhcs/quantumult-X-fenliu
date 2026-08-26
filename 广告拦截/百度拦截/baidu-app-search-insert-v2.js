// 百度主 App 搜索广告同步插入事件清理实验 - v2
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wise_exposure_intersection-*-chunk.js
//
// 百度搜索3.har 已确认：
// - EventEmitter 的真实实现位于该 chunk 内；
// - eventEmitterInstance 由 getInstance() 延迟创建，并非 chunk 注册时立即存在；
// - 原 emit() 为同步调用；
// - wiseSearchHasAd 监听 ps:baikan:adsDomInserted。
//
// v2 不再在 chunk 末尾寻找 window.ecom.wise.eventEmitterInstance，
// 而是直接在 EventEmitter.prototype.emit 源码定义完成后包裹原 emit。
// 因而后续才创建的 eventEmitterInstance 也会天然使用该 wrapper。
//
// wrapper 顺序：
// 原百度 emit（完整执行所有监听器） -> 同步清理本次 adsDomInserted payload -> 返回原结果。
// 不使用 MutationObserver / setTimeout / document 全局扫描。

const TAG = "baidu-app-search-insert-v2";
const SIGNATURE = "__QX_BAIDU_SEARCH_INSERT_V2__";
const ANCHOR = "return!0},c.prototype.on=";

(() => {
  const originalBody = $response?.body;

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log(`[${TAG}] no-string-body fail-open`);
    $done({});
    return;
  }

  if (originalBody.includes(SIGNATURE)) {
    console.log(`[${TAG}] already-patched`);
    $done({ body: originalBody });
    return;
  }

  const anchorCount = originalBody.split(ANCHOR).length - 1;
  if (anchorCount !== 1) {
    console.log(`[${TAG}] anchor-mismatch count=${anchorCount} fail-open`);
    $done({ body: originalBody });
    return;
  }

  const patch = `return!0};/* ${SIGNATURE} */var __qxBaiduOriginalEmit=c.prototype.emit;function __qxBaiduHideNode(e){if(!e||1!==e.nodeType||!e.style)return;try{e.setAttribute("data-qx-baidu-search-ad-hidden","insert-v2"),e.style.setProperty("display","none","important"),e.style.setProperty("visibility","hidden","important")}catch(e){}}function __qxBaiduHideMarkerCard(e){if(!e||!e.closest)return;var t=e.closest(".c-container")||e.closest(".ec-result-inner")||e.closest(".ec_wise_ad")||e.closest('[class^="ec_r_"]');t&&__qxBaiduHideNode(t)}function __qxBaiduCleanElement(e){if(!e||1!==e.nodeType)return;try{e.matches&&e.matches('.ec_wise_ad,[class^="ec_r_"]')&&__qxBaiduHideNode(e),e.matches&&e.matches(".ecfc-tuiguang")&&__qxBaiduHideMarkerCard(e);if(e.querySelectorAll){for(var t=e.querySelectorAll('.ec_wise_ad,[class^="ec_r_"]'),n=0;n<t.length;n++)__qxBaiduHideNode(t[n]);for(var r=e.querySelectorAll(".ecfc-tuiguang"),i=0;i<r.length;i++)__qxBaiduHideMarkerCard(r[i])}}catch(e){}}function __qxBaiduCleanPayload(e,t){if(!e||t>2)return;if(1===e.nodeType)return void __qxBaiduCleanElement(e);if(Array.isArray(e)||"string"!=typeof e&&"number"==typeof e.length){for(var n=0;n<e.length;n++)__qxBaiduCleanPayload(e[n],t+1);return}if("object"==typeof e){for(var r=["dom","node","el","element","nodes","elements","list","data"],i=0;i<r.length;i++){var o=r[i];o in e&&__qxBaiduCleanPayload(e[o],t+1)}}}c.prototype.emit=function(){var e=arguments[0],t=__qxBaiduOriginalEmit.apply(this,arguments);if("ps:baikan:adsDomInserted"===e)try{for(var n=1;n<arguments.length;n++)__qxBaiduCleanPayload(arguments[n],0)}catch(e){}return t},c.prototype.on=`;

  const body = originalBody.replace(ANCHOR, patch);
  console.log(`[${TAG}] patched prototype-emit anchorCount=1 event=ps:baikan:adsDomInserted phase=post-emit observer=0 domscan=0`);
  $done({ body });
})();
