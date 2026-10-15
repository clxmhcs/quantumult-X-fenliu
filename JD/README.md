# JD / Quantumult X 抓包观察脚本

本目录包含两个文件：

- `jd_qx_observer.js`：实际执行的宽范围只读观察脚本
- `jd_qx_observer.snippet`：给 Quantumult X 作为“重写资源”导入的资源文件

## 正确导入方式

不要把 `.js` 文件直接填到 Quantumult X 的“资源路径”里，否则 Quantumult X 会把 JavaScript 当成重写规则逐行解析，并在第一行 `/*` 处报 `Invalid Line /*`。

请在 Quantumult X 的“重写”资源中填入：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.snippet
```

这个 `.snippet` 会自动远程调用：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
```

由于该资源已经是 Quantumult X 原生重写格式，不需要额外的资源解析器；如果该资源页面启用了第三方“资源解析器”，建议对这个资源关闭，避免二次转换。

## 当前增强版

当前 snippet 同时挂载四类 HTTP rewrite 钩子：

```text
script-request-header
script-request-body
script-response-header
script-response-body
```

这样即使请求或响应 body 为空，也仍有机会从 header 阶段观察到 URL、Host、Method、Status、Content-Type、Content-Length、sessionIndex 等信息。

同时 MITM 目标包含：

```text
jd.com
*.jd.com
2402:db40:5100:1011::5
```

其中 `2402:db40:5100:1011::5:443` 是此前在 Proxyman 的 JD 搜索诊断中观察到的直接 IPv6 连接。

## 日志

脚本只观察已经进入 Quantumult X MITM/rewrite 层的 HTTP(S) 请求与响应，不修改业务数据。

日志前缀已升级为：

```text
[JD-WIDE]
```

重点命中会显示：

```text
[JD-WIDE] HIT
```

会重点标记：

- `Search_ProductList`
- `Searchlist_Productid`
- `activitySearch`
- `functionId`
- `wareId`
- `skuId`
- `sku_id`
- `jdPrice`
- `purchasePrice`
- `doublePrice`
- `priceInfo`
- `finalPrice`
- `keyword` / `keyWord`
- `search`
- `product` / `ware` / `price`

Cookie、Authorization、Set-Cookie 等敏感头会替换为 `<redacted>`。

脚本会输出 `sessionIndex`，可用于把同一条请求的 request/response 记录关联起来。

## 限制

该脚本不能把原本没有进入 Quantumult X HTTP MITM/rewrite 层的连接强行变成可读 HTTP。若搜索主链路使用未被 MITM 的 TLS、QUIC、证书固定、自定义 socket，或者 QX 无法把连接解析成 HTTP，则 JavaScript rewrite 仍然看不到正文。
