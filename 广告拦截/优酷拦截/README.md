# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前实现

当前实现由三部分组成：

1. `Advertising/Advertising-2.list`
   - 拦截已确认的第三方广告 SDK / 广告请求域名。

2. `youku-v1.snippet` + `youku-commercial-v1.js`
   - 重写 `un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1` 的响应。
   - 商业视频识别必须同时满足：
     - `data.data.video.username` 或 `data.data.uploader.username` 等于 `商业化页面banner素材专用`；
     - `data.data.video.title` 以 `创意中心-` 开头。
   - 命中后只清空 `stream`、默认清晰度和预览图。
   - 普通视频、解析失败、结构变化或条件不完整时全部 fail-open 原样放行。

3. `youku-m3u8-filter-v1.js`（当前实验版）
   - 处理 `pl-ali.youku.com/playlist/m3u8`。
   - 依据 2026-09-03 `优酷.har` 与实机 `1615.log`，免费内容广告会作为独立 `#EXT-X-DISCONTINUITY` block 动态拼入 M3U8。
   - 广告时长不固定，不写死 34s / 54s / 118s 等秒数。
   - 当前强证据判定：
     - URI 路径明确包含 `/ad/`；或
     - `ccode=0902`，且该 block 内部 `vid` 与外层正片 `vid` 不同，同时不包含正片 `vid`。
   - 命中后删除整个广告 block，包括对应 `#EXT-X-MAP`、`#EXTINF` 和媒体 URI。
   - 重建时保留一个正常 block 边界，并单独保护 M3U8 全局头与 `#EXT-X-ENDLIST`。
   - 找不到正片 block、删除后缺少正片 `vid`、结构异常等情况全部 fail-open。
   - 原只读诊断脚本 `youku-m3u8-diagnostic-v1.js` 保留，必要时可立即切回。

## M3U8 实机证据

2026-09-03 实机日志已确认同一次免费剧集播放的多个音视频变体均识别出相同广告组合：

```text
mainVid = XNTE4NDgxOTQ0MA==
advInfo = 2
adBlocks = 2

广告1：XNjM5NzkyMTY2NA== / ccode=0902 / 约 4s
广告2：XNjU1MTI3NDEwMA== / ccode=0902 / 约 30s
总广告时长约 34s
```

此前 HAR 样本又出现 4 + 30 + 15 + 5 = 54s，因此广告编排与总时长均为动态值。

当前目标不是 REJECT 广告媒体后等待原广告时间，而是从播放器收到的 M3U8 时间轴中直接删除广告 block。

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
pl-ali.youku.com
```

尤其不能整域封锁 `un-acs.youku.com`、`pl-ali.youku.com` 或 CIBN 视频 CDN，否则可能影响正常电影、电视剧、综艺播放。

## 当前实机验收标准

刷新远程重写后：

- 免费剧集不应再为了被删除的广告 block 空等原广告时长。
- 日志应出现 `youku-m3u8-filter-v1 2026-09-03`。
- 命中时应出现 `removed=N removedTotal=...s` 以及逐条 `优酷M3U8删除广告#N`。
- 正常电影、电视剧、综艺必须可以正常播放；若出现持续转圈、跳播、音画异常，应立即保留日志并切回诊断脚本。
- 已确认 UPS 商业视频仍应出现 `stream=...->0` 日志。
- “我的”页商业广告父卡可能仍保留黑框；这是另一条 Native 父卡链路。

## 依据

UPS 商业视频识别来自 2026-09-02 多份独立 HAR 样本：舒肤佳、潘婷等商业视频均使用 `商业化页面banner素材专用` 与 `创意中心-` 标识。`youku3.har` / `youku4.har` 又进一步确认“我的”页广告播放器使用 `a2h0f.8166709.kuflix_space.1`。

免费剧集 M3U8 动态广告块识别来自 2026-09-03 `优酷.har` 与 `1615.log` 的独立验证；当前仍处于实机实验阶段。
