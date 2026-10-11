const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const DAY = 86_400_000;
const palette = ["#68adff", "#4fdbaf", "#ffc56b", "#b69aff", "#ff88b3", "#57cde9", "#f3a079", "#8eabff", "#c7de79", "#dda9f5"];
const periodLabels = { d30: "最近 30 天", d90: "最近 90 天", ytd: "年初至今" };
const state = { data: null, archive: null, period: "d30", hidden: new Set(["ETH"]), chartSeries: [], chartDates: [] };

function pct(value, digits = 1) { return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%` : "—"; }
function day(value) { return String(value || "").slice(0, 10); }
function dateZh(value) { const d = day(value); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8)}` : "—"; }
function assetOf(symbol) { return state.data?.assets.find(asset => asset.symbol === symbol); }
function avatar(symbol) { return `<span class="coin-avatar" aria-hidden="true">${esc(symbol.slice(0, 2))}</span>`; }
function classFor(value) { return Number.isFinite(value) && value < 0 ? "negative" : "positive"; }

function baseline(period, asOf) {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (period === "d30") return new Date(end - 30 * DAY).toISOString().slice(0, 10);
  if (period === "d90") return new Date(end - 90 * DAY).toISOString().slice(0, 10);
  return `${Number(asOf.slice(0, 4)) - 1}-12-31`;
}

function normalized(history, period) {
  const start = baseline(period, state.data.asOf);
  const rows = history.filter(([date]) => date >= start && date <= state.data.asOf);
  if (!rows.length || rows[0][0] !== start || rows.at(-1)[0] !== state.data.asOf) return [];
  const base = rows[0][1];
  return rows.map(([date, price]) => [date, (price / base - 1) * 100]);
}

function renderMetadata() {
  const data = state.data;
  const prior = new Date();
  prior.setUTCDate(prior.getUTCDate() - 1);
  const expected = prior.toISOString().slice(0, 10);
  const stale = data.asOf < expected;
  $("#rank-asof").textContent = stale ? `数据延迟 · ${dateZh(data.asOf)} UTC 收盘` : `${dateZh(data.asOf)} UTC 收盘`;
  $("#method-universe").textContent = data.coverage.universe;
  $("#footer-updated").textContent = `行情生成：${new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 北京时间`;
}

function renderRanks() {
  document.querySelectorAll("[data-period]").forEach(button => {
    const active = button.dataset.period === state.period;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const rows = state.data.rankings[state.period] || [];
  const eligible = state.data.assets.filter(asset => Number.isFinite(asset.returns[state.period])).length;
  $("#rank-coverage").textContent = `${eligible} / ${state.data.coverage.universe} 个项目具备完整区间日线`;
  $("#rank-rows").innerHTML = `<div class="rank-rows-wrap">${rows.map((row, index) => {
    const asset = assetOf(row.symbol);
    return `<div class="rank-row"><span class="rank-static-name"><span class="rank-ident"><span class="rank-index">${String(row.rank).padStart(2, "0")}</span>${avatar(row.symbol)}<span class="rank-name"><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)} · ${esc(asset.sector)}</small></span></span></span><span class="rank-return"><strong class="${classFor(row.returnPct)}">${pct(row.returnPct)}</strong><small>${periodLabels[state.period]}</small></span></div>`;
  }).join("")}</div>`;
  renderChart();
}

function renderIntersection() {
  const sets = ["d30", "d90", "ytd"].map(period => new Set(state.data.rankings[period].map(row => row.symbol)));
  const common = [...sets[0]].filter(symbol => sets[1].has(symbol) && sets[2].has(symbol));
  $("#intersection-list").innerHTML = common.length ? common.map(symbol => `<span class="intersection-chip">${esc(symbol)}</span>`).join("") : `<span class="coverage-text">目前没有三榜共同入选项目</span>`;
}

function chartData() {
  const top = state.data.rankings[state.period];
  const sources = top.map((row, i) => ({ symbol: row.symbol, history: assetOf(row.symbol).history, color: palette[i], dashed: false }));
  sources.push({ symbol: "BTC", history: state.data.benchmarks.BTC, color: "#d0dbea", dashed: true });
  sources.push({ symbol: "ETH", history: state.data.benchmarks.ETH, color: "#9aacbf", dashed: true });
  return sources.map(source => ({ ...source, points: normalized(source.history, state.period) })).filter(source => source.points.length);
}

