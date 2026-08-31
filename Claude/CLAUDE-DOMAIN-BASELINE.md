# Claude 公共域名基线（研究阶段）

> 更新时间：2026-08-31
>
> 状态：**仅做公开证据归档，不是 Quantumult X 生效规则。**
>
> 目标：在不登录 Claude 账号、不抓取账号会话流量的前提下，先建立官方公开信息能够确认的 Claude / Anthropic 域名基线。后续再与本仓库现有 Direct / Advertising / Apple / Google / ChinaMax 等规则做冲突审计。

## A. 高置信度第一方域名

| 域名 | 公开证据 | 当前判断 |
|---|---|---|
| `claude.ai` | Anthropic Help Center 明确将其列为 Claude Web 入口；登录文档也明确说明 Web / Desktop / Mobile 共用 Claude 账号登录体系 | **Claude 消费者产品核心域名** |
| `anthropic.com` | Anthropic 官方主域；Privacy Center 的认证/安全 Cookie 明确覆盖 `.anthropic.com` | **Anthropic 第一方主域** |
| `api.anthropic.com` | Anthropic 官方 API 文档和工程文章明确使用该 API 域名 | **Anthropic 官方 API 域名；尚未证明 iOS App 必然直接调用** |
| `console.anthropic.com` | Privacy Center 的认证 Cookie 明确覆盖 `console.anthropic.com` | **官方 Console；当前不视为消费者 iOS 必需域名** |
| `statsig.anthropic.com` | Anthropic Help Center 的“Approved network domains”明确列为 Anthropic Services | **官方 Anthropic 服务域名；尚未证明 iOS App 必然调用** |

## B. 官方辅助站点（当前不纳入核心 App 路由）

| 域名 | 用途 | 当前处理 |
|---|---|---|
| `support.claude.com` | Claude Help Center | 仅记录，不作为 App 核心域名 |
| `privacy.claude.com` | Anthropic / Claude Privacy Center | 仅记录，不作为 App 核心域名 |
| `docs.anthropic.com` | Anthropic Developer Docs | 仅记录，不作为 App 核心域名 |
| `claude.com` | Anthropic 当前部分产品/品牌页面使用该域名，Privacy Center 也出现 `.claude.com` | **保留观察，不在没有 iOS 实证前直接纳入核心分流** |

## C. 条件型第三方服务

### Google 登录

Anthropic 官方登录文档明确提供 “Continue with Google”。因此 Google 网络请求属于**条件型认证流量**：只有用户选择 Google 登录时才应视为相关。

当前原则：

- 不因为 Claude 使用 Google 登录，就把整个 Google 域名体系强制绑定到 Claude 策略。
- 后续只根据实际、公开可验证的认证链路决定是否需要局部处理。
- 邮箱 Secure Link 登录则不应引入 Google 登录链。

### Cloudflare / Stripe / Intercom / Analytics / Marketing

Anthropic Privacy Center 公开列出了 Cloudflare、Stripe、Intercom、Google Analytics、LinkedIn、Facebook、Reddit、TikTok、Twitter 等 Cookie/第三方用途。

**这些资料只能证明 Anthropic 网站存在相关第三方服务或 Cookie，不足以证明 Claude iOS App 的核心会话一定直接访问相应第三方域名。** 因此现阶段不把这些第三方服务批量加入 Claude 分流。

## D. 第一版候选核心集合

当前仅用于下一阶段冲突审计：

```text
claude.ai
anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
```

其中真正建议优先作为消费者 Claude 核心候选的是：

```text
claude.ai
anthropic.com
```

`api.anthropic.com`、`statsig.anthropic.com`、`console.anthropic.com` 暂时保留为“官方第一方、用途明确，但尚缺 iOS App 直接调用证据”。

## E. 明确不做的推断

在获得进一步证据前，不做以下推断：

- 不把所有 `google.com` / `googleapis.com` 都归入 Claude。
- 不把所有 `cloudflare.com` / Cloudflare IP 归入 Claude。
- 不因为 Cookie 中出现 Stripe / Intercom 就直接加入 `stripe.com` / `intercom.io`。
- 不根据第三方社区规则直接加入 CDN、遥测、Sentry、Segment 等域名。
- 不通过伪造地区、修改请求头、修改定位/GEOIP、MITM Claude 会话来建立规则。

## F. 官方公开来源

- Anthropic Help Center — Get started with Claude: https://support.claude.com/en/articles/8114491-get-started-with-claude
- Anthropic Help Center — Log in to your Claude account: https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account
- Anthropic Help Center — Install Claude for iOS: https://support.claude.com/en/articles/9266462-install-claude-for-ios
- Anthropic Privacy Center — What Cookies Does Anthropic Use?: https://privacy.claude.com/en/articles/10023541-what-cookies-does-anthropic-use
- Anthropic Help Center — Create and edit files with Claude（Approved network domains）: https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
- Anthropic Engineering — How we contain Claude across products: https://www.anthropic.com/engineering/how-we-contain-claude

## G. 下一阶段

下一步只做**规则冲突审计**，仍不登录 Claude：

1. 检查 `claude.ai` / `anthropic.com` / `api.anthropic.com` / `statsig.anthropic.com` / `console.anthropic.com` 是否已被仓库中的 `Direct.list`、`Advertising.list`、`Advertising-2.list`、Google、Apple、ChinaMax 等提前命中。
2. 明确每个候选域名在当前 Quantumult X 配置中的实际命中优先级。
3. 只有冲突审计完成后，才设计 Claude 专用 policy / list。
