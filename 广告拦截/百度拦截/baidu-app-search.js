// 百度主 App 搜索广告最终清理 + 运行时/生命周期/第二入口诊断
// Quantumult X script-response-body / script-request-header / script-response-header / script-request-body
//
// 目标响应：wiseSearchHasAd-*-chunk.js
// 诊断请求：m.baidu.com/__qx_baidu_search_diag
// 第二入口探针：在 m.baidu.com/s hard reject 条件下，仅记录 m/mbd/h2mbd/www.baidu.com 其他路径元数据。
// searchbox body 探针：仅记录字段名、长度、控制字段和结构标志；不打印关键词、Cookie、Token。
// cmd=169 深层探针：仅输出 data.169 的字段路径、类型、数组长度及商业嫌疑字段名，不输出任何字段值。
// 所有诊断路径均 fail-open，不修改真实请求/响应。

const TAG = "baidu-app-search";
const ROUTE_TAG = "baidu-app-search-route-probe";
const SEARCHBOX_TAG = "baidu-app-searchbox-probe";
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
    const meta = parseUrlMeta(requestUrl);

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

    // /searchbox request-body / response-body 诊断。
    if (meta && isSearchboxTarget(meta.host, meta.path)) {
      if (!hasResponse && typeof $request?.body === "string") {
        logSearchboxRequestBody(requestUrl, meta, $request.body);
        $done({});
        return;
      }
      if (hasResponse && typeof $response?.body === "string") {
        logSearchboxResponseBody(requestUrl, meta, $response.body);
        $done({});
        return;
      }
    }

    // 第二搜索入口 header 探针。只记录元数据，明确排除 /s 和本地 beacon。
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
      `[${TAG}] patched helper=1 force=1 dynamic-pre=1 dynamic-post=1 initial=t dynamic=i ` +
      `role=fallback-final-cleaner diag=local-beacon-v1 lifecycle=v1 route-probe=merged-v1 searchbox-probe=body-v1 cmd169-probe=structure-v1`
    );

    $done({ body });
  } catch (e) {
    console.log(`[${TAG}] exception=${safeToken(String(e), 160)} fail-open`);
    $done({});
  }
})();

function logSearchboxRequestBody(url, meta, body) {
  const headers = $request?.headers || {};
  const type = safeHeaderValue(getHeader(headers, "content-type"), 64);
  const pairs = parseFormBody(body);
  const keys = limitedKeys(pairs.map((x) => x.key));
  const control = searchboxControls(url, pairs);
  const flags = formSensitiveFlags(pairs);

  let dataJson = "-";
  let dataKeys = "-";
  let nestedFlags = "-";
  const data = firstFormValue(pairs, "data");
  if (data.found) {
    const decoded = safeDecodeFormValue(data.value);
    const parsed = tryParseJson(decoded);
    if (parsed.ok) {
      dataJson = "1";
      dataKeys = jsonTopKeys(parsed.value);
      nestedFlags = collectNamedValueLengths(parsed.value, ["word", "query", "oq", "wd", "keyword", "q"], 4);
    } else {
      dataJson = "0";
    }
  }

  console.log(
    `[${SEARCHBOX_TAG}] body-v1 req host=${meta.host} bodyLen=${String(body).length} type=${type || "-"} ` +
    `keys=${keys} action=${control.action} cmd=${control.cmd} service=${control.service} flags=${flags} ` +
    `dataLen=${data.found ? safeDecodedLength(data.value) : 0} dataJson=${dataJson} dataKeys=${dataKeys} nested=${nestedFlags}`
  );
}

