# Claude 规则冲突审计

> 更新时间：2026-09-01
>
> 状态：**第三阶段静态审计完成；不登录 Claude，不抓账号会话，不修改现有 Quantumult X 生效规则。**
>
> 基线：`Claude/CLAUDE-DOMAIN-BASELINE.md` + 当前 `quantumult_20260831.conf` 配置快照 + 用户上传的当前 `Advertising.list` / `ChinaMax.list` / `ChinaMax_No_IPv6.list` 原文件。

## 1. 审计对象

第一版官方第一方候选域名：

```text
claude.ai
anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
```

辅助观察域名：

```text
claude.com
support.claude.com
privacy.claude.com
docs.anthropic.com
```

## 2. 已检查的当前规则资源

仓库内：

- `Direct/Direct.list`
- `Advertising/Advertising.list`
- `Advertising/Advertising-2.list`
- `ChinaMax/ChinaMax.list`
- `ChinaMax/ChinaMax_No_IPv6.list`
- `Google/Google.list`
- `Apple/Apple.list`
- `ChatGPT/OpenAI.list`

同时结合当前 `quantumult_20260831.conf` 的启用状态和 `filter_remote` 顺序进行判断。

## 3. 大文件本地原文件复核

GitHub 对超大规则文件的全文搜索存在 `incomplete_results` 和读取限制，因此本阶段改用用户上传的当前原文件完成逐行复核。

文件规模：

```text
Advertising.list          279423 行 / 11963033 bytes
ChinaMax.list             123862 行 / 4175943 bytes
ChinaMax_No_IPv6.list     119886 行 / 4029640 bytes
```

针对以下候选字符串执行精确检查：

```text
claude.ai
anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
claude.com
support.claude.com
privacy.claude.com
docs.anthropic.com
```

并结合 `HOST` / `HOST-SUFFIX` / `HOST-KEYWORD` / `HOST-WILDCARD` / `IP-CIDR` / `IP6-CIDR` / `IP-ASN` 等规则类型进行复核。

## 4. 关键发现

### 4.1 已确认冲突：`statsig.anthropic.com`

当前 `Advertising/Advertising.list` 第 272100 行存在：

```text
HOST-SUFFIX,statsig.anthropic.com,Advertising
```

而当前 Quantumult X 配置对该远程资源使用：

```ini
force-policy=reject
enabled=true
```

因此在没有更高优先级修正规则时：

```text
statsig.anthropic.com
        ↓
Advertising.list
        ↓
REJECT
```

这是本轮唯一已经确认的 Claude / Anthropic 第一方候选域名冲突。

### 4.2 `ChinaMax.list`

上传的当前原文件中未发现上述 Claude / Anthropic 候选域名直接命中。

### 4.3 `ChinaMax_No_IPv6.list`

上传的当前原文件中未发现上述 Claude / Anthropic 候选域名直接命中。

### 4.4 `Advertising-2.list`

已读取完整文件，当前内容主要为天气、百度贴吧、日历等自建广告规则，未发现 Claude / Anthropic 第一方候选域名。

### 4.5 `Direct.list`

已读取完整文件，未发现 Claude / Anthropic 第一方候选域名，因此当前不存在这些第一方域名被本仓库 Direct 白名单直接接管的证据。

### 4.6 Google / Apple / OpenAI

已检查的当前仓库规则中未发现 Claude / Anthropic 第一方候选域名本身。

如果用户主动选择 Google 登录，Google 认证链本身仍属于 Google 流量；这不等于 Claude 第一方域名被 Google 规则误命中，也不应因此把整个 Google 域名体系归入 Claude。

## 5. 当前候选域名命中矩阵

| 域名 | Direct | Advertising | Advertising-2 | ChinaMax | Google | Apple | OpenAI | 当前静态判断 |
|---|---|---|---|---|---|---|---|---|
| `claude.ai` | 无 | 无已确认命中 | 无 | 无 | 无 | 无 | 无 | 未有专用规则时进入后续规则 / Final |
| `anthropic.com` | 无 | 无已确认命中 | 无 | 无 | 无 | 无 | 无 | 未有专用规则时进入后续规则 / Final |
| `api.anthropic.com` | 无 | 无已确认命中 | 无 | 无 | 无 | 无 | 无 | 未有专用规则时进入后续规则 / Final |
| `statsig.anthropic.com` | 无 | **命中** | 无 | 无 | 无 | 无 | 无 | **当前会被 Advertising 资源 REJECT，必须修正** |
| `console.anthropic.com` | 无 | 无已确认命中 | 无 | 无 | 无 | 无 | 无 | 未有专用规则时进入后续规则 / Final |

## 6. 当前 Final 路径问题

现有配置没有 `Claude` 专用策略组，也没有 Claude 专用远程分流。

当前本地兜底为：

```ini
final, 黑白名单
```

而 `黑白名单` 指向：

```text
【港·日】节点
```

该组是 `url-latency-benchmark` 自动测速组。

因此，对没有被其他规则提前命中的 Claude 第一方域名，当前结构不能保证长期由一个固定出口处理。

这里的结论只针对网络路径稳定性与配置确定性，不涉及规避任何服务商地区限制或风控。

## 7. Quantumult X 规则顺序注意事项

Quantumult X 远程分流资源需要关注资源先后顺序；修正规则通常应放在广告拦截规则之前。

同时，Quantumult X 的“分流匹配优化”可能按规则类型优先级影响匹配结果，因此后续 Claude 修正规则应使用与冲突规则同等或更高精度的域名规则，避免依赖宽泛 `HOST-KEYWORD`。

本项目后续优先采用：

```text
HOST-SUFFIX / HOST
```

而不是宽泛关键词规则。

## 8. 第三阶段结论

第三步静态冲突审计：**PASS with 1 confirmed conflict**。

唯一已确认必须处理的问题：

```text
statsig.anthropic.com
→ Advertising.list
→ REJECT
```

其余第一版 Claude / Anthropic 第一方候选域名目前没有在已检查的 Direct / Advertising-2 / ChinaMax / Google / Apple / OpenAI 资源中发现冲突。

此前因 GitHub 超大文件读取限制而保留的 `PARTIAL PASS` 状态，现已通过用户上传的三份当前原文件完成补充验证，可以关闭。

## 9. 下一阶段

第四阶段只做“Claude 专用分流设计”，仍不要求登录 Claude：

1. 新建 `Claude/Claude.list`。
2. 仅纳入有官方证据支持的第一方域名，不批量加入 Google / Cloudflare / Stripe / Intercom 等第三方域名。
3. Claude 远程资源放在 Advertising 资源之前，以修正 `statsig.anthropic.com` 的误杀。
4. 新建独立 `Claude` policy，目标是固定、可预测的网络路径；不使用自动测速组作为 Claude 会话的直接策略。
5. 不给 Claude / Anthropic 域名增加 MITM、Rewrite、请求头改写或 GEOIP/定位伪造。
6. 完成静态验收后才进入任何实机验证。
