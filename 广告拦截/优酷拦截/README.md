# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前阶段：UPS 纯诊断

2026-09-02 实机发现：

- 电影可以正常播放；
- 剧集在商业视频 UPS 响应被修改后可能持续转圈；
- `data={}` 实验会导致播放器持续转圈；
- 即使只清空商业视频 `stream`，剧集场景仍可能卡住播放器状态机。

因此当前 `youku-commercial-v1.js` 已改为 **100% 原样放行所有 UPS 响应**，不再修改 `data`、`stream`、`stream_types` 或 `preview`。

脚本只记录以下安全定位字段：

```text
spmid
vid
needad
position
appstyle
player_source
open_cpm
```

以及响应侧：

```text
NORMAL / COMMERCIAL
title
stream 数量
```

不会打印 Cookie、Token 或完整请求体。

## 本阶段测试目标

刷新远程重写后：

1. 完全杀掉优酷；
2. 先播放此前会持续转圈的同一部剧集；
3. 再播放一部已确认正常的电影；
4. 如剧集恢复，保存 Quantumult X 中对应的 UPS 诊断日志；
5. 再进入“我的”页触发商业广告，保存对应 COMMERCIAL 日志。

重点比较：

```text
剧集播放前商业阶段
vs
“我的”页商业广告
```

它们的 `spmid / vid / position / appstyle / player_source / open_cpm` 是否存在稳定差异。

若 UPS 100% 原样放行后剧集仍然转圈，则说明问题不只来自 UPS 响应改写；下一步继续单独撤掉 `creative-center` 等路径级 REJECT 做隔离测试。

## Quantumult X 远程重写

远程 snippet 地址保持不变：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/%E4%BC%98%E9%85%B7%E6%8B%A6%E6%88%AA/youku-v1.snippet
```

更新仓库后只需刷新现有远程重写，无需重新添加。

## 当前仍保留的路径级拦截

为单独验证“UPS 响应修改”是否为剧集转圈原因，本阶段暂时保留：

- 字节广告组件 `/obj/static/ad/`；
- `youku-crm-product.youku.com/creative-center/`；
- “学习时刻”已确认 H5 落地页；
- “学习时刻”已确认唯一素材 URL。

## 不应整域封锁

以下主机同时承担正常优酷业务，禁止整域 REJECT：

```text
un-acs.youku.com
*.cibntv.net
gw.alicdn.com
liangcang-material.alicdn.com
o.youku.com
```

## 已确认边界

- `商业化页面banner素材专用 + 创意中心-*` 可以识别商业视频，但不能证明该商业视频只用于首页/“我的”页 Banner；
- `kuflix_space.1` 是“我的”页已确认商业广告位的重要定位特征；
- UPS 更像广告卡内部播放器，而不是父广告卡创建接口；
- 最终要做到像爱奇艺一样干净，仍需定位并删除父级 Native/GaiaX 广告卡，而不是破坏播放器响应。
