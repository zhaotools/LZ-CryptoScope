const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const DAY = 86_400_000;
const palette = ["#2c78d4", "#22a789", "#ee9b42", "#7d69d3", "#d46491", "#36a8c2", "#bf6e42", "#537ec2", "#8cb759", "#bd8fce"];
const periodLabels = { d30: "最近 30 天", d90: "最近 90 天", ytd: "年初至今" };
const state = { data: null, news: null, archive: null, period: "d30", hidden: new Set(["ETH"]), expanded: false, search: "", sector: "", issueDate: null, chartSeries: [], chartDates: [] };

function pct(value, digits = 1) { return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%` : "—"; }
function short(value, unit = "$") {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e12) return `${unit}${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${unit}${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${unit}${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${unit}${(value / 1e3).toFixed(1)}K`;
  return `${unit}${value.toFixed(value < 10 ? 2 : 0)}`;
}
function number(value) { return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) : "—"; }
function price(value) { if (!Number.isFinite(value)) return "—"; const digits = value >= 100 ? 2 : value >= 1 ? 3 : value >= .01 ? 4 : 6; return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value)}`; }
function day(value) { return String(value || "").slice(0, 10); }
function dateZh(value) { const d = day(value); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8)}` : "—"; }
function assetOf(symbol) { return state.data?.assets.find(asset => asset.symbol === symbol); }
function avatar(symbol) { return `<span class="coin-avatar" aria-hidden="true">${esc(symbol.slice(0, 2))}</span>`; }
function safeUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function assetHref(symbol) { return `?asset=${encodeURIComponent(symbol)}`; }
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

function renderHero() {
  const data = state.data;
  const prior = new Date();
  prior.setUTCDate(prior.getUTCDate() - 1);
  const expected = prior.toISOString().slice(0, 10);
  const stale = data.asOf < expected;
  $("#hero-freshness").textContent = stale ? `行情数据延迟 · 最后完整日 ${data.asOf} UTC` : `行情截至 ${data.asOf} UTC · 每日自动重算`;
  $("#panel-date").textContent = data.asOf;
  $("#stat-universe").textContent = String(data.coverage.universe).padStart(2, "0");
  $("#stat-date").textContent = data.asOf.slice(5).replace("-", "/");
  $("#rank-asof").textContent = `${dateZh(data.asOf)} UTC 收盘`;
  $("#method-universe").textContent = data.coverage.universe;
  $("#footer-updated").textContent = `行情生成：${new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 北京时间`;
  const issue = state.news?.issues?.[0];
  $("#stat-news").textContent = String(issue?.items?.length ?? 0).padStart(2, "0");
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
    return `<div class="rank-row"><button type="button" data-asset="${esc(row.symbol)}" aria-label="查看 ${esc(asset.name)} 项目详情"><span class="rank-ident"><span class="rank-index">${String(row.rank).padStart(2, "0")}</span>${avatar(row.symbol)}<span class="rank-name"><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)} · ${esc(asset.sector)}</small></span></span></button><span class="rank-return"><strong class="${classFor(row.returnPct)}">${pct(row.returnPct)}</strong><small>${periodLabels[state.period]}</small></span></div>`;
  }).join("")}</div>`;
  $("#rank-rows").querySelectorAll("[data-asset]").forEach(button => button.addEventListener("click", () => { location.href = assetHref(button.dataset.asset); }));
  renderChart();
}

function renderIntersection() {
  const sets = ["d30", "d90", "ytd"].map(period => new Set(state.data.rankings[period].map(row => row.symbol)));
  const common = [...sets[0]].filter(symbol => sets[1].has(symbol) && sets[2].has(symbol));
  $("#intersection-list").innerHTML = common.length ? common.map(symbol => `<a class="intersection-chip" href="${assetHref(symbol)}">${esc(symbol)} ↗</a>`).join("") : `<span class="coverage-text">目前没有三榜共同入选项目</span>`;
}

