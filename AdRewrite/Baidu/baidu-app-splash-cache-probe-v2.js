// Baidu main App splash pre-cache persistent probe - v2
// Quantumult X script-request-header
//
// v2 is logically equivalent to v1. Only the remote subresource filename changed
// to bypass a possible cached 404/failure state for the old v1 URL in Quantumult X.
//
// Goal: record suspected splash-prefetch/asset requests during normal Baidu usage and save them to $prefs.
// Do not modify requests and do not record Cookie / Token / query parameter values; save only time, Host, Path, parameter names, and method.

(() => {
  const TAG = "baidu-app-splash-cache-probe-v2";
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
        `[${TAG}] stored kind=${entry.kind} ` +
        `${entry.method} ${entry.host}${entry.path}` +
        `${entry.queryKeys ? ` ?keys=${entry.queryKeys}` : ""}`
      );
    }
  } catch (error) {
    console.log(`[${TAG}] probe error: ${error}`);
  }

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
