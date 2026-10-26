// Relatório 4 — Convocação (1 página, A4 paisagem). Referência: docs/formato_relatorios/convocacao-preview.html.
const fs = require('fs');
const path = require('path');
const F = require('../format');
const C = require('./components');

const esc = F.esc;
const CSS = fs.readFileSync(path.join(__dirname, 'convocacao.css'), 'utf8');

// Linhas oficiais (68×105). Retângulos esticam com o campo; círculos/arcos em
// outro SVG com "meet" para não ficarem ovais.
const PITCH_LINES = `<svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".35">
<rect x="2" y="2" width="64" height="101"/><line x1="2" y1="52.5" x2="66" y2="52.5"/>
<rect x="15.85" y="2" width="36.3" height="16.5"/><rect x="24.85" y="2" width="18.3" height="5.5"/>
<rect x="15.85" y="86.5" width="36.3" height="16.5"/><rect x="24.85" y="97.5" width="18.3" height="5.5"/></svg>
<svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="xMidYMid meet" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".35">
<circle cx="34" cy="52.5" r="9.15"/><circle cx="34" cy="52.5" r=".5" fill="rgba(255,255,255,.5)"/>
<path d="M26.7 18.5 A9.15 9.15 0 0 0 41.3 18.5"/><path d="M26.7 86.5 A9.15 9.15 0 0 1 41.3 86.5"/></svg>`;

function header(vm) {
  const info = vm.info.map((i) => `<div><b>${esc(i.label)}</b> ${i.value ? esc(i.value) : '<span class="nil">—</span>'}</div>`).join('');
  return `<header class="hdr">${C.crest(vm.team)}
    <div class="ttl"><div class="eyebrow">Convocação</div>
      <h1 style="font-size:${vm.titleSizePt}pt">${esc(vm.team.name)}<span>vs</span>${esc(vm.opponent)}</h1>
      ${vm.meta.length ? `<div class="meta">${vm.meta.map(esc).join(' · ')}</div>` : ''}</div>
    <div class="when"><div class="d"><small>${esc(vm.weekday)}</small>${esc(vm.ddmm)}</div><div class="sep"></div>
      <div class="x">${info}</div></div></header>`;
}

function pitch(vm) {
  const players = vm.field.map((p) => `<div class="pl${p.small ? ' sm' : ''}" style="left:${p.x}%;top:${p.y}%;width:min(24mm,${p.maxWidthPct}%)">`
    + `<div class="tok${p.gk ? ' gk' : ''}${p.hasShirt ? '' : ' ini'}">${esc(p.token)}</div><div class="nm">${esc(p.name)}</div></div>`).join('');
  const overlay = vm.hasLineup ? ''
    : `<div class="ov"><div class="empty"><b>Escalação não definida</b>Escolha as vagas no campo do jogo para ver a escalação aqui.</div></div>`;
  return `<div class="pitchwrap"><div class="pitch">${PITCH_LINES}${players}
    <div class="dir">Ataque ↑</div>${overlay}</div></div>`;
}

function row(r) {
  const n = r.shirt != null ? `<span class="n">${esc(r.shirt)}</span>` : '<span class="n nil">—</span>';
  const off = r.offField ? '<small>sem vaga</small>' : '';
  const pos = r.pos ? C.positionChip(r.pos, r.posColor) : '<span></span>';
  return `<div class="row">${n}<span class="nm">${esc(r.name)}${off}</span>${pos}</div>`;
}

function lists(vm) {
  const stats = [
    // a formação (ex. 4-4-2) não aparece mais (pedido de 26/10/2026)
    ['Convocados', vm.counts.total], ['Titulares', vm.counts.starters], ['Reservas', vm.counts.bench],
  ].map(([l, v]) => `<div class="st"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join('');
  const starters = vm.groups.length
    ? vm.groups.map((g) => `<div class="grp" style="--c:${g.color}"><h4><i></i>${esc(g.label)}</h4>${g.rows.map(row).join('')}</div>`).join('')
    : C.emptyState('Nenhum titular definido');
  const bench = vm.bench.length ? vm.bench.map(row).join('') : C.emptyState('Sem reservas');
  const notes = [];
  if (vm.unplaced.length) {
    notes.push(`<b>Fora do campo (titular sem vaga):</b> ${esc(vm.unplaced.join(', '))}.`);
  }
  notes.push('Camisas exibidas são as deste jogo (fallback: nº permanente do plantel). “—” = sem número cadastrado.');
  return `<div class="right"><div class="stats">${stats}</div>
    <div class="cols"><div>${C.sec('Titulares', esc(vm.counts.starters))}<div class="starters${vm.startersCompact ? ' compact' : ''}">${starters}</div></div>
      <div>${C.sec('Reservas', esc(vm.counts.bench))}<div class="bench${vm.benchLayout ? ' ' + vm.benchLayout : ''}">${bench}</div></div></div>
    <div class="note">${notes.join('<br>')}</div></div>`;
}

function renderConvocacao(vm, { now }) {
  const foot = C.footer({ now });
  const html = C.documentHtml({
    title: `Convocação · ${vm.team.name} vs ${vm.opponent}`,
    palette: vm.team.palette,
    pages: [C.page({ header: header(vm), body: `<div class="cv f-${esc(vm.fonte || 'normal')}">${pitch(vm)}${lists(vm)}</div>`, foot })],
    contHeader: C.compactHeader({ team: vm.team, reportName: 'Convocação', subtitle: '', right: F.ddmmyyyy(vm.date) }),
    foot,
  });
  // CSS da paisagem depois do comum (styles.css), antes das variáveis da paleta
  const at = html.indexOf('<style>:root{');
  const pos = at >= 0 ? at : html.indexOf('</head>');
  return html.slice(0, pos) + `<style>${CSS}</style>` + html.slice(pos);
}

module.exports = { renderConvocacao };