function chartData() {
  const top = state.data.rankings[state.period];
  const sources = top.map((row, i) => ({ symbol: row.symbol, history: assetOf(row.symbol).history, color: palette[i], dashed: false }));
  sources.push({ symbol: "BTC", history: state.data.benchmarks.BTC, color: "#526984", dashed: true });
  sources.push({ symbol: "ETH", history: state.data.benchmarks.ETH, color: "#9babc0", dashed: true });
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
    return `<line x1="${left}" y1="${yy}" x2="${left + width}" y2="${yy}" stroke="#e7edf3" stroke-width="1"/><text x="${left - 9}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#9cabb9">${Math.round(value)}%</text>`;
  }).join("");
  const axes = first.length ? [0, Math.floor((first.length - 1) / 2), first.length - 1].map(i => `<text x="${x(i)}" y="${top + height + 25}" text-anchor="middle" font-size="10" fill="#9cabb9">${esc(first[i][0].slice(5).replace("-", "/"))}</text>`).join("") : "";
  const paths = active.map(series => {
    const byDate = new Map(series.points);
    const d = state.chartDates.map((date, i) => byDate.has(date) ? `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(byDate.get(date)).toFixed(1)}` : "").join(" ");
    return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="${series.dashed ? 2 : 2.4}" ${series.dashed ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round" stroke-linecap="round" opacity="${series.dashed ? .7 : .9}"/>`;
  }).join("");
  svg.innerHTML = `<rect width="760" height="320" fill="#fff"/>${grid}<line x1="${left}" y1="${y(0)}" x2="${left + width}" y2="${y(0)}" stroke="#aec1d3" stroke-width="1.3"/>${paths}${axes}<line id="hover-line" x1="0" x2="0" y1="${top}" y2="${top + height}" stroke="#748da8" stroke-width="1" stroke-dasharray="3 4" opacity="0"/>`;
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

function renderProjects() {
  const sectors = [...new Set(state.data.assets.map(asset => asset.sector))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  $("#sector-filter").innerHTML = `<option value="">全部赛道</option>${sectors.map(sector => `<option value="${esc(sector)}">${esc(sector)}</option>`).join("")}`;
  renderProjectGrid();
}
function renderProjectGrid() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.data.assets.filter(asset => (!state.sector || asset.sector === state.sector) && (!query || `${asset.symbol} ${asset.name} ${asset.sector}`.toLowerCase().includes(query)));
  filtered.sort((a, b) => (b.market.marketCapUsd || 0) - (a.market.marketCapUsd || 0));
  const showing = state.expanded || query || state.sector ? filtered : filtered.slice(0, 12);
  $("#project-count").textContent = `${filtered.length} 个项目`;
  $("#project-grid").innerHTML = showing.length ? showing.map(asset => `<a class="project-card" href="${assetHref(asset.symbol)}"><div class="project-card-head">${avatar(asset.symbol)}<span><strong>${esc(asset.name)}</strong><small>${esc(asset.symbol)}</small></span></div><span class="project-sector">${esc(asset.sector)}</span><p>${esc(asset.description)}</p><div class="project-card-bottom"><span>流通市值</span><strong>${short(asset.market.marketCapUsd)}</strong></div></a>`).join("") : `<div class="empty">没有匹配的项目</div>`;
  $("#show-more").hidden = Boolean(query || state.sector || state.expanded || filtered.length <= 12);
}

function newsCard(item) {
  const url = safeUrl(item.url);
  if (!url) return "";
  return `<article class="news-item"><time class="news-date" datetime="${esc(item.publishedAt)}">${dateZh(item.publishedAt)}</time><div><span class="news-topic">${esc(item.topic)}</span><h4><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h4><div class="news-meta"><span>${esc(item.source)}</span><span>·</span><span>${esc(item.symbols.join(" / "))}</span><span>·</span><span>官方原始来源</span></div></div><a class="news-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="打开原文">原文 ↗</a></article>`;
}
function renderNews() {
  const issues = state.news?.issues || [];
  if (!issues.length) { $("#issue-list").innerHTML = ""; $("#issue-title").textContent = "暂无已发布简报"; $("#news-items").innerHTML = `<div class="news-empty"><strong>新闻简报尚未生成</strong><p>每日采集任务完成后会在这里显示。</p></div>`; return; }
  const selected = issues.find(issue => issue.date === state.issueDate) || issues[0];
  state.issueDate = selected.date;
  $("#issue-list").innerHTML = issues.slice(0, 20).map(issue => `<button type="button" data-date="${esc(issue.date)}" class="${issue.date === selected.date ? "active" : ""}">${dateZh(issue.date)} <span>${issue.items.length}</span></button>`).join("");
  $("#issue-list").querySelectorAll("button").forEach(button => button.addEventListener("click", () => { state.issueDate = button.dataset.date; renderNews(); }));
  $("#issue-date").textContent = selected.date;
  $("#issue-title").textContent = `${dateZh(selected.date)} 每日简报`;
  const healthy = selected.sourceStatus.filter(source => source.ok).length;
  const health = $("#issue-health");
  health.textContent = `${healthy} / ${selected.sourceStatus.length} 个来源已检查`;
  health.classList.toggle("warn", healthy < selected.sourceStatus.length);
  $("#news-items").innerHTML = selected.items.length ? selected.items.map(newsCard).join("") : `<div class="news-empty"><strong>已检查来源，暂无符合条件的重要消息</strong><p>这表示已接入的官方来源中没有新的匹配内容，不代表整个市场没有新闻。</p></div>`;
  $("#stat-news").textContent = String(issues[0].items.length).padStart(2, "0");
}

function renderArchive() {
  if (!state.archive?.sections) return;
  const labels = { oneMonth: "近 1 个月", threeMonth: "近 3 个月", ytd: "年初至今" };
  $("#archive-content").innerHTML = `<div class="archive-grid">${state.archive.sections.map(section => `<div><h4>${labels[section.key] || esc(section.periodLabel)}</h4><ol>${section.items.map(item => `<li><strong>${esc(item.symbol)}</strong><span>${pct(item.ret)}</span></li>`).join("")}</ol></div>`).join("")}</div>`;
}

function detailMetric(label, value, source) { return `<div class="detail-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(source)}</small></div>`; }
function renderDetail(symbol) {
  const asset = assetOf(symbol);
  if (!asset) { $("#detail-content").innerHTML = `<div class="empty">找不到这个项目。<a href="./#projects">返回资料库</a></div>`; return; }
  document.title = `${asset.name} (${asset.symbol})｜LZ CryptoScope`;
  $("#home-view").hidden = true;
  $("#detail-view").hidden = false;
  const related = (state.news?.issues || []).flatMap(issue => issue.items).filter(item => item.symbols.includes(symbol)).slice(0, 5);
  const funding = Number.isFinite(asset.derivatives?.fundingRatePct) ? pct(asset.derivatives.fundingRatePct, 4) : "—";
  $("#detail-content").innerHTML = `<section class="detail-hero"><div class="detail-title-row">${avatar(symbol)}<div><h1>${esc(asset.name)}</h1><span>${esc(asset.symbol)} · ${esc(asset.sector)}</span></div></div><p>${esc(asset.description)}</p><div class="detail-return-row">${["d30", "d90", "ytd"].map(period => `<div class="detail-return-chip">${periodLabels[period]}<strong class="${classFor(asset.returns[period])}">${pct(asset.returns[period])}</strong></div>`).join("")}</div></section>
    <h2 class="detail-section-title">市场与交易</h2><div class="detail-metrics">${detailMetric("当前价格", price(asset.market.priceUsd), "CoinLore · USD")}${detailMetric("流通市值", short(asset.market.marketCapUsd), "CoinLore · USD")}${detailMetric("完全稀释估值", short(asset.market.fdvUsd), "按 CoinLore 价格与最大供应量计算")}${detailMetric("流通供应量", short(asset.market.circulatingSupply, ""), "CoinLore · 代币单位")}${detailMetric("现货 24h 成交额", short(asset.spot.volume24hUsdt, ""), `${asset.spot.exchange} · ${asset.spot.pair} · USDT`)}${detailMetric("合约持仓价值", short(asset.derivatives?.openInterestUsd), asset.derivatives ? `${asset.derivatives.exchange} · 标记价估算 USD` : "暂无可用合约数据")}${detailMetric("合约 24h 成交额", short(asset.derivatives?.volume24hUsd), asset.derivatives ? `${asset.derivatives.exchange} · 名义成交额 USD` : "暂无可用合约数据")}${detailMetric("当前每小时资金费率", funding, asset.derivatives ? asset.derivatives.exchange : "暂无可用合约数据")}${detailMetric("最新收盘价", price(asset.history.at(-1)?.[1]), `${state.data.asOf} UTC · ${asset.pair}`)}</div>
    <h2 class="detail-section-title">项目基本面</h2><div class="detail-metrics">${detailMetric("协议锁仓量 TVL", short(asset.fundamentals.tvlUsd), asset.fundamentals.source || "暂无可比项目指标")}${detailMetric("近 30 天用户费用", short(asset.fundamentals.fees30dUsd), asset.fundamentals.source || "暂无可比项目指标")}${detailMetric("近 30 天协议收入", short(asset.fundamentals.revenue30dUsd), asset.fundamentals.source || "暂无可比项目指标")}</div><div class="detail-panel" style="margin-top:12px"><span class="mini-label">DATA SCOPE</span><p>协议指标覆盖：${asset.fundamentals.scope.length ? esc(asset.fundamentals.scope.join("、")) : "暂无已匹配的 DefiLlama 子协议"}。TVL、费用和收入是不同指标；所列子协议不一定覆盖项目全部业务。</p><p>榜单价格采用 Binance 现货 USDT 完整日线；市值等市场资料与现货 24 小时成交额的采集时间可能不同。<a href="./#method">查看完整方法 ↗</a></p></div>
    <h2 class="detail-section-title">相关重要新闻</h2><div class="detail-news">${related.length ? related.map(newsCard).join("") : `<div class="news-empty"><strong>暂无已收录的重要新闻</strong><p>已接入的官方来源仍会每日检查。</p></div>`}</div><p class="detail-caveat">数据截至 ${esc(state.data.asOf)} UTC 完整日线；现货与项目指标采集于 ${esc(new Date(state.data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))} 北京时间。缺失数据以“—”表示，不按零处理。</p>`;
}

function showFailure(error) {
  console.error(error);
  $("#hero-freshness").textContent = "数据读取失败，请稍后重试";
  $("#rank-rows").innerHTML = `<div class="empty">榜单暂时无法加载。请刷新页面或查看稍后的每日更新。</div>`;
  $("#project-grid").innerHTML = `<div class="empty">项目资料暂时无法加载。</div>`;
  $("#news-items").innerHTML = `<div class="news-empty"><strong>简报暂时无法加载</strong></div>`;
}

async function start() {
  const [daily, news, archive] = await Promise.all([
    fetch("./data/daily.json", { cache: "no-cache" }).then(response => { if (!response.ok) throw new Error("market snapshot unavailable"); return response.json(); }),
    fetch("./data/news.json", { cache: "no-cache" }).then(response => response.ok ? response.json() : null).catch(() => null),
    fetch("./data/archive-2026-09-28.json").then(response => response.ok ? response.json() : null).catch(() => null)
  ]);
  if (!daily?.assets?.length || !daily?.rankings?.d30) throw new Error("invalid market snapshot");
  state.data = daily; state.news = news; state.archive = archive;
  renderHero(); renderRanks(); renderIntersection(); renderProjects(); renderNews(); renderArchive();
  document.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => { state.period = button.dataset.period; state.hidden = new Set(["ETH"]); renderRanks(); }));
  $("#top5-btn").addEventListener("click", () => { state.hidden = new Set(state.data.rankings[state.period].slice(5).map(row => row.symbol).concat("ETH")); renderChart(); });
  $("#all-btn").addEventListener("click", () => { state.hidden.clear(); renderChart(); });
  $("#project-search").addEventListener("input", event => { state.search = event.target.value; renderProjectGrid(); });
  $("#sector-filter").addEventListener("change", event => { state.sector = event.target.value; renderProjectGrid(); });
  $("#show-more").addEventListener("click", () => { state.expanded = true; renderProjectGrid(); });
  $("#archive-toggle").addEventListener("click", () => { const content = $("#archive-content"); content.hidden = !content.hidden; $("#archive-toggle").setAttribute("aria-expanded", String(!content.hidden)); });
  const symbol = new URLSearchParams(location.search).get("asset")?.toUpperCase();
  if (symbol) renderDetail(symbol);
}

start().catch(showFailure);
