// Programação da semana (A4 paisagem): o resumo da tela Programação, não as estatísticas.
// 7 colunas (dias); cada dia com os períodos (Manhã · Tático) e os blocos (fase, conteúdo,
// atividade); jogo, descanso e avaliação como na tela; no pé, minutos e distância.
// Fotos dos anexos (modal "Fotos do relatório") nas páginas seguintes.
const F = require('../format');
const C = require('./components');
const { photoPageBody } = require('./photos');

const esc = F.esc;

const CSS = `
@page{size:A4 landscape;margin:0}
.page{width:297mm;height:210mm}
.hdr{padding:6mm 10mm}
.hdr h1{font-size:18pt}
.body{padding:5mm 10mm 3mm}
.wk{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2mm}
.dc{display:flex;flex-direction:column;gap:1.2mm;min-width:0;min-height:0}
.dc .dh{background:var(--team);color:var(--on-team);border-radius:2mm;padding:1.6mm 2mm;text-align:center}
.dc .dh b{display:block;font:700 8.5pt Poppins}
.dc .dh span{font-size:7pt;opacity:.85}
.dc .pr{border:1px solid var(--line);border-radius:1.8mm;padding:1mm 1.6mm;text-align:center;font:600 7pt Poppins;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc .bl{border:1px solid var(--line);border-radius:1.8mm;padding:1.1mm 1.6mm;min-width:0}
.dc .bl .ph{font-size:5.8pt;color:var(--muted);display:flex;justify-content:space-between;gap:1mm}
.dc .bl .ph i{font-style:normal;font-weight:600;color:var(--ink-2)}
.dc .bl .ct{font-size:7pt;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
.dc .bl .tt{font-size:6.2pt;color:var(--ink-2);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.dc .bl{border-left:1.2mm solid var(--c,var(--line))}
.dc .big{flex:1;border:1px solid var(--line);border-radius:1.8mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2mm;gap:1mm;min-height:22mm}
.dc .big b{font:700 11pt Poppins;letter-spacing:.02em}
.dc .big span{font-size:7.5pt;font-weight:600}
.dc .big small{font-size:6.5pt;color:var(--muted)}
.dc .big.game{background:var(--team-softer);border-color:var(--team-soft)}
.dc .big.rest{background:repeating-linear-gradient(135deg,var(--surface) 0 2mm,#fff 2mm 4mm);color:var(--muted)}
.dc .big.none{border-style:dashed;color:var(--faint)}
.dc .big.av{background:var(--team-softer);border-color:var(--team-soft)}
.dc .nada{font-size:6.5pt;color:var(--faint);text-align:center;padding:1.5mm 0}
.dc .sp{flex:1}
.dc .ft{border-top:1px solid var(--line);padding-top:1.2mm;text-align:center;font:700 8pt Poppins;color:var(--ink)}
.dc .ft small{display:block;font:500 6.3pt Inter;color:var(--muted)}
`;

function blocoHtml(b) {
  const cor = b.pillar ? C.dimInfo(b.pillar).color : 'var(--line)';
  return `<div class="bl" style="--c:${cor}"><div class="ph"><span>${esc(b.phase)}</span>${b.minutes ? `<i>${b.minutes}'</i>` : ''}</div>`
    + `${b.content ? `<div class="ct">${esc(b.content)}</div>` : ''}${b.title ? `<div class="tt">${esc(b.title)}</div>` : ''}</div>`;
}

function periodoHtml(p) {
  const rot = [p.label, p.type === 'training' ? p.pillar : null].filter(Boolean).join(' · ');
  if (p.type === 'match') {
    const g = p.game || {};
    const info = [g.round ? (/^\d+$/.test(String(g.round)) ? `Rodada ${g.round}` : g.round) : null, g.location].filter(Boolean).join(' · ');
    return `${p.label ? `<div class="pr">${esc(p.label)} · Jogo</div>` : ''}<div class="big game"><b>JOGO</b><span>vs ${esc(g.opponent || 'Adversário')}</span>`
      + `${g.score ? `<span>${esc(g.score)}${g.result ? ` · ${esc(g.result)}` : ''}</span>` : ''}${info ? `<small>${esc(info)}</small>` : ''}</div>`
      + (p.blocks.length ? `<div class="pr">Não relacionados</div>${p.blocks.map((b) => blocoHtml({ ...b, phase: b.phase === 'Não relacionados' ? '' : b.phase })).join('')}` : '');
  }
  if (p.type === 'assessment') {
    const tipos = p.assessment?.types?.length ? p.assessment.types.join(' · ') : 'Tipo não informado';
    return `${rot ? `<div class="pr">${esc(rot)} · Avaliação</div>` : ''}<div class="big av"><b>AVALIAÇÃO</b><small>${esc(tipos)}</small></div>`;
  }
  const corpo = p.blocks.length ? p.blocks.map(blocoHtml).join('') : '<div class="nada">Nenhuma atividade</div>';
  return `${rot ? `<div class="pr">${esc(rot)}</div>` : ''}${corpo}`;
}

function diaHtml(d) {
  const head = `<div class="dh"><b>${esc(d.dn)}</b><span>${esc(d.dd)}</span></div>`;
  let meio;
  if (d.kind === 'descanso') meio = '<div class="big rest"><b>Descanso</b></div>';
  else if (d.kind === 'vazio') meio = '<div class="big none"><small>Sem registro</small></div>';
  else meio = d.periodos.map(periodoHtml).join('');
  const temGrande = d.kind !== 'dia' || d.periodos.some((p) => p.type === 'match' || p.type === 'assessment');
  const ft = d.kind === 'dia' && (d.minutes > 0 || d.km != null)
    ? `<div class="ft">${d.minutes}'${d.km != null ? ` · ${esc(F.dec1(d.km))} km` : ''}${d.split ? `<small>${esc(d.split)}</small>` : ''}</div>`
    : '';
  return `<div class="dc">${head}${meio}${temGrande ? '' : '<div class="sp"></div>'}${ft}</div>`;
}

function renderWeekProgram(vm, { now, onlyPhotos = false }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Programação da semana';
  const header = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const pages = onlyPhotos ? [] : [C.page({ header, subtitle: 'Programação', body: `<div class="wk">${vm.days.map(diaHtml).join('')}</div>`, foot })];
  if (vm.photos && vm.photos.items.length) {
    pages.push(C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Registro fotográfico', right: vm.right }),
      subtitle: 'Registro fotográfico',
      body: photoPageBody('Registro fotográfico', vm.photos),
      bodyStyle: 'gap:3mm',
      foot,
    }));
  }
  const html = C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages,
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: vm.right }),
    foot,
  });
  const at = html.indexOf('<style>:root{');
  const pos = at >= 0 ? at : html.indexOf('</head>');
  return html.slice(0, pos) + `<style>${CSS}</style>` + html.slice(pos);
}

module.exports = { renderWeekProgram };
