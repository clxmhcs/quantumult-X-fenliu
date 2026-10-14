# JD / Quantumult X 抓包观察脚本

文件：`jd_qx_observer.js`

远程脚本地址：

```text
https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
```

## Quantumult X 调用示例

先在 `[rewrite_local]` 中加入：

```ini
^https?:\/\/(?:[^\/]+\.)?jd\.com(?:\/|$) url script-request-body https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
^https?:\/\/(?:[^\/]+\.)?jd\.com(?:\/|$) url script-response-body https://raw.githubusercontent.com/clxmhcs/quantumult-X-fenliu/main/JD/jd_qx_observer.js
```

并确保 `[mitm]` 的 `hostname` 已覆盖需要观察的京东域名，例如：

```ini
hostname = jd.com, *.jd.com
```

如果已有 `hostname = ...`，请追加域名，不要再新建第二行。

## 作用

脚本只观察已经进入 Quantumult X MITM/rewrite 层的 HTTP(S) 请求与响应，不修改业务数据。

会重点标记以下关键词：

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

重点命中会显示：

```text
[JD-QX] HIT
```

Cookie、Authorization 等敏感头会在日志中自动替换为 `<redacted>`。

## 限制

此脚本不能把原本没有进入 Quantumult X HTTP MITM/rewrite 层的连接强行变成可读 HTTP。若搜索主链路使用未被 MITM 的 TLS、QUIC、证书固定或自定义 socket，该脚本仍然看不到其正文。
