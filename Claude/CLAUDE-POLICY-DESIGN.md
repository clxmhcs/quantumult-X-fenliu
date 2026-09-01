# Claude 专用分流设计

> 更新时间：2026-09-01
>
> 状态：**第四阶段设计完成；本文件用于 Quantumult X 结构设计，不代表已修改用户当前配置。**

## 1. 目标

为 Claude / Anthropic 第一方域名建立独立、可预测、可审计的分流边界，避免其落入通用广告规则、ChinaMax 或 Final 自动测速组。

本设计只处理网络路径稳定性与配置确定性，不用于伪造地区、修改定位、规避服务商地区政策或账号风控。

## 2. Claude.list

本仓库已新增：

```text
Claude/Claude.list
```

当前规则：

```text
HOST-SUFFIX,claude.ai,Claude
HOST,api.anthropic.com,Claude
HOST,statsig.anthropic.com,Claude
HOST,console.anthropic.com,Claude
HOST-SUFFIX,anthropic.com,Claude
```

设计理由：

- `claude.ai`：Claude 消费者产品核心第一方域名。
- `anthropic.com`：Anthropic 第一方主域，覆盖一般子域。
- `api.anthropic.com` / `console.anthropic.com`：官方第一方子域，显式列出便于审计。
- `statsig.anthropic.com`：当前 `Advertising.list` 已确认存在同域名 REJECT，因此使用精确 `HOST` 规则显式覆盖。

当前不把 Google / Cloudflare / Stripe / Intercom / Sentry / Segment 等第三方域名批量归入 Claude。

## 3. 推荐 policy 结构

Quantumult X 中建议增加独立静态策略组：

```ini
static=Claude, <固定节点A>, <固定节点B>
```

原则：

- Claude 策略组只放人工选择的固定节点或固定代理入口。
- 不把 `台湾节点`、`日本节点`、`香港节点`、`【港·日】节点` 等 `url-latency-benchmark` 自动组直接作为 Claude 的最终会话出口。
- 不使用负载均衡或按延迟自动切换来维持同一 Claude 会话。
- 具体节点应由用户在符合服务商政策的前提下自行选择，本仓库不固化具体地区节点。

## 4. 推荐 filter_remote 结构

应将 Claude 远程规则放在通用广告规则之前：

```ini
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

推荐顺序：

```text
OpenAI / TikTok / Gemini / AV / Microsoft / Apple / Direct
Claude
Advertising
Advertising-2
GitHub
ChinaMax_No_IPv6
ChinaMax
Google
...
```

关键目标：

```text
statsig.anthropic.com
        ↓
Claude.list 精确 HOST
        ↓
force-policy=Claude
        ↓
不再进入 Advertising.list 的 REJECT
```

## 5. 零修改区

Claude / Anthropic 第一方域名保持：

```text
无 MITM
无 Rewrite
无 request-header 改写
无 response-body 改写
无 Cookie / Authorization / User-Agent 修改
无 GEOIP / 定位 / 国家字段伪造
```

当前用户配置的 `[mitm] hostname` 中没有 Claude / Anthropic 域名，应继续保持。

## 6. DNS / IPv6

第四阶段不修改当前 DNS 与 `no-ipv6`。

原因：当前最明确的问题是专用路由缺失和 `statsig.anthropic.com` 被广告规则误杀。DNS / IPv6 应在下一阶段单独审计，不与 policy 结构同时改动，避免一次引入过多变量。

## 7. 当前配置需要的最小结构变化

未来正式落地时，仅需要两处：

```ini
[policy]
static=Claude, <固定节点A>, <固定节点B>
```

以及在 `[filter_remote]` 中、`Advertising.list` 之前增加：

```ini
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

此阶段不删除或修改 `Advertising.list` 中的 `statsig.anthropic.com`，通过更高优先级 Claude 专用规则隔离，避免影响广告规则上游维护。

## 8. 静态验收目标

正式修改配置后，应在不登录 Claude 的情况下先确认：

```text
claude.ai              → Claude
*.claude.ai            → Claude
anthropic.com           → Claude
api.anthropic.com       → Claude
statsig.anthropic.com   → Claude
console.anthropic.com   → Claude
```

并确认：

```text
不 REJECT
不 DIRECT
不进入 Final
不进入 【港·日】自动测速
不 MITM
不 Rewrite
```

## 9. 阶段结论

第四阶段：**DESIGN PASS**。

仓库侧已具备独立 `Claude.list`；下一阶段应把该结构映射到当前 `quantumult_20260831.conf` 的具体修改草案，并进行 DNS / IPv4 / IPv6 / MITM / Rewrite 静态审计，仍不需要登录 Claude。
