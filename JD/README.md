# JD / Quantumult X 抓包观察脚本

本目录包含两个文件：

- `jd_qx_observer.js`：实际执行的脚本文件
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

## snippet 内容

```ini
hostname = jd.com, *.jd.com
^https?:\/\/(?:[^\/]+\.)?jd\.com(?:\/|$) url script-request-body https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
^https?:\/\/(?:[^\/]+\.)?jd\.com(?:\/|$) url script-response-body https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
```

## 作用

脚本只观察已经进入 Quantumult X MITM/rewrite 层的 HTTP(S) 请求与响应，不修改业务数据。

会重点标记：

- `Search_ProductList`
- `Searchlist_Productid`
- `activitySearch`
- `functionId`
- `wareId`
- `skuId`
- `jdPrice`
- `purchasePrice`
- `doublePrice`
- `priceInfo`
- `keyword` / `keyWord`
- `search`

日志前缀：

```text
[JD-QX]
```

重点命中：

```text
[JD-QX] HIT
```

Cookie、Authorization 等敏感头会替换为 `<redacted>`。

## 限制

该脚本不能把原本没有进入 Quantumult X HTTP MITM/rewrite 层的连接强行变成可读 HTTP。若搜索主链路使用未被 MITM 的 TLS、QUIC、证书固定或自定义 socket，该脚本仍然看不到正文。
