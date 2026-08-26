// 百度主 App 搜索广告首帧隐藏实验 - CSS v1
// Quantumult X script-response-body
//
// 目标响应：
// https://ms.bdstatic.com/se/chat-search/static/search-*.css
//
// 目的：把广告隐藏规则前移到搜索页 CSS 加载阶段，避免等待
// wiseSearchHasAd-*.js 执行后才隐藏，从而减少“广告先出现再消失”。
//
// 本脚本：
// - 不扫描 DOM
// - 不使用 MutationObserver / setTimeout
// - 不修改普通搜索结果数据
// - 仅在原 CSS 末尾追加已由百度搜索前端确认的广告选择器

const TAG = "baidu-app-search-css-v1";
const SIGNATURE = "__QX_BAIDU_SEARCH_CSS_V1__";

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

  const patch = `\n/* ${SIGNATURE} */\n.ec_wise_ad,.c-container:has(.ecfc-tuiguang),.ec-result-inner:has(.ecfc-tuiguang){display:none!important;visibility:hidden!important;}\n`;

  console.log(`[${TAG}] patched css bytes=${originalBody.length} observer=0 domscan=0`);
  $done({ body: originalBody + patch });
})();
