'use strict';

const $ = selector => document.querySelector(selector);
const element = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const value = number => Number.isFinite(Number(number)) ? Number(number).toFixed(1) : '—';
const columns = ['WR', 'RB', 'TE', 'QB'];
let data;
const nflCode = team => ({ WAS: 'wsh', WSH: 'wsh', JAC: 'jax', JAX: 'jax', SF: 'sf', TB: 'tb', GB: 'gb', KC: 'kc', NE: 'ne', NO: 'no', NYG: 'nyg', NYJ: 'nyj', LV: 'lv', LAR: 'lar', LAC: 'lac' }[team] || String(team || '').toLowerCase());

function nflLogo(team) {
  const wrap = element('span', '', 'nfl-logo'); const image = document.createElement('img');
  image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${nflCode(team)}.png`; image.alt = `${team} logo`; image.loading = 'lazy';
  image.addEventListener('error', () => { wrap.textContent = team; wrap.classList.add('nfl-logo-fallback'); }, { once: true }); wrap.append(image); return wrap;
}
function displayDate(date) { return date ? new Date(date).toLocaleString() : 'Awaiting permitted import'; }
function pointDate(date, long = false) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'numeric', day: 'numeric', year: '2-digit' }); }
function trend(item) {
  const points = (item.history || []).filter(point => Number.isFinite(Number(point.market_value)));
  const latest = points.at(-1)?.market_value ?? item.market_value; const previous = points.at(-2)?.market_value;
  const units = Number.isFinite(Number(previous)) ? Math.round(Number(latest) - Number(previous)) : 0;
  return { units, className: units > 0 ? 'positive' : units < 0 ? 'negative' : 'neutral', label: units > 0 ? `+${units}` : units < 0 ? String(units) : '—', aria: units > 0 ? `up ${units} value units` : units < 0 ? `down ${Math.abs(units)} value units` : 'no value change' };
}
function svgNode(name, attributes = {}) { const node = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attributes).forEach(([key, val]) => node.setAttribute(key, val)); return node; }
function chart(points, expanded = false) {
  const clean = points.filter(point => Number.isFinite(Number(point.market_value)));
  if (!clean.length) return element('p', 'First market snapshot pending.', 'history-empty');
  const width = expanded ? 980 : 306, height = expanded ? 380 : 112, pad = expanded ? { left: 58, right: 24, top: 22, bottom: 48 } : { left: 29, right: 8, top: 10, bottom: 25 };
  const values = clean.map(point => Number(point.market_value)), floor = Math.min(...values), ceiling = Math.max(...values), spread = Math.max(5, ceiling - floor);
  const low = Math.max(0, Math.floor((floor - spread * .22) / 5) * 5), high = Math.ceil((ceiling + spread * .22) / 5) * 5;
  const x = index => pad.left + (width - pad.left - pad.right) * (clean.length === 1 ? .5 : index / (clean.length - 1));
  const y = number => pad.top + (high - number) / Math.max(1, high - low) * (height - pad.top - pad.bottom);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Market value history from ${clean[0].date} to ${clean.at(-1).date}` });
  Array.from({ length: expanded ? 4 : 3 }, (_, index, all) => low + (high - low) * index / (all.length - 1)).forEach(number => {
    const line = svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y(number), y2: y(number), class: 'history-grid' }); const label = svgNode('text', { x: expanded ? 12 : 0, y: y(number) + 4 }); label.textContent = number.toFixed(0); svg.append(line, label);
  });
  svg.append(svgNode('polyline', { points: clean.map((point, index) => `${x(index)},${y(point.market_value)}`).join(' '), class: 'history-line' }));
  clean.forEach((point, index) => { const dot = svgNode('circle', { cx: x(index), cy: y(point.market_value), r: expanded ? 5.5 : 0, class: 'history-dot' }); const title = svgNode('title'); title.textContent = `${pointDate(point.date, true)} · ${value(point.market_value)}${point.kind === 'modeled_preseason' ? ' · modeled preseason' : ''}`; dot.append(title); if (expanded) svg.append(dot); });
  const labels = expanded ? clean.map((point, index) => ({ point, index })).filter(({ index }) => index === 0 || index === clean.length - 1 || (clean.length > 4 && index === Math.floor((clean.length - 1) / 2))) : [0, clean.length - 1].filter((item, index, all) => all.indexOf(item) === index).map(index => ({ point: clean[index], index }));
  labels.forEach(({ point, index }) => { const label = svgNode('text', { x: x(index), y: height - (expanded ? 14 : 4), 'text-anchor': index === 0 ? 'start' : index === clean.length - 1 ? 'end' : 'middle', class: 'history-date' }); label.textContent = pointDate(point.date); svg.append(label); }); return svg;
}
function historyCard(item) {
  const change = trend(item), card = element('aside', '', 'history-popover'), title = element('div', '', 'history-title'); title.append(element('strong', item.player), element('span', `${item.nfl_team} · ${item.position}`));
  const measures = element('div', '', 'history-measures'); [['Market', item.market_value], ['Change', change.label]].forEach(([label, number]) => { const measure = element('span', '', label === 'Change' ? `popover-change ${change.className}` : ''); measure.append(element('small', label), element('b', String(number))); measures.append(measure); });
  const drivers = item.drivers ? element('p', `Production ${value(item.drivers.production)} · Form ${value(item.drivers.recent_form)} · Outlook ${value(item.drivers.outlook)} · Role ${value(item.drivers.starting_role)}${item.drivers.superflex_qb ? ` · QB +${value(item.drivers.superflex_qb)}` : ''}${item.drivers.news_impact ? ` · News ${item.drivers.news_impact > 0 ? '+' : ''}${value(item.drivers.news_impact)}` : ''}`, 'driver-summary') : null;
  const note = item.news?.reason || item.override?.reason, details = element('button', 'View details', 'details-button'); details.type = 'button'; details.addEventListener('click', event => { event.stopPropagation(); openTrend(item); });
  card.append(title, measures, drivers || document.createDocumentFragment(), note ? element('p', note, 'driver-note') : document.createDocumentFragment(), chart(item.history || []), details); return card;
}
function playerCard(item, tierRow) {
  const change = trend(item), card = element('article', '', `board-player ${change.className}`); card.style.gridColumn = String(columns.indexOf(item.position) + 1); card.style.gridRow = String(tierRow); card.tabIndex = 0;
  card.setAttribute('aria-label', `${item.player}, ${item.position}, WFC market value ${value(item.market_value)}, ${change.aria}. Focus for value history and model drivers.`);
  const identity = element('span', '', 'player-identity'), copy = element('span', '', 'player-copy'); copy.append(element('strong', item.player), element('small', `${item.nfl_team} · ${item.position}`)); identity.append(nflLogo(item.nfl_team), copy);
  const changeNode = element('span', change.label, `value-change ${change.className}`); changeNode.setAttribute('aria-label', change.aria); card.append(identity, changeNode, element('span', '⌁', 'history-icon'), historyCard(item)); return card;
}
function valueCell(item, tierRow) { const cell = element('div', '', 'board-value'); cell.style.gridColumn = '5'; cell.style.gridRow = String(tierRow); cell.setAttribute('aria-label', `${item.player} market value ${value(item.market_value)}`); cell.append(element('small', 'WFC'), element('b', value(item.market_value))); return cell; }
function ensureTrendDialog() { let dialog = $('#trend-dialog'); if (dialog) return dialog; dialog = document.createElement('dialog'); dialog.id = 'trend-dialog'; dialog.className = 'trend-dialog'; dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }); document.body.append(dialog); return dialog; }
function openTrend(item) {
  const dialog = ensureTrendDialog(), change = trend(item), shell = element('section', '', 'trend-shell'), close = element('button', '×', 'trend-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close value trend'); close.addEventListener('click', () => dialog.close());
  const eyebrow = element('p', 'WFC / MARKET HISTORY', 'eyebrow'), heading = element('h2', '3D value trend'), player = element('section', '', 'trend-player'), identity = element('div', '', 'trend-identity'), text = element('div'); text.append(element('h3', item.player), element('p', `${item.nfl_team} · ${item.position}`)); identity.append(nflLogo(item.nfl_team), text);
  const stats = element('div', '', 'trend-stats'); [['Market value', value(item.market_value)], ['Change', change.label]].forEach(([label, result]) => { const stat = element('div', '', label === 'Change' ? `trend-change ${change.className}` : ''); stat.append(element('small', label), element('strong', result)); stats.append(stat); }); player.append(identity, stats);
  const graph = element('section', '', 'trend-graph'); graph.append(chart(item.history || [], true), element('p', 'Preseason points are clearly labeled WFC model reconstructions. Regular-season points are saved daily WFC snapshots; hover a plotted point for its date and value.', 'trend-note'));
  shell.append(close, eyebrow, heading, player, graph); dialog.replaceChildren(shell); dialog.showModal();
}
function renderBoard() {
  const board = $('#value-board'), items = data.market_board?.length ? data.market_board : data.manual_board; board.replaceChildren(); if (!items?.length) { board.append(element('p', 'No WFC market snapshot is available yet. Run the Trade Alley refresh.', 'empty')); return; }
  const grouped = new Map(); items.forEach(item => { const tier = item.tier || 'Unassigned'; grouped.set(tier, [...(grouped.get(tier) || []), item]); });
  [...grouped.entries()].sort(([left], [right]) => Number(left) - Number(right) || left.localeCompare(right)).forEach(([tier, tierItems]) => { const block = element('section', '', 'tier-block'); block.append(element('h3', `Tier ${tier}`, 'tier-label')); const grid = element('div', '', 'board-grid'); columns.forEach(position => grid.append(element('div', position === 'WR' ? 'Wide Receiver' : position === 'RB' ? 'Running Back' : position === 'TE' ? 'Tight End' : 'Quarterback', 'position-header'))); grid.append(element('div', 'Market value', 'position-header value-header')); const rows = new Map(); tierItems.slice().sort((a, b) => a.source_rank - b.source_rank).forEach((item, index) => rows.set(item.player_id, index + 2)); tierItems.forEach(item => grid.append(playerCard(item, rows.get(item.player_id)), valueCell(item, rows.get(item.player_id)))); block.append(grid); board.append(block); });
}
function renderProviders() { $('#providers').replaceChildren(...data.providers.map(provider => { const card = element('article', '', 'provider'), heading = element('h3'), link = provider.source_url ? document.createElement('a') : element('span'); link.textContent = provider.name; if (provider.source_url) { link.href = provider.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; } heading.append(link); card.append(heading, element('p', provider.status.replaceAll('_', ' '), `provider-status ${provider.status === 'active' ? 'active' : ''}`), element('p', provider.scoring_format), element('p', `Captured: ${displayDate(provider.captured_at)}`, 'muted'), element('p', provider.notes, 'muted')); return card; })); }
function init() { const model = data.providers.find(provider => provider.id === 'wfc-market-model'), board = data.market_board?.length ? data.market_board : data.manual_board, activeNews = data.market_model?.input_status?.active_news_signals ?? 0; $('#updated').textContent = `WFC market model updated ${displayDate(model?.captured_at)} · ${board.length} players valued · ${activeNews} active news signals.`; $('#board-state').textContent = `${board.length} VALUES`; renderBoard(); renderProviders(); }
fetch('data/trade-values.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw Error('Trade snapshot unavailable'); return response.json(); }).then(snapshot => { data = snapshot; init(); }).catch(() => { $('#updated').textContent = 'Trade Alley data could not load. Refresh to try again.'; });
