// 百度主 App 搜索第二入口诊断探针 v1
// Quantumult X script-request-header / script-response-header
//
// 目的：在 m.baidu.com/s 被临时 hard reject 时，寻找仍能承载搜索首帧/广告的其他 HTTP 路径。
// 只记录请求/响应元数据，不修改 URL、Header、Body，不读取响应正文。
// 隐私约束：不打印关键词、query 值、Cookie、Token；只打印已知搜索参数是否存在及解码后的长度。

const TAG = "baidu-app-search-route-probe";
const VERSION = "v1";

(() => {
  try {
    const url = typeof $request !== "undefined" && $request?.url ? String($request.url) : "";
    const meta = parseUrlMeta(url);
    if (!meta || !isTargetHost(meta.host)) {
      $done({});
      return;
    }

    // 当前单变量实验明确排除：
    // 1) m.baidu.com/s 已由 snippet hard reject；
    // 2) __qx_baidu_search_diag 是我们自己的本地诊断 beacon。
    if (
      meta.host === "m.baidu.com" &&
      (meta.path === "/s" || meta.path === "/__qx_baidu_search_diag")
    ) {
      $done({});
      return;
    }

    const hasResponse = typeof $response !== "undefined" && $response != null;

    if (!hasResponse) {
      const method = safeToken($request?.method || "GET", 12);
      const reqHeaders = $request?.headers || {};
      const refHost = hostFromHeader(getHeader(reqHeaders, "referer"));
      const reqType = safeHeaderValue(getHeader(reqHeaders, "content-type"), 48);
      const flags = queryFlags(url);

      console.log(
        `[${TAG}] ${VERSION} req method=${method} host=${meta.host} path=${safePath(meta.path)} ` +
        `flags=${flags} ref=${refHost || "-"} reqType=${reqType || "-"}`
      );
      $done({});
      return;
    }

    const resHeaders = $response?.headers || {};
    const status = safeToken(
      $response?.statusCode ?? $response?.status ?? getHeader(resHeaders, ":status") ?? "-",
      32
    );
    const type = safeHeaderValue(getHeader(resHeaders, "content-type"), 64);
    const len = numericHeader(getHeader(resHeaders, "content-length"));
    const enc = safeHeaderValue(getHeader(resHeaders, "content-encoding"), 24);
    const flags = queryFlags(url);

    console.log(
      `[${TAG}] ${VERSION} resp status=${status || "-"} host=${meta.host} path=${safePath(meta.path)} ` +
      `flags=${flags} type=${type || "-"} len=${len} enc=${enc || "-"}`
    );
    $done({});
  } catch (e) {
    console.log(`[${TAG}] ${VERSION} exception=${safeToken(String(e), 120)} fail-open`);
    $done({});
  }
})();

function isTargetHost(host) {
  return (
    host === "m.baidu.com" ||
    host === "mbd.baidu.com" ||
    host === "h2mbd.baidu.com" ||
    host === "www.baidu.com"
  );
}

function parseUrlMeta(url) {
  const m = /^https?:\/\/([^\/:?#]+)(?::\d+)?([^?#]*)?(?:\?[^#]*)?/i.exec(url || "");
  if (!m) return null;
  return {
    host: String(m[1] || "").toLowerCase(),
    path: m[2] || "/"
  };
}

function queryFlags(url) {
  const names = ["word", "query", "oq", "wd", "tn", "sa", "t_samp"];
  const out = [];
  for (const name of names) {
    const value = safeQueryParam(url, name);
    if (value.found) out.push(`${name}:${decodedLength(value.value)}`);
  }
  return out.length ? out.join(",") : "-";
}

function safeQueryParam(url, name) {
  const q = String(url || "").indexOf("?");
  if (q < 0) return { found: false, value: "" };
  const end = String(url).indexOf("#", q + 1);
  const query = String(url).slice(q + 1, end >= 0 ? end : undefined);
  const pairs = query.split("&");
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    if (key === name) {
      return { found: true, value: eq >= 0 ? pair.slice(eq + 1, eq + 257) : "" };
    }
  }
  return { found: false, value: "" };
}

function decodedLength(value) {
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
  if (s.length <= 120) return s;
  return `${s.slice(0, 117)}...`;
}

function safeHeaderValue(value, max) {
  if (value == null) return "";
  return safeToken(String(value).replace(/[\r\n\t ]+/g, " "), max);
}

function safeToken(value, max) {
  const s = String(value ?? "").replace(/[\r\n\t]/g, " ");
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}
