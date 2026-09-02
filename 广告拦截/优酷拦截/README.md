# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前 v1

当前实现由两部分组成：

1. `Advertising/Advertising-2.list`
   - 拦截已确认的第三方广告 SDK / 广告请求域名。
   - 精确拦截字节可玩广告组件路径。
   - 精确拦截 `youku-crm-product.youku.com/creative-center/` 商业素材路径。

2. `youku-v1.snippet` + `youku-commercial-v1.js`
   - 仅重写 `un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1` 的响应。
   - 只有同时满足以下两个条件才判定为当前已确认的优酷商业化 Banner 视频：
     - `data.data.video.username` 或 `data.data.uploader.username` 等于 `商业化页面banner素材专用`；
     - `data.data.video.title` 以 `创意中心-` 开头。
   - 命中后清空播放流、默认可用清晰度和视频预览图。
   - 普通视频、JSON 解析失败、结构变化或识别条件不完整时全部 fail-open 原样放行。

## Quantumult X 远程重写

远程 snippet：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/%E4%BC%98%E9%85%B7%E6%8B%A6%E6%88%AA/youku-v1.snippet
```

`youku-v1.snippet` 已包含：

```text
hostname = un-acs.youku.com
```

因此不要另外扩大 MITM 到整个 `*.youku.com`，当前 v1 只需要处理已确认的 UPS 接口。

## 不应静态封锁

以下主机同时承担正常优酷业务，当前禁止整域 REJECT：

```text
un-acs.youku.com
*.cibntv.net
gw.alicdn.com
liangcang-material.alicdn.com
```

尤其不能整域封锁 `un-acs.youku.com` 或 CIBN 视频 CDN，否则可能影响正常电影、电视剧、综艺播放。

## v1 实机验收

启用 `Advertising-2.list` 和 `youku-v1.snippet` 后，冷启动优酷并观察已确认的商业化 Banner：

- 若商业 Banner 整体消失：当前 v1 可继续作为稳定基线。
- 若视频不再播放，但仍留下空白/静态 Banner 卡片：说明播放器层拦截生效，但首页 Feed 上游仍在创建商业卡；下一阶段应抓取首页 Feed / 页面配置接口并从源头删除商业卡，而不是扩大播放器或 CDN 拦截范围。
- 若正常视频播放异常：立即检查脚本日志，确认是否存在新的非商业视频误命中结构。

## 依据

当前识别条件来自 2026-09-02 的 `youku.har` 与 `youku1.har` 两次独立样本：分别确认了舒肤佳、潘婷商业化视频，二者均使用 `商业化页面banner素材专用` 与 `创意中心-` 标识。
