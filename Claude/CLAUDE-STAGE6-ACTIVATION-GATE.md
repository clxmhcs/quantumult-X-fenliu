# Claude 第六阶段：激活门槛与最终静态验收

> 更新时间：2026-09-01
>
> 状态：**第六阶段已进入激活前门槛；仓库模板已生成，但尚未替用户选择具体固定节点，也未修改其当前 Quantumult X 配置。**

## 1. 当前已经完成的工作

仓库已经具备：

```text
Claude/Claude.list
Claude/CLAUDE-DOMAIN-BASELINE.md
Claude/CLAUDE-RULE-CONFLICT-AUDIT.md
Claude/CLAUDE-POLICY-DESIGN.md
Claude/CLAUDE-CONFIG-MAPPING-AUDIT.md
Claude/Claude-config-patch.template.conf
```

其中 `Claude-config-patch.template.conf` 已把当前配置需要的最小修改压缩为两行结构：

```ini
static=Claude, <USER_SELECTED_FIXED_NODE>

https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/refs/heads/main/Claude/Claude.list, tag=Claude, force-policy=Claude, update-interval=172800, opt-parser=true, enabled=true
```

第二行必须插入当前 `Direct.list` 与 `Advertising.list` 之间。

## 2. 当前唯一未确定变量

仍缺少：

```text
<USER_SELECTED_FIXED_NODE>
```

这个值必须是用户当前 Quantumult X 订阅中的**精确固定服务器标签**。

第六阶段不由仓库替用户选择地区或具体节点，也不将自动测速组作为最终 Claude 会话出口。

不接受以下类型作为最终固定成员：

```text
台湾节点
日本节点
香港节点
【港·日】节点
```

原因不是这些名称本身，而是当前配置中它们属于 `url-latency-benchmark` 自动选择组；它们的成员可能随测速结果变化，不能满足“固定、可预测、可审计”的目标。

## 3. 合格的固定节点输入形式

用户下一步只需提供当前 Quantumult X 中一个或多个**完整、原样的单节点服务器标签**。

示例格式仅表示标签形态：

```text
<某个单独服务器标签>
<另一个单独服务器标签>
```

不要提供订阅 URL、密码、UUID、Token 或其他凭据。

节点的实际使用必须符合服务商当前支持地区与账户使用规则。

## 4. 收到固定节点标签后的最终配置生成

如果用户提供一个固定节点：

```ini
static=Claude, <FIXED_NODE_A>
```

如果用户提供两个固定节点：

```ini
static=Claude, <FIXED_NODE_A>, <FIXED_NODE_B>
```

该 static 组只提供人工选择入口；不要改成自动测速或负载均衡。

## 5. 最终静态路径验收

激活前必须逐项满足：

```text
claude.ai              → Claude
*.claude.ai            → Claude
anthropic.com           → Claude
*.anthropic.com         → Claude
api.anthropic.com       → Claude
statsig.anthropic.com   → Claude
console.anthropic.com   → Claude
```

并确认：

```text
不命中 Advertising → REJECT
不命中 ChinaMax → DIRECT
不进入 Final
不进入【港·日】自动测速
不进入 MITM
不进入 Rewrite
```

其中 `statsig.anthropic.com` 是关键回归项，因为当前 `Advertising.list` 已确认存在对该域名的 REJECT 规则。

## 6. 保持不变的配置

第六阶段正式激活时仍不改：

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

因此本轮修改变量仍严格限制为：

```text
1. 新增 Claude static policy
2. 新增 Claude filter_remote
```

## 7. 激活门槛

当前阶段状态：

```text
STAGE 6: READY, WAITING FOR USER-SELECTED FIXED NODE TAG
```

在没有精确固定服务器标签之前，不生成伪造的最终 policy 行，也不把模板标记为可直接激活。

用户提供固定节点标签后，下一步将：

1. 把模板替换为正式 policy 行；
2. 生成针对当前 `quantumult_20260831.conf` 的最终两行补丁；
3. 对 `Claude.list → Claude policy → fixed node` 做完整静态路径验收；
4. 仍然不需要登录 Claude 即可完成该阶段。
