import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizedSeries } from "./market-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [template, daily, news] = await Promise.all([
  readFile(join(root, "templates", "index.html"), "utf8"),
  readFile(join(root, "data", "daily.json"), "utf8").then(JSON.parse),
  readFile(join(root, "data", "news.json"), "utf8").then(JSON.parse)
]);

if (daily.rankings?.d30?.length !== 10 || daily.rankings?.d90?.length !== 10 || daily.rankings?.ytd?.length !== 10) {
  throw new Error("Cannot render an incomplete Top 10 snapshot");
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateZh = value => String(value).slice(0, 10).replaceAll("-", ".");
const pct = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
const money = value => !Number.isFinite(value) ? "—" : value >= 1e12 ? `$${(value / 1e12).toFixed(2)}T` : value >= 1e9 ? `$${(value / 1e9).toFixed(2)}B` : value >= 1e6 ? `$${(value / 1e6).toFixed(1)}M` : `$${value.toFixed(0)}`;
const issue = news.issues?.[0] || null;
const assets = new Map(daily.assets.map(asset => [asset.symbol, asset]));
const periodNames = { d30: "最近 30 天", d90: "最近 90 天", ytd: "年初至今" };

function replaceOnce(source, search, value) {
  if (!source.includes(search)) throw new Error(`Template marker missing: ${search.slice(0, 80)}`);
  return source.replace(search, () => value);
}

function rankRow(row, period) {
  const asset = assets.get(row.symbol);
  if (!asset) throw new Error(`Unknown ranked asset: ${row.symbol}`);
  return `<div class="rank-row"><a class="rank-static-link" href="./projects/${encodeURIComponent(row.symbol)}.html" aria-label="查看 ${esc(asset.name)} 项目详情"><span class="rank-ident"><span class="rank-index">${String(row.rank).padStart(2, "0")}</span><span class="coin-avatar" aria-hidden="true">${esc(row.symbol.slice(0, 2))}</span><span class="rank-name"><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)} · ${esc(asset.sector)}</small></span></span></a><span class="rank-return"><strong class="${row.returnPct < 0 ? "negative" : "positive"}">${pct(row.returnPct)}</strong><small>${periodNames[period]}</small></span></div>`;
}

function projectCard(asset) {
  return `<a class="project-card" href="./projects/${encodeURIComponent(asset.symbol)}.html"><div class="project-card-head"><span class="coin-avatar" aria-hidden="true">${esc(asset.symbol.slice(0, 2))}</span><span><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)}</small></span></div><span class="project-sector">${esc(asset.sector)}</span><p>${esc(asset.description)}</p><div class="project-card-bottom"><span>流通市值</span><strong>${money(asset.market.marketCapUsd)}</strong></div></a>`;
}

function newsCard(item) {
  let url;
  try { url = new URL(item.url); } catch { return ""; }
  if (url.protocol !== "https:") return "";
  return `<article class="news-item"><time class="news-date" datetime="${esc(item.publishedAt)}">${dateZh(item.publishedAt)}</time><div><span class="news-topic">${esc(item.topic)}</span><h4><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h4><div class="news-meta"><span>${esc(item.source)}</span><span>·</span><span>${esc(item.symbols.join(" / "))}</span><span>·</span><span>官方原始来源</span></div></div><a class="news-link" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" aria-label="打开原文">原文 ↗</a></article>`;
}

function staticChart() {
  const end = Date.parse(`${daily.asOf}T00:00:00Z`);
  const colors = ["#2c78d4", "#22a789", "#ee9b42", "#7d69d3", "#d46491", "#36a8c2", "#bf6e42", "#537ec2", "#8cb759", "#bd8fce", "#526984", "#9babc0"];
  const sources = [...daily.rankings.d30.map(row => assets.get(row.symbol).history), daily.benchmarks.BTC, daily.benchmarks.ETH];
  const lines = sources.map(history => normalizedSeries(history, "d30", end)).filter(rows => rows.length);
  const values = lines.flatMap(rows => rows.map(([, value]) => value));
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const pad = Math.max(20, high - low) * .09;
  const min = low - pad, max = high + pad;
  const x = index => 48 + index / Math.max(1, lines[0].length - 1) * 686;
  const y = value => 20 + (max - value) / (max - min) * 255;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max - (max - min) * index / 4;
    return `<line x1="48" y1="${y(value)}" x2="734" y2="${y(value)}" stroke="#e7edf3"/><text x="39" y="${y(value) + 4}" text-anchor="end" font-size="10" fill="#9cabb9">${Math.round(value)}%</text>`;
  }).join("");
  const paths = lines.map((rows, index) => `<path d="${rows.map(([, value], point) => `${point ? "L" : "M"}${x(point).toFixed(1)} ${y(value).toFixed(1)}`).join(" ")}" fill="none" stroke="${colors[index]}" stroke-width="${index >= 10 ? 2 : 2.4}" ${index >= 10 ? 'stroke-dasharray="6 5"' : ""} opacity=".85"/>`).join("");
  const dates = [0, Math.floor((lines[0].length - 1) / 2), lines[0].length - 1].map(index => `<text x="${x(index)}" y="300" text-anchor="middle" font-size="10" fill="#9cabb9">${esc(lines[0][index][0].slice(5).replace("-", "/"))}</text>`).join("");
  return `<rect width="760" height="320" fill="#fff"/>${grid}${paths}${dates}`;
}