function logSearchboxResponseBody(url, meta, body) {
  const headers = $response?.headers || {};
  const type = safeHeaderValue(getHeader(headers, "content-type"), 64);
  const statusCode = safeToken($response?.statusCode ?? $response?.status ?? "-", 24);
  const parsed = tryParseJson(body);
  const sample = String(body).slice(0, 1048576);
  const markers = [
    `html:${/<(?:html|body|div)\b/i.test(sample) ? 1 : 0}`,
    `ecWise:${sample.includes("ec_wise_ad") ? 1 : 0}`,
    `ecR:${sample.includes("ec_r_") ? 1 : 0}`,
    `cmatch:${sample.includes("data-cmatchid") ? 1 : 0}`,
    `placeid:${sample.includes("data-placeid") ? 1 : 0}`
  ].join(",");

  let top = "-";
  let code = "-";
  let dataType = "-";
  let dataKeys = "-";
  let nestedFlags = "-";
  if (parsed.ok) {
    top = jsonTopKeys(parsed.value);
    code = jsonControlCode(parsed.value);
    const data = parsed.value && typeof parsed.value === "object" ? parsed.value.data : undefined;
    dataType = valueType(data);
    if (data && typeof data === "object" && !Array.isArray(data)) dataKeys = limitedKeys(Object.keys(data));
    nestedFlags = collectNamedValueLengths(parsed.value, ["word", "query", "oq", "wd", "keyword", "q"], 4);
  }

  console.log(
    `[${SEARCHBOX_TAG}] body-v1 resp host=${meta.host} http=${statusCode || "-"} bodyLen=${String(body).length} ` +
    `type=${type || "-"} json=${parsed.ok ? 1 : 0} top=${top} code=${code} dataType=${dataType} dataKeys=${dataKeys} ` +
    `markers=${markers} nested=${nestedFlags}`
  );

  const control = searchboxControls(url, []);
  if (parsed.ok && control.action === "feed" && control.cmd === "169") {
    logCmd169Structure(meta, parsed.value);
  }
}

function logCmd169Structure(meta, root) {
  const data = root && typeof root === "object" && !Array.isArray(root) ? root.data : undefined;
  const node = data && typeof data === "object" && !Array.isArray(data) ? data["169"] : undefined;
  const entries = [];
  const suspicious = [];
  const seen = new Set();

  console.log(
    `[${SEARCHBOX_TAG}] cmd169-v1 root host=${meta.host} data169Type=${valueType(node)} ` +
    `data169Keys=${node && typeof node === "object" && !Array.isArray(node) ? limitedKeys(Object.keys(node)) : "-"}`
  );

  walkStructure(node, "data.169", 0, 5, 120, entries, suspicious, seen);

  const chunkSize = 8;
  const totalChunks = Math.max(1, Math.ceil(entries.length / chunkSize));
  if (!entries.length) {
    console.log(`[${SEARCHBOX_TAG}] cmd169-v1 struct 1/1 -`);
  } else {
    for (let i = 0; i < entries.length; i += chunkSize) {
      const n = Math.floor(i / chunkSize) + 1;
      console.log(
        `[${SEARCHBOX_TAG}] cmd169-v1 struct ${n}/${totalChunks} ` + entries.slice(i, i + chunkSize).join(";")
      );
    }
  }

  const uniqueSuspicious = Array.from(new Set(suspicious)).slice(0, 48);
  if (!uniqueSuspicious.length) {
    console.log(`[${SEARCHBOX_TAG}] cmd169-v1 suspicious=-`);
  } else {
    for (let i = 0; i < uniqueSuspicious.length; i += 8) {
      console.log(
        `[${SEARCHBOX_TAG}] cmd169-v1 suspicious ${Math.floor(i / 8) + 1}/${Math.ceil(uniqueSuspicious.length / 8)} ` +
        uniqueSuspicious.slice(i, i + 8).join(";")
      );
    }
  }
}

function walkStructure(value, path, depth, maxDepth, maxNodes, entries, suspicious, seen) {
  if (entries.length >= maxNodes || depth > maxDepth) return;

  const type = valueType(value);
  entries.push(`${safeStructurePath(path)}=${type}`);

  const key = path.split(".").pop().replace(/\[.*$/, "");
  if (isSuspiciousKey(key)) suspicious.push(`${safeStructurePath(path)}=${type}`);

  if (value == null || typeof value !== "object" || depth >= maxDepth) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > 0) walkStructure(value[0], `${path}[0]`, depth + 1, maxDepth, maxNodes, entries, suspicious, seen);
    return;
  }

  for (const childKey of Object.keys(value).slice(0, 40)) {
    if (entries.length >= maxNodes) break;
    const safeKey = safeStructureKey(childKey);
    const childPath = `${path}.${safeKey}`;
    if (isSuspiciousKey(childKey)) suspicious.push(`${safeStructurePath(childPath)}=${valueType(value[childKey])}`);
    walkStructure(value[childKey], childPath, depth + 1, maxDepth, maxNodes, entries, suspicious, seen);
  }
}

