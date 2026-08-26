// 百度主 App 搜索广告首帧隐藏实验 - CSS v2
// Quantumult X script-response-body
//
// 目标响应：
// https://ms.bdstatic.com/se/chat-search/static/search-*.css
//
// v2 目的：验证百度自身 wiseForceDisplay 使用的 [class^="ec_r_"]
// 是否是比 .ecfc-tuiguang / .ec_wise_ad 更早出现的搜索广告身份。
//
// 本脚本：
// - 不扫描 DOM
// - 不使用 MutationObserver / setTimeout
// - 不修改搜索结果数据
// - 仅在原 CSS 末尾追加广告隐藏规则
// - 在 v1 已验证选择器基础上，新增百度自身广告展示逻辑明确使用的 [class^="ec_r_"]
//
// 诊断意义：
// - 若 v2 后首帧闪现消失：说明 ec_r_* 早于“广告/推广”标志出现；
// - 若仍先出现再消失：说明 search-*.css 本身加载时机仍晚，需继续追更早资源/上游数据。

const TAG = "baidu-app-search-css-v2";
const SIGNATURE = "__QX_BAIDU_SEARCH_CSS_V2__";

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

  const patch = `\n/* ${SIGNATURE} */\n[class^="ec_r_"],.ec_wise_ad,.c-container:has(.ecfc-tuiguang),.ec-result-inner:has(.ecfc-tuiguang){display:none!important;visibility:hidden!important;}\n`;

  console.log(`[${TAG}] patched css bytes=${originalBody.length} early=ec_r_ fallback=ec_wise_ad/ecfc-tuiguang observer=0 domscan=0`);
  $done({ body: originalBody + patch });
})();
