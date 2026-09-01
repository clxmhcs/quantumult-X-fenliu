# Claude 当前配置映射与静态网络审计

> 更新时间：2026-09-01
>
> 状态：**第五阶段静态映射完成；尚未修改用户当前 `quantumult_20260831.conf`，尚未登录 Claude。**
>
> 基线：当前 `quantumult_20260831.conf` + `Claude/Claude.list` + `Claude/CLAUDE-POLICY-DESIGN.md`。

## 1. 本阶段目标

把第四阶段已经确定的 Claude 专用规则结构映射到当前 Quantumult X 配置，明确最小修改位置，并对 DNS / IPv4 / IPv6 / UDP / MITM / Rewrite 做静态审计。

本阶段只处理配置稳定性、确定性与冲突隔离，不用于伪造地区、修改定位、规避服务商地区政策或账号风控。

## 2. 当前配置的两个确定性问题

### 2.1 Claude 没有独立 policy

当前 `[policy]` 中不存在 `Claude`。

Claude 第一方域名如果没有被更早规则命中，会继续进入：

```text
final
↓
黑白名单
↓
【港·日】节点
↓
url-latency-benchmark
```

因此当前 Claude 网络路径不是独立、固定、可审计的。

### 2.2 `statsig.anthropic.com` 会被 Advertising 拒绝

第三阶段已经确认：

```text
Advertising.list
HOST-SUFFIX,statsig.anthropic.com,Advertising
```

而当前配置对该资源使用：

```text
force-policy=reject
```

所以必须让 Claude 专用规则在 Advertising 之前接管该域名。

## 3. `[policy]` 的最小映射

当前配置应新增一个独立静态组：

```ini
static=Claude, <固定节点A>, <固定节点B>
```

该组必须满足：

- 成员是用户主动选择的固定服务器标签或固定代理入口；
- 不直接使用 `台湾节点` / `日本节点` / `香港节点` / `【港·日】节点` 这类 `url-latency-benchmark` 自动测速组作为 Claude 的会话出口；
- 不使用负载均衡；
- 不在同一会话过程中依赖延迟变化自动切换；
- 节点选择应符合服务商当前支持地区及账户使用规则。

当前基线中已经存在多个单独服务器标签，可作为静态组成员候选；本仓库不替用户固化具体地区或具体节点。

> 因此本阶段可以确定 `[policy]` 的结构和插入位置，但在用户选定合规的固定节点之前，不生成带具体节点的最终激活行。

## 4. `[filter_remote]` 的精确映射

当前顺序片段为：

```text
Apple
Direct
Advertising
Advertising-2
GitHub
ChinaMax_No_IPv6
ChinaMax
Google
```

应改为：

```text
Apple
Direct
Claude
Advertising
Advertising-2
GitHub
ChinaMax_No_IPv6
ChinaMax
Google
```

新增行：

