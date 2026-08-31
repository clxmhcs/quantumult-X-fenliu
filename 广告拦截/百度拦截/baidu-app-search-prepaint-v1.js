// 百度主 App 搜索广告首帧预隐藏实验 - prepaint v1
// Quantumult X script-response-body
//
// 目标响应：
// https://nv00.cdn.bcebos.com/nv01/static/ecom/amd/wise_exposure_intersection-*-chunk.js
//
// 实机结果已确认：Handler v1 能最终隐藏搜索广告，但会先出现后消失（B）。
// 百度搜索广告.har 时间线又确认 wise_exposure_intersection 早于 wiseSearchHasAd 加载，
// 因此本脚本只做“更早预隐藏”，最终精确清理由 handler v1 负责。
//
// 设计：
// - 在 wise_exposure_intersection AMD factory 一进入时立即向当前 document 注入 style；
// - 只使用百度源码已确认的广告 DOM 标志；
// - 不 hook EventEmitter；
// - 不使用 MutationObserver / setTimeout；
// - 不扫描 document，不删除节点；
// - handler v1 后续仍使用百度真实 t selector / i[] 完成最终清理。

const TAG = "baidu-app-search-prepaint-v1";
const SIGNATURE = "__QX_BAIDU_SEARCH_PREPAINT_V1__";
const DEFINE_RE = /define\("ecom\/amd\/wise_exposure_intersection-[^"]+-chunk",\["exports"\],function\(e\)\{"use strict";/;

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

  const matches = originalBody.match(new RegExp(DEFINE_RE.source, "g")) || [];
  if (matches.length !== 1) {
    console.log(`[${TAG}] define-anchor-mismatch count=${matches.length} fail-open`);
    $done({ body: originalBody });
    return;
  }

  const injection =
    `/* ${SIGNATURE} */` +
    `(function(){try{if("undefined"==typeof document)return;` +
    `var e="__qx_baidu_search_prepaint_v1";if(document.getElementById(e))return;` +
    `var t=document.createElement("style");t.id=e,` +
    `t.textContent='.ec_wise_ad,[class^="ec_r_"],.c-container:has(.ecfc-tuiguang),.ec-result-inner:has(.ecfc-tuiguang){display:none!important;visibility:hidden!important;}';` +
    `(document.head||document.documentElement)&&((document.head||document.documentElement).appendChild(t))}catch(e){}})();`;

  const body = originalBody.replace(DEFINE_RE, match => `${match}${injection}`);

  console.log(
    `[${TAG}] patched amd-entry=1 selectors=ec_wise_ad/ec_r_/ecfc-tuiguang phase=prepaint observer=0 timers=0 domscan=0`
  );

  $done({ body });
})();
