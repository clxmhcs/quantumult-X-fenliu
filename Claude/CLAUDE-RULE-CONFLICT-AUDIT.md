# Claude / Quantumult X 规则冲突审计

> 更新时间：2026-08-31
>
> 状态：**静态审计完成；不修改 Quantumult X 生效规则，不登录 Claude。**
>
> 基线：`quantumult_20260831.conf` + `Claude/CLAUDE-DOMAIN-BASELINE.md`

## 1. 审计目标

针对第一版候选域名：

```text
claude.ai
anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
```

检查当前仓库及现行 Quantumult X 配置中，是否会被已有规则提前命中，重点覆盖：

```text
ChatGPT/OpenAI.list
TikTok/TikTok-2.list
Google/Gemini.list
Google/AV.list
Microsoft/Microsoft.list
Apple/Apple.list
Direct/Direct.list
Advertising/Advertising.list
Advertising/Advertising-2.list
ChinaMax/ChinaMax_No_IPv6.list
ChinaMax/ChinaMax.list
Google/Google.list
```

本阶段只做静态规则审计；不通过 Claude 账号登录或抓取会话流量验证。

## 2. 当前 Quantumult X 相关规则顺序

现行配置中，相关已启用规则大致按以下顺序出现：

```text
ChatGPT/OpenAI.list        -> Chatgpt
TikTok/TikTok-2.list      -> TikTok
Google/Gemini.list        -> Gemini
Google/AV.list            -> 台湾节点
Microsoft/Microsoft.list  -> direct
Apple/Apple.list          -> direct
Direct/Direct.list        -> direct
Advertising.list          -> reject
Advertising-2.list        -> reject
GitHub                     -> proxy
ChinaMax_No_IPv6.list     -> direct
ChinaMax.list              -> direct
Google/Google.list        -> Google
...
final                      -> 黑白名单
黑白名单                   -> 【港·日】节点
【港·日】节点               -> url-latency-benchmark
```

因此：**已有规则先命中时，不会再进入 `final`。**

## 3. 关键冲突：`statsig.anthropic.com`

在当前 `Advertising/Advertising.list` 中发现明确规则：

```text
HOST-SUFFIX,statsig.anthropic.com,Advertising
```

而现行 Quantumult X 配置加载该列表时使用：

```text
force-policy=reject
```

因此，在当前配置下，`statsig.anthropic.com` 存在一个明确的静态规则冲突：

```text
statsig.anthropic.com
        ↓
Advertising.list
        ↓
force-policy=reject
        ↓
REJECT
```

这一点与第一版公开域名基线发生冲突：Anthropic 官方资料把 `statsig.anthropic.com` 列为 Anthropic Services 的 approved network domain，因此不能仅因为它出现在通用广告列表里，就把它视为可安全屏蔽的普通广告域名。

### 当前结论

**这是本轮审计发现的唯一一个直接、确定的 Claude / Anthropic 域名级冲突。**

下一阶段设计 Claude 专用分流时，应确保该第一方域名在 `Advertising.list` 之前被 Claude 专用规则接管；不建议直接删除整个通用广告列表。

## 4. 其余候选域名的静态审计

| 候选域名 | 当前已发现直接域名冲突 | 当前静态判断 |
|---|---|---|
| `claude.ai` | 未发现 | 若无其他运行时匹配，将继续向后落到 `final` |
| `anthropic.com` | 未发现 | 若无其他运行时匹配，将继续向后落到 `final` |
| `api.anthropic.com` | 未发现 | 若无其他运行时匹配，将继续向后落到 `final` |
| `statsig.anthropic.com` | **Advertising.list** | **当前存在 REJECT 冲突** |
| `console.anthropic.com` | 未发现 | 若无其他运行时匹配，将继续向后落到 `final` |

对以下仓库规则做了 Claude / Anthropic 关键字和具体域名检查，未发现第一版候选域名的直接 HOST / HOST-SUFFIX 命中：

```text
ChatGPT/OpenAI.list
TikTok/TikTok-2.list
Google/Gemini.list
Google/AV.list
Microsoft/Microsoft.list
Apple/Apple.list
Direct/Direct.list
Advertising/Advertising-2.list
ChinaMax/ChinaMax.list
Google/Google.list
```

另外：

```text
ChinaMax/ChinaMax_No_IPv6.list
```

当前仓库文件内容为空，因此它本身不会产生 Claude 域名命中。

## 5. 未命中域名现在会走哪里

对于 `claude.ai`、`anthropic.com`、`api.anthropic.com`、`console.anthropic.com`，在本轮静态域名审计范围内没有发现提前接管规则。

因此按照现行配置，它们的默认路径是：

```text
未命中已有域名规则
        ↓
final, 黑白名单
        ↓
static=黑白名单, 【港·日】节点
        ↓
url-latency-benchmark=【港·日】节点
```

也就是说，目前这些域名并没有固定到 Claude 专用出口，而是可能进入自动测速选出的港/日节点。

这不是“已发现封禁风险”的证据；它只是说明当前网络路径缺少 Claude 专用的确定性控制。

## 6. 静态审计的边界

本轮结论是**域名/规则文本层面的静态审计**，不能把它扩大解释成“运行时一定只会命中这些规则”。仍有以下变量未在本阶段验证：

- 某个域名运行时解析出的 IP 是否恰好命中其他启用列表中的 `IP-CIDR` / `IP-ASN`；
- Claude iOS 是否还会使用第一版公开基线之外的第一方或第三方域名；
- 条件型 Google 登录、Apple 系统服务、CDN 等是否参与特定流程；
- App 更新后网络依赖是否变化。

这些都不应通过直接拿账号做“裸跑”来解决；应先完成专用规则设计，再做最小化验证。

## 7. MITM / Rewrite 结论保持不变

现行配置的 `[mitm] hostname` 未包含：

```text
claude.ai
anthropic.com
```

当前启用 Rewrite 也没有 Claude / Anthropic 专用修改。

因此下一阶段仍应保持原则：

```text
Claude 第一方流量
    -> 不 MITM
    -> 不 Rewrite
    -> 不改请求头 / 响应体
```

## 8. 第三阶段结论

本阶段静态审计结果：

```text
[明确冲突]
statsig.anthropic.com
-> Advertising.list
-> reject

[缺少专用路由]
claude.ai
anthropic.com
api.anthropic.com
console.anthropic.com
-> 当前没有 Claude 专用规则
-> 静态审计下最终进入 黑白名单 / 港日自动测速组

[无直接冲突]
Direct.list
Advertising-2.list
Apple.list
Google/Gemini.list
Google/Google.list
Microsoft.list
TikTok-2.list
AV.list
ChinaMax.list

[空文件]
ChinaMax_No_IPv6.list
```

## 9. 下一阶段

下一步开始设计 **Claude 专用 policy + Claude.list**，但仍遵守以下约束：

1. Claude 专用规则必须放在 `Advertising.list` 之前，确保 `statsig.anthropic.com` 不被通用广告列表误杀。
2. 不把 Google / Cloudflare / Stripe / Intercom 等第三方体系整域粗暴绑进 Claude。
3. 不增加 Claude MITM / Rewrite。
4. 不使用自动测速组作为 Claude 专用出口策略本身。
5. 先完成静态配置设计和验收，再考虑实机最小化验证。