let html = template;
html = replaceOnce(html, '<main id="home-view">', `<main id="home-view" data-static-snapshot="${esc(daily.asOf)}">`);
html = replaceOnce(html, '<span id="hero-freshness">正在读取最新数据…</span>', `<span id="hero-freshness">行情截至 ${esc(daily.asOf)} UTC · 已保存静态快照</span>`);
html = replaceOnce(html, '<span id="panel-date">—</span>', `<span id="panel-date">${esc(daily.asOf)}</span>`);
html = replaceOnce(html, '<strong id="stat-universe">—</strong>', `<strong id="stat-universe">${daily.coverage.universe}</strong>`);
html = replaceOnce(html, '<strong id="stat-news">—</strong>', `<strong id="stat-news">${String(issue?.items?.length ?? 0).padStart(2, "0")}</strong>`);
html = replaceOnce(html, '<strong id="stat-date">—</strong>', `<strong id="stat-date">${esc(daily.asOf.slice(5).replace("-", "/"))}</strong>`);
html = replaceOnce(html, '<span id="rank-asof">数据加载中</span>', `<span id="rank-asof">${dateZh(daily.asOf)} UTC 收盘</span>`);
const eligible = daily.assets.filter(asset => Number.isFinite(asset.returns.d30)).length;
html = replaceOnce(html, '<span id="rank-coverage" class="coverage-text">—</span>', `<span id="rank-coverage" class="coverage-text">${eligible} / ${daily.coverage.universe} 个项目具备完整区间日线</span>`);
html = replaceOnce(html, '<div id="rank-rows" aria-live="polite"></div>', `<div id="rank-rows" aria-live="polite"><div class="rank-rows-wrap">${daily.rankings.d30.map(row => rankRow(row, "d30")).join("")}</div></div>`);
html = replaceOnce(html, '<svg id="returns-chart" viewBox="0 0 760 320" role="img" aria-label="前十项目及基准资产的收益曲线"></svg>', `<svg id="returns-chart" viewBox="0 0 760 320" role="img" aria-label="前十项目及基准资产的收益曲线">${staticChart()}</svg>`);
const staticLegend = [...daily.rankings.d30.map(row => row.symbol), "BTC", "ETH"].map((symbol, index) => `<span class="legend-button"><span class="legend-line" style="--line-color:${["#2c78d4", "#22a789", "#ee9b42", "#7d69d3", "#d46491", "#36a8c2", "#bf6e42", "#537ec2", "#8cb759", "#bd8fce", "#526984", "#9babc0"][index]}"></span>${esc(symbol)}</span>`).join("");
html = replaceOnce(html, '<div id="chart-legend" class="chart-legend" aria-label="曲线开关"></div>', `<div id="chart-legend" class="chart-legend" aria-label="曲线开关">${staticLegend}</div>`);
const extraPeriods = ["d90", "ytd"].map(period => `<section class="static-period"><h3>${periodNames[period]} Top 10</h3><div class="static-period-list">${daily.rankings[period].map(row => rankRow(row, period)).join("")}</div></section>`).join("");
html = replaceOnce(html, '<div id="static-periods" class="static-periods"></div>', `<div id="static-periods" class="static-periods">${extraPeriods}</div>`);
const common = daily.rankings.d30.filter(row => daily.rankings.d90.some(other => other.symbol === row.symbol) && daily.rankings.ytd.some(other => other.symbol === row.symbol)).map(row => row.symbol);
html = replaceOnce(html, '<div id="intersection-list" class="intersection-list">—</div>', `<div id="intersection-list" class="intersection-list">${common.length ? common.map(symbol => `<a class="intersection-chip" href="./projects/${encodeURIComponent(symbol)}.html">${esc(symbol)} ↗</a>`).join("") : "目前没有三榜共同入选项目"}</div>`);
html = replaceOnce(html, '<span id="project-count" class="section-count">—</span>', `<span id="project-count" class="section-count">${daily.assets.length} 个项目</span>`);
const sorted = [...daily.assets].sort((a, b) => (b.market.marketCapUsd || 0) - (a.market.marketCapUsd || 0));
html = replaceOnce(html, '<div id="project-grid" class="project-grid"></div>', `<div id="project-grid" class="project-grid">${sorted.map(projectCard).join("")}</div>`);
html = replaceOnce(html, '<button type="button" id="show-more" class="outline-button">', '<button type="button" id="show-more" class="outline-button" hidden>');
html = replaceOnce(html, '<span id="issue-date" class="mini-label">—</span>', `<span id="issue-date" class="mini-label">${esc(issue?.date || "—")}</span>`);
html = replaceOnce(html, '<h3 id="issue-title">正在读取简报</h3>', `<h3 id="issue-title">${issue ? `${dateZh(issue.date)} 每日简报` : "暂无已发布简报"}</h3>`);
const healthy = issue?.sourceStatus?.filter(source => source.ok).length || 0;
html = replaceOnce(html, '<span id="issue-health" class="health-badge">—</span>', `<span id="issue-health" class="health-badge">${healthy} / ${issue?.sourceStatus?.length || 0} 个来源已检查</span>`);
html = replaceOnce(html, '<div id="issue-list" class="issue-list"></div>', `<div id="issue-list" class="issue-list">${(news.issues || []).slice(0, 20).map(entry => `<a class="static-issue-date" href="./news/${encodeURIComponent(entry.date)}.html">${dateZh(entry.date)} · ${entry.items.length} 条</a>`).join("")}</div>`);
html = replaceOnce(html, '<div id="news-items" class="news-items"></div>', `<div id="news-items" class="news-items">${issue?.items?.length ? issue.items.map(newsCard).join("") : '<div class="news-empty"><strong>已检查来源，暂无符合条件的重要消息</strong></div>'}</div>`);
html = replaceOnce(html, '<strong id="method-universe">—</strong>', `<strong id="method-universe">${daily.coverage.universe}</strong>`);
html = replaceOnce(html, '<span id="footer-updated">—</span>', `<span id="footer-updated">行情生成：${esc(new Date(daily.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))} 北京时间</span>`);

