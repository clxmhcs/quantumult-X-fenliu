// 百度主 App 搜索容器 /sf 定点诊断 v1
// Quantumult X script-request-header / script-response-body
//
// 目标：
// 1) https://m.baidu.com/searchframe...
// 2) https://m.baidu.com/sf...
//
// 只记录请求生命周期、query 字段长度、响应长度与结构标志。
// 不记录关键词、Cookie、Token，不修改请求或响应。

const TAG = "baidu-app-search-frame-probe";

const url = typeof $request !== "undefined" && $request?.url ? String($request.url) : "";
const hasResponse = typeof $response !== "undefined" && $response != null;
const meta = parseUrlMeta(url);

try {
  if (!meta || meta.host !== "m.baidu.com" || !isTargetPath(meta.path)) {
    $done({});
  } else if (!hasResponse) {
    const target = targetName(meta.path);
    console.log(
      `[${TAG}] lifecycle target=${target} request-start flags=${queryFlags(url)} ` +
      `method=${safeToken($request?.method || "GET", 12)}`
    );
    $done({});
  } else {
    const body = $response?.body;
    const headers = $response?.headers || {};
    const status = safeToken($response?.statusCode ?? $response?.status ?? "-", 24);
    const type = safeHeaderValue(getHeader(headers, "content-type"), 64);
    const enc = safeHeaderValue(getHeader(headers, "content-encoding"), 24);

    if (typeof body !== "string") {
      console.log(
        `[${TAG}] resp target=${targetName(meta.path)} http=${status || "-"} body=non-string ` +
        `type=${type || "-"} enc=${enc || "-"} fail-open`
      );
      $done({});
    } else {
      const sample = body.slice(0, 1048576);
      const markers = [
        `html:${/<(?:html|head|body|div|script)\b/i.test(sample) ? 1 : 0}`,
        `ecWise:${countToken(sample, "ec_wise_ad")}`,
        `ecR:${countRegex(sample, /ec_r_/g)}`,
        `src160:${countSrcid(sample, "160")}`,
        `src111:${countSrcid(sample, "111")}`,
        `src2304:${countSrcid(sample, "2304")}`,
        `srcidAny:${countRegex(sample, /data-srcid\s*=\s*["'][^"']+["']/gi)}`,
        `placeid:${countToken(sample, "data-placeid")}`,
        `cmatch:${countToken(sample, "data-cmatchid")}`,
        `wiseJS:${countToken(sample, "wiseSearchHasAd")}`,
        `ldy:${countToken(sample, "ldy_ajax_prefetch_flag")}`,
        `imlp:${countToken(sample, "imlp_prerender")}`,
        `sfRef:${countRegex(sample, /(?:["'\/]|^)sf(?:[?"'\/]|$)/g)}`
      ].join(",");

      console.log(
        `[${TAG}] resp target=${targetName(meta.path)} http=${status || "-"} bodyLen=${body.length} ` +
        `type=${type || "-"} enc=${enc || "-"} flags=${queryFlags(url)} markers=${markers}`
      );
      $done({});
    }
  }
} catch (e) {
  console.log(`[${TAG}] exception=${safeToken(String(e), 160)} fail-open`);
  $done({});
}

function isTargetPath(path) {
  return path === "/searchframe" || path === "/sf";
}

function targetName(path) {
  return path === "/searchframe" ? "searchframe" : path === "/sf" ? "sf" : "other";
}

function parseUrlMeta(value) {
  const m = /^https?:\/\/([^\/:?#]+)(?::\d+)?([^?#]*)?/i.exec(value || "");
  if (!m) return null;
  return { host: String(m[1] || "").toLowerCase(), path: m[2] || "/" };
}

function queryFlags(value) {
  const names = ["word", "query", "oq", "wd", "tn", "sa", "t_samp"];
  const out = [];
  for (const name of names) {
    const item = findQueryParam(value, name);
    if (item.found) out.push(`${name}:${safeDecodedLength(item.value)}`);
  }
  return out.length ? out.join(",") : "-";
}

function findQueryParam(value, name) {
  const s = String(value || "");
  const q = s.indexOf("?");
  if (q < 0) return { found: false, value: "" };
  const query = s.slice(q + 1).split("#", 1)[0];
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    if (key === name) return { found: true, value: eq >= 0 ? pair.slice(eq + 1, eq + 257) : "" };
  }
  return { found: false, value: "" };
}

function safeDecodedLength(value) {
  if (!value) return 0;
  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20")).length;
  } catch (_) {
    return String(value).length;
  }
}

function countSrcid(text, id) {
  const re = new RegExp(`data-srcid\\s*=\\s*["']${id}["']`, "gi");
  return countRegex(text, re);
}

function countToken(text, token) {
  if (!text || !token) return 0;
  let count = 0;
  let from = 0;
  while (count < 99) {
    const i = text.indexOf(token, from);
    if (i < 0) break;
    count++;
    from = i + token.length;
  }
  return count;
}

function countRegex(text, regex) {
  if (!text) return 0;
  let count = 0;
  regex.lastIndex = 0;
  while (count < 99 && regex.exec(text)) count++;
  return count;
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const target = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === target) return headers[key];
  }
  return "";
}

function safeHeaderValue(value, max) {
  if (value == null) return "";
  return safeToken(String(value).replace(/[\r\n\t ]+/g, " "), max);
}

function safeToken(value, max) {
  const s = String(value ?? "").replace(/[\r\n\t]/g, " ");
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}
