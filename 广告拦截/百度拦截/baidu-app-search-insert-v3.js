// 百度主 App 搜索广告同步插入事件清理实验 - v3
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wise_exposure_intersection-*-chunk.js
//
// 百度搜索4.har 进一步确认：
// - wiseSearchHasAd 对 ps:baikan:adsDomInserted 的监听参数直接执行 reduce()；
// - 每个事件元素都是插入根节点，百度随后使用当前搜索结果 selector 在这些根节点内 find()；
// - v2 猜测 .ec_wise_ad / ec_r_*，没有复用百度当前运行时的真实结果类，因此可能完全匹配不到。
//
// v3：
// - 继续源码级包裹 EventEmitter.prototype.emit；
// - 原百度 emit 完整执行后，在同一个同步调用栈处理 adsDomInserted；
// - 从 ECOM 环境 getValue().resultClass 读取当前真实结果类；
// - 只扫描本次 adsDomInserted payload，不扫描 document；
// - resultClass 不可用时才使用已确认广告属性作 fail-safe fallback。
// - 不使用 MutationObserver / setTimeout。

const TAG = "baidu-app-search-insert-v3";
const SIGNATURE = "__QX_BAIDU_SEARCH_INSERT_V3__";
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

  const patch = `return!0};/* ${SIGNATURE} */var __qxBaiduOriginalEmit=c.prototype.emit;function __qxBaiduHideResult(e){if(!e||1!==e.nodeType||!e.style)return;try{e.setAttribute("data-qx-baidu-search-ad-hidden","insert-v3"),e.style.setProperty("display","none","important"),e.style.setProperty("visibility","hidden","important")}catch(e){}}function __qxBaiduCleanRoot(e,t){if(!e||1!==e.nodeType)return;try{if(t){e.matches&&e.matches(t)&&__qxBaiduHideResult(e);if(e.querySelectorAll)for(var n=e.querySelectorAll(t),r=0;r<n.length;r++)__qxBaiduHideResult(n[r])}else{if(e.matches&&e.matches('.ec_wise_ad,[class^="ec_r_"],[data-cmatchid][data-rank]'))__qxBaiduHideResult(e);if(e.querySelectorAll)for(var i=e.querySelectorAll('.ec_wise_ad,[class^="ec_r_"],[data-cmatchid][data-rank]'),o=0;o<i.length;o++)__qxBaiduHideResult(i[o])}}catch(e){}}function __qxBaiduCleanInserted(e,t,n){if(!e||n>2)return;if(1===e.nodeType)return void __qxBaiduCleanRoot(e,t);if(Array.isArray(e)||"string"!=typeof e&&"number"==typeof e.length){for(var r=0;r<e.length;r++)__qxBaiduCleanInserted(e[r],t,n+1);return}if("object"==typeof e){for(var i=["dom","node","el","element","nodes","elements","list","data"],o=0;o<i.length;o++){var a=i[o];a in e&&__qxBaiduCleanInserted(e[a],t,n+1)}}}c.prototype.emit=function(){var e=arguments[0],t=__qxBaiduOriginalEmit.apply(this,arguments);if("ps:baikan:adsDomInserted"===e)try{var n="",r=f&&f.getInstance?f.getInstance().getValue():null,i=r&&r.resultClass;n=i?"."+i:"";for(var o=1;o<arguments.length;o++)__qxBaiduCleanInserted(arguments[o],n,0)}catch(e){}return t},c.prototype.on=`;

  const body = originalBody.replace(ANCHOR, patch);
  console.log(`[${TAG}] patched prototype-emit anchorCount=1 event=ps:baikan:adsDomInserted selector=resultClass fallback=ad-attrs phase=post-emit observer=0 domscan=0`);
  $done({ body });
})();
