// 百度主 App 搜索广告统一处理
// Quantumult X script-response-body
//
// 目标：
// 1) bundle-*-chunk.js：在 AMD define 之前执行首帧预隐藏，尽量早于模块 factory 调用；
// 2) wiseSearchHasAd-*-chunk.js：复用百度原生 t selector / i[] 做最终精确清理。
//
// 不使用 MutationObserver / setTimeout；不依赖 leads/sourceType/resultClass 推导。

const TAG = "baidu-app-search";
const url = $request?.url || "";
const originalBody = $response?.body;

const PREPAINT_SIGNATURE = "__QX_BAIDU_SEARCH_PREPAINT_TOP_V2__";
const HANDLER_SIGNATURE = "__QX_BAIDU_SEARCH_HANDLER_V2__";

const HELPER_ANCHOR = `function r(e,t){for(var n=0;n<e.length;n++){var r=e[n],i=r.getAttribute("style");r.setAttribute("style",i?"".concat(t).concat(i):t)}}`;
const FORCE_ANCHOR = `wiseForceDisplay:function(e){var t=document.querySelector(".se-baikan-ads"),n=document.querySelector(".ad-hide-place");if(!t||!n){var i=Array.from(document.querySelectorAll(e));t&&(i=i.filter(function(e){return!e.hasAttribute("data-hide-last")}));var o=document.querySelectorAll(".ec_wise_ad"),a=document.querySelectorAll('[class^="ec_r_"]'),s="display:block !important;visibility: visible !important;position: relative;";r(i,s),r(o,s),r(a,s)}},`;
const DYNAMIC_PRE_ANCHOR = `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);$t.forEach`;
const DYNAMIC_POST_ANCHOR = `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)});var o=r.reduce`;

(() => {
  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log(`[${TAG}] no-string-body fail-open`);
    $done({});
    return;
  }

  if (/\/bundle-[^/]+-chunk\.js(?:\?.*)?$/.test(url)) {
    patchBundle(originalBody);
    return;
  }

  if (/\/wiseSearchHasAd-[^/]+-chunk\.js(?:\?.*)?$/.test(url)) {
    patchHandler(originalBody);
    return;
  }

  console.log(`[${TAG}] unmatched-url fail-open`);
  $done({ body: originalBody });
})();

function patchBundle(body) {
  if (body.includes(PREPAINT_SIGNATURE)) {
    console.log(`[${TAG}] prepaint already-patched`);
    $done({ body });
    return;
  }

  const isTarget =
    body.startsWith('define("ecom/amd/bundle-') &&
    body.includes('./wise_exposure_intersection-');

  if (!isTarget) {
    console.log(`[${TAG}] prepaint bundle-shape-mismatch fail-open`);
    $done({ body });
    return;
  }

  const injection =
    `/* ${PREPAINT_SIGNATURE} */` +
    `(function(){try{if("undefined"==typeof document)return;` +
    `var e="__qx_baidu_search_prepaint_top_v2",t=document.getElementById(e);if(t)return;` +
    `t=document.createElement("style"),t.id=e,` +
    `t.textContent='.ec_wise_ad,[class^="ec_r_"],.se-baikan-ads,.c-container:has(.ecfc-tuiguang),.ec-result-inner:has(.ecfc-tuiguang),[data-cmatchid][data-rank]{display:none!important;visibility:hidden!important;}';` +
    `var n=document.head||document.documentElement;n&&n.appendChild(t)}catch(e){}})();`;

  console.log(
    `[${TAG}] prepaint patched phase=top-level target=bundle selectors=confirmed-ad-markers observer=0 timers=0`
  );
  $done({ body: injection + body });
}

function patchHandler(body) {
  if (body.includes(HANDLER_SIGNATURE)) {
    console.log(`[${TAG}] handler already-patched`);
    $done({ body });
    return;
  }

  const helperCount = body.split(HELPER_ANCHOR).length - 1;
  const forceCount = body.split(FORCE_ANCHOR).length - 1;
  const dynamicPreCount = body.split(DYNAMIC_PRE_ANCHOR).length - 1;
  const dynamicPostCount = body.split(DYNAMIC_POST_ANCHOR).length - 1;

  if (helperCount !== 1 || forceCount !== 1 || dynamicPreCount !== 1 || dynamicPostCount !== 1) {
    console.log(
      `[${TAG}] handler anchor-mismatch helper=${helperCount} force=${forceCount} pre=${dynamicPreCount} post=${dynamicPostCount} fail-open`
    );
    $done({ body });
    return;
  }

  const helperPatch =
    `${HELPER_ANCHOR}/* ${HANDLER_SIGNATURE} */` +
    `function __qxBaiduSearchHide(e){if(!e)return;for(var t=0;t<e.length;t++){var n=e[t];if(n&&n.style)try{n.setAttribute("data-qx-baidu-search-ad-hidden","handler-v2"),n.style.setProperty("display","none","important"),n.style.setProperty("visibility","hidden","important")}catch(e){}}}`;

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

  const patched = body
    .replace(HELPER_ANCHOR, helperPatch)
    .replace(FORCE_ANCHOR, forcePatch)
    .replace(DYNAMIC_PRE_ANCHOR, dynamicPrePatch)
    .replace(DYNAMIC_POST_ANCHOR, dynamicPostPatch);

  console.log(
    `[${TAG}] handler patched helper=1 force=1 dynamic-pre=1 dynamic-post=1 initial=t dynamic=i observer=0 timers=0`
  );
  $done({ body: patched });
}
