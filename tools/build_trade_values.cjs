/*
 * Builds the Trade Alley public/league-facing read model.  Canon data stays in
 * sources/; this script only reads it and writes a separate website snapshot.
 *
 * External source adapters deliberately accept local, reviewed JSON snapshots.
 * They do not fetch, scrape, or reverse engineer third-party sites.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const root = path.resolve(repo, '..', '..');
const source = name => JSON.parse(fs.readFileSync(path.join(root, 'sources', name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(repo, 'data', name), JSON.stringify(value, null, 2) + '\n');
const canonical = name => name.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g, '').replace(/[^a-z0-9]/g, '');
const idFor = name => canonical(name);
const skillPositions = new Set(['QB', 'RB', 'WR', 'TE']);
const iso = value => new Date(value).toISOString();

const master = source('WFC_MASTER.json');
const analytics = source('WFC_ANALYTICS.json');
const season = master.seasons[String(analytics.season)];
const marketModelPath = path.join(repo, 'data', 'wfc-market-model.json');
const marketModel = fs.existsSync(marketModelPath) ? JSON.parse(fs.readFileSync(marketModelPath, 'utf8')) : null;

const providers = [
  {
    id: 'wfc-manual', name: 'WFC manual value board', status: 'active',
    scoring_format: 'WFC · full PPR · 1 QB + 1 Superflex · 4 pt pass TD',
    source_url: null, captured_at: null,
    access: 'Commissioner-maintained manual values and tiers', raw_scale: 'WFC manual 3D-style value',
    normalization: 'Displayed as entered; included in consensus only as a within-board percentile',
    notes: 'The first-class board. Edit the reviewed local snapshot to set values, tiers, market values, and historical points.'
  },
  {
    id: 'wfc-internal', name: 'WFC internal rankings', status: 'active',
    scoring_format: 'WFC · full PPR · 1 QB + 1 Superflex · 4 pt pass TD',
    source_url: null, captured_at: iso(analytics.generated_at),
    access: 'Internal derived rank model', raw_scale: 'WFC rank signal',
    normalization: 'Rank → percentile within the provider pool',
    notes: 'Derived from WFC roster context, permitted private forward signals where available, approved legacy rank inputs, and rostered-player results. Not a public-source value chart.'
  },
  {
    id: 'wfc-market-model', name: 'WFC daily market model', status: marketModel ? 'active' : 'awaiting_refresh',
    scoring_format: 'WFC · full PPR · 1 QB + 1 Superflex · 4 pt pass TD',
    source_url: null, captured_at: marketModel?.as_of || null,
    access: 'WFC-owned explainable model', raw_scale: 'WFC market value (0–100)',
    normalization: 'Rank/value → percentile within the WFC model pool',
    notes: 'Independent production, form, outlook, role, schedule, news, and Superflex model. It is not a copy or reverse-engineering of a publisher value chart.'
  },
  {
    id: 'wfc-market-v2-shadow', name: 'WFC v2 shadow — uncapped drift', status: marketModel?.shadow_v2 ? 'shadow_review' : 'awaiting_refresh',
    scoring_format: 'WFC · full PPR · 1 QB + 1 Superflex · 4 pt pass TD', source_url: null, captured_at: marketModel?.as_of || null,
    access: 'WFC-owned review model', raw_scale: 'WFC v2 shadow value (0–100)', comparison_mode: 'direct',
    normalization: 'Shown beside v1 on the same 0–100 scale; no external-market drift guardrail is active.',
    notes: 'First calibration pass: regressed scoring forecast + availability proxy + WFC-format value over replacement. Review only; it does not replace the live board.'
  },
  {
    id: 'footclan-private-inputs', name: 'Fantasy Footballers FootClan — private inputs',
    status: marketModel?.input_status?.footclan_private_status || 'not_captured',
    scoring_format: 'Subscriber profile aligned to WFC full PPR / 4-point pass TD / Superflex context',
    source_url: 'https://www.thefantasyfootballers.com/footclan/',
    captured_at: marketModel?.input_status?.footclan_private_captured_at || null,
    access: 'Private subscriber decision input; not re-published', raw_scale: 'Provider rank/projection (private)', comparison_mode: 'input_only',
    normalization: 'Private source rows are converted locally to WFC forward signals. They are never treated as a public trade-value provider or exposed as raw values.',
    notes: `Current coverage: ${marketModel?.input_status?.footclan_private_status || 'not captured'}; ${marketModel?.input_status?.footclan_private_rankings_matched || 0} rostered-player inputs matched. Article signals are WFC-authored summaries, not copied articles.`
  },
  {
    id: 'nflverse-weekly', name: 'nflverse weekly usage inputs', status: marketModel?.input_status?.nflverse_weekly_status || 'awaiting_refresh',
    scoring_format: 'NFL weekly player statistics; WFC transforms these into usage/efficiency signals',
    source_url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', captured_at: marketModel?.input_status?.nflverse_weekly_captured_at || null,
    access: 'Public nflverse data release', raw_scale: 'Weekly targets, shares, carries, EPA, and PPR points', comparison_mode: 'input_only',
    normalization: 'Not a trade-value source. In v2, usage and efficiency are ranked only within position and make modest PPG adjustments.',
    notes: `Attributed to nflverse / FTN Data (CC-BY-SA 4.0). ${marketModel?.input_status?.nflverse_players_matched || 0} WFC-rostered players matched in the current cache.`
  },
  {
    id: 'draftsharks', name: 'DraftSharks', status: 'manual_or_licensed_import_required',
    scoring_format: 'PPR Superflex (select the matching public chart)',
    source_url: 'https://www.draftsharks.com/trade-value-chart/ppr-superflex', captured_at: null,
    access: 'Public chart landing page is linkable; premium/custom trade tools are not collected.', raw_scale: 'Provider value',
    normalization: 'Rank/value → percentile only after a permitted, reviewed snapshot is supplied',
    notes: 'No automated fetch, paywall bypass, authentication, robots workaround, or anti-bot circumvention.'
  },
  {
    id: 'fantasypros', name: 'FantasyPros', status: 'manual_or_licensed_import_required', scoring_format: 'Use matching PPR Superflex / 2QB chart', source_url: 'https://www.fantasypros.com/nfl/rankings/ros-ppr-superflex.php', captured_at: null, access: 'Placeholder adapter', raw_scale: 'Provider value', normalization: 'Rank/value → percentile after permitted import', notes: 'Source-specific terms and refresh policy must be reviewed before use.'
  },
  {
    id: 'espn', name: 'ESPN', status: 'manual_or_licensed_import_required', scoring_format: 'Use matching PPR Superflex / 2QB rankings', source_url: 'https://www.espn.com/fantasy/football/', captured_at: null, access: 'Placeholder adapter', raw_scale: 'Provider rank/value', normalization: 'Rank/value → percentile after permitted import', notes: 'WFC league results are canon context; any separate ESPN ranks require a reviewed, permitted snapshot.'
  },
  {
    id: 'justin-boone-yahoo', name: 'Justin Boone / Yahoo', status: 'manual_or_licensed_import_required', scoring_format: 'Use matching PPR Superflex / 2QB chart', source_url: 'https://sports.yahoo.com/author/justin-boone/', captured_at: null, access: 'Placeholder adapter', raw_scale: 'Provider value', normalization: 'Rank/value → percentile after permitted import', notes: 'Source-specific terms and refresh policy must be reviewed before use.'
  },
  {
    id: 'cbs', name: 'CBS Sports / Dave Richard', status: 'manual_or_licensed_import_required', scoring_format: 'Use matching PPR Superflex / 2QB chart', source_url: 'https://www.cbssports.com/fantasy/football/', captured_at: null, access: 'Placeholder adapter', raw_scale: 'Provider value', normalization: 'Rank/value → percentile after permitted import', notes: 'Source-specific terms and refresh policy must be reviewed before use.'
  }
];

// The external adapter contract is intentionally file-based. A reviewed import
// contains { provider_id, captured_at, scoring_format, rows:[{player, position,
// rank?, raw_value?, tier?}] }. The importer below normalizes *within* the
// provider; raw numeric scales are never averaged across providers.
const importsDir = path.join(repo, 'data', 'trade-sources');
const externalRows = [];
if (fs.existsSync(importsDir)) {
  for (const file of fs.readdirSync(importsDir).filter(file => file.endsWith('.json'))) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(importsDir, file), 'utf8'));
    if (!snapshot.provider_id || !Array.isArray(snapshot.rows)) throw new Error(`${file}: invalid provider snapshot`);
    const provider = providers.find(item => item.id === snapshot.provider_id);
    if (!provider) throw new Error(`${file}: unknown provider ${snapshot.provider_id}`);
    provider.captured_at = iso(snapshot.captured_at);
    provider.scoring_format = snapshot.scoring_format || provider.scoring_format;
    provider.status = 'active';
    provider.access = snapshot.access || 'Reviewed local import';
    snapshot.rows.forEach((row, index) => externalRows.push({
      provider_id: provider.id, player_id: idFor(row.player), player: row.player,
      position: row.position || null, source_rank: Number.isFinite(row.rank) ? row.rank : null,
      raw_value: Number.isFinite(row.raw_value) ? row.raw_value : null,
      tier: row.tier || null, market_value: Number.isFinite(row.market_value) ? row.market_value : null,
      history: Array.isArray(row.history) ? row.history : [], captured_at: provider.captured_at, ordinal: index + 1
    }));
  }
}

const franchises = new Map(season.franchises.map(team => [team.franchise_id, team]));
const roster = new Map();
for (const row of season.rosters) {
  const position = (row.player_details || '').trim().split(/\s+/).at(-1) || null;
  if (!skillPositions.has(position)) continue;
  roster.set(idFor(row.player_name), { id: idFor(row.player_name), name: row.player_name, position, nfl_team: (row.player_details || '').split(/\s+/)[0] || '—', franchise_id: row.franchise_id });
}

const footballers = new Map();
for (const [name, position, nfl_team, rank] of analytics.footballers.players) {
  if (skillPositions.has(position) && Number.isFinite(Number(rank))) footballers.set(idFor(name), { rank: Number(rank), position, nfl_team });
}

const totals = new Map();
for (const row of season.player_weeks) {
  const key = idFor(row.player_name);
  if (!roster.has(key) || !skillPositions.has(row.position)) continue;
  const stat = totals.get(key) || { total: 0, games: 0, starts: 0 };
  stat.total += Number(row.fantasy_points) || 0;
  stat.games += 1;
  stat.starts += row.is_starter ? 1 : 0;
  totals.set(key, stat);
}

const performanceRank = new Map();
for (const position of skillPositions) {
  const rows = [...roster.values()].filter(player => player.position === position).sort((a, b) => {
    const left = totals.get(a.id), right = totals.get(b.id);
    const leftScore = left ? left.total / Math.max(left.games, 1) + left.starts * .35 : -1;
    const rightScore = right ? right.total / Math.max(right.games, 1) + right.starts * .35 : -1;
    return rightScore - leftScore || a.name.localeCompare(b.name);
  });
  rows.forEach((player, index) => performanceRank.set(player.id, index + 1));
}

const caps = { QB: 40, RB: 60, WR: 90, TE: 40 };
const internalRows = [...roster.values()].map(player => {
  const rank = footballers.get(player.id)?.rank ?? performanceRank.get(player.id);
  const basePercentile = Math.max(0, Math.min(100, 100 * (caps[player.position] - rank + 1) / caps[player.position]));
  let adjustment = 0;
  let adjustment_label = 'No positional adjustment';
  if (player.position === 'QB') {
    adjustment = rank <= 12 ? 12 : rank <= 24 ? 8 : 3;
    adjustment_label = `+${adjustment} Superflex QB scarcity`;
  }
  const wfc_value = Math.min(100, Math.round((basePercentile + adjustment) * 10) / 10);
  return {
    provider_id: 'wfc-internal', player_id: player.id, player: player.name, position: player.position,
    source_rank: rank, raw_value: null, tier: null, normalized_value: Math.round(basePercentile * 10) / 10,
    wfc_value, wfc_adjustment: adjustment, adjustment_label, captured_at: providers.find(item => item.id === 'wfc-internal').captured_at
  };
});

const marketRows = (marketModel?.players || []).map((row, index) => ({
  provider_id: 'wfc-market-model', player_id: row.id, player: row.name, position: row.position,
  source_rank: row.market_rank, raw_value: row.value, tier: row.tier, market_value: row.market_value,
  history: row.history || [], captured_at: marketModel.as_of, ordinal: index + 1,
  drivers: row.drivers, stats: row.stats, news: row.news, override: row.override
}));
const shadowRows = (marketModel?.shadow_v2?.players || []).map((row, index) => ({
  provider_id: 'wfc-market-v2-shadow', player_id: row.id, player: row.name, position: row.position,
  source_rank: row.market_rank, raw_value: row.value, tier: row.tier, market_value: row.market_value,
  captured_at: marketModel.as_of, ordinal: index + 1, drivers: row.drivers
}));

// External rankings are normalized provider-by-provider. If rank is absent, a
// higher raw value ranks first. Ties receive a shared midpoint percentile.
for (const provider of providers.filter(item => item.id !== 'wfc-internal' && (item.status === 'active' || item.comparison_mode === 'direct'))) {
  const rows = [...externalRows, ...marketRows, ...shadowRows].filter(row => row.provider_id === provider.id).sort((a, b) => {
    if (a.source_rank !== null && b.source_rank !== null) return a.source_rank - b.source_rank;
    if (a.raw_value !== null && b.raw_value !== null) return b.raw_value - a.raw_value;
    return a.ordinal - b.ordinal;
  });
  rows.forEach((row, index) => { row.normalized_value = Math.round((100 * (rows.length - index) / rows.length) * 10) / 10; });
}

const allRows = [...internalRows, ...marketRows, ...shadowRows, ...externalRows];
const playerMap = new Map([...roster.values()].map(player => [player.id, player]));
for (const row of allRows) if (!playerMap.has(row.player_id)) playerMap.set(row.player_id, { id: row.player_id, name: row.player, position: row.position || '—', nfl_team: '—', franchise_id: null });

const players = [...playerMap.values()].map(player => {
  const rows = allRows.filter(row => row.player_id === player.id && Number.isFinite(row.normalized_value));
  // Consensus uses normalized percentiles, not provider raw scores.
  const consensus_value = rows.length ? Math.round((rows.reduce((sum, row) => sum + row.normalized_value, 0) / rows.length) * 10) / 10 : null;
  const wfc = internalRows.find(row => row.player_id === player.id);
  return { ...player, consensus_value, consensus_rank: null, source_count: rows.length, wfc_value: wfc?.wfc_value ?? null, wfc_adjustment: wfc?.wfc_adjustment ?? 0, adjustment_label: wfc?.adjustment_label ?? 'External-only player; WFC adjustment unavailable' };
}).sort((a, b) => (b.consensus_value ?? -1) - (a.consensus_value ?? -1) || a.name.localeCompare(b.name));
players.forEach((player, index) => { player.consensus_rank = player.consensus_value === null ? null : index + 1; });

const teams = season.franchises.map(team => ({
  id: team.franchise_id, name: team.team_name,
  quarterbacks: season.rosters.filter(row => row.franchise_id === team.franchise_id && /\bQB$/.test(row.player_details || '')).map(row => idFor(row.player_name)),
  roster_size: season.rosters.filter(row => row.franchise_id === team.franchise_id).length
}));
const manualBoard = externalRows.filter(row => row.provider_id === 'wfc-manual').map(row => {
  const player = playerMap.get(row.player_id);
  return {
    player_id: row.player_id, player: row.player, position: row.position || player?.position || '—',
    nfl_team: player?.nfl_team || '—', franchise_id: player?.franchise_id || null,
    tier: row.tier || 'Unassigned', value: row.raw_value, market_value: row.market_value,
    source_rank: row.source_rank, history: row.history, captured_at: row.captured_at
  };
}).sort((left, right) => Number(left.tier) - Number(right.tier) || right.value - left.value || left.player.localeCompare(right.player));
const marketBoard = marketRows.map(row => {
  const player = playerMap.get(row.player_id);
  return {
    player_id: row.player_id, player: row.player, position: row.position || player?.position || '—',
    nfl_team: player?.nfl_team || '—', franchise_id: player?.franchise_id || null,
    tier: row.tier || 'Unassigned', value: row.raw_value, market_value: row.market_value,
    source_rank: row.source_rank, history: row.history, captured_at: row.captured_at,
    drivers: row.drivers, stats: row.stats, news: row.news, override: row.override
  };
}).sort((left, right) => Number(left.tier) - Number(right.tier) || right.value - left.value || left.player.localeCompare(right.player));

write('trade-values.json', {
  schema_version: '1.0.0', product: 'WFC Trade Alley', generated_at: new Date().toISOString(),
  data_scope: 'league decision support; external trade values are separate from WFC canon',
  league_rules: { teams: 12, scoring: 'full PPR', starters: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'D/ST', 'K'], passing_touchdown_points: 4, quarterback_cap: 3 },
  consensus_method: 'For each provider, convert its rank/value order to a 0–100 within-provider percentile. Average only those normalized values. Provider raw values are displayed but never averaged.',
  wfc_adjustments: 'QB scarcity: +12 for ranks 1–12, +8 for ranks 13–24, +3 otherwise. Package values are limited by the receiving team’s 3-QB cap.',
  providers, players, rows: allRows, teams, manual_board: manualBoard, market_board: marketBoard,
  market_model: marketModel ? {
    model_id: marketModel.model_id, as_of: marketModel.as_of, history_date: marketModel.history_date,
    input_status: marketModel.input_status, limitations: marketModel.limitations,
    shadow_v2: marketModel.shadow_v2 ? {
      model_id: marketModel.shadow_v2.model_id, status: marketModel.shadow_v2.status,
      model_summary: marketModel.shadow_v2.model_summary, limitations: marketModel.shadow_v2.limitations
    } : null
  } : null,
  default_trade: { left_team: 'WFC_ESPN_14', right_team: 'WFC_ESPN_19', left: ['amonrastbrown'], right: ['bryceyoung', 'teehiggins'] }
});
console.log(`Wrote ${players.length} players, ${internalRows.length} internal rows, and ${externalRows.length} authorized external rows.`);
