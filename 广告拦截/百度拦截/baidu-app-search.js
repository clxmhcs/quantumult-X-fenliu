// 百度主 App 搜索广告最终清理 + 运行时诊断
// Quantumult X script-response-body / script-request-header
//
// 目标响应：wiseSearchHasAd-*-chunk.js
// 诊断请求：m.baidu.com/__qx_baidu_search_diag
//
// 实机已经确认：该处理器能够最终隐藏搜索广告卡，但 ECOM 层无法早于首帧绘制。
// 因此这里只保留已经验证有效的最终清理，并增加不改变过滤条件的运行时诊断。
// 诊断 beacon 只发往同源 m.baidu.com/__qx_baidu_search_diag，并由 QX 本地 204 截获，不发送到百度服务器。
// 不使用 MutationObserver / setTimeout；不依赖 leads/sourceType/resultClass 推导。

const TAG = "baidu-app-search";
const SIGNATURE = "__QX_BAIDU_SEARCH_HANDLER_V2__";
const DIAG_PATH = "/__qx_baidu_search_diag";

const HELPER_ANCHOR = `function r(e,t){for(var n=0;n<e.length;n++){var r=e[n],i=r.getAttribute("style");r.setAttribute("style",i?"".concat(t).concat(i):t)}}`;
const FORCE_ANCHOR = `wiseForceDisplay:function(e){var t=document.querySelector(".se-baikan-ads"),n=document.querySelector(".ad-hide-place");if(!t||!n){var i=Array.from(document.querySelectorAll(e));t&&(i=i.filter(function(e){return!e.hasAttribute("data-hide-last")}));var o=document.querySelectorAll(".ec_wise_ad"),a=document.querySelectorAll('[class^="ec_r_"]'),s="display:block !important;visibility: visible !important;position: relative;";r(i,s),r(o,s),r(a,s)}},`;
const DYNAMIC_PRE_ANCHOR = `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);$t.forEach`;
const DYNAMIC_POST_ANCHOR = `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)});var o=r.reduce`;

(() => {
  const requestUrl = typeof $request !== "undefined" && $request?.url ? $request.url : "";

  // 页面运行时诊断由 QX 本地截获并打印，绝不转发到上游。
  if (requestUrl.includes(DIAG_PATH)) {
    const payload = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?") + 1) : "phase=unknown";
    console.log(`[${TAG}] runtime-diag ${payload}`);
    $done({
      status: "HTTP/1.1 204 No Content",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: ""
    });
    return;
  }

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
    `function __qxBaiduSearchHide(e){if(!e)return;for(var t=0;t<e.length;t++){var n=e[t];if(n&&n.style)try{n.setAttribute("data-qx-baidu-search-ad-hidden","handler-v2"),n.style.setProperty("display","none","important"),n.style.setProperty("visibility","hidden","important")}catch(e){}}}` +
    `function __qxBaiduSearchDiag(e){try{if(!e)return;var t=window.__QX_BAIDU_SEARCH_DIAG_COUNT__||0;if(t>=8)return;window.__QX_BAIDU_SEARCH_DIAG_COUNT__=t+1;var n=new Image;n.src="https://m.baidu.com/__qx_baidu_search_diag?"+e+"&n="+(t+1)+"&ts="+Date.now()}catch(e){}}`;

  const forcePatch =
    `wiseForceDisplay:function(e){var t=[];try{t=Array.from(document.querySelectorAll(e))}catch(e){}` +
    `var n=document.querySelectorAll(".ec_wise_ad"),r=document.querySelectorAll('[class^="ec_r_"]');` +
    `__qxBaiduSearchHide(t),__qxBaiduSearchHide(n),__qxBaiduSearchHide(r),` +
    `__qxBaiduSearchDiag("phase=force&t="+t.length+"&wise="+n.length+"&ecR="+r.length)},`;

  const dynamicPrePatch =
    `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);` +
    `__qxBaiduSearchHide(i),i.length&&__qxBaiduSearchDiag("phase=dynamic&i="+i.length),$t.forEach`;

  const dynamicPostPatch =
    `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)}),` +
    `__qxBaiduSearchHide(i);var o=r.reduce`;

  const body = originalBody
    .replace(HELPER_ANCHOR, helperPatch)
    .replace(FORCE_ANCHOR, forcePatch)
    .replace(DYNAMIC_PRE_ANCHOR, dynamicPrePatch)
    .replace(DYNAMIC_POST_ANCHOR, dynamicPostPatch);

  console.log(
    `[${TAG}] patched helper=1 force=1 dynamic-pre=1 dynamic-post=1 initial=t dynamic=i role=fallback-final-cleaner diag=local-beacon-v1`
  );

  $done({ body });
})();
