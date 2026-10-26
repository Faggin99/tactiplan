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
.wk{flex:1;min-height:0;display:grid;column-gap:2mm;row-gap:1.6mm}
.dh{background:var(--team);color:var(--on-team);border-radius:2mm;padding:1.6mm 2mm;text-align:center}
.dh b{display:block;font:700 8.5pt Poppins}
.dh span{font-size:7pt;opacity:.85}
.bd{writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;justify-content:center;
  font:700 7pt Poppins;letter-spacing:.12em;text-transform:uppercase;color:var(--team-ink);background:var(--team-softer);border-radius:2mm}
.cel{display:flex;flex-direction:column;gap:1.2mm;min-width:0;min-height:0;overflow:hidden}
.cel.vz{border:1px dashed var(--line);border-radius:1.8mm}
.pr{border:1px solid var(--line);border-radius:1.8mm;padding:1mm 1.6mm;text-align:center;font:600 7.2pt Poppins;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl{border:1px solid var(--line);border-left:1.2mm solid var(--c,var(--line));border-radius:1.8mm;padding:1.2mm 1.8mm;min-width:0}
.bl .ph{font-size:6.3pt;color:var(--muted);display:flex;justify-content:space-between;gap:1mm}
.bl .ph i{font-style:normal;font-weight:600;color:var(--ink-2)}
.bl .ct{font-size:7.8pt;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
.bl .tt{font-size:6.8pt;color:var(--ink-2);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.box{border:1px solid var(--line);border-radius:1.8mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3mm 2mm;gap:.8mm}
.box b{font:700 10pt Poppins;letter-spacing:.02em}
.box span{font-size:7.5pt;font-weight:600}
.box small{font-size:6.5pt;color:var(--muted)}
.box.game{background:var(--team-softer);border-color:var(--team-soft)}
.box.av{background:var(--team-softer);border-color:var(--team-soft)}
.box.rest{flex:1;background:repeating-linear-gradient(135deg,var(--surface) 0 2mm,#fff 2mm 4mm);color:var(--muted)}
.box.none{flex:1;border-style:dashed;color:var(--faint)}
.nada{font-size:6.5pt;color:var(--faint);text-align:center;padding:1.5mm 0}
.ft{border-top:1px solid var(--line);padding-top:1.2mm;text-align:center;font:700 8pt Poppins;color:var(--ink)}
.ft small{display:block;font:500 6.3pt Inter;color:var(--muted)}
`;

function blocoHtml(b) {
  const cor = b.pillar ? C.dimInfo(b.pillar).color : 'var(--line)';
  return `<div class="bl" style="--c:${cor}"><div class="ph"><span>${esc(b.phase)}</span>${b.minutes ? `<i>${b.minutes}'</i>` : ''}</div>`
    + `${b.content ? `<div class="ct">${esc(b.content)}</div>` : ''}${b.title ? `<div class="tt">${esc(b.title)}</div>` : ''}</div>`;
}

// Um período (treino, jogo ou avaliação) dentro da célula. comRotulo: dia de período único
// mostra "Manhã · Tático" em cima; nas faixas (Manhã/Tarde) o rótulo já está na linha.
function periodoHtml(p, comRotulo) {
  const rot = [comRotulo ? p.label : null, p.type === 'training' ? p.pillar : null].filter(Boolean).join(' · ');
  if (p.type === 'match') {
    const g = p.game || {};
    const info = [g.round ? (/^\d+$/.test(String(g.round)) ? `Rodada ${g.round}` : g.round) : null, g.location].filter(Boolean).join(' · ');
    return `<div class="box game"><b>JOGO</b><span>vs ${esc(g.opponent || 'Adversário')}</span>`
      + `${g.score ? `<span>${esc(g.score)}${g.result ? ` · ${esc(g.result)}` : ''}</span>` : ''}${info ? `<small>${esc(info)}</small>` : ''}</div>`
      + (p.blocks.length ? `<div class="pr">Não relacionados</div>${p.blocks.map((b) => blocoHtml({ ...b, phase: b.phase === 'Não relacionados' ? '' : b.phase })).join('')}` : '');
  }
  if (p.type === 'assessment') {
    const tipos = p.assessment?.types?.length ? p.assessment.types.join(' · ') : 'Tipo não informado';
    return `<div class="box av"><b>AVALIAÇÃO</b><small>${esc(tipos)}</small></div>`;
  }
  const corpo = p.blocks.length ? p.blocks.map(blocoHtml).join('') : '<div class="nada">Nenhuma atividade</div>';
  return `${rot ? `<div class="pr">${esc(rot)}</div>` : ''}${corpo}`;
}

function celulaDia(d) {
  if (d.kind === 'descanso') return '<div class="box rest"><b>Descanso</b></div>';
  if (d.kind === 'vazio') return '<div class="box none"><small>Sem registro</small></div>';
  return d.periodos.map((p) => periodoHtml(p, true)).join('');
}

function rodape(d) {
  if (d.kind !== 'dia' || !(d.minutes > 0 || d.km != null)) return '<div></div>';
  return `<div class="ft">${d.minutes}'${d.km != null ? ` · ${esc(F.dec1(d.km))} km` : ''}${d.split ? `<small>${esc(d.split)}</small>` : ''}</div>`;
}

// Grade: linha 1 = dias; depois 1 linha por faixa (Manhã/Tarde/Noite) quando algum dia tem
// 2+ períodos — o dia dividido põe cada período na sua faixa e o dia de período único ocupa
// a coluna inteira (como a tela); última linha = minutos e km.
function grade(vm) {
  const bandas = vm.bandas || [];
  const nb = Math.max(1, bandas.length);
  const off = bandas.length ? 1 : 0; // coluna do rótulo da faixa
  const cols = `${bandas.length ? '6mm ' : ''}repeat(7,minmax(0,1fr))`;
  const rows = `auto repeat(${nb},minmax(0,1fr)) auto`;
  const at = (r, c, extra = '') => `style="grid-row:${r};grid-column:${c};${extra}"`;
  const cells = [];
  bandas.forEach((b, i) => cells.push(`<div class="bd" ${at(2 + i, 1)}>${esc(b)}</div>`));
  vm.days.forEach((d, i) => {
    const col = i + 1 + off;
    cells.push(`<div class="dh" ${at(1, col)}><b>${esc(d.dn)}</b><span>${esc(d.dd)}</span></div>`);
    if (d.span) {
      cells.push(`<div class="cel" ${at(`2 / span ${nb}`, col)}>${celulaDia(d)}</div>`);
    } else {
      bandas.forEach((b, j) => {
        const p = d.periodos.find((x) => x.label === b);
        cells.push(p
          ? `<div class="cel" ${at(2 + j, col)}>${periodoHtml(p, false)}</div>`
          : `<div class="cel vz" ${at(2 + j, col)}></div>`);
      });
    }
    cells.push(`<div ${at(nb + 2, col)}>${rodape(d)}</div>`);
  });
  return `<div class="wk" style="grid-template-columns:${cols};grid-template-rows:${rows}">${cells.join('')}</div>`;
}

function renderWeekProgram(vm, { now, onlyPhotos = false }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Programação da semana';
  const header = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const pages = onlyPhotos ? [] : [C.page({ header, subtitle: 'Programação', body: grade(vm), foot })];
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
