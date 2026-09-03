# 优酷广告拦截

本目录用于维护 Quantumult X 的优酷 App 广告拦截规则与脚本。

## 当前稳定架构

当前生产链路由三部分组成：

1. `Advertising/Advertising-2.list`
   - 拦截已确认的第三方广告 SDK / 广告请求域名。
   - 不再依赖对正常播放 CDN 的整域 REJECT 来去前置广告。

2. `youku-v1.snippet` + `youku-commercial-v1.js`
   - 重写：
     `un-acs.youku.com/gw/mtop.youku.play.ups.appinfo.get/1.1`
   - 同一个 UPS 响应脚本承担两类处理：
     - 正常剧集 / 视频的前置广告计划清理；
     - “商业化页面banner素材专用”子视频的精确处理。

3. `youku-m3u8-request-v1.js`
   - 处理：
     `pl-ali.youku.com/playlist/m3u8`
   - 仅在请求侧把 `advInfo` 改为空数组 `[]`，其它参数保持不变。
   - 用于抑制另一套服务端动态拼接到 M3U8 的广告编排。

M3U8 response 诊断脚本和删除广告 block 的实验脚本仍保留在仓库，但已经退出当前生产链路。

---

## UPS 前置广告：已实机验证成功

2026-09-03 的 `优酷(1).har` 已确认，正常剧集 UPS 响应会在：

```text
data.data.ad.seats[].bids[]
```

直接下发完整前置广告计划，包括：

```text
广告数量
广告时长
广告 vid
广告素材 URL
曝光 / 点击 / 播放监测
```

同一个 `data.data.ad` 对象还包含：

```text
BFSTREAM   # 广告备用流
vip_tips   # 广告 UI，例如“会员可关闭此广告”
```

当前稳定处理：

```javascript
data.ad.seats = [];
data.ad.BFSTREAM = {};
delete data.ad.vip_tips;
```

明确不修改：

```text
data.stream
\data.video
播放权限
ad.reqid
ad.algoBuckets
```

### 实机闭环结果

`优酷02.har` + 实机测试已经验证：

```text
原始 UPS 前置广告：
4 条 / 60s
4 条 / 60s
7 条 / 140s
7 条 / 120s

经过响应重写后：
seats -> []
BFSTREAM -> {}
vip_tips -> 删除
```

客户端随后不再请求原前置广告 MP4 素材，并可直接进入正常正片媒体链。

最终实机回归结果：

```text
正常播放
无异常转圈
无前置广告
Advertising-2.list 重新开启后仍正常
```

因此 UPS 前置广告处理已经作为稳定基线封版。

---

## 商业化 Banner 子视频

以下两个条件必须同时满足才按商业素材处理：

```text
data.data.video.username
或 data.data.uploader.username
== “商业化页面banner素材专用”

并且

data.data.video.title
以 “创意中心-” 开头
```

命中后仅清空商业子视频本身的播放流、默认清晰度和预览图。

普通视频不满足这两个条件时不会执行商业子视频 stream 清空。

注意：这只能处理父卡片里的商业子视频；“我的”页面父级 Native / GaiaX 商业卡片本身仍可能占位。父卡不能通过破坏 UPS 顶层 `data` 强行消失。

---

## M3U8 动态拼接广告

此前 HAR 已确认，部分免费内容会通过：

```text
pl-ali.youku.com/playlist/m3u8
```

在服务端动态生成广告编排。

请求中的：

```text
advInfo
```

会影响 M3U8 返回的广告 block。

实机实验已证明：

```text
原始 advInfo 有广告计划
        ↓
请求侧改成 advInfo=[]
        ↓
服务端返回的 M3U8 可变为 adBlocks=0
```

因此当前保留请求侧：

```text
advInfo=[]
```

但不再在 response 阶段主动删除 M3U8 block。

原因：当前 UPS 前置广告已经稳定解决，且短剧样本中即使 M3U8 仍出现约 4s / 5s 的 `/ad/` block，实机并未实际请求这些广告媒体。没有实际广告表现时不继续扩大修改范围。

---

## 已确认的错误处理方式

### 1. 仅 REJECT 前置广告素材 CDN

历史广告列表曾对正常/广告共用播放 CDN 做整域拦截，例如：

```text
vali-g1.cp31.ott.cibntv.net
```

实机 A/B 已证明：

```text
REJECT -> 广告任务仍存在，播放器重试 / fallback，表现为转圈
放行   -> 不转圈，但广告仍正常播放
```

因此不能通过“拦广告 MP4 素材”解决 UPS 前置广告。

正确方法是在 UPS 父数据层清空广告任务本身。

### 2. 把 kuflix_space 商业视频 UPS 顶层 data 改为空对象

此前针对：

```text
spmid = a2h0f.8166709.kuflix_space.1
```

曾尝试把 UPS 顶层 `data` 清空，试图让父级商业卡片自动塌缩。

实机结果：

```text
会破坏正常播放并导致持续转圈
```

该方案已永久撤销，禁止恢复。

---

## 当前路径级拦截

`youku-v1.snippet` 仍保留以下已确认的精确路径：

```text
lf-cdn-tos.bytescm.com/obj/static/ad/*
youku-crm-product.youku.com/creative-center/*
o.youku.com/m/u07ljj6bit
学习时刻唯一已确认素材 URL
```

原则：只拦已确认路径，不扩大到整个公共域名。

---

## 禁止整域 REJECT

以下域名或域名族同时承担正常优酷业务，禁止为了去广告直接整域封锁：

```text
un-acs.youku.com
*.cibntv.net
pl-ali.youku.com
liangcang-material.alicdn.com
o.youku.com
dl-oss-wanju.youku.com
ykimg.alicdn.com
```

优先采用：

```text
父数据对象过滤
精确 URL 路径
请求参数级重写
```

而不是混合 CDN 整域 REJECT。

---

## Quantumult X 远程重写

远程地址保持不变：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA/%E4%BC%98%E9%85%B7%E6%8B%A6%E6%88%AA/youku-v1.snippet
```

仓库更新后，在 Quantumult X 中刷新该远程重写即可。

---

## 下一阶段：页面商业卡片

当前视频前置广告已经封版。

下一阶段重点转向：

```text
“我的”页面商业卡片
首页 Banner / 推广卡
推荐流广告
Native / GaiaX / UserCenter 父级广告对象
```

已有证据表明，“我的”页黑色商业卡片内部会调用 UPS 子视频：

```text
spmid = a2h0f.8166709.kuflix_space.1
```

但 UPS 只是父卡中的播放器，不是父卡数据源。

最终目标是定位生成整个 Native / GaiaX 卡片的上游响应，然后直接删除父对象，避免出现“广告素材没了但空卡/黑框仍存在”的情况。

建议下一份 HAR 使用冷缓存、只进入“我的”页面、不播放剧集、不点击广告，以减少网络噪声并定位父卡来源。
