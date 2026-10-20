// Relatório 5 — Relatório do clube / temporada (2 páginas, A4 retrato). Ver seção 5c.
// Reaproveita os blocos do Relatório 1 (Pontuação, Histórico) e os componentes comuns.
const F = require('../format');
const C = require('./components');
const { heroPoints, history } = require('./games');

const esc = F.esc;

function desempenho(vm) {
  const g = vm.games;
  if (g.empty) {
    return `<div>${C.sec('Desempenho')}${C.emptyState('Nenhum jogo registrado neste período', { cls: 'fill' })}</div>`;
  }
  const k = vm.kpis;
  const diffVariant = k.diff > 0 ? 'pos' : (k.diff < 0 ? 'neg' : '');
  const st = k.streak;
  const streakKpi = st.kind === 'winless'
    ? C.kpi({ label: 'Sem vencer há', value: st.value, sub: F.word(st.value, 'jogo', 'jogos'), variant: 'neg' })
    : C.kpi({ label: 'Invicto há', value: st.value, sub: `${F.word(st.value, 'jogo', 'jogos')} · ${F.plural(st.wins, 'vitória seguida', 'vitórias seguidas')}` });
  const form = g.form.length
    ? `<span style="display:inline-flex;align-items:center;gap:1.5mm">Últimos <span class="form">${g.form.map((r) => C.resultChip(r)).join('')}</span></span>`
    : null;
  return `<div>${C.sec('Desempenho', esc(F.plural(g.total, 'jogo', 'jogos')))}
    <div class="hero">${heroPoints(g)}<div class="club-kpis">
      ${C.kpi({ label: 'Gols pró', value: k.goalsFor, sub: `${F.dec1(k.avgFor)} por jogo` })}
      ${C.kpi({ label: 'Gols contra', value: k.goalsAgainst, sub: `${F.dec1(k.avgAgainst)} por jogo` })}
      ${C.kpi({ label: 'Saldo', value: F.signed(k.diff), variant: diffVariant })}
      ${streakKpi}
    </div></div></div>${history(g, { metaHtml: form })}`;
}

function treinos(vm) {
  const t = vm.training;
  if (t.empty) {
    return `<div>${C.sec('Treinos')}${C.emptyState('Nenhum treino registrado neste período', { cls: 'fill' })}</div>`;
  }
  const kpis = `<div class="grid g3">
    ${C.kpi({ label: 'Minutos trabalhados', value: F.duration(t.minutes), sub: `${F.int(t.minutes)} min`, variant: 'accent' })}
    ${C.kpi({ label: 'Sessões', value: t.sessions, sub: t.avgPerSession != null ? `${t.avgPerSession} min por sessão` : '' })}
    ${C.kpi({ label: 'Atividades', value: t.activities, sub: F.plural(t.distinctContents, 'conteúdo distinto', 'conteúdos distintos') })}
  </div>`;
  let pillars;
  if (!t.pillars.length) {
    pillars = `<div class="card">${C.sec('Distribuição por pilar')}${C.emptyState('Nenhum conteúdo com pilar registrado no período')}</div>`;
  } else {
    const stack = C.stackBar(t.pillars.map((p) => {
      const info = C.dimInfo(p.key);
      return { pct: p.pct, color: info.color, light: info.light, label: p.label };
    }));
    const cols = t.pillars.map((p) => `<div><h5><span class="dot" style="background:${C.dimInfo(p.key).color}"></span>${esc(p.label)}`
      + ` <small>· ${esc(F.plural(p.activities, 'ativ.', 'ativ.'))}${t.useTime ? ` · ${esc(F.duration(p.minutes, 'table'))}` : ''}</small></h5>`
      + `<div>${p.chips.map((c) => C.chip(c)).join('')}${p.more ? C.chip(`+${p.more}`, { nil: true }) : ''}</div></div>`).join('');
    // até 3 pilares com poucos conteúdos: colunas (protótipo); senão uma linha por
    // pilar com os chips correndo na largura toda (não empurra o card para outra página)
    const compact = t.pillars.length <= 3 && t.pillars.every((p) => p.chips.length + (p.more ? 1 : 0) <= 4);
    const layout = compact
      ? `<div class="pillar-cols" style="grid-template-columns:repeat(3,1fr)">${cols}</div>`
      : `<div class="pillar-rows">${cols}</div>`;
    pillars = `<div class="card"${compact ? '' : ' data-split=".pillar-rows > div"'}>${C.sec('Distribuição por pilar', t.useTime ? 'por tempo de treino' : 'por nº de atividades')}
      ${stack}${layout}</div>`;
  }
  return `<div>${C.sec('Treinos', esc(F.plural(t.sessions, 'sessão', 'sessões')))}${kpis}</div>${pillars}`;
}

