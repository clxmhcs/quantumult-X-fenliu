# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前阶段

当前实现由两部分组成：

1. `Advertising/Advertising-2.list`
   - 拦截已确认的第三方广告 SDK / 广告请求域名。

2. `youku-v1.snippet` + `youku-commercial-v1.js`
   - 重写 `un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1` 的响应。
   - 商业视频识别必须同时满足：
     - `data.data.video.username` 或 `data.data.uploader.username` 等于 `商业化页面banner素材专用`；
     - `data.data.video.title` 以 `创意中心-` 开头。
   - 普通视频、解析失败、结构变化或条件不完整时全部 fail-open 原样放行。

## kuflix_space.1 实验

`youku3.har` / `youku4.har` 已确认“我的”页黑色商业广告位的 UPS 请求包含：

```text
spmid = a2h0f.8166709.kuflix_space.1
```

同时请求中的广告参数出现：

```text
needad = 0
position = 7
```

这说明 UPS 更像父级 Native 广告卡内部的播放器，而不是负责创建广告卡的接口。

当前实验逻辑：

- 只有同时命中 `kuflix_space.1` 和上述商业视频双条件时，才把 UPS 响应的顶层 `data` 改为空对象：

```json
{
  "api": "mtop.youku.play.ups.appinfo.get",
  "data": {},
  "ret": ["SUCCESS::调用成功"],
  "v": "1.1"
}
```

- 目的：测试 Native 父广告卡收到“调用成功但无有效视频数据”后是否自动收起。
- 非 `kuflix_space.1` 的已确认商业视频仍使用旧逻辑：清空 `stream`、默认清晰度和预览图。
- 正常视频完全不修改。

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

刷新远程重写后，进入“我的”页触发商业广告，观察 Quantumult X 日志：

预期实验日志：

```text
优酷商业化广告: kuflix_space实验命中 ... -> top-level data={}
```

然后观察 UI：

- 若整个广告卡自动消失/高度塌缩：说明父级 Native 卡会根据 UPS 无数据自动关闭，该实验可继续收敛为正式方案。
- 若仍然保留黑框：说明父级 Native 卡完全独立于 UPS 成败，下一步必须继续定位真正的 `kuflix_space` 父级 Native 数据/配置。
- 若出现持续高频重试：说明空业务 data 会触发播放器重试，需停止该实验并改用另一种响应状态。
- 若正常视频异常：检查日志；正常视频应显示“正常视频原样放行”。

## 依据

当前商业视频识别来自 2026-09-02 多份独立 HAR 样本：舒肤佳、潘婷等商业视频均使用 `商业化页面banner素材专用` 与 `创意中心-` 标识。`youku3.har` / `youku4.har` 又进一步确认“我的”页广告播放器使用 `a2h0f.8166709.kuflix_space.1`。
