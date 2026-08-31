// 百度主 App 搜索广告最终清理 + 运行时/生命周期/第二入口诊断
// Quantumult X script-response-body / script-request-header / script-response-header
//
// 目标响应：wiseSearchHasAd-*-chunk.js
// 诊断请求：m.baidu.com/__qx_baidu_search_diag
// 第二入口探针：在 m.baidu.com/s hard reject 条件下，仅记录 m/mbd/h2mbd/www.baidu.com 其他路径元数据。
// 不修改请求/响应，不读取正文，不打印关键词、Cookie、Token。

const TAG = "baidu-app-search";
const ROUTE_TAG = "baidu-app-search-route-probe";
const SIGNATURE = "__QX_BAIDU_SEARCH_HANDLER_V2__";
const DIAG_PATH = "/__qx_baidu_search_diag";

const HELPER_ANCHOR = `function r(e,t){for(var n=0;n<e.length;n++){var r=e[n],i=r.getAttribute("style");r.setAttribute("style",i?"".concat(t).concat(i):t)}}`;
const FORCE_ANCHOR = `wiseForceDisplay:function(e){var t=document.querySelector(".se-baikan-ads"),n=document.querySelector(".ad-hide-place");if(!t||!n){var i=Array.from(document.querySelectorAll(e));t&&(i=i.filter(function(e){return!e.hasAttribute("data-hide-last")}));var o=document.querySelectorAll(".ec_wise_ad"),a=document.querySelectorAll('[class^="ec_r_"]'),s="display:block !important;visibility: visible !important;position: relative;";r(i,s),r(o,s),r(a,s)}},`;
const DYNAMIC_PRE_ANCHOR = `var i=r.reduce(function(t,n){var r=$(n).find(e);return $e(t).concat($e(r.toArray()))},[]);$t.forEach`;
const DYNAMIC_POST_ANCHOR = `$r.forEach(function(i){var o=$i[i];o&&n.i$1(function(){o(e,t,r)},!0)});var o=r.reduce`;

(() => {
  try {
    const requestUrl = typeof $request !== "undefined" && $request?.url ? String($request.url) : "";
    const hasResponse = typeof $response !== "undefined" && $response != null;

    // 页面运行时诊断由 QX 本地截获并打印，不转发上游。
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

    // /s 生命周期诊断（正式规则恢复后可继续复用；当前 hard reject 期间不会命中）。
    if (!hasResponse && /^https:\/\/m\.baidu\.com\/s\?/i.test(requestUrl)) {
      console.log(
        `[${TAG}] lifecycle search-request-start t_samp=${safeQueryParam(requestUrl, "t_samp") || "-"} ` +
        `wordLen=${safeDecodedLength(safeQueryParam(requestUrl, "word"))}`
      );
      $done({});
      return;
    }

    if (!hasResponse && /\/wiseSearchHasAd-[^/?]+-chunk\.js(?:\?|$)/i.test(requestUrl)) {
      console.log(`[${TAG}] lifecycle wise-request-start`);
      $done({});
      return;
    }

    // 第二搜索入口探针。只记录元数据，明确排除 /s 和本地 beacon。
    const meta = parseUrlMeta(requestUrl);
    if (meta && isRouteProbeHost(meta.host) && !(meta.host === "m.baidu.com" && (meta.path === "/s" || meta.path === DIAG_PATH))) {
      logRouteProbe(requestUrl, meta, hasResponse);
      $done({});
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
      `[${TAG}] patched helper=1 force=1 dynamic-pre=1 dynamic-post=1 initial=t dynamic=i role=fallback-final-cleaner diag=local-beacon-v1 lifecycle=v1 route-probe=merged-v1`
    );

    $done({ body });
  } catch (e) {
    console.log(`[${TAG}] exception=${String(e)} fail-open`);
    $done({});
  }
})();

function logRouteProbe(url, meta, hasResponse) {
  const flags = queryFlags(url);
  if (!hasResponse) {
    const method = safeToken($request?.method || "GET", 12);
    const headers = $request?.headers || {};
    const ref = hostFromHeader(getHeader(headers, "referer"));
    const reqType = safeHeaderValue(getHeader(headers, "content-type"), 48);
    console.log(
      `[${ROUTE_TAG}] merged-v1 req method=${method} host=${meta.host} path=${safePath(meta.path)} ` +
      `flags=${flags} ref=${ref || "-"} reqType=${reqType || "-"}`
    );
    return;
  }

  const headers = $response?.headers || {};
  const status = safeToken($response?.statusCode ?? $response?.status ?? getHeader(headers, ":status") ?? "-", 32);
  const type = safeHeaderValue(getHeader(headers, "content-type"), 64);
  const len = numericHeader(getHeader(headers, "content-length"));
  const enc = safeHeaderValue(getHeader(headers, "content-encoding"), 24);
  console.log(
    `[${ROUTE_TAG}] merged-v1 resp status=${status || "-"} host=${meta.host} path=${safePath(meta.path)} ` +
    `flags=${flags} type=${type || "-"} len=${len} enc=${enc || "-"}`
  );
}

function isRouteProbeHost(host) {
  return host === "m.baidu.com" || host === "mbd.baidu.com" || host === "h2mbd.baidu.com" || host === "www.baidu.com";
}

function parseUrlMeta(url) {
  const m = /^https?:\/\/([^\/:?#]+)(?::\d+)?([^?#]*)?/i.exec(url || "");
  if (!m) return null;
  return { host: String(m[1] || "").toLowerCase(), path: m[2] || "/" };
}

function queryFlags(url) {
  const names = ["word", "query", "oq", "wd", "tn", "sa", "t_samp"];
  const out = [];
  for (const name of names) {
    const value = findQueryParam(url, name);
    if (value.found) out.push(`${name}:${safeDecodedLength(value.value)}`);
  }
  return out.length ? out.join(",") : "-";
}

function findQueryParam(url, name) {
  const q = String(url || "").indexOf("?");
  if (q < 0) return { found: false, value: "" };
  const query = String(url).slice(q + 1).split("#", 1)[0];
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    if (key === name) return { found: true, value: eq >= 0 ? pair.slice(eq + 1, eq + 257) : "" };
  }
  return { found: false, value: "" };
}

function safeQueryParam(url, name) {
  const item = findQueryParam(url, name);
  return item.found ? item.value : "";
}

function safeDecodedLength(value) {
  if (!value) return 0;
  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20")).length;
  } catch (_) {
    return String(value).length;
  }
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const target = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === target) return headers[key];
  }
  return "";
}

function hostFromHeader(value) {
  if (!value) return "";
  const m = /^https?:\/\/([^\/:?#]+)/i.exec(String(value));
  return m ? safeToken(String(m[1]).toLowerCase(), 80) : "-";
}

function numericHeader(value) {
  const s = String(value ?? "");
  return /^\d{1,12}$/.test(s) ? s : "-";
}

function safePath(path) {
  const s = String(path || "/");
  return s.length <= 120 ? s : `${s.slice(0, 117)}...`;
}

function safeHeaderValue(value, max) {
  if (value == null) return "";
  return safeToken(String(value).replace(/[\r\n\t ]+/g, " "), max);
}

function safeToken(value, max) {
  const s = String(value ?? "").replace(/[\r\n\t]/g, " ");
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}