function shirt(n) {
  return n != null ? `<span class="n">${esc(n)}</span>` : '<span class="n nil">—</span>';
}
function groupChip(p) {
  return p.group ? `<span class="chip grp">${esc(p.group)}</span>` : '';
}

function composition(sq) {
  const meta = [F.plural(sq.total, 'atleta', 'atletas')].concat(sq.noGroup ? ['todos sem grupo definido'] : []).join(' · ');
  if (!sq.total) return `<div>${C.sec('Composição do plantel', '0 atletas')}${C.emptyState('Nenhum atleta cadastrado no plantel')}</div>`;
  const bar = `<div class="comp">${sq.composition.map((c) => `<i style="width:${c.pct}%;--c:${c.color}">${c.count}</i>`).join('')}</div>`;
  const legend = `<div class="legend">${sq.sectors.map((c) => `<span><i class="dot" style="background:${c.color}"></i>${esc(c.label)} <b>${c.count}</b></span>`).join('')}</div>`;
  return `<div>${C.sec('Composição do plantel', esc(meta))}${bar}${legend}</div>`;
}

// Sem estatísticas: 4 cards por setor (grade 2×2)
function sectorCards(sq) {
  const cards = sq.sectors.map((s) => {
    const rows = s.players.length
      ? s.players.map((p) => `<div class="sq-row">${shirt(p.shirt)}<span class="nm">${esc(p.name)}${groupChip(p)}</span>${p.pos ? C.positionChip(p.pos, p.posColor) : '<span></span>'}</div>`).join('')
      : C.emptyState('Nenhum atleta');
    return `<div class="sector" style="--c:${s.color}"><h4>${esc(s.label)}<small>${esc(F.plural(s.count, 'atleta', 'atletas'))}</small></h4>${rows}</div>`;
  }).join('');
  return `<div class="grid g2">${cards}</div>`;
}

// Com estatísticas: tabela única agrupada por setor (5c item 4)
function squadTable(sq) {
  const num = (v, suffix = '') => (v ? `${F.int(v)}${suffix}` : '<span class="nil">0</span>');
  const rows = sq.sectors.filter((s) => s.count > 0).map((s) => `<tr class="sgrp" style="--c:${s.color}"><td colspan="7"><i></i>${esc(s.label)}<small>${esc(F.plural(s.count, 'atleta', 'atletas'))}</small></td></tr>`
    + s.players.map((p) => `<tr><td class="c">${shirt(p.shirt)}</td><td class="nm"><b>${esc(p.name)}</b>${groupChip(p)}</td>`
      + `<td class="c">${p.pos ? C.positionChip(p.pos, p.posColor) : '<span class="nil">—</span>'}</td>`
      + `<td class="c${p.stats.games ? '' : ' z'}">${p.stats.games}</td><td class="r${p.stats.minutes ? '' : ' z'}">${num(p.stats.minutes, "'")}</td>`
      + `<td class="c${p.stats.goals ? '' : ' z'}">${p.stats.goals}</td><td class="c${p.stats.assists ? '' : ' z'}">${p.stats.assists}</td></tr>`).join('')).join('');
  return `<div class="card" data-split="tbody tr">${C.sec('Atletas', 'jogos, minutos, gols e assistências no período')}
    <table class="tbl dense"><thead><tr><th class="c" style="width:9mm">#</th><th>Atleta</th><th class="c" style="width:14mm">Pos.</th>
    <th class="c" style="width:13mm">Jogos</th><th class="r" style="width:14mm">Min</th><th class="c" style="width:12mm">Gols</th><th class="c" style="width:12mm">Ast.</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function plantel(vm) {
  if (!vm.squadAllowed) return C.emptyState('Sem permissão para ver o plantel deste clube', { cls: 'fill' });
  const sq = vm.squad;
  if (!sq.total) return composition(sq);
  return composition(sq) + (sq.withStats ? squadTable(sq) : sectorCards(sq))
    + '<div class="note" style="margin-top:auto">“—” = sem número de camisa cadastrado no plantel.</div>';
}

function renderClube(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Relatório do clube';
  const header1 = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const pages = [
    C.page({ header: header1, subtitle: 'Desempenho e treinos', body: desempenho(vm) + treinos(vm), foot }),
    C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Plantel', right: vm.right }),
      subtitle: 'Plantel',
      body: plantel(vm),
      foot,
    }),
  ];
  return C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages,
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: vm.right }),
    foot,
  });
}

module.exports = { renderClube };
