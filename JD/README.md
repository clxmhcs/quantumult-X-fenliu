# JD / Quantumult X 抓包观察脚本

本目录包含：

- `jd_qx_observer.js`：只读诊断脚本
- `jd_qx_observer.snippet`：Quantumult X 重写资源

## 导入地址

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.snippet
```

不要把 `.js` 文件直接作为重写资源导入。

## 当前模式

当前为临时“零过滤、纯元数据全局发现版”，用于确认京东搜索是否通过一个看起来不像京东的 HTTP(S) Host / User-Agent 进入 Quantumult X。

snippet 仍使用：

```ini
hostname = *
```

当前 JavaScript 不再按京东域名、JD4iPhone、jdmall、jdapp 等条件过滤：凡是已经进入 Quantumult X HTTP(S) rewrite 层并触发脚本的请求都会输出一条元数据记录。

脚本不会记录：

- Request Body
- Response Body
- Cookie
- Authorization
- token / sign / eid / uuid 等凭据值
- URL 查询参数
- 完整 User-Agent

日志前缀：

```text
[QX-GLOBAL]
```

记录字段：

```text
sessionIndex
REQUEST / RESPONSE
method
scheme
host
path
ua（仅分类）
request Content-Type
request Content-Length
status
response Content-Type
response Content-Length / Transfer-Encoding
```

UA 只记录粗粒度类别，例如：

```text
JD4iPhone
jdmall
jdapp
Cronet
CFNetwork
WebKit
okhttp
Mozilla
other
none
```

## 测试流程

```text
更新重写资源
→ 关闭其他 App，尽量减少背景流量
→ 清空 Quantumult X 日志
→ 强制退出京东
→ 重新打开京东
→ 直接搜索一个全新关键词
→ 等商品列表完整出现
→ 不点击商品
→ 等 3~5 秒
→ 立即导出日志
```

分析重点是搜索结果商品图片批量加载之前约 0～3 秒内出现的新 Host、非 JD User-Agent、Content-Type 及较大的响应。

测试完成后请关闭这个重写资源。`hostname = *` 仅用于短时诊断，不建议长期常驻。