await writeFile(join(root, "index.html"), html, "utf8");

const price = value => !Number.isFinite(value) ? "—" : `$${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 })}`;
const count = value => Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—";
const hourlyFunding = value => Number.isFinite(value) ? `${value.toFixed(4)}%` : "—";
const metric = (label, value, note) => `<div class="detail-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
const returns = asset => Object.entries(periodNames).map(([key, label]) => `<div class="detail-return-chip">${label}<strong class="${asset.returns[key] < 0 ? "negative" : "positive"}">${pct(asset.returns[key])}</strong></div>`).join("");
const header = `<header class="site-header"><div class="nav-inner"><a class="brand" href="../" aria-label="LZ CryptoScope 首页"><span class="brand-mark">LZ<span class="brand-mark-dot">.</span></span><span class="brand-name">CryptoScope<small>加密基本面观察</small></span></a><nav class="main-nav" aria-label="主导航"><a href="../#rankings">动态排行</a><a href="../#projects">项目资料</a><a href="../#news">每日新闻</a><a href="../#method">方法说明</a></nav><span class="nav-live"><span class="live-dot"></span>每日更新</span></div></header>`;
const footer = `<footer class="site-footer"><div class="shell footer-inner"><div><strong>LZ<span class="footer-dot">.</span> CryptoScope</strong><p>加密基本面观察 · 数据研究用途</p></div><div class="footer-links"><a href="../#method">方法说明</a></div></div><div class="shell footer-bottom">行情、项目指标和新闻可能延迟或不完整。本站不构成投资建议。<span>行情截至 ${esc(daily.asOf)} UTC</span></div></footer>`;
const page = (title, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b1d38"><meta name="description" content="${esc(title)} · LZ CryptoScope 加密基本面观察"><title>${esc(title)}｜LZ CryptoScope</title><link rel="stylesheet" href="../assets/styles.css"></head><body>${header}<main class="shell detail-view">${body}</main>${footer}</body></html>`;

