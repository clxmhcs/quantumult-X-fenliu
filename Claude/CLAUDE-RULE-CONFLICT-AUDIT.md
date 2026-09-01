# Claude 规则冲突审计

> 更新时间：2026-09-01
>
> 状态：**静态审计阶段；不登录 Claude，不抓账号会话，不修改现有 Quantumult X 生效规则。**
>
> 基线：`Claude/CLAUDE-DOMAIN-BASELINE.md` + 当前 `quantumult_20260831.conf` 配置快照。

## 1. 审计对象

第一版官方第一方候选域名：

```text
claude.ai
anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
```

其中优先级最高的消费者 Claude 核心候选仍为：

```text
claude.ai
anthropic.com
```

## 2. 当前规则命中审计

| 规则资源 | 当前策略 | 审计结果 | 结论 |
|---|---|---|---|
| `Direct/Direct.list` | `direct` | 已读取完整文件，未发现上述 Claude / Anthropic 第一方候选域名 | **未发现冲突** |
| `ChatGPT/OpenAI.list` | `Chatgpt` | 已读取完整文件，规则面向 OpenAI 及其相关第三方域名；未发现上述 Claude / Anthropic 第一方候选域名 | **未发现第一方冲突** |
| `Google/Google.list` | `Google` | 已读取规则；未发现 `anthropic` 第一方匹配 | **未发现第一方冲突** |
| `Apple/Apple.list` | `direct` | 已读取规则；未发现 `anthropic` 第一方匹配 | **未发现第一方冲突** |
| `Advertising/Advertising-2.list` | `reject` | 已读取完整文件；当前内容为天气、百度贴吧、日历等自建广告规则，未发现 Claude / Anthropic 第一方候选域名 | **未发现冲突** |
| `Advertising/Advertising.list` | `reject` | 文件约 11.96 MB；GitHub 连接器无法完整读取，代码搜索返回 `incomplete_results=true` | **未完成，不能宣告无冲突** |
| `ChinaMax/ChinaMax.list` | `direct` | 文件约 4.18 MB；GitHub 连接器无法完整读取，代码搜索返回 `incomplete_results=true` | **未完成，不能宣告无冲突** |
| `ChinaMax/ChinaMax_No_IPv6.list` | `direct` | 文件约 4.03 MB；同属超大规则文件，当前连接器无法完成逐条验证 | **未完成，不能宣告无冲突** |

## 3. GitHub 代码搜索限制

针对 `claude.ai` / `anthropic` 的仓库代码搜索曾返回 0 条结果，但同时返回：

```text
incomplete_results = true
```

并且新建的 Claude 基线文件也未被搜索稳定检出。因此：

> **GitHub 当前代码搜索不能作为“超大规则文件不存在某域名”的最终证明。**

对 `Advertising.list`、`ChinaMax.list`、`ChinaMax_No_IPv6.list` 必须保留“未完全验证”状态，不能根据 0 条搜索结果直接标记 PASS。

上一版审计曾把 `statsig.anthropic.com` 在 `Advertising.list` 中的命中写成“已确认”，并把 `ChinaMax_No_IPv6.list` 写成“空文件”。当前复核不能支持这两个结论：前者受超大文件读取/索引限制尚未独立验证；后者当前仓库元数据显示文件约 4.03 MB。因此本版撤回这两个未经充分证据支持的结论。

## 4. 当前 Quantumult X 的暂定命中路径

根据当前 `quantumult_20260831.conf` 的启用顺序，如果 Claude 第一方域名没有隐藏在尚未完成审计的超大规则文件中，也没有被其他更早规则命中，则当前会继续落到：

```text
Claude 第一方请求
    ↓
现有远程规则均未命中
    ↓
final, 黑白名单
    ↓
黑白名单
    ↓
【港·日】节点
    ↓
url-latency-benchmark 自动测速组
```

因此现阶段仍不能把当前配置视为 Claude 的确定性路由环境。

## 5. 已确认不存在的问题

截至本阶段，已有证据支持：

- `Direct.list` 没有把 Claude 第一方候选域名强制 `direct`。
- `Advertising-2.list` 没有把 Claude 第一方候选域名 `reject`。
- `OpenAI.list` 没有把 Claude 第一方候选域名误归入 ChatGPT。
- Google / Apple 规则没有直接包含 Anthropic 第一方候选域名。
- 当前配置未把 `claude.ai` / `anthropic.com` 加入 MITM hostname。
- 当前没有 Claude 专用 Rewrite。

## 6. 尚未关闭的风险

当前仅剩两个主要静态风险面：

1. **超大通用规则文件未知命中**
   - `Advertising.list`
   - `ChinaMax.list`
   - `ChinaMax_No_IPv6.list`

2. **无 Claude 专用前置规则时的兜底不确定性**
   - 未命中的 Claude 请求进入 `final → 黑白名单 → 【港·日】节点`；
   - `【港·日】节点` 是自动测速组，不属于固定 Claude 专用路径。

## 7. 下一阶段设计原则

在不依赖超大通用规则文件是否包含 Claude 域名的情况下，下一阶段应通过**更高优先级的 Claude 专用规则**建立确定性路由边界：

```text
Claude 专用规则
    ↓
Claude 专用 policy
    ↓
再进入 Advertising / ChinaMax / 其他通用规则
```

这样可以从架构上避免 Claude 第一方域名被后面的通用广告、国内站点或最终兜底规则接管。

但下一阶段仍遵守以下限制：

- 不把整个 Google / Apple / Cloudflare 域名体系绑定到 Claude。
- 不修改 Claude 请求头、定位信息、GEOIP 或账号数据。
- 不给 Claude 加 MITM / Rewrite。
- 不使用自动测速、负载均衡作为 Claude 专用 policy 的内部自动切换逻辑。
- 本文件只讨论稳定、一致、可审计的网络分流，不讨论伪造地区或规避服务访问限制。

## 8. 阶段结论

第三步结论：**PARTIAL PASS**。

已确认的小型/中型规则没有 Claude 第一方冲突；三个超大通用规则文件受 GitHub 连接器和代码搜索限制，暂不能完成逐条排除。因此不能写成“所有现有规则均无冲突”。

下一步进入 Claude 专用 policy / list 的结构设计，使第一方 Claude 域名在规则优先级上先于通用 Advertising / ChinaMax / final，从架构层面消除当前最大的路由不确定性。
