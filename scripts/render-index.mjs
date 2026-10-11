import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizedSeries } from "./market-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [template, daily] = await Promise.all([
  readFile(join(root, "templates", "index.html"), "utf8"),
  readFile(join(root, "data", "daily.json"), "utf8").then(JSON.parse)
]);

if (daily.rankings?.d30?.length !== 10 || daily.rankings?.d90?.length !== 10 || daily.rankings?.ytd?.length !== 10) {
  throw new Error("Cannot render an incomplete Top 10 snapshot");
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateZh = value => String(value).slice(0, 10).replaceAll("-", ".");
const pct = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
const assets = new Map(daily.assets.map(asset => [asset.symbol, asset]));
const periodNames = { d30: "最近 30 天", d90: "最近 90 天", ytd: "年初至今" };
const colors = ["#2c78d4", "#22a789", "#ee9b42", "#7d69d3", "#d46491", "#36a8c2", "#bf6e42", "#537ec2", "#8cb759", "#bd8fce", "#526984", "#9babc0"];

function replaceOnce(source, search, value) {
  if (!source.includes(search)) throw new Error(`Template marker missing: ${search.slice(0, 80)}`);
  return source.replace(search, () => value);
}

function rankRow(row, period) {
  const asset = assets.get(row.symbol);
  if (!asset) throw new Error(`Unknown ranked asset: ${row.symbol}`);
  return `<div class="rank-row"><span class="rank-static-name"><span class="rank-ident"><span class="rank-index">${String(row.rank).padStart(2, "0")}</span><span class="coin-avatar" aria-hidden="true">${esc(row.symbol.slice(0, 2))}</span><span class="rank-name"><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)} · ${esc(asset.sector)}</small></span></span></span><span class="rank-return"><strong class="${row.returnPct < 0 ? "negative" : "positive"}">${pct(row.returnPct)}</strong><small>${periodNames[period]}</small></span></div>`;
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
html = replaceOnce(html, '<span id="rank-asof">数据加载中</span>', `<span id="rank-asof">${dateZh(daily.asOf)} UTC 收盘</span>`);
const eligible = daily.assets.filter(asset => Number.isFinite(asset.returns.d30)).length;
html = replaceOnce(html, '<span id="rank-coverage" class="coverage-text">—</span>', `<span id="rank-coverage" class="coverage-text">${eligible} / ${daily.coverage.universe} 个项目具备完整区间日线</span>`);
html = replaceOnce(html, '<div id="rank-rows" aria-live="polite"></div>', `<div id="rank-rows" aria-live="polite"><div class="rank-rows-wrap">${daily.rankings.d30.map(row => rankRow(row, "d30")).join("")}</div></div>`);
html = replaceOnce(html, '<svg id="returns-chart" viewBox="0 0 760 320" role="img" aria-label="前十项目及基准资产的收益曲线"></svg>', `<svg id="returns-chart" viewBox="0 0 760 320" role="img" aria-label="前十项目及基准资产的收益曲线">${staticChart()}</svg>`);
const staticLegend = [...daily.rankings.d30.map(row => row.symbol), "BTC", "ETH"].map((symbol, index) => `<span class="legend-button"><span class="legend-line" style="--line-color:${colors[index]}"></span>${esc(symbol)}</span>`).join("");
html = replaceOnce(html, '<div id="chart-legend" class="chart-legend" aria-label="曲线开关"></div>', `<div id="chart-legend" class="chart-legend" aria-label="曲线开关">${staticLegend}</div>`);
const extraPeriods = ["d90", "ytd"].map(period => `<section class="static-period"><h3>${periodNames[period]} Top 10</h3><div class="static-period-list">${daily.rankings[period].map(row => rankRow(row, period)).join("")}</div></section>`).join("");
html = replaceOnce(html, '<div id="static-periods" class="static-periods"></div>', `<div id="static-periods" class="static-periods">${extraPeriods}</div>`);
const common = daily.rankings.d30.filter(row => daily.rankings.d90.some(other => other.symbol === row.symbol) && daily.rankings.ytd.some(other => other.symbol === row.symbol)).map(row => row.symbol);
html = replaceOnce(html, '<div id="intersection-list" class="intersection-list">—</div>', `<div id="intersection-list" class="intersection-list">${common.length ? common.map(symbol => `<span class="intersection-chip">${esc(symbol)}</span>`).join("") : "目前没有三榜共同入选项目"}</div>`);
html = replaceOnce(html, '<strong id="method-universe">—</strong>', `<strong id="method-universe">${daily.coverage.universe}</strong>`);
html = replaceOnce(html, '<span id="footer-updated">—</span>', `<span id="footer-updated">行情生成：${esc(new Date(daily.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))} 北京时间</span>`);

await writeFile(join(root, "index.html"), html, "utf8");
console.log(`Rendered ranking index.html: ${daily.asOf}, three Top 10s`);
