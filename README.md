# LZ CryptoScope · 加密基本面观察

公开的加密项目收益排行网站。首页直接显示最近 30 天、最近 90 天和年初至今的动态 Top 10、收益曲线、三榜交集，以及用户提供的 2026-09-28 历史三榜。

## 本地运行

需要 Node.js 22 或以上。项目没有 npm 依赖。

```bash
node scripts/update-market.mjs
node scripts/render-index.mjs
node scripts/check.mjs
python3 -m http.server 8765
```

打开 `http://localhost:8765/` 使用周期切换和曲线交互。直接用 `file://` 打开 `index.html` 时，预生成的三个 Top 10 仍可阅读，但浏览器可能拦截交互脚本读取 JSON。

## 每日更新

- GitHub Actions `market.yml` 每天北京时间 09:45 运行，取前一日已完成的 UTC 日线，重算三个周期的 Top 10，并提交数据与预生成首页。
- `pages.yml` 在市场任务成功后发布网站，并于每天北京时间 10:15 补发一次。Pages 发布来源必须设置为 **GitHub Actions**。
- GitHub 计划任务可能延迟。页面展示快照日期；更新脚本在行情覆盖不足时保留上一份结果。

## 统计范围与计算

候选池在 `data/universe.mjs`，需人工审查变更。它是公开的研究名单，不声称覆盖所有加密货币。当前排除 BTC、ETH、稳定币、锚定资产及纯 Meme 项目；BTC 和 ETH 仅作为曲线基准。

排行使用 Binance Spot `*USDT` 交易对的 UTC 完整日收盘价，公式为 `(终点收盘价 / 起点收盘价 - 1) × 100`。近 30/90 天以结束日前 30/90 个完整 UTC 日的收盘价为基准；年初至今以上年 12 月 31 日的收盘价为基准。缺任一基准日价格的项目不参与对应周期排名；曲线与榜单读取同一数据快照。

## 发布

公开仓库：[zhaotools/LZ-CryptoScope](https://github.com/zhaotools/LZ-CryptoScope)。正式网站：[GitHub Pages](https://zhaotools.github.io/LZ-CryptoScope/)。发布后分别检查本地生成页、GitHub 提交、Pages 构建结果和线上首页及 JSON 日期。