function renderChart() {
  const svg = $("#returns-chart");
  const all = chartData();
  state.chartSeries = all;
  const active = all.filter(series => !state.hidden.has(series.symbol));
  const first = all[0]?.points || [];
  state.chartDates = first.map(([date]) => date);
  const values = active.flatMap(series => series.points.map(([, value]) => value));
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const span = Math.max(20, hi - lo);
  const min = lo - span * .09, max = hi + span * .09;
  const left = 48, top = 20, width = 686, height = 255;
  const x = i => left + (i / Math.max(1, first.length - 1)) * width;
  const y = value => top + ((max - value) / (max - min)) * height;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = max - (max - min) * i / 4;
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${left + width}" y2="${yy}" stroke="#2c405c" stroke-width="1"/><text x="${left - 9}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#9eb3cc">${Math.round(value)}%</text>`;
  }).join("");
  const axes = first.length ? [0, Math.floor((first.length - 1) / 2), first.length - 1].map(i => `<text x="${x(i)}" y="${top + height + 25}" text-anchor="middle" font-size="10" fill="#9eb3cc">${esc(first[i][0].slice(5).replace("-", "/"))}</text>`).join("") : "";
  const paths = active.map(series => {
    const byDate = new Map(series.points);
    const d = state.chartDates.map((date, i) => byDate.has(date) ? `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(byDate.get(date)).toFixed(1)}` : "").join(" ");
    return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="${series.dashed ? 2 : 2.4}" ${series.dashed ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round" stroke-linecap="round" opacity="${series.dashed ? .7 : .9}"/>`;
  }).join("");
  svg.innerHTML = `<rect width="760" height="320" fill="#111d30"/>${grid}<line x1="${left}" y1="${y(0)}" x2="${left + width}" y2="${y(0)}" stroke="#5a7899" stroke-width="1.3"/>${paths}${axes}<line id="hover-line" x1="0" x2="0" y1="${top}" y2="${top + height}" stroke="#8caac9" stroke-width="1" stroke-dasharray="3 4" opacity="0"/>`;
  svg.onpointermove = event => {
    if (!state.chartDates.length) return;
    const bounds = svg.getBoundingClientRect();
    const px = (event.clientX - bounds.left) * 760 / bounds.width;
    const index = Math.max(0, Math.min(state.chartDates.length - 1, Math.round((px - left) / width * (state.chartDates.length - 1))));
    const date = state.chartDates[index];
    const line = $("#hover-line");
    line.setAttribute("x1", x(index)); line.setAttribute("x2", x(index)); line.setAttribute("opacity", "1");
    const entries = active.map(series => ({ symbol: series.symbol, value: new Map(series.points).get(date), color: series.color })).filter(item => Number.isFinite(item.value));
    $("#chart-tip").innerHTML = `<strong>${esc(date)} UTC</strong>${entries.map(item => `<div><span style="color:${item.color}">●</span> ${esc(item.symbol)} <b>${pct(item.value)}</b></div>`).join("")}`;
    $("#chart-tip").hidden = false;
  };
  svg.onpointerleave = () => { $("#chart-tip").hidden = true; $("#hover-line")?.setAttribute("opacity", "0"); };
  $("#chart-legend").innerHTML = all.map(series => `<button type="button" class="legend-button ${state.hidden.has(series.symbol) ? "is-hidden" : ""}" data-symbol="${esc(series.symbol)}" aria-pressed="${!state.hidden.has(series.symbol)}"><span class="legend-line" style="--line-color:${series.color}"></span>${esc(series.symbol)}</button>`).join("");
  $("#chart-legend").querySelectorAll("button").forEach(button => button.addEventListener("click", () => { const symbol = button.dataset.symbol; state.hidden.has(symbol) ? state.hidden.delete(symbol) : state.hidden.add(symbol); renderChart(); }));
}

function renderArchive() {
  if (!state.archive?.sections) return;
  const labels = { oneMonth: "近 1 个月", threeMonth: "近 3 个月", ytd: "年初至今" };
  $("#archive-content").innerHTML = `<div class="archive-grid">${state.archive.sections.map(section => `<div><h4>${labels[section.key] || esc(section.periodLabel)}</h4><ol>${section.items.map(item => `<li><strong>${esc(item.symbol)}</strong><span>${pct(item.ret)}</span></li>`).join("")}</ol></div>`).join("")}</div>`;
}

function showFailure(error) {
  console.error(error);
  if ($("#home-view").dataset.staticSnapshot) {
    $("#rank-asof").textContent = `已保存快照：${$("#home-view").dataset.staticSnapshot} UTC · 交互数据暂时不可用`;
    return;
  }
  $("#rank-asof").textContent = "数据读取失败，请稍后重试";
  $("#rank-rows").innerHTML = `<div class="empty">榜单暂时无法加载。请刷新页面或查看稍后的每日更新。</div>`;
}

async function start() {
  const [daily, archive] = await Promise.all([
    fetch("./data/daily.json", { cache: "no-cache" }).then(response => { if (!response.ok) throw new Error("market snapshot unavailable"); return response.json(); }),
    fetch("./data/archive-2026-09-28.json").then(response => response.ok ? response.json() : null).catch(() => null)
  ]);
  if (!daily?.assets?.length || !daily?.rankings?.d30) throw new Error("invalid market snapshot");
  state.data = daily; state.archive = archive;
  renderMetadata(); renderRanks(); renderIntersection(); renderArchive();
  $("#static-periods")?.setAttribute("hidden", "");
  document.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => { state.period = button.dataset.period; state.hidden = new Set(["ETH"]); renderRanks(); }));
  $("#top5-btn").addEventListener("click", () => { state.hidden = new Set(state.data.rankings[state.period].slice(5).map(row => row.symbol).concat("ETH")); renderChart(); });
  $("#all-btn").addEventListener("click", () => { state.hidden.clear(); renderChart(); });
  $("#archive-toggle").addEventListener("click", () => { const content = $("#archive-content"); content.hidden = !content.hidden; $("#archive-toggle").setAttribute("aria-expanded", String(!content.hidden)); });
}

start().catch(showFailure);