function isSuspiciousKey(key) {
  const raw = String(key || "").toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");
  if (!raw) return false;
  if (/^(ad|ads|adv|is_ad|ad_info|adinfo|ad_data|addata|ad_list|adlist|ad_type|adtype|ad_id|adid|ec)$/.test(raw)) return true;
  if (["srcid", "cmatch", "cmatchid", "placeid", "tpl", "material", "creative", "business"].includes(compact)) return true;
  return /(advert|commercial|marketing|promotion|promote|sponsor|sponsored|material|creative)/.test(compact);
}

function safeStructureKey(key) {
  const s = String(key || "");
  return /^[A-Za-z0-9_\-]{1,64}$/.test(s) ? s : `keyLen${s.length}`;
}

function safeStructurePath(path) {
  const s = String(path || "-").replace(/[\r\n\t ;]/g, "_");
  return s.length <= 180 ? s : `${s.slice(0, 177)}...`;
}

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

function isSearchboxTarget(host, path) {
  return (host === "mbd.baidu.com" || host === "h2mbd.baidu.com") && path === "/searchbox";
}

function searchboxControls(url, pairs) {
  return {
    action: safeControlValue(firstNonEmpty(safeQueryParam(url, "action"), decodedFormValue(pairs, "action"))),
    cmd: safeControlValue(firstNonEmpty(safeQueryParam(url, "cmd"), decodedFormValue(pairs, "cmd"))),
    service: safeControlValue(firstNonEmpty(safeQueryParam(url, "service"), decodedFormValue(pairs, "service")))
  };
}

function parseFormBody(body) {
  const out = [];
  for (const part of String(body || "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const key = safeDecodeFormValue(rawKey);
    if (!/^[A-Za-z0-9_.\-]{1,80}$/.test(key)) continue;
    out.push({ key, value: eq >= 0 ? part.slice(eq + 1) : "" });
    if (out.length >= 96) break;
  }
  return out;
}

function firstFormValue(pairs, name) {
  for (const item of pairs || []) {
    if (item.key === name) return { found: true, value: item.value || "" };
  }
  return { found: false, value: "" };
}

function decodedFormValue(pairs, name) {
  const item = firstFormValue(pairs, name);
  return item.found ? safeDecodeFormValue(item.value) : "";
}

function formSensitiveFlags(pairs) {
  const names = ["word", "query", "oq", "wd", "keyword", "q", "data"];
  const out = [];
  for (const name of names) {
    const item = firstFormValue(pairs, name);
    if (item.found) out.push(`${name}:${safeDecodedLength(item.value)}`);
  }
  return out.length ? out.join(",") : "-";
}

function collectNamedValueLengths(root, names, maxDepth) {
  const wanted = new Set(names);
  const found = [];
  const seen = new Set();

  function walk(value, depth) {
    if (depth > maxDepth || value == null || found.length >= 16) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && i < 24; i++) walk(value[i], depth + 1);
      return;
    }

    for (const key of Object.keys(value).slice(0, 64)) {
      const child = value[key];
      if (wanted.has(String(key).toLowerCase())) {
        const len = typeof child === "string" || typeof child === "number" ? String(child).length : -1;
        found.push(`${safeToken(key, 24)}:${len}`);
      }
      walk(child, depth + 1);
      if (found.length >= 16) break;
    }
  }

  walk(root, 0);
  return found.length ? found.join(",") : "-";
}

function tryParseJson(text) {
  const s = String(text || "").trim();
  if (!s || (s[0] !== "{" && s[0] !== "[")) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (_) {
    return { ok: false, value: null };
  }
}

function jsonTopKeys(value) {
  if (!value || typeof value !== "object") return "-";
  if (Array.isArray(value)) return `array:${value.length}`;
  return limitedKeys(Object.keys(value));
}

function jsonControlCode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "-";
  for (const key of ["status", "code", "errno", "errNo", "errorCode"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return safeControlValue(value[key]);
  }
  return "-";
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array:${value.length}`;
  return typeof value;
}

function limitedKeys(keys) {
  const clean = [];
  for (const key of keys || []) {
    const s = String(key);
    if (/^[A-Za-z0-9_.\-]{1,80}$/.test(s)) clean.push(s);
    if (clean.length >= 24) break;
  }
  return clean.length ? clean.join(",") : "-";
}

function safeDecodeFormValue(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
  } catch (_) {
    return String(value || "");
  }
}

function safeControlValue(value) {
  const s = String(value ?? "");
  if (!s) return "-";
  if (/^[A-Za-z0-9_.:\-]{1,48}$/.test(s)) return s;
  return `len:${s.length}`;
}

function firstNonEmpty(a, b) {
  return a || b || "";
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
