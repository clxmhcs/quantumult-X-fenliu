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

当前为临时“全局发现版”，用于判断京东搜索是否使用非 `*.jd.com` 域名。

snippet 使用：

```ini
hostname = *
```

并挂载 request/response 的 header 与 body 四类 hook。JS 本身只输出元数据，不记录正文；同时根据京东 App 常见 User-Agent、JD 请求头以及 `*.jd.com` Host 进行过滤。

日志前缀：

```text
[JD-DISCOVERY]
```

日志字段主要包括：sessionIndex、method、host、path、status、Content-Type 和 Content-Length。URL 查询参数不会写入日志。

## 测试流程

```text
更新重写资源
→ 清空 Quantumult X 日志
→ 强制退出京东
→ 重新打开京东
→ 搜索一个全新关键词
→ 等商品列表完整出现
→ 不点击商品
→ 等 3~5 秒
→ 导出日志
```

测试完成后建议关闭这个重写资源，因为 `hostname = *` 只用于临时诊断，不建议长期常驻。
