// 百度主 App 开屏预缓存持久化探针 - v1
// Quantumult X script-request-header
// 目标：在百度正常使用期间记录疑似开屏预取/素材请求，并保存到 $prefs。
// 不修改请求，不记录 Cookie / Token / query 参数值；仅保存时间、Host、Path、参数名与方法。

(() => {
  const STORE_KEY = "baidu_app_splash_cache_probe_v1";
  const MAX_RECORDS = 80;
  const RETENTION_MS = 6 * 60 * 60 * 1000;

  const now = Date.now();
  const rawUrl = $request?.url || "";
  const method = String($request?.method || "GET").toUpperCase();

  try {
    const safe = parseSafeUrl(rawUrl);
    if (!safe.host) {
      $done({});
      return;
    }

    const records = loadRecords(STORE_KEY)
      .filter(item => item && Number.isFinite(item.ts) && now - item.ts <= RETENTION_MS);

    const entry = {
      ts: now,
      method,
      host: safe.host,
      path: safe.path,
      queryKeys: safe.queryKeys,
      kind: classifyCandidate(safe.host, safe.path)
    };

    // 同一候选在极短时间内重复触发时去重，避免环形记录被单个资源刷满。
    const last = records[records.length - 1];
    const duplicate = last &&
      now - last.ts < 3000 &&
      last.method === entry.method &&
      last.host === entry.host &&
      last.path === entry.path &&
      last.queryKeys === entry.queryKeys;

    if (!duplicate) {
      records.push(entry);
      while (records.length > MAX_RECORDS) records.shift();
      $prefs.setValueForKey(JSON.stringify(records), STORE_KEY);

      console.log(
        `[baidu-app-splash-cache-probe-v1] stored kind=${entry.kind} ` +
        `${entry.method} ${entry.host}${entry.path}` +
        `${entry.queryKeys ? ` ?keys=${entry.queryKeys}` : ""}`
      );
    }
  } catch (error) {
    console.log(`[baidu-app-splash-cache-probe-v1] probe error: ${error}`);
  }

  // 纯探针：不修改原请求。
  $done({});
})();

function loadRecords(key) {
  try {
    const raw = $prefs.valueForKey(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function parseSafeUrl(rawUrl) {
  const match = String(rawUrl).match(/^(https?):\/\/([^\/?#]+)(\/[^?#]*)?(?:\?([^#]*))?/i);
  if (!match) return { host: "", path: "", queryKeys: "" };

  const host = String(match[2] || "").toLowerCase();
  const path = match[3] || "/";
  const query = match[4] || "";

  const keys = query
    .split("&")
    .filter(Boolean)
    .map(pair => pair.split("=", 1)[0])
    .filter(Boolean)
    .slice(0, 30);

  return {
    host,
    path,
    queryKeys: keys.join(",")
  };
}

function classifyCandidate(host, path) {
  const text = `${host}${path}`.toLowerCase();

  if (text.includes("search-splash") || text.includes("splash_")) return "splash-material";
  if (text.includes("open_screen") || text.includes("openscreen")) return "open-screen";
  if (text.includes("launch")) return "launch";
  if (text.includes("preload")) return "preload";
  if (/\.mp4(?:$|[/?#])/i.test(path)) return "mp4";
  if (host.includes("mobads")) return "mobads";
  if (host.includes("jomoxc")) return "pcdn";
  if (host.includes("bdimg")) return "bdimg";

  return "candidate";
}
