// Relatório 5 — Relatório do clube / temporada (2 páginas, A4 retrato). Ver seção 5c.
// Reaproveita os blocos do Relatório 1 (Pontuação, Histórico) e os componentes comuns.
const F = require('../format');
const C = require('./components');
const { heroPoints, history } = require('./games');
const { weeksChart } = require('./training');
const { campogramaHtml } = require('./campograma');

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

// Página "Elenco em campo": campograma à esquerda e, ao lado, os destaques do período e o DM.
function lista(titulo, itens, fmt) {
  const linhas = itens.length
    ? itens.map((p, i) => `<li><span class="pos">${i + 1}º</span><span class="nm">${p.shirt != null ? `<em>${esc(p.shirt)}</em> ` : ''}${esc(p.name)}</span><b>${fmt(p.value)}</b></li>`).join('')
    : '<li class="vazio">—</li>';
  return `<div class="dq"><h5>${esc(titulo)}</h5><ol>${linhas}</ol></div>`;
}

// carga da temporada: minutos por semana (mesmo gráfico do relatório de treino, com os números)
function semanas(vm) {
  const t = vm.training;
  return !t.empty && t.weeks && t.weeks.length > 1 && t.weekMax > 0 ? weeksChart({ weeks: t.weeks, weekMax: t.weekMax }, { altura: 28 }) : '';
}

function elencoEmCampo(vm) {
  if (!vm.squadAllowed || !vm.campo || !vm.campo.zonas.length) return '';
  const d = vm.destaques || { gols: [], assistencias: [], minutos: [] };
  const dm = (vm.dm || []).length
    ? `<ol>${vm.dm.map((x) => `<li class="dm"><span class="nm">${esc(x.name)}<small>${esc([x.injury_type, x.body_part].filter(Boolean).join(' · '))}${x.expected_return ? ` · volta ${esc(F.ddmm(F.toDateStr(x.expected_return)))}` : ''}</small></span></li>`).join('')}</ol>`
    : '<p class="vazio">Ninguém no departamento médico.</p>';
  const lado = `<div class="dq-col">
      ${lista('Artilharia', d.gols, (v) => `${v} ${v === 1 ? 'gol' : 'gols'}`)}
      ${lista('Assistências', d.assistencias, (v) => `${v}`)}
      ${lista('Mais minutos', d.minutos, (v) => `${F.int(v)}'`)}
      <div class="dq"><h5>Departamento médico</h5>${dm}</div>
    </div>`;
  return `<div class="card">${C.sec('Elenco em campo', 'por posição · em vermelho, no departamento médico')}
    <div class="ec">${campogramaHtml(vm.campo, { futsal: vm.team.modality === 'futsal', largura: 96, altura: 148, card: false })}${lado}</div>
    <style>
      .ec{display:grid;grid-template-columns:100mm 1fr;gap:5mm;align-items:start}
      .ec .cg{margin:0}
      .dq-col{display:flex;flex-direction:column;gap:4mm}
      .dq h5{margin:0 0 1.5mm;font:700 7pt Poppins;letter-spacing:.08em;text-transform:uppercase;color:var(--team-ink)}
      .dq ol{list-style:none;margin:0;padding:0}
      .dq li{display:flex;align-items:baseline;gap:2mm;padding:1.3mm 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:8pt}
      .dq li .pos{width:5mm;color:var(--ink-2);font-weight:600}
      .dq li .nm{flex:1;min-width:0}
      .dq li .nm em{font-style:normal;font-weight:800;color:var(--ink-2)}
      .dq li .nm small{display:block;color:var(--ink-2);font-size:6.8pt}
      .dq li b{font-variant-numeric:tabular-nums}
      .dq li.dm .nm{padding-left:3mm;position:relative}
      .dq li.dm .nm::before{content:"";position:absolute;left:0;top:1.2mm;width:1.8mm;height:1.8mm;border-radius:50%;background:#C62D2D}
      .dq .vazio{color:var(--ink-2);font-size:7.5pt;margin:0}
    </style></div>`;
}

function renderClube(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Relatório do clube';
  const header1 = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const temporada = semanas(vm) + elencoEmCampo(vm);
  const pages = [
    C.page({ header: header1, subtitle: 'Desempenho e treinos', body: desempenho(vm) + treinos(vm), foot }),
    ...(temporada ? [C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Temporada', right: vm.right }),
      subtitle: 'Temporada',
      body: temporada,
      foot,
    })] : []),
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
