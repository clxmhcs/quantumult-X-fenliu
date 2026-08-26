// 百度主 App 开屏请求侧净化 - v1
// Quantumult X script-request-body
// HAR 已确认请求格式：application/x-www-form-urlencoded
// body: data=<URL 编码后的 JSON>
// 目标：
// 1) 清空本地开屏广告候选 adinfo.s / adinfo.d，并清空 final_backup_key。
// 2) 每次 splash 启动时打印持久化探针保存的近期疑似开屏预取记录。
// 其余启动参数保持不变；解析失败时 fail-open 原样放行。

(() => {
  const originalBody = $request?.body;

  console.log("baidu-app-splash-request-v1 2026-08-26");
  dumpSplashCacheHistory();

  if (typeof originalBody !== "string" || originalBody.length === 0) {
    console.log("百度App v1 / splash-request: 无文本请求体，原样放行");
    $done({ body: originalBody });
    return;
  }

  try {
    const result = rewriteFormBody(originalBody);

    if (!result.matched) {
      console.log("百度App v1 / splash-request: 未找到 data 表单字段，原样放行");
      $done({ body: originalBody });
      return;
    }

    if (!result.changed) {
      console.log("百度App v1 / splash-request: 无需修改开屏请求字段");
      $done({ body: originalBody });
      return;
    }

    console.log(
      `百度App v1 / splash-request: adinfo.s ${result.beforeS}->0, ` +
      `adinfo.d ${result.beforeD}->0, final_backup_key ${result.hadBackupKey ? "cleared" : "already-empty"}`
    );
    console.log("百度App v1 / splash-request: 请求侧净化完成");

    $done({ body: result.body });
  } catch (error) {
    console.log(`百度App v1 / splash-request: 解析失败，原样放行: ${error}`);
    $done({ body: originalBody });
  }
})();

function dumpSplashCacheHistory() {
  const STORE_KEY = "baidu_app_splash_cache_probe_v1";
  const RETENTION_MS = 6 * 60 * 60 * 1000;
  const MAX_DUMP = 30;
  const now = Date.now();

  try {
    const raw = $prefs.valueForKey(STORE_KEY);
    if (!raw) {
      console.log("[splash-cache-history] no-records");
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.log("[splash-cache-history] invalid-store");
      return;
    }

    const recent = parsed
      .filter(item => item && Number.isFinite(item.ts) && now - item.ts >= 0 && now - item.ts <= RETENTION_MS)
      .slice(-MAX_DUMP);

    if (recent.length === 0) {
      console.log("[splash-cache-history] no-recent-records");
      return;
    }

    console.log(`[splash-cache-history] begin count=${recent.length} window=6h`);
    recent.forEach((item, index) => {
      const ageSeconds = Math.max(0, Math.round((now - item.ts) / 1000));
      console.log(
        `[splash-cache-history] #${index + 1} age=${ageSeconds}s ` +
        `kind=${item.kind || "candidate"} ${item.method || "GET"} ` +
        `${item.host || ""}${item.path || "/"}` +
        `${item.queryKeys ? ` ?keys=${item.queryKeys}` : ""}`
      );
    });
    console.log("[splash-cache-history] end");
  } catch (error) {
    console.log(`[splash-cache-history] read-error: ${error}`);
  }
}

function rewriteFormBody(body) {
  const pairs = body.split("&");
  let matched = false;
  let changed = false;
  let beforeS = 0;
  let beforeD = 0;
  let hadBackupKey = false;

  const rewritten = pairs.map((pair) => {
    const equalIndex = pair.indexOf("=");
    const rawName = equalIndex === -1 ? pair : pair.slice(0, equalIndex);
    const rawValue = equalIndex === -1 ? "" : pair.slice(equalIndex + 1);

    if (decodeFormComponent(rawName) !== "data") return pair;

    matched = true;

    const decoded = decodeFormComponent(rawValue);
    const data = JSON.parse(decoded);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("data 不是 JSON object");
    }

    if (data.adinfo && typeof data.adinfo === "object" && !Array.isArray(data.adinfo)) {
      if (Array.isArray(data.adinfo.s)) {
        beforeS = data.adinfo.s.length;
        if (beforeS > 0) {
          data.adinfo.s = [];
          changed = true;
        }
      }

      if (Array.isArray(data.adinfo.d)) {
        beforeD = data.adinfo.d.length;
        if (beforeD > 0) {
          data.adinfo.d = [];
          changed = true;
        }
      }

      // adinfo.v 为 HAR 中存在的版本/状态字段，保留不动。
    }

    if (typeof data.final_backup_key === "string") {
      hadBackupKey = data.final_backup_key.length > 0;
      if (hadBackupKey) {
        data.final_backup_key = "";
        changed = true;
      }
    }

    return `${rawName}=${encodeURIComponent(JSON.stringify(data))}`;
  });

  return {
    matched,
    changed,
    beforeS,
    beforeD,
    hadBackupKey,
    body: rewritten.join("&")
  };
}

function decodeFormComponent(value) {
  return decodeURIComponent(String(value).replace(/\+/g, "%20"));
}
