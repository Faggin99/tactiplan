// Relatório 1 — Desempenho em jogos (2 páginas). Ver seção 3 da especificação.
const F = require('../format');
const C = require('./components');

const esc = F.esc;

function heroPoints(vm) {
  const { won, played, aprov } = vm.points;
  const tot = vm.total || 1;
  const seg = (n, color) => (n > 0 ? `<i style="width:${(n / tot) * 100}%;background:${color}"></i>` : '');
  const [lv, le, ld] = vm.vedLegend.map((t) => t.split(' '));
  return `<div class="card">${C.sec('Pontuação')}
    <div class="pts">${C.ring(aprov)}<div><div class="big">${won}<small>/${played}</small></div>
      <div style="color:var(--muted);font-size:7.5pt">pontos ganhos / disputados</div></div></div>
    <div class="ved">${seg(vm.wins, 'var(--win)')}${seg(vm.draws, 'var(--draw)')}${seg(vm.losses, 'var(--loss)')}</div>
    <div class="ved-l"><span><b>${lv[0]}</b> ${lv.slice(1).join(' ')}</span><span><b>${le[0]}</b> ${le.slice(1).join(' ')}</span><span><b>${ld[0]}</b> ${ld.slice(1).join(' ')}</span></div>
  </div>`;
}

function heroMoment(vm) {
  const streak = vm.winStreak;
  const unbeaten = vm.unbeatenStreak;
  const row = (icBg, icon, k, valHtml, vs = '') => `<div class="row"><div class="ic" style="background:${icBg}">${icon}</div>`
    + `<div><div class="k">${esc(k)}</div>${valHtml}</div>${vs ? `<div class="vs">${vs}</div>` : ''}</div>`;
  const streakVal = streak > 0
    ? `<div class="val">${esc(F.plural(streak, 'jogo', 'jogos'))}</div>`
    : '<div class="val nil">Sem sequência</div>';
  const win = vm.biggestWin
    ? row('var(--win)', C.ICON.star, 'Maior vitória', `<div class="val">${esc(vm.biggestWin.score)}</div>`, `vs ${esc(vm.biggestWin.opponent)} · ${esc(vm.biggestWin.date)}`)
    : row('var(--faint)', C.ICON.dash, 'Maior vitória', '<div class="val nil">Sem vitórias</div>');
  const loss = vm.biggestLoss
    ? row('var(--loss)', C.ICON.down, 'Maior derrota', `<div class="val">${esc(vm.biggestLoss.score)}</div>`, `vs ${esc(vm.biggestLoss.opponent)} · ${esc(vm.biggestLoss.date)}`)
    : row('var(--faint)', C.ICON.dash, 'Maior derrota', '<div class="val nil">Sem derrotas</div>');
  return `<div class="card">${C.sec('Momento')}<div class="hl">
    ${row('var(--team)', `<span style="color:var(--on-team);display:grid">${C.ICON.up}</span>`, 'Seq. de vitórias', streakVal, unbeaten > 0 ? `Invicto há ${unbeaten}` : '')}
    ${win}${loss}</div>
    <div style="display:flex;align-items:center;gap:2mm;margin-top:3mm;font-size:7pt;color:var(--muted)">Últimos jogos
      <div class="form">${vm.form.map((r) => C.resultChip(r)).join('')}</div></div>
  </div>`;
}

function kpis(vm) {
  const k = vm.kpis;
  const diffVariant = k.diff > 0 ? 'pos' : (k.diff < 0 ? 'neg' : '');
  // 6 números (tempo médio do 1º gol saiu a pedido do dono, 22/10/2026)
  return `<div>${C.sec('Números do período')}<div class="grid g3">
    ${C.kpi({ label: 'Jogos', value: k.games, sub: `${k.home} em casa · ${k.away} fora` })}
    ${C.kpi({ label: 'Gols pró', value: k.goalsFor, sub: `${F.dec1(k.avgFor)} por jogo` })}
    ${C.kpi({ label: 'Gols contra', value: k.goalsAgainst, sub: `${F.dec1(k.avgAgainst)} por jogo` })}
    ${C.kpi({ label: 'Saldo', value: F.signed(k.diff), variant: diffVariant })}
    ${C.kpi({ label: 'Jogos sem sofrer', value: k.cleanSheets, sub: `${k.cleanPct}% dos jogos` })}
    ${C.kpi({ label: 'Cartões', value: `${k.yellow} <small>· ${k.red}</small>`, sub: 'amarelos · vermelhos' })}
  </div></div>`;
}

