/*
 * Imports the public nflverse weekly player-stat release into a compact WFC
 * usage cache. It never requests a publisher trade chart and only retains
 * rows for players in the WFC league context.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const root = path.resolve(repo, '..', '..');
const data = name => JSON.parse(fs.readFileSync(path.join(repo, 'data', name), 'utf8'));
const source = name => JSON.parse(fs.readFileSync(path.join(root, 'sources', name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(repo, 'data', name), JSON.stringify(value, null, 2) + '\n');
const canon = name => String(name || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g, '').replace(/[^a-z0-9]/g, '');
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round(value * 10000) / 10000;
const positions = new Set(['QB', 'RB', 'WR', 'TE']);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field); if (row.length > 1) rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(header => header.replace(/^\uFEFF/, ''));
  return rows.filter(row => row.length === headers.length).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}
function weightedAverage(rows, field, weightField = null) {
  const valid = rows.filter(row => Number.isFinite(Number(row[field])));
  if (!valid.length) return null;
  const weighted = valid.map(row => ({ value: numeric(row[field]), weight: weightField ? Math.max(0, numeric(row[weightField])) : 1 }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  return round(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / (totalWeight || weighted.length));
}

async function main() {
  const master = source('WFC_MASTER.json');
  const analytics = source('WFC_ANALYTICS.json');
  const season = Number(process.env.WFC_NFLVERSE_SEASON || analytics.season);
  const leagueSeason = master.seasons[String(analytics.season)];
  const roster = new Map();
  for (const row of leagueSeason.rosters) {
    const details = (row.player_details || '').trim().split(/\s+/), position = details.at(-1);
    if (positions.has(position)) roster.set(canon(row.player_name), { id: canon(row.player_name), name: row.player_name, position, nfl_team: details[0] || '—' });
  }
  const url = process.env.WFC_NFLVERSE_URL || `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 60000);
  let response;
  try { response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'WFC-Fantasy-Engine/1.0 (public-data import)' } }); }
  finally { clearTimeout(timeout); }
  if (!response?.ok) throw new Error(`nflverse returned ${response?.status || 'no response'} for ${url}`);
  const statRows = parseCsv(await response.text()).filter(row => row.season_type === 'REG' && positions.has(row.position));
  const teamWeek = new Map();
  for (const row of statRows) {
    const key = `${row.team}|${row.week}`;
    const total = teamWeek.get(key) || { attempts: 0, carries: 0 };
    total.attempts += numeric(row.attempts); total.carries += numeric(row.carries); teamWeek.set(key, total);
  }
  const grouped = new Map();
  for (const row of statRows) {
    const id = canon(row.player_display_name || row.player_name);
    if (!roster.has(id)) continue;
    const totals = teamWeek.get(`${row.team}|${row.week}`) || { attempts: 0, carries: 0 };
    grouped.set(id, [...(grouped.get(id) || []), {
      ...row,
      pass_share: totals.attempts ? numeric(row.attempts) / totals.attempts : null,
      carry_share: totals.carries ? numeric(row.carries) / totals.carries : null
    }]);
  }
  const players = [...grouped.entries()].map(([id, rows]) => {
    const player = roster.get(id), recent = rows.slice().sort((a, b) => numeric(a.week) - numeric(b.week)).slice(-2);
    const sum = (field, sourceRows = rows) => sourceRows.reduce((total, row) => total + numeric(row[field]), 0);
    const opportunities = sourceRows => sum('targets', sourceRows) + sum('carries', sourceRows);
    const usageFor = sourceRows => {
      if (player.position === 'QB') return weightedAverage(sourceRows, 'pass_share', 'attempts');
      if (player.position === 'RB') {
        const carry = weightedAverage(sourceRows, 'carry_share', 'carries') || 0;
        const target = weightedAverage(sourceRows, 'target_share', 'targets') || 0;
        return round(.7 * carry + .3 * target);
      }
      const target = weightedAverage(sourceRows, 'target_share', 'targets') || 0;
      const air = weightedAverage(sourceRows, 'air_yards_share', 'targets') || 0;
      return round(.7 * target + .3 * air);
    };
    const epaFor = sourceRows => {
      if (player.position === 'QB') return sum('passing_epa', sourceRows) / Math.max(1, sum('attempts', sourceRows));
      if (player.position === 'RB') return (sum('rushing_epa', sourceRows) + sum('receiving_epa', sourceRows)) / Math.max(1, opportunities(sourceRows));
      return sum('receiving_epa', sourceRows) / Math.max(1, sum('targets', sourceRows));
    };
    return {
      player_id: id, player: player.name, source_player_name: rows[0].player_display_name || rows[0].player_name,
      position: player.position, nfl_team: rows.at(-1).team, games: rows.length, last_week: Math.max(...rows.map(row => numeric(row.week))),
      fantasy_ppg_ppr: round(sum('fantasy_points_ppr') / rows.length),
      targets_per_game: round(sum('targets') / rows.length), carries_per_game: round(sum('carries') / rows.length),
      target_share: weightedAverage(rows, 'target_share', 'targets'), air_yards_share: weightedAverage(rows, 'air_yards_share', 'targets'),
      wopr: weightedAverage(rows, 'wopr', 'targets'), carry_share: weightedAverage(rows, 'carry_share', 'carries'), pass_share: weightedAverage(rows, 'pass_share', 'attempts'),
      usage_share: usageFor(rows), recent_usage_share: usageFor(recent), epa_per_opportunity: round(epaFor(rows)), recent_epa_per_opportunity: round(epaFor(recent))
    };
  }).sort((left, right) => left.position.localeCompare(right.position) || left.player.localeCompare(right.player));
  write('market-inputs/nflverse-weekly.json', {
    schema_version: '1.0.0', status: 'active', source: 'nflverse weekly player statistics', source_url: url,
    license: 'CC-BY-SA 4.0; attribute nflverse / FTN Data', season, captured_at: new Date().toISOString(),
    notes: 'Public nflverse weekly-stat release, reduced to WFC-rostered QB/RB/WR/TE usage and EPA inputs. WFC market values are separately calculated.',
    players
  });
  console.log(`Wrote nflverse usage cache for ${players.length}/${roster.size} WFC rostered players from ${statRows.length} public weekly rows.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
