// 百度主 App 搜索 ECOM 预取/预渲染运行时诊断 v1
// Quantumult X script-request-header / script-response-body
//
// 目标：
// 1) ldy_ajax_prefetch_flag-*-chunk.js
// 2) imlp_prerender-*-chunk.js
//
// 只记录生命周期和 DOM 数量，不记录关键词、Cookie、Token、落地页 URL。
// 不改变原模块控制流；anchor 不匹配时 fail-open。

const TAG = "baidu-app-search-prerender-probe";
const DIAG_URL = "https://m.baidu.com/__qx_baidu_search_diag?";
const LDY_SIG = "__QX_BAIDU_LDY_PRERENDER_DIAG_V1__";
const IMLP_SIG = "__QX_BAIDU_IMLP_PRERENDER_DIAG_V1__";

const url = typeof $request !== "undefined" && $request?.url ? String($request.url) : "";
const hasResponse = typeof $response !== "undefined" && $response != null;
const isLdy = /\/ldy_ajax_prefetch_flag-[^/?]+-chunk\.js(?:\?|$)/i.test(url);
const isImlp = /\/imlp_prerender-[^/?]+-chunk\.js(?:\?|$)/i.test(url);

try {
  if (!hasResponse) {
    if (isLdy) console.log(`[${TAG}] lifecycle ldy-request-start`);
    else if (isImlp) console.log(`[${TAG}] lifecycle imlp-request-start`);
    $done({});
  } else {
    const originalBody = $response?.body;
    if (typeof originalBody !== "string" || !originalBody.length) {
      console.log(`[${TAG}] no-string-body fail-open`);
      $done({});
    } else if (isLdy) {
      patchLdy(originalBody);
    } else if (isImlp) {
      patchImlp(originalBody);
    } else {
      $done({});
    }
  }
} catch (e) {
  console.log(`[${TAG}] exception=${safeToken(String(e), 160)} fail-open`);
  $done({});
}

function patchLdy(originalBody) {
  if (originalBody.includes(LDY_SIG)) {
    console.log(`[${TAG}] ldy already-patched`);
    $done({ body: originalBody });
    return;
  }

  const anchor = `d=Object.create(null);s.each`;
  const count = originalBody.split(anchor).length - 1;
  if (count !== 1) {
    console.log(`[${TAG}] ldy anchor-mismatch count=${count} fail-open`);
    $done({ body: originalBody });
    return;
  }

  const runtime =
    `d=Object.create(null);/* ${LDY_SIG} */` +
    `try{var __qxK="__QX_BAIDU_LDY_DIAG_COUNT__",__qxC=window[__qxK]||0;if(__qxC<4){window[__qxK]=__qxC+1;` +
    `var __qxN=$(".".concat(a.resultClass)).length||0,__qxS=s&&s.length||0,` +
    `__qxW=document.querySelectorAll(".ec_wise_ad").length,` +
    `__qxR=document.querySelectorAll('[class^="ec_r_"]').length,__qxI=new Image;` +
    `__qxI.src="${DIAG_URL}phase=ldy&n="+__qxN+"&s="+__qxS+"&wise="+__qxW+"&ecR="+__qxR+"&nrun="+(__qxC+1)+"&ts="+Date.now()}}catch(__qxE){};s.each`;

  const body = originalBody.replace(anchor, runtime);
  console.log(`[${TAG}] patched module=ldy anchor=1 runtime=count-only-v1`);
  $done({ body });
}

function patchImlp(originalBody) {
  if (originalBody.includes(IMLP_SIG)) {
    console.log(`[${TAG}] imlp already-patched`);
    $done({ body: originalBody });
    return;
  }

  const anchor = `var i=[];n.forEach`;
  const count = originalBody.split(anchor).length - 1;
  if (count !== 1) {
    console.log(`[${TAG}] imlp anchor-mismatch count=${count} fail-open`);
    $done({ body: originalBody });
    return;
  }

  const runtime =
    `var i=[];/* ${IMLP_SIG} */` +
    `try{var __qxK="__QX_BAIDU_IMLP_DIAG_COUNT__",__qxC=window[__qxK]||0;if(__qxC<4){window[__qxK]=__qxC+1;` +
    `var __qxN=n&&n.length||0,__qxW=document.querySelectorAll(".ec_wise_ad").length,` +
    `__qxR=document.querySelectorAll('[class^="ec_r_"]').length,__qxI=new Image;` +
    `__qxI.src="${DIAG_URL}phase=imlp&n="+__qxN+"&wise="+__qxW+"&ecR="+__qxR+"&nrun="+(__qxC+1)+"&ts="+Date.now()}}catch(__qxE){};n.forEach`;

  const body = originalBody.replace(anchor, runtime);
  console.log(`[${TAG}] patched module=imlp anchor=1 runtime=count-only-v1`);
  $done({ body });
}

function safeToken(value, max) {
  const s = String(value ?? "").replace(/[\r\n\t]/g, " ");
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}
