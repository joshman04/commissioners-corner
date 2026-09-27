'use strict';
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
async function load() {
  const response = await fetch('wfc.json');
  if (!response.ok) throw new Error('Results unavailable');
  const data = await response.json();
  if (!data.weeks?.length) throw new Error('No completed weeks');
  const select = document.querySelector('#week');
  select.replaceChildren(...data.weeks.map(w => {
    const option = el('option', `${data.season} · Week ${w.week}`);
    option.value = w.week;
    return option;
  }));
  select.value = data.weeks.at(-1).week;
  select.disabled = false;
  function render() {
    const week = data.weeks.find(w => w.week === Number(select.value));
    document.querySelector('#matchups').replaceChildren(...week.matchups.map(g => {
      const card = el('article', '', 'game');
      for (const [name, points, other] of [[g.team, g.points, g.opponent_points], [g.opponent, g.opponent_points, g.points]]) {
        const row = el('div', '', 'row');
        row.append(el('span', name), el('span', points.toFixed(2), `score ${points > other ? 'winner' : ''}`));
        card.append(row);
      }
      return card;
    }));
    document.querySelector('#players').replaceChildren(...week.top_players.map((p, i) => {
      const card = el('article', '', 'player');
      const name = el('div', p.player);
      name.append(el('small', `${p.position} · ${p.team}`));
      card.append(el('span', `#${i + 1}`, 'rank'), name, el('strong', p.points.toFixed(2), 'score'));
      return card;
    }));
    document.querySelector('#status').textContent = `${data.season} Week ${week.week} · Completed results`;
  }
  select.addEventListener('change', render);
  document.querySelector('#source').textContent = `${data.source} · Source snapshot: ${new Date(data.source_updated).toLocaleString()}. Updates appear after the next website refresh.`;
  render();
}
load().catch(() => {
  document.querySelector('#status').textContent = 'League results could not load. Please refresh or visit the 2025 archive.';
});
