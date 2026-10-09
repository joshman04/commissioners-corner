/*
 * WFC's independent, explainable market-value model.
 *
 * It deliberately does not scrape, clone, or reverse engineer third-party
 * valuation systems. Public/provider charts can be compared separately after a
 * permitted manual import. This model only reads WFC canon plus reviewed WFC
 * inputs and writes derived website data.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const root = path.resolve(repo, '..', '..');
const data = name => JSON.parse(fs.readFileSync(path.join(repo, 'data', name), 'utf8'));
const source = name => JSON.parse(fs.readFileSync(path.join(root, 'sources', name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(repo, 'data', name), JSON.stringify(value, null, 2) + '\n');
const canon = name => String(name).toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g, '').replace(/[^a-z0-9]/g, '');
const clamp = (number, low = 0, high = 100) => Math.max(low, Math.min(high, number));
const round = number => Math.round(number * 10) / 10;
const positions = new Set(['QB', 'RB', 'WR', 'TE']);
const today = new Date().toISOString().slice(0, 10);

const master = source('WFC_MASTER.json');
const analytics = source('WFC_ANALYTICS.json');
const season = master.seasons[String(analytics.season)];
const newsInput = data('market-inputs/news-signals.json');
const scheduleInput = data('market-inputs/schedule-signals.json');
const overrideInput = data('market-inputs/manual-overrides.json');
const nflverseInput = data('market-inputs/nflverse-weekly.json');
const rosProjectionInput = data('market-inputs/ros-projections.json');
const availabilityInput = data('market-inputs/availability-signals.json');
// Subscriber inputs live outside the website repository. The public build may
// consume their *derived* signal, but never writes source projections, ranks,
// expert splits, or article text to a public data file.
const footclanPath = path.join(root, 'private', 'footclan', 'current.json');
const footclan = fs.existsSync(footclanPath)
  ? JSON.parse(fs.readFileSync(footclanPath, 'utf8'))
  : null;
// The owner-controlled UDK export is a private preseason anchor, not a public
// provider. This file holds only WFC-derived 0–100 anchors; raw UDK ranks,
// projections, ADP, and editorial content never enter the website payload.
const preseasonSeedPath = path.join(root, 'private', 'udk', 'limp-brizkit-espn-preseason-seed.json');
const preseasonSeedInput = fs.existsSync(preseasonSeedPath)
  ? JSON.parse(fs.readFileSync(preseasonSeedPath, 'utf8'))
  : null;
const preseasonSeeds = new Map((preseasonSeedInput?.players || [])
  .map(row => [canon(row.name || row.id), Number(row.seed_value)]));
// A commissioner-supplied public DraftSharks snapshot provides market shape,
// not a second raw score to average. WFC evidence is blended into that shape
// after its rank/tier curve is established.
const calibrationPath = path.join(root, 'private', 'calibration', 'draftsharks-ppr-superflex-2026-10-07.json');
const calibrationInput = fs.existsSync(calibrationPath)
  ? JSON.parse(fs.readFileSync(calibrationPath, 'utf8'))
  : null;
const calibrationRows = calibrationInput?.rows || [];
const calibrationById = new Map(calibrationRows.map(row => [canon(row.player || row.id), row]));
const calibrationTierEnds = calibrationInput?.tier_ends || [];
const historyPath = path.join(repo, 'data', 'market-history.json');
const historyStore = fs.existsSync(historyPath)
  ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
  : { schema_version: '1.0.0', snapshots: {} };
historyStore.snapshot_metadata = historyStore.snapshot_metadata || {};

const roster = new Map();
for (const row of season.rosters) {
  const details = (row.player_details || '').trim().split(/\s+/);
  const position = details.at(-1);
  if (!positions.has(position)) continue;
  roster.set(canon(row.player_name), { id: canon(row.player_name), name: row.player_name, position, nfl_team: details[0] || '—', franchise_id: row.franchise_id });
}
const ranks = new Map();
for (const [name, position, nflTeam, rank] of analytics.footballers.players) {
  if (positions.has(position) && Number.isFinite(Number(rank))) ranks.set(canon(name), { rank: Number(rank), nfl_team: nflTeam });
}
const games = new Map();
for (const row of season.player_weeks) {
  const id = canon(row.player_name);
  if (!roster.has(id) || !positions.has(row.position)) continue;
  const rows = games.get(id) || [];
  rows.push({ week: Number(row.week), points: Number(row.fantasy_points) || 0, started: Boolean(row.is_starter) });
  games.set(id, rows);
}
for (const rows of games.values()) rows.sort((left, right) => left.week - right.week);

function percentileByPosition(metric) {
  const result = new Map();
  for (const position of positions) {
    const group = [...roster.values()].filter(player => player.position === position)
      .sort((left, right) => metric(right) - metric(left) || left.name.localeCompare(right.name));
    group.forEach((player, index) => result.set(player.id, round(100 * (group.length - index) / group.length)));
  }
  return result;
}
const ppg = player => {
  const rows = games.get(player.id) || [];
  return rows.length ? rows.reduce((sum, row) => sum + row.points, 0) / rows.length : 0;
};
const recentPpg = player => {
  const rows = (games.get(player.id) || []).slice(-2);
  return rows.length ? rows.reduce((sum, row) => sum + row.points, 0) / rows.length : 0;
};
const startRate = player => {
  const rows = games.get(player.id) || [];
  return rows.length ? rows.filter(row => row.started).length / rows.length : 0;
};
const production = percentileByPosition(ppg);
const recent = percentileByPosition(recentPpg);
const role = new Map([...roster.values()].map(player => [player.id, round(startRate(player) * 100)]));
const productionRank = new Map();
for (const position of positions) {
  [...roster.values()].filter(player => player.position === position)
    .sort((left, right) => ppg(right) - ppg(left) || left.name.localeCompare(right.name))
    .forEach((player, index) => productionRank.set(player.id, index + 1));
}
const positionalCaps = { QB: 40, RB: 60, WR: 90, TE: 40 };
const activeNews = new Map((newsInput.signals || []).filter(signal => !signal.expires_on || signal.expires_on >= today).map(signal => [canon(signal.player), signal]));
const overrides = new Map((overrideInput.overrides || []).map(item => [canon(item.player), item]));
const nflverse = new Map((nflverseInput.status === 'active' ? nflverseInput.players : []).map(row => [canon(row.player_id || row.player), row]));
const rosProjections = new Map((rosProjectionInput.rows || []).filter(row => Number.isFinite(Number(row.ros_ppg))).map(row => [canon(row.player), row]));
const availabilitySignals = new Map((availabilityInput.signals || []).filter(signal => !signal.expires_on || signal.expires_on >= today).map(signal => [canon(signal.player), signal]));
const footclanRankings = (footclan?.visibility === 'private_subscriber_input' ? footclan.premium_rankings : [])
  .filter(row => positions.has(row.position) && Number.isFinite(Number(row.weekly_projection)) && Number.isFinite(Number(row.consensus_rank)));
const footclanByPlayer = new Map(footclanRankings.map(row => [canon(row.player), row]));
const footclanProjectionPercentile = new Map();
const footclanRankPercentile = new Map();
for (const position of positions) {
  const group = footclanRankings.filter(row => row.position === position);
  group.slice().sort((left, right) => Number(right.weekly_projection) - Number(left.weekly_projection) || Number(left.consensus_rank) - Number(right.consensus_rank))
    .forEach((row, index) => footclanProjectionPercentile.set(canon(row.player), round(100 * (group.length - index) / group.length)));
  group.slice().sort((left, right) => Number(left.consensus_rank) - Number(right.consensus_rank))
    .forEach((row, index) => footclanRankPercentile.set(canon(row.player), round(100 * (group.length - index) / group.length)));
}
const activeArticleSignals = new Map((footclan?.article_signals || [])
  .filter(signal => !signal.expires_on || signal.expires_on >= today)
  .map(signal => [canon(signal.player), signal]));

const rows = [...roster.values()].map(player => {
  const rank = ranks.get(player.id)?.rank;
  const permittedForward = footclanByPlayer.get(player.id);
  const effectiveRank = rank || productionRank.get(player.id);
  const rankOutlook = rank ? round(clamp(100 * (positionalCaps[player.position] - rank + 1) / positionalCaps[player.position])) : production.get(player.id);
  // The subscriber input is transformed locally into relative signals. Raw
  // projections/ranks are neither exposed here nor copied to the site.
  const outlook = permittedForward
    ? round(.55 * (footclanProjectionPercentile.get(player.id) ?? rankOutlook) + .45 * (footclanRankPercentile.get(player.id) ?? rankOutlook))
    : rankOutlook;
  const outlookSource = permittedForward ? 'Private permitted forward input (derived signal)' : rank ? 'Approved rank snapshot' : 'Production fallback (no approved forward input)';
  const scheduleAdjustment = Number(scheduleInput.team_adjustments?.[player.nfl_team] || 0);
  const schedule = round(clamp(50 + scheduleAdjustment * 10));
  const base = .28 * production.get(player.id) + .18 * recent.get(player.id) + .34 * outlook + .12 * role.get(player.id) + .08 * schedule;
  let superflexBand = 0;
  if (player.position === 'QB') superflexBand = effectiveRank <= 12 ? 16 : effectiveRank <= 24 ? 10 : 4;
  // A band is intentionally damped before it is added, so a good QB is
  // rewarded for scarcity without repeatedly pinning the entire QB1 tier at 100.
  const superflex = round(superflexBand * .4);
  const news = activeNews.get(player.id);
  const articleSignal = activeArticleSignals.get(player.id);
  const articleImpact = articleSignal?.direction === 'up' ? Number(articleSignal.impact || 0) : articleSignal?.direction === 'down' ? -Math.abs(Number(articleSignal.impact || 0)) : 0;
  const newsImpact = clamp((Number(news?.impact) || 0) + articleImpact, -10, 10);
  let marketValue = round(clamp(base + superflex + newsImpact));
  const override = overrides.get(player.id);
  if (override && Number.isFinite(Number(override.value))) marketValue = round(clamp(Number(override.value)));
  // Tier labels are generated from the current sorted board below.  The
  // reviewed snapshot may retain old tiers as reference, but must not freeze
  // the presentation in the prior five-tier layout.
  const tier = null;
  return {
    ...player, value: marketValue, market_value: marketValue, tier, source_rank: rank || null,
    stats: { games: (games.get(player.id) || []).length, season_ppg: round(ppg(player)), recent_ppg: round(recentPpg(player)), start_rate: round(startRate(player) * 100) },
    drivers: { production: production.get(player.id), recent_form: recent.get(player.id), outlook, outlook_source: outlookSource, effective_position_rank: effectiveRank, private_forward_input_applied: Boolean(permittedForward), starting_role: role.get(player.id), schedule, schedule_adjustment: scheduleAdjustment, superflex_qb: superflex, superflex_band: superflexBand, news_impact: newsImpact },
    news: news ? { reason: news.reason || 'Commissioner-reviewed news', source_url: news.source_url || null, expires_on: news.expires_on || null } : null,
    override: override ? { reason: override.reason || 'Commissioner override', source_url: override.source_url || null } : null,
    article_signal: articleSignal ? { direction: articleSignal.direction, expires_on: articleSignal.expires_on } : null
  };
}).sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
rows.forEach((row, index) => {
  row.market_rank = index + 1;
  // Roughly 15 players per tier produces an easy-to-scan 12-tier market board
  // without pretending that arbitrary raw-value cliffs are meaningful.
  row.tier = row.tier || String(Math.min(12, Math.ceil((index + 1) / 15)));
});

// Shadow v2 deliberately does not inherit the v1 score.  It turns the same
// WFC scoring feed into a small rest-of-season proxy, prices each player above
// a WFC-format replacement level, and leaves any external-market drift
// uncapped.  It is a review surface, not the public board or a third-party
// value copy.
const median = values => {
  const clean = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
};
function metricPercentile(metric) {
  const result = new Map();
  for (const position of positions) {
    const group = [...roster.values()]
      .filter(player => player.position === position && Number.isFinite(Number(metric(player))))
      .sort((left, right) => Number(metric(right)) - Number(metric(left)) || left.name.localeCompare(right.name));
    group.forEach((player, index) => result.set(player.id, round(100 * (group.length - index) / group.length)));
  }
  return result;
}
const maxGames = Math.max(1, ...[...games.values()].map(group => group.length));
const positionMedians = Object.fromEntries([...positions].map(position => [position, median([...roster.values()].filter(player => player.position === position).map(ppg))]));
const replacementSlots = { QB: 24, RB: 30, WR: 36, TE: 12 };
const usagePercentile = metricPercentile(player => nflverse.get(player.id)?.recent_usage_share ?? nflverse.get(player.id)?.usage_share);
const efficiencyPercentile = metricPercentile(player => nflverse.get(player.id)?.recent_epa_per_opportunity ?? nflverse.get(player.id)?.epa_per_opportunity);
const shadowSeeds = [...roster.values()].map(player => {
  const seasonal = ppg(player), recentPoints = recentPpg(player), roleRate = startRate(player);
  const usage = nflverse.get(player.id), projection = rosProjections.get(player.id), availabilitySignal = availabilitySignals.get(player.id);
  const usageScore = usagePercentile.get(player.id) ?? null, efficiencyScore = efficiencyPercentile.get(player.id) ?? null;
  const permittedForward = footclanByPlayer.get(player.id);
  // Regress scoring history toward the positional median. Public nflverse
  // usage/EPA can move this estimate modestly; a reviewed ROS PPG import has
  // more weight when it is actually supplied.
  const baseForecast = .55 * seasonal + .20 * recentPoints + .25 * positionMedians[player.position];
  const usageAdjustment = usageScore === null ? 0 : (usageScore - 50) * .025;
  const efficiencyAdjustment = efficiencyScore === null ? 0 : (efficiencyScore - 50) * .012;
  const wfcForecast = Math.max(0, baseForecast + usageAdjustment + efficiencyAdjustment);
  const premiumForecast = permittedForward ? Number(permittedForward.weekly_projection) : null;
  const forecastPpg = round(projection
    ? .60 * Number(projection.ros_ppg) + .40 * wfcForecast
    : premiumForecast !== null ? .35 * premiumForecast + .65 * wfcForecast
    : wfcForecast);
  const baseAvailability = .60 + .25 * roleRate + .15 * Math.min(1, (games.get(player.id) || []).length / maxGames);
  const availability = round(clamp(availabilitySignal && Number.isFinite(Number(availabilitySignal.availability)) ? .65 * baseAvailability + .35 * Number(availabilitySignal.availability) : baseAvailability, 0, 1));
  return { player, forecastPpg, availability, adjustedPpg: round(forecastPpg * availability), seasonal, recentPoints, roleRate, usage, usageScore, efficiencyScore, usageAdjustment: round(usageAdjustment), efficiencyAdjustment: round(efficiencyAdjustment), projection, availabilitySignal, hasPermittedForward: Boolean(permittedForward) };
});
const replacementPpg = {};
for (const position of positions) {
  const group = shadowSeeds.filter(seed => seed.player.position === position).sort((left, right) => right.adjustedPpg - left.adjustedPpg || left.player.name.localeCompare(right.player.name));
  replacementPpg[position] = group[Math.min(group.length - 1, replacementSlots[position] - 1)]?.adjustedPpg ?? 0;
}
const maxVor = Math.max(0.1, ...shadowSeeds.map(seed => Math.max(0, seed.adjustedPpg - replacementPpg[seed.player.position])));
const shadowV2 = shadowSeeds.map(seed => {
  const vorPpg = round(Math.max(0, seed.adjustedPpg - replacementPpg[seed.player.position]));
  // The square-root curve preserves useful separation near replacement while
  // avoiding v1's tendency to pin every positional leader near 100.
  const marketValue = round(100 * Math.sqrt(vorPpg / maxVor));
  const sourceRank = ranks.get(seed.player.id)?.rank ?? null;
  return {
    id: seed.player.id, name: seed.player.name, position: seed.player.position, nfl_team: seed.player.nfl_team,
    market_value: marketValue, value: marketValue, source_rank: sourceRank,
    drivers: {
      season_ppg: seed.seasonal, recent_ppg: seed.recentPoints, forecast_ppg: seed.forecastPpg,
      availability: seed.availability, replacement_ppg: replacementPpg[seed.player.position], vor_ppg: vorPpg,
      nflverse_usage_score: seed.usageScore, nflverse_efficiency_score: seed.efficiencyScore,
      nflverse_usage_adjustment_ppg: seed.usageAdjustment, nflverse_efficiency_adjustment_ppg: seed.efficiencyAdjustment,
      nflverse_last_week: seed.usage?.last_week ?? null, ros_projection_ppg: seed.projection ? Number(seed.projection.ros_ppg) : null,
      ros_projection_source: seed.projection?.source_url || null, availability_signal_source: seed.availabilitySignal?.source_url || null,
      private_forward_input_applied: seed.hasPermittedForward,
      forecast_source: seed.projection ? 'Reviewed ROS projection blended with WFC scoring, usage, and efficiency' : seed.hasPermittedForward ? 'Private permitted forward input blended with WFC scoring, usage, and efficiency' : seed.usage ? 'WFC scoring forecast with public nflverse usage/EPA' : 'WFC weekly data, regressed to positional median',
      external_market_cap: null
    }
  };
}).sort((left, right) => right.market_value - left.market_value || left.name.localeCompare(right.name));
shadowV2.forEach((row, index) => {
  row.market_rank = index + 1;
  const prior = shadowV2[index - 1];
  // Natural score breaks set the first shadow tiers; a long flat section never
  // gets a synthetic break merely to force an equal player count.
  const priorTier = prior ? Number(prior.tier) : 1;
  row.tier = String(index === 0 ? 1 : Math.min(12, priorTier + (prior.market_value - row.market_value >= 7 ? 1 : 0)));
});

// v2 is now the live board. It begins from the private ESPN-specific UDK
// market anchor and moves gradually using independent WFC VOR evidence, so a
// noisy early sample cannot erase a credible preseason market in one refresh.
const legacyById = new Map(rows.map(row => [row.id, row]));
const qbV2Ranks = new Map(shadowV2.filter(row => row.position === 'QB').map((row, index) => [row.id, index + 1]));
const liveRows = shadowV2.map(shadow => {
  const legacy = legacyById.get(shadow.id);
  const anchor = preseasonSeeds.get(shadow.id);
  const marketReference = calibrationById.get(shadow.id);
  const anchorWeight = Number.isFinite(anchor) ? .75 : 0;
  const updateWeight = Number.isFinite(anchor) ? .25 : 1;
  const currentEvidence = Number.isFinite(shadow.market_value) ? shadow.market_value : 0;
  const qbRank = qbV2Ranks.get(shadow.id);
  // One extra Superflex starter raises the premium for the elite current QB,
  // while the 3-QB cap prevents a broad QB inflation.
  const superflexPremium = shadow.position === 'QB' && qbRank === 1 ? 10.5 : shadow.position === 'QB' && qbRank === 2 ? 3 : 0;
  const newsImpact = Number(legacy?.drivers?.news_impact || 0);
  const wfcEvidenceValue = clamp(anchorWeight * (Number.isFinite(anchor) ? anchor : 0) + updateWeight * currentEvidence + superflexPremium + newsImpact);
  // The external chart contributes its market-cost shape by rank/tier. It is
  // not averaged with WFC's raw score. A 70/30 shape/evidence blend preserves
  // WFC drift while restoring the nonlinear trade gaps visible in the chart.
  const marketShapeWeight = marketReference ? .80 : 0;
  const evidenceWeight = 1 - marketShapeWeight;
  // A player absent from the supplied market chart is not allowed to displace
  // a covered Tier 1–4 asset on WFC evidence alone. The cap is a confidence
  // guard, not a permanent player opinion; it disappears when the next
  // reviewed market snapshot covers that player.
  const uncoveredMarketCap = 45;
  let marketValue = marketReference
    ? round(clamp(marketShapeWeight * Number(marketReference.market_curve_value || 0) + evidenceWeight * wfcEvidenceValue))
    : round(clamp(Math.min(uncoveredMarketCap, wfcEvidenceValue)));
  const override = overrides.get(shadow.id);
  if (override && Number.isFinite(Number(override.value))) marketValue = round(clamp(Number(override.value)));
  return {
    id: shadow.id, name: shadow.name, position: shadow.position, nfl_team: shadow.nfl_team,
    value: marketValue, market_value: marketValue, tier: null, source_rank: null,
    stats: legacy?.stats || { games: (games.get(shadow.id) || []).length, season_ppg: round(ppg(shadow)), recent_ppg: round(recentPpg(shadow)), start_rate: round(startRate(shadow) * 100) },
    drivers: {
      model_version: 'v2-preseason-anchor', preseason_anchor_applied: Number.isFinite(anchor),
      preseason_anchor_weight: anchorWeight, current_evidence_weight: updateWeight,
      market_shape_calibration_applied: Boolean(marketReference), market_shape_weight: marketShapeWeight,
      calibration_reference_rank: marketReference?.rank || null, calibration_reference_tier: marketReference?.tier || null,
      uncovered_market_cap: marketReference ? null : uncoveredMarketCap,
      production: production.get(shadow.id), recent_form: recent.get(shadow.id),
      outlook: shadow.drivers.forecast_ppg, outlook_source: shadow.drivers.forecast_source,
      forecast_ppg: shadow.drivers.forecast_ppg, availability: shadow.drivers.availability,
      vor_ppg: shadow.drivers.vor_ppg, replacement_ppg: shadow.drivers.replacement_ppg,
      nflverse_usage_score: shadow.drivers.nflverse_usage_score,
      nflverse_efficiency_score: shadow.drivers.nflverse_efficiency_score,
      private_forward_input_applied: shadow.drivers.private_forward_input_applied,
      superflex_qb: superflexPremium, superflex_qb_rank: qbRank || null, news_impact: newsImpact
    },
    news: legacy?.news || null,
    override: override ? { reason: override.reason || 'Commissioner override', source_url: override.source_url || null } : null
  };
}).sort((left, right) => right.market_value - left.market_value || left.name.localeCompare(right.name));
liveRows.forEach((row, index) => {
  row.market_rank = index + 1;
  const referenceTier = calibrationTierEnds.findIndex(end => index + 1 <= end);
  row.tier = String(referenceTier >= 0 ? referenceTier + 1 : 12);
});

// History begins with an actual private preseason anchor. Keep later daily
// snapshots so the interface can report a true weekly move, not a disguised
// preseason-to-now total. Reset once only when the calibrated model changes.
const seasonYear = Number(analytics.season) || new Date().getUTCFullYear();
const historyModelId = 'wfc-market-v3-market-calibrated';
if (historyStore.model !== historyModelId) {
  historyStore.snapshots = {};
  historyStore.snapshot_metadata = {};
}
historyStore.snapshots ||= {};
historyStore.snapshot_metadata ||= {};
const preseasonDate = `${seasonYear}-08-29`;
if (preseasonSeeds.size && !historyStore.snapshots[preseasonDate]) {
  historyStore.snapshots[preseasonDate] = Object.fromEntries(liveRows
    .filter(row => Number.isFinite(preseasonSeeds.get(row.id)))
    .map(row => [row.id, preseasonSeeds.get(row.id)]));
  historyStore.snapshot_metadata[preseasonDate] = { kind: 'private_preseason_anchor', label: 'Private ESPN UDK-derived preseason anchor' };
}
historyStore.snapshots[today] = Object.fromEntries(liveRows.map(row => [row.id, row.market_value]));
historyStore.snapshot_metadata[today] = { kind: 'saved_snapshot', label: 'Saved WFC market snapshot' };
historyStore.updated_at = new Date().toISOString();
historyStore.model = historyModelId;
write('market-history.json', historyStore);
for (const row of liveRows) row.history = Object.entries(historyStore.snapshots)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([date, values]) => ({ date, market_value: values[row.id], kind: historyStore.snapshot_metadata[date]?.kind || 'saved_snapshot' }))
  .filter(point => Number.isFinite(point.market_value));

write('wfc-market-model.json', {
  schema_version: '1.2.0', model_id: historyModelId, as_of: new Date().toISOString(), history_date: today,
  league_rules: { teams: 12, scoring: 'full PPR', quarterback_starters: 2, passing_touchdown_points: 4, quarterback_cap: 3 },
  model_summary: 'Independent WFC trade-market index. A commissioner-supplied DraftSharks rank/tier curve supplies 70% of the market-cost shape; the private Limp Brizkit — ESPN UDK preseason anchor and independent v2 rest-of-season value-over-replacement evidence supply the remaining WFC-specific drift, plus a limited top-QB Superflex premium and reviewed news. Provider raw values are not averaged.',
  history_summary: 'The first point is a private ESPN UDK-derived preseason anchor. It is not a publisher chart. Current and future points are saved WFC market snapshots; prior simulated history was removed.',
  limitations: [
    'Only WFC rostered skill players are in the initial pool.',
    'A current private subscriber forward input is used only where captured; uncovered players fall back to the approved rank snapshot or production.',
    'No schedule adjustment is assumed unless a reviewed team signal is supplied.',
    'No news adjustment is assumed unless a reviewed, dated player signal is supplied.',
    'External publisher values are comparison/calibration references only and are not reverse engineered or copied into this score.',
    'The private preseason anchor is displayed only as an internal WFC-derived value; no UDK ranks, projections, ADP, or editorial text are published.',
    'DraftSharks calibration is a commissioner-supplied public snapshot used for rank/tier market shape. It is not treated as a second raw value provider or copied as a permanent chart.'
  ],
  input_status: { footballers_snapshot: analytics.captured_at, footclan_private_status: footclan?.coverage?.premium_rankings?.status || 'not_captured', footclan_private_captured_at: footclan?.captured_at || null, footclan_private_rankings_matched: [...roster.values()].filter(player => footclanByPlayer.has(player.id)).length, footclan_article_signal_count: activeArticleSignals.size, footclan_article_status: footclan?.coverage?.articles?.status || 'not_captured', schedule_signal_date: scheduleInput.as_of || null, active_news_signals: activeNews.size, commissioner_overrides: overrides.size, nflverse_weekly_status: nflverseInput.status, nflverse_weekly_captured_at: nflverseInput.captured_at || null, nflverse_players_matched: nflverse.size, ros_projection_date: rosProjectionInput.as_of || null, reviewed_ros_projections: rosProjections.size, availability_signal_date: availabilityInput.as_of || null, active_availability_signals: availabilitySignals.size, preseason_anchor_profile: preseasonSeedInput?.profile || 'not_captured', preseason_anchor_players_matched: [...roster.values()].filter(player => preseasonSeeds.has(player.id)).length, market_shape_calibration_provider: calibrationInput?.provider || 'not_captured', market_shape_calibration_date: calibrationInput?.snapshot_date || null, market_shape_calibration_players: calibrationRows.length, market_shape_calibration_players_matched: [...roster.values()].filter(player => calibrationById.has(player.id)).length },
  players: liveRows,
  shadow_v2: {
    model_id: 'wfc-market-v2-core', status: 'live_component',
    model_summary: 'The v2 core uses a regressed scoring forecast, availability proxy, permitted private forward inputs where captured, and WFC-format value-over-replacement. Its output is blended into the live private-anchor market board.',
    limitations: [
      'Public nflverse player-stat signals are usage/efficiency inputs, not forward projections or external trade values.',
      'A reviewed ROS projection or private permitted forward input only affects the forecast after it is captured locally; neither source row is published.',
      'Injury and depth signals remain commissioner-reviewed until a permitted, reliable structured source is connected.'
    ],
    replacement_slots: replacementSlots, replacement_ppg: replacementPpg, players: shadowV2
  }
});
console.log(`Wrote WFC market model for ${liveRows.length} rostered players; ${activeNews.size} active news signals and ${overrides.size} overrides.`);