// metaHtml: o Relatório do clube põe ali os chips dos últimos resultados
function history(vm, { metaHtml = null } = {}) {
  const withSubs = vm.substitutions && vm.substitutions.total > 0;
  const rows = vm.games.map((g) => `<tr><td>${esc(g.dateLabel)}</td><td class="c">${esc(g.round || '—')}</td><td>${esc(g.location)}</td>`
    + `<td><b>${esc(g.opponent)}</b></td><td class="c"><b>${g.goalsFor} × ${g.goalsAgainst}</b></td>`
    + `${withSubs ? `<td class="c">${g.subs ? g.subs : '<span style="color:var(--faint)">—</span>'}</td>` : ''}<td class="c">${C.resultChip(g.result)}</td></tr>`).join('');
  return `<div class="card" style="padding-bottom:2mm" data-split="tbody tr">${C.sec('Histórico de jogos', metaHtml ?? esc(F.plural(vm.total, 'jogo', 'jogos')))}
    <table class="tbl"><thead><tr><th>Data</th><th class="c">Rod.</th><th>Local</th><th>Adversário</th><th class="c">Placar</th>${withSubs ? '<th class="c">Subst.</th>' : ''}<th class="c">Res.</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function goalsByType(title, data, emptyText, cls) {
  const meta = esc(F.plural(data.total, 'gol', 'gols'));
  if (data.total === 0) {
    return `<div class="card" style="display:flex;flex-direction:column">${C.sec(title, meta)}${C.emptyState(emptyText, { cls: 'fill', icon: C.ICON.shield })}</div>`;
  }
  return `<div class="card">${C.sec(title, meta)}${data.rows.map((r) => C.barRow({ label: r.label, value: r.value, max: data.max, cls })).join('')}</div>`;
}

function byPeriod(vm) {
  const n = vm.buckets.length;
  const total = vm.buckets.reduce((s, b) => s + b.for + b.against, 0);
  if (total === 0) {
    return `<div class="card">${C.sec('Gols por período do jogo')}${C.emptyState('Nenhum gol com minuto registrado no período', { icon: C.ICON.ball })}</div>`;
  }
  const max = vm.bucketMax || 1;
  // mesma escala nos dois lados: o maior valor do gráfico ocupa 20mm
  const scale = 20 / max;
  const maxFor = Math.max(0, ...vm.buckets.map((b) => b.for));
  const maxAgainst = Math.max(0, ...vm.buckets.map((b) => b.against));
  const upH = Math.max(10, maxFor * scale);
  const dnH = vm.anyAgainstByMin ? maxAgainst * scale + 5 : 10;
  const cols = `grid-template-columns:14mm repeat(${n},1fr)`;
  const up = vm.buckets.map((b) => `<div class="up" style="height:${upH}mm">${b.for > 0 ? `<i style="height:${b.for * scale}mm"><b>${b.for}</b></i>` : ''}</div>`).join('');
  const dn = vm.buckets.map((b) => `<div class="dn" style="height:${dnH}mm">${b.against > 0 ? `<i style="height:${b.against * scale}mm"><b>${b.against}</b></i>` : ''}</div>`).join('');
  const labs = vm.buckets.map((b) => `<div class="lab">${esc(b.label.replace('-', '–'))}</div>`).join('');
  return `<div class="card">${C.sec('Gols por período do jogo')}
    <div class="bf" style="${cols}"><div class="ax">Feitos</div>${up}<hr class="mid"><div></div>${labs}<div class="ax">Sofridos</div>${dn}</div></div>`;
}

function rank(title, rows, color, emptyText) {
  if (!rows.length) return `<div class="card" style="display:flex;flex-direction:column">${C.sec(title)}${C.emptyState(emptyText, { cls: 'fill' })}</div>`;
  const max = Math.max(...rows.map((r) => r.value));
  return `<div class="card">${C.sec(title)}<table class="tbl dense"><tbody>${rows.map((r, i) => `<tr><td class="rank">${i + 1}</td>`
    + `<td class="nm"><b>${esc(r.name)}</b></td><td style="width:28mm"><div class="bar"><i style="width:${Math.round((r.value / max) * 100)}%;background:${color}"></i></div></td>`
    + `<td class="r"><b>${r.value}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function minutes(vm) {
  if (!vm.minutes.length) {
    return `<div class="card">${C.sec('Minutagem')}${C.emptyState('Sem escalação registrada nos jogos do período')}</div>`;
  }
  const detail = vm.minutes.some((m) => m.starts != null);
  const n = (v) => (v == null ? '—' : v);
  const rows = vm.minutes.map((m, i) => `<tr><td class="rank">${i + 1}</td><td><b>${esc(m.name)}</b></td>`
    + `<td><div class="bar"><i style="width:${m.bar}%"></i></div></td><td class="r"><b>${m.minutes}'</b></td>`
    + `<td class="c">${m.games}</td>${detail ? `<td class="c">${n(m.starts)}</td><td class="c">${n(m.entries)}</td>` : ''}<td class="r">${m.pctPossible}%</td></tr>`).join('');
  return `<div class="card" data-split="tbody tr">${C.sec('Minutagem', `de ${F.int(vm.minutesPossible)} min possíveis`)}
    <table class="tbl dense"><thead><tr><th class="rank">#</th><th>Jogador</th><th style="width:${detail ? 46 : 60}mm"></th><th class="r">Min</th><th class="c">Jogos</th>${detail ? '<th class="c">Tit.</th><th class="c">Entrou</th>' : ''}<th class="r">% poss.</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Substituições de cada jogo: minuto, quem sai, quem entra.
function substitutions(vm) {
  const sb = vm.substitutions;
  if (!sb || sb.total === 0) return '';
  // minuto médio da troca saiu a pedido do dono (26/10/2026)
  const meta = [F.plural(sb.total, 'substituição', 'substituições'), `${F.dec1(sb.perGame)} por jogo`].join(' · ');
  const rows = sb.games.map((g) => g.rows.map((r, i) => `<tr>`
    + `<td>${i === 0 ? esc(g.dateLabel) : ''}</td><td>${i === 0 ? `<b>${esc(g.opponent)}</b>` : ''}</td>`
    + `<td class="c"><b>${esc(r.minute)}</b></td>`
    + `<td><span style="color:var(--loss);font-weight:700">↓</span> ${esc(r.out)}</td>`
    + `<td><span style="color:var(--win);font-weight:700">↑</span> ${esc(r.in)}</td></tr>`).join('')).join('');
  return `<div class="card" data-split="tbody tr">${C.sec('Substituições', esc(meta))}
    <table class="tbl dense"><thead><tr><th style="width:18mm">Data</th><th>Adversário</th><th class="c" style="width:12mm">Min</th><th>Sai</th><th>Entra</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderGames(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Desempenho em jogos';
  const header1 = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const pages = [];
  if (vm.empty) {
    pages.push(C.page({
      header: header1,
      subtitle: 'Resumo',
      body: `<div class="empty big"><b>Nenhum jogo registrado neste período</b>Marque o dia como jogo na Programação para ver o desempenho aqui.</div>`,
      foot,
    }));
  } else {
    pages.push(C.page({
      header: header1,
      subtitle: 'Resumo',
      body: `<div class="hero">${heroPoints(vm)}${heroMoment(vm)}</div>${kpis(vm)}${history(vm)}`,
      foot,
    }));
    pages.push(C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Gols e destaques', right: vm.right }),
      subtitle: 'Gols e destaques',
      body: `<div class="grid g2">${goalsByType('Gols feitos por tipo', vm.goalsFor, 'Nenhum gol marcado no período', '')}`
        + `${goalsByType('Gols sofridos por tipo', vm.goalsAgainst, 'Nenhum gol sofrido no período', 'loss')}</div>`
        + byPeriod(vm)
        + `<div class="grid g2">${rank('Artilharia', vm.scorers, 'var(--team-bar)', 'Nenhum gol no período')}${rank('Assistências', vm.assists, 'var(--ink-2)', 'Nenhuma assistência registrada')}</div>`
        + minutes(vm)
        + substitutions(vm),
      foot,
    }));
  }
  return C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages,
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: vm.right }),
    foot,
  });
}

module.exports = { renderGames, heroPoints, history };
