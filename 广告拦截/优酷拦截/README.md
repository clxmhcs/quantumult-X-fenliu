# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前稳定基线

当前实现由两部分组成：

1. `Advertising/Advertising-2.list`
   - 拦截已确认的第三方广告 SDK / 广告请求域名。

2. `youku-v1.snippet` + `youku-commercial-v1.js`
   - 重写 `un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1` 的响应。
   - 商业视频识别必须同时满足：
     - `data.data.video.username` 或 `data.data.uploader.username` 等于 `商业化页面banner素材专用`；
     - `data.data.video.title` 以 `创意中心-` 开头。
   - 命中后只清空 `stream`、默认清晰度和预览图。
   - 普通视频、解析失败、结构变化或条件不完整时全部 fail-open 原样放行。

## 已失败并撤销的实验

`youku3.har` / `youku4.har` 已确认“我的”页黑色商业广告位的 UPS 请求包含：

```text
spmid = a2h0f.8166709.kuflix_space.1
needad = 0
position = 7
```

曾实验仅对该广告位把 UPS 顶层 `data` 改为空对象，试图让父级 Native 广告卡自动塌缩。

实机结果：

```text
会导致视频无法播放并持续转圈
```

因此该方案已撤销，后续禁止再通过破坏 UPS 顶层业务结构来逼迫父卡消失。

当前结论：UPS 只是 `kuflix_space` 父级 Native 广告卡内部的播放器。要彻底删除黑色广告卡，下一阶段必须继续定位父级 Native / GaiaX / UserCenter 卡片配置，从父对象层删除，而不是继续扩大 UPS 响应破坏范围。

## Quantumult X 远程重写

远程 snippet 地址保持不变：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/%E4%BC%98%E9%85%B7%E6%8B%A6%E6%88%AA/youku-v1.snippet
```

更新仓库后只需在 Quantumult X 中刷新该远程重写，无需重新添加。

## 当前路径级拦截

`youku-v1.snippet` 仍保留：

- 字节广告组件 `/obj/static/ad/`
- `youku-crm-product.youku.com/creative-center/`
- “学习时刻”已确认的 H5 落地页
- “学习时刻”已确认的唯一素材 URL

这些规则只处理已确认路径，不扩大到公共域名。

## 不应静态封锁

以下主机同时承担正常优酷业务，禁止整域 REJECT：

```text
un-acs.youku.com
*.cibntv.net
gw.alicdn.com
liangcang-material.alicdn.com
o.youku.com
```

尤其不能整域封锁 `un-acs.youku.com` 或 CIBN 视频 CDN，否则可能影响正常电影、电视剧、综艺播放。

## 当前实机验收标准

刷新远程重写后：

- 正常电影、电视剧、综艺必须可以正常播放，不应持续转圈。
- 已确认商业视频应出现 `stream=...->0` 的日志。
- “我的”页商业广告父卡可能仍保留黑框；这是当前已知限制，不能通过清空顶层 `data` 解决。

## 依据

当前商业视频识别来自 2026-09-02 多份独立 HAR 样本：舒肤佳、潘婷等商业视频均使用 `商业化页面banner素材专用` 与 `创意中心-` 标识。`youku3.har` / `youku4.har` 又进一步确认“我的”页广告播放器使用 `a2h0f.8166709.kuflix_space.1`。
