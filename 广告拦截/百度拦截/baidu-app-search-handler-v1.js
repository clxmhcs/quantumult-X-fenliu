// 百度主 App 搜索广告原生处理器清理实验 - handler v1
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wiseSearchHasAd-*-chunk.js
//
// 百度搜索广告.har 确认：
// 1) 首屏广告 DOM 可在 wiseSearchHasAd 初始化前已存在；
// 2) $g(t,r) 会调用 o.wiseForceDisplay(t)，直接 document.querySelectorAll(t)
//    并将结果强制 display:block / visibility:visible；
// 3) $o.init(t,r) 只负责后续 ps:baikan:adsDomInserted；
// 4) 其监听器已自行把事件根节点 reduce 成 i[] = $(node).find(t)。
// 
// 本实验直接复用百度自己的真实 t / i[]：
// - 初始化：把 wiseForceDisplay 改为隐藏 t / .ec_wise_ad / ec_r_*；
// - 动态：在百度原处理器前后都隐藏其已计算出的 i[]；
// - 不使用 MutationObserver / setTimeout；不猜 resultClass；不扫描无关 selector。

const TAG = "baidu-app-search-handler-v1";
const SIGNATURE = "__QX_BAIDU_SEARCH_HANDLER_V1__";

const HELPER_ANCHOR = `function r(e,t){for(var n=0;n<e.length;n++){var r=e[n],i=r.getAttribute("style");r.setAttribute("style",i?"".concat(t).concat(i):t)}}`;

const FORCE_ANCHOR = `wiseForceDisplay:function(e){var t=document.querySelector(".se-baikan-ads"),n=document.querySelector(".ad-hide-place");if(!t||!n){var i=Array.from(document.querySelectorAll(e));t&&(i=i.filter(function(e){return!e.hasAttribute("data-hide-last")}));var o=document.querySelectorAll(".ec_wise_ad"),a=document.querySelectorAll('[class^="ec_r_"]'),s="display:block !important;visibility: visible !important;position: relative;";r(i,s),r(o,s),r(a,s)}},`;

const DYNAMIC_PRE_ANCHOR = `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);$t.forEach`;

const DYNAMIC_POST_ANCHOR = `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)});var o=r.reduce`;

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

  const helperCount = originalBody.split(HELPER_ANCHOR).length - 1;
  const forceCount = originalBody.split(FORCE_ANCHOR).length - 1;
  const dynamicPreCount = originalBody.split(DYNAMIC_PRE_ANCHOR).length - 1;
  const dynamicPostCount = originalBody.split(DYNAMIC_POST_ANCHOR).length - 1;

  if (helperCount !== 1 || forceCount !== 1 || dynamicPreCount !== 1 || dynamicPostCount !== 1) {
    console.log(
      `[${TAG}] anchor-mismatch helper=${helperCount} force=${forceCount} pre=${dynamicPreCount} post=${dynamicPostCount} fail-open`
    );
    $done({ body: originalBody });
    return;
  }

  const helperPatch =
    `${HELPER_ANCHOR}/* ${SIGNATURE} */` +
    `function __qxBaiduSearchHide(e){if(!e)return;for(var t=0;t<e.length;t++){var n=e[t];if(n&&n.style)try{n.setAttribute("data-qx-baidu-search-ad-hidden","handler-v1"),n.style.setProperty("display","none","important"),n.style.setProperty("visibility","hidden","important")}catch(e){}}}`;

  const forcePatch =
    `wiseForceDisplay:function(e){var t=[];try{t=Array.from(document.querySelectorAll(e))}catch(e){}` +
    `var n=document.querySelectorAll(".ec_wise_ad"),r=document.querySelectorAll('[class^="ec_r_"]');` +
    `__qxBaiduSearchHide(t),__qxBaiduSearchHide(n),__qxBaiduSearchHide(r)},`;

  const dynamicPrePatch =
    `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);` +
    `__qxBaiduSearchHide(i),$t.forEach`;

  const dynamicPostPatch =
    `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)}),` +
    `__qxBaiduSearchHide(i);var o=r.reduce`;

  let body = originalBody
    .replace(HELPER_ANCHOR, helperPatch)
    .replace(FORCE_ANCHOR, forcePatch)
    .replace(DYNAMIC_PRE_ANCHOR, dynamicPrePatch)
    .replace(DYNAMIC_POST_ANCHOR, dynamicPostPatch);

  console.log(
    `[${TAG}] patched helper=1 wiseForceDisplay=1 dynamic-pre=1 dynamic-post=1 initial=t dynamic=i observer=0 timers=0`
  );

  $done({ body });
})();
