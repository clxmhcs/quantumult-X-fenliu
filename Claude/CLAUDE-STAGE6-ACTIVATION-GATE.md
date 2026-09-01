# Claude 第六阶段：固定节点落地与最终静态验收

> 更新时间：2026-09-01
>
> 状态：**第六阶段静态验收完成；固定节点已确定，正式最小补丁已生成；尚未修改用户本地 `quantumult_20260831.conf`，尚未登录 Claude。**

## 1. 最终固定节点

用户已确认当前节点均为动态 IP，但同一节点长期保持同一城市；经当前网络质量与一致性检测，选定单节点：

```text
🇹🇼台湾T02 家宽 1x
```

当前已观察到的网络特征包括：

```text
ASN: AS3462
ISP: 中华电信 / Chunghwa Telecom
位置: 台湾台北（当前样本为新店）
类型: 原生 IP / 住宅 IP
纯净度: A / 94
代理威胁: 0/100
WebRTC: 未发现第二公网出口
```

本阶段只把这些指标作为当前网络稳定性与一致性证据，不把第三方网站的浏览器“中国用户特征分”视为 Anthropic 官方风控结果。

## 2. 正式补丁文件

仓库新增：

```text
Claude/Claude-config-patch.conf
```

内容只包含当前配置所需的两处最小结构变化：

```ini
static=Claude, 🇹🇼台湾T02 家宽 1x

https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

第二行必须位于当前：

```text
Direct.list
↓
Claude.list
↓
Advertising.list
```

这个顺序的关键回归项是 `statsig.anthropic.com`，因为当前 `Advertising.list` 已确认包含该域名的 REJECT 规则。

## 3. 最终静态路径

按当前 `Claude/Claude.list`：

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
force-policy=Claude
        ↓
static=Claude
        ↓
🇹🇼台湾T02 家宽 1x
```

预期不再进入：

```text
Advertising → REJECT
ChinaMax → DIRECT
Final → 黑白名单 → 【港·日】自动测速
```

## 4. 关键回归验收

### `statsig.anthropic.com`

修改前：

```text
statsig.anthropic.com
→ Advertising.list
→ reject
```

修改后：

```text
statsig.anthropic.com
→ Claude.list 中精确 HOST
→ force-policy=Claude
→ 🇹🇼台湾T02 家宽 1x
```

因此第三阶段发现的唯一确定性冲突，在最终结构中已经有明确前置修正路径。

## 5. 保持不变

第六阶段不改：

```text
DNS
no-ipv6
udp_whitelist
MITM
Rewrite
Advertising.list 内容
Advertising-2.list 内容
ChinaMax
Final
```

Claude / Anthropic 继续保持：

```text
无 MITM
无 Rewrite
无 request-header 改写
无 response-body 改写
无 Cookie / Authorization / User-Agent 修改
无 GEOIP / 定位 / 国家字段伪造
```

## 6. 动态 IP 的处理原则

当前节点公网 IP 会变化，因此第六阶段不要求固定 IP 数字不变。

后续运行时重点观察：

```text
ASN 是否仍为 AS3462
ISP 是否仍为中华电信
城市是否仍保持台湾台北区域
是否仍被识别为住宅 / 原生 IP
代理威胁与滥用指标是否明显恶化
WebRTC 与 HTTP 出口是否仍一致
节点是否频繁离线或出现显著延迟波动
```

如果上述网络身份长期稳定，则动态住宅 IP 本身不构成本项目的配置失败条件。

## 7. 第六阶段结论

```text
STAGE 6: STATIC PASS
```

已完成：

1. 固定单节点标签确定；
2. 正式 Claude policy 行确定；
3. 正式 Claude filter_remote 行确定；
4. `statsig.anthropic.com` 冲突修正路径验收；
5. Claude 第一方域名不再依赖 Final 自动测速组；
6. MITM / Rewrite / DNS / IPv6 / UDP 保持单变量原则不变。

尚未执行：

- 尚未替用户直接修改本地 Quantumult X 配置；
- 尚未登录 Claude；
- 尚未进行运行时会话验证。

下一阶段应由用户把 `Claude-config-patch.conf` 的两行按指定位置加入当前 Quantumult X 配置，随后在不登录 Claude 的情况下先检查资源加载与策略组是否正常出现，再决定是否进入符合服务商当前政策要求的最小运行时验证。