function detailPage(asset) {
  const market = asset.market || {};
  const spot = asset.spot || {};
  const perp = asset.derivatives || {};
  const fundamentals = asset.fundamentals || {};
  const related = (news.issues || []).flatMap(entry => entry.items || []).filter(item => item.symbols?.includes(asset.symbol)).slice(0, 5);
  const spotNote = `${spot.exchange || "Binance Spot"} · ${spot.pair || asset.pair} · ${spot.observedAt || "暂无采集时间"}`;
  const perpNote = `${perp.exchange || "Hyperliquid Perps"} · 仅该平台已上线市场 · ${perp.observedAt || "暂无采集时间"}`;
  const metricCards = [
    metric("现价", price(market.priceUsd), `CoinLore · ${market.observedAt || "暂无采集时间"}`),
    metric("流通市值", money(market.marketCapUsd), "CoinLore · 流通供应量 × 价格"),
    metric("完全稀释估值", money(market.fdvUsd), "CoinLore · 最大供应量 × 价格"),
    metric("流通供应量", count(market.circulatingSupply), "CoinLore · 个代币"),
    metric("最大供应量", count(market.maxSupply), "CoinLore · 个代币"),
    metric("现货 24 小时成交额", money(spot.volume24hUsdt), spotNote),
    metric("合约持仓价值", money(perp.openInterestUsd), perpNote),
    metric("合约 24 小时成交额", money(perp.volume24hUsd), perpNote),
    metric("合约资金费率", hourlyFunding(perp.fundingRatePct), `${perp.exchange || "Hyperliquid Perps"} · 每小时费率`)
  ].join("");
  const fundamentalCards = [
    metric("锁仓价值 TVL", money(fundamentals.tvlUsd), "DefiLlama · 不等于协议收入"),
    metric("近 30 天费用", money(fundamentals.fees30dUsd), "DefiLlama · 用户支付的费用"),
    metric("近 30 天协议收入", money(fundamentals.revenue30dUsd), "DefiLlama · 协议留存收入")
  ].join("");
  const scope = fundamentals.scope?.length ? fundamentals.scope.join("、") : "暂无匹配的子协议";
  return page(`${asset.name}（${asset.symbol}）项目资料`, `<a class="detail-back" href="../#projects">← 返回项目资料库</a><section class="detail-hero"><div class="detail-title-row"><span class="coin-avatar">${esc(asset.symbol.slice(0, 2))}</span><div><h1>${esc(asset.name)}</h1><span>${esc(asset.symbol)} · ${esc(asset.sector)}</span></div></div><p>${esc(asset.description)}</p><div class="detail-return-row">${returns(asset)}</div></section><h2 class="detail-section-title">市场与交易</h2><div class="detail-metrics">${metricCards}</div><h2 class="detail-section-title">项目基本面</h2><div class="detail-metrics">${fundamentalCards}</div><div class="detail-panel" style="margin-top:12px"><p>DefiLlama 覆盖范围：${esc(scope)}。缺少可靠来源的指标显示“—”。</p></div><h2 class="detail-section-title">相关重要新闻</h2><div class="detail-news">${related.length ? related.map(newsCard).join("") : '<div class="news-empty"><strong>暂无已收录的重要新闻</strong><p>新闻仅覆盖已接入的项目官方来源。</p></div>'}</div><p class="detail-caveat">排行使用截至 ${esc(daily.asOf)} UTC 的完整日线。市值、现货、合约和协议指标的采集时间各自独立；不同交易所数据不合并。</p>`);
}

function newsPage(entry) {
  const healthy = entry.sourceStatus?.filter(source => source.ok).length || 0;
  const body = `<a class="detail-back" href="../#news">← 返回每日新闻</a><section class="detail-hero"><span class="mini-label">DAILY BRIEFING</span><h1>${dateZh(entry.date)} 每日简报</h1><p>已检查 ${healthy} / ${entry.sourceStatus?.length || 0} 个接入来源 · 检查时间 ${esc(entry.checkedAt || "—")}</p></section><div class="detail-news" style="margin-top:24px">${entry.items?.length ? entry.items.map(newsCard).join("") : '<div class="news-empty"><strong>已检查来源，暂无符合条件的重要消息</strong></div>'}</div><p class="detail-caveat">仅收录已接入的项目官方论坛与代码版本发布。标题和链接指向原始来源；自动筛选不等同人工事实核查。</p>`;
  return page(`${entry.date} 每日新闻`, body);
}

await Promise.all([mkdir(join(root, "projects"), { recursive: true }), mkdir(join(root, "news"), { recursive: true })]);
for (const asset of daily.assets) {
  if (!/^[A-Z0-9]+$/.test(asset.symbol)) throw new Error(`Unsafe project symbol: ${asset.symbol}`);
  await writeFile(join(root, "projects", `${asset.symbol}.html`), detailPage(asset), "utf8");
}
for (const entry of news.issues || []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error(`Unsafe issue date: ${entry.date}`);
  await writeFile(join(root, "news", `${entry.date}.html`), newsPage(entry), "utf8");
}
console.log(`Rendered index.html, ${daily.assets.length} project pages and ${news.issues?.length || 0} news pages for ${daily.asOf}`);