```ini
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

即放在：

```ini
.../Direct/Direct.list
```

之后，且必须位于：

```ini
.../Advertising/Advertising.list
```

之前。

目标路径：

```text
statsig.anthropic.com
↓
Claude.list
↓
force-policy=Claude
↓
不再继续落入 Advertising.list → REJECT
```

## 5. 当前 Claude.list 静态检查

当前仓库规则：

```text
HOST-SUFFIX,claude.ai,Claude
HOST,api.anthropic.com,Claude
HOST,statsig.anthropic.com,Claude
HOST,console.anthropic.com,Claude
HOST-SUFFIX,anthropic.com,Claude
```

静态覆盖关系：

```text
claude.ai            → Claude
*.claude.ai          → Claude
anthropic.com         → Claude
*.anthropic.com       → Claude
api.anthropic.com     → Claude
statsig.anthropic.com → Claude
console.anthropic.com → Claude
```

`HOST-SUFFIX,anthropic.com` 本身已经覆盖三个显式子域；三个 `HOST` 保留是为了审计可读性和对 `statsig.anthropic.com` 冲突的显式修正。

本阶段仍不加入整个 Google / Apple / Cloudflare / Stripe / Intercom / Sentry / Segment 域名体系。

## 6. DNS 静态审计

当前 `[dns]`：

```ini
no-ipv6
server=119.29.29.29
server=223.5.5.5
server=1.1.1.1
```

以及若干与 Claude 无关的按域名指定 DNS。

当前判断：

- 没有 Claude / Anthropic 专用 DNS 覆盖；
- 没有发现 `claude.ai` / `anthropic.com` 被定向到某个特殊 DNS；
- `no-ipv6` 会使当前 Quantumult X DNS 层以禁用 IPv6 解析为基线，这有助于减少常见的 IPv4 / IPv6 双栈路径差异；
- 但仅凭静态配置不能证明代理服务器自身的上游传输一定不使用 IPv6；节点名称中的 `[v6]` 也只应视为标签，不能替代实际链路验证；
- 当前没有证据说明 119.29.29.29 / 223.5.5.5 / 1.1.1.1 的混合使用已经造成 Claude 异常，因此第五阶段不修改 DNS。

结论：**DNS 保持不变。**

## 7. IPv4 / IPv6 静态审计

当前配置具备：

```text
DNS: no-ipv6
filter_local: 仅局域网 fe80::/10 direct
```

未发现 Claude 专用 `IP6-CIDR`、IPv6 直连例外或针对 Anthropic 的 IPv6 特殊分流。

因此当前没有静态证据表明 Claude 第一方域名会因为专门的 IPv6 规则绕过 Claude policy。

但第五阶段只能确认“配置中没有显式 Claude IPv6 旁路”，不能证明最终代理出口协议栈；后者属于后续运行时验收。

## 8. UDP / 443 静态审计

当前 `[general]`：

```ini
udp_whitelist=1-442, 444-65535
```

即 443 不在该白名单范围内。

这可能影响部分 UDP/443 / QUIC / HTTP/3 路径并促使连接使用其他传输方式，但本阶段不把这一行解释为已证明的 Claude 故障原因，也不修改它。

原因：

- 当前没有 Claude 实际会话证据证明 UDP/443 是问题源；
- 同时修改 policy、DNS 和 UDP 会增加变量；
- 应先完成 Claude 专用路由，再在后续静态/运行时验收中单独判断是否存在传输层异常。

结论：**UDP 白名单保持不变。**

## 9. MITM 静态审计

当前 `[mitm] hostname` 包含京东、贴吧、百度、联通、优酷等业务域名，但没有：

```text
claude.ai
*.claude.ai
anthropic.com
*.anthropic.com
```

因此当前 Claude / Anthropic 第一方 HTTPS 不属于现有 MITM hostname 集合。

后续继续保持：

```text
Claude / Anthropic → 不加入 MITM
```

特别不应为了分流而把 Claude 域名加入证书解密列表。

结论：**MITM PASS，无需修改。**

## 10. Rewrite 静态审计

当前启用的主要 Rewrite 资源包括：

```text
百度 App 去广告
贴吧去广告
京东比价
Netflix 评分
Bilibili 去广告
TestFlight 区域模块
```

当前没有 Claude / Anthropic 专用 Rewrite，`[rewrite_local]` 为空。

结合 MITM hostname 中不存在 Claude / Anthropic，当前没有证据表明这些 App 专用响应重写会进入 Claude 第一方 HTTPS 正文。

后续继续保持：

```text
无 Claude request-header rewrite
无 Claude response-body rewrite
无 Cookie / Authorization 修改
无 User-Agent 修改
无设备/地区字段注入
```

结论：**Rewrite PASS，无需修改。**

## 11. 第五阶段最小修改集

正式落地时只修改两处：

### A. `[policy]`

新增：

```ini
static=Claude, <固定节点A>, <固定节点B>
```

### B. `[filter_remote]`

在 `Direct.list` 与 `Advertising.list` 之间新增：

```ini
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

其余保持：

```text
DNS              不改
no-ipv6          不改
udp_whitelist    不改
MITM             不改
Rewrite          不改
Advertising.list 不删规则
ChinaMax         不改
Final            不改
```

## 12. 修改后的预期静态路径

```text
claude.ai
*.claude.ai
anthropic.com
*.anthropic.com
api.anthropic.com
statsig.anthropic.com
console.anthropic.com
        ↓
Claude.list
        ↓
Claude policy
        ↓
人工选定的固定出口
```

不再预期进入：

```text
Advertising → REJECT
ChinaMax → DIRECT
Final → 黑白名单 → 【港·日】自动测速
```

## 13. 第五阶段结论

第五阶段：**STATIC MAPPING PASS**。

已完成：

- 当前配置精确插入位置；
- Claude.list 与 Advertising 冲突隔离路径；
- DNS 静态审计；
- IPv4 / IPv6 静态审计；
- UDP/443 静态审计；
- MITM 静态审计；
- Rewrite 静态审计。

尚未执行：

- 不修改用户当前配置文件；
- 不替用户选择具体地区或固定节点；
- 不登录 Claude；
- 不进行账号级实验。

下一阶段应在用户选定符合服务商政策的固定节点后，生成可直接粘贴到当前 Quantumult X 配置的最终两行修改，并做修改后的静态路径验收。