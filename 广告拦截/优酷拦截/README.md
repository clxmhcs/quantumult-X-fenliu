# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前阶段：剧集转圈隔离

2026-09-02 实机现象：

- 电影可以正常播放；
- 剧集会持续转圈；
- `data={}` 实验会导致播放器持续转圈；
- 清空商业视频 `stream` 也可能破坏剧集播放；
- 将 UPS 改为 100% 原样放行后，剧集仍然持续转圈。

因此当前已确认：**剧集转圈不只来自 UPS 响应改写。**

## 当前 UPS 状态

`youku-commercial-v1.js` 处于纯诊断模式：

- 所有 UPS 响应 100% 原样返回；
- 不修改 `data`、`stream`、`stream_types`、`preview`；
- 只记录 NORMAL / COMMERCIAL、title、stream 数量及少量安全定位字段。

## 本阶段隔离改动

`youku-v1.snippet` 现在只保留 UPS 纯诊断规则。

本阶段暂时撤掉此前 snippet 中的全部路径级 `url reject`：

```text
lf-cdn-tos.bytescm.com/obj/static/ad/*
youku-crm-product.youku.com/creative-center/*
o.youku.com/m/u07ljj6bit
liangcang-material.alicdn.com/prod/upload/e87cf4ecc6b24721b068dccf9500ad9a.webp.jpg
```

`hostname` 也临时收缩为：

```text
un-acs.youku.com
```

注意：`Advertising/Advertising-2.list` 中的优酷第三方广告域名本阶段暂时不动。

## 本阶段测试目标

刷新远程重写后：

1. 完全杀掉优酷；
2. 播放此前持续转圈的同一部剧集；
3. 再播放一部已确认正常的电影。

结果解释：

- 若剧集恢复：说明问题位于此前 snippet 的路径级 REJECT；下一步逐条恢复规则定位具体冲突项。
- 若剧集仍然转圈：说明路径级 REJECT 也不是唯一原因；下一步继续隔离 `Advertising-2.list` 中的优酷第三方广告域名。

## Quantumult X 远程重写

远程 snippet 地址保持不变：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/%E4%BC%98%E9%85%B7%E6%8B%A6%E6%88%AA/youku-v1.snippet
```

更新仓库后只需刷新现有远程重写，无需重新添加。

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
