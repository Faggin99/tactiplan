// Relatório de UM jogo (A4 retrato): placar, números, lances por minuto e os atletas
// do jogo com minutos, gols, assistências e cartões. POST /api/reports/jogo { session_id }.
const F = require('../format');
const C = require('./components');

const esc = F.esc;

const CSS = `
.lance{display:grid;grid-template-columns:11mm 24mm 1fr;align-items:center;gap:2mm;padding:1.6mm 0;border-bottom:1px solid var(--line-2)}
.lance:last-child{border-bottom:0}
.lance .mn{font:700 9pt Poppins;color:var(--ink);text-align:right}
.lance .mn.nil{color:var(--faint);font-weight:500}
.lance .tg{display:inline-flex;align-items:center;gap:1.4mm;font-size:7pt;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2)}
.lance .tg i{width:2.4mm;height:2.4mm;border-radius:50%;background:var(--faint);flex:none}
.lance.gol .tg i{background:var(--win)} .lance.sofrido .tg i{background:var(--loss)}
.lance.amarelo .tg i{background:#EAB308;border-radius:.5mm;width:2mm;height:2.8mm}
.lance.vermelho .tg i{background:var(--loss);border-radius:.5mm;width:2mm;height:2.8mm}
.lance.troca .tg i{background:#3B82F6}
.lance .tx b{font-weight:600}
.lance .tx small{display:block;font-size:7pt;color:var(--muted)}
.cart{display:inline-block;width:2.2mm;height:3mm;border-radius:.4mm;margin-right:.6mm;vertical-align:-0.4mm}
.cart.y{background:#EAB308}.cart.r{background:var(--loss)}
.tbl tr.out td{color:var(--faint)}
`;

function kpis(vm) {
  const k = vm.kpis;
  return `<div class="grid g4">
    ${C.kpi({ label: 'Placar', value: esc(vm.score), sub: esc(vm.resultLabel), variant: vm.result === 'win' ? 'pos' : (vm.result === 'loss' ? 'neg' : '') })}
    ${C.kpi({ label: 'Atletas utilizados', value: k.usados, sub: `de ${k.convocados} convocados` })}
    ${C.kpi({ label: 'Substituições', value: k.subs })}
    ${C.kpi({ label: 'Cartões', value: `${k.yellow} <small>· ${k.red}</small>`, sub: 'amarelos · vermelhos' })}
  </div>`;
}

function lances(vm) {
  if (!vm.lances.length) {
    return `<div class="card">${C.sec('Lances do jogo')}${C.emptyState('Nenhum lance registrado neste jogo', { icon: C.ICON.ball })}</div>`;
  }
  const rows = vm.lances.map((l) => `<div class="lance ${l.kind}">`
    + `<div class="mn${l.min == null ? ' nil' : ''}">${l.min == null ? '—' : `${esc(l.min)}'`}</div>`
    + `<div class="tg"><i></i>${esc(l.label)}</div>`
    + `<div class="tx"><b>${esc(l.text)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div></div>`).join('');
  return `<div class="card" data-split=".lance">${C.sec('Lances do jogo', esc(F.plural(vm.lances.length, 'lance', 'lances')))}${rows}</div>`;
}

function num(v) { return v ? `<b>${v}</b>` : '<span class="nil">—</span>'; }

function linha(r) {
  const cart = '<i class="cart y"></i>'.repeat(r.yellow) + '<i class="cart r"></i>'.repeat(r.red);
  return `<tr${r.played ? '' : ' class="out"'}>`
    + `<td class="c">${r.shirt != null ? `<span class="n">${esc(r.shirt)}</span>` : '<span class="n nil">—</span>'}</td>`
    + `<td class="nm"><b>${esc(r.name)}</b></td>`
    + `<td class="c">${r.pos ? C.positionChip(r.pos, r.posColor) : '<span class="nil">—</span>'}</td>`
    + `<td class="c">${r.played ? `<b>${r.minutes}'</b>` : '<span class="nil" style="white-space:nowrap">não entrou</span>'}</td>`
    + `<td class="c">${num(r.goals)}</td><td class="c">${num(r.assists)}</td>`
    + `<td class="c">${cart || '<span class="nil">—</span>'}</td></tr>`;
}

function tabela(title, meta, rows) {
  return `<div class="card" data-split="tbody tr">${C.sec(title, meta)}
    <table class="tbl dense"><thead><tr><th class="c" style="width:14mm">Camisa</th><th>Nome</th>
    <th class="c" style="width:16mm">Posição</th><th class="c" style="width:20mm">Minutos</th>
    <th class="c" style="width:13mm">Gols</th><th class="c" style="width:13mm">Assist.</th><th class="c" style="width:16mm">Cartões</th></tr></thead>
    <tbody>${rows.map(linha).join('')}</tbody></table></div>`;
}

function renderJogo(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Relatório do jogo';
  const header = C.fullHeader({
    team, eyebrow: reportName, title: `${team.name} × ${vm.opponent}`, metaHtml: esc(vm.meta.join(' · ')),
    badgeTop: vm.score, badgeSub: vm.resultLabel,
  });
  const body = kpis(vm)
    + lances(vm)
    + (vm.titulares.length ? tabela('Titulares', esc(`${vm.formation} · ${vm.duration} min`), vm.titulares) : '')
    + (vm.reservas.length ? tabela('Reservas', esc(F.plural(vm.reservas.length, 'atleta', 'atletas')), vm.reservas) : '')
    + (!vm.titulares.length && !vm.reservas.length ? `<div class="card">${C.sec('Atletas')}${C.emptyState('Nenhum atleta convocado neste jogo')}</div>` : '');
  const html = C.documentHtml({
    title: `${reportName} · ${team.name} × ${vm.opponent}`,
    palette: team.palette,
    pages: [C.page({ header, subtitle: 'Jogo', body, foot })],
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: `${vm.opponent} · ${F.ddmmyyyy(vm.date)}` }),
    foot,
  });
  const at = html.indexOf('<style>:root{');
  const pos = at >= 0 ? at : html.indexOf('</head>');
  return html.slice(0, pos) + `<style>${CSS}</style>` + html.slice(pos);
}

module.exports = { renderJogo };
