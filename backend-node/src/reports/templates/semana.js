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
/* 21/11/2026: os 6 blocos ocupam sempre a mesma linha em todos os dias e esticam até o pé */
.blocos{flex:1;min-height:0;display:grid;grid-template-rows:repeat(6,minmax(0,1fr));gap:1.2mm}
.blocos .bl{min-height:0;overflow:hidden}
.bl.vz{border-style:dashed;border-left-width:1px;background:none}
.bl.vz .ct{color:var(--faint);font-weight:500}
.cel > .box.game:only-child,.cel > .box.av:only-child{flex:1}
.resumo{display:flex;align-items:center;gap:4mm;margin-top:2.5mm;padding-top:2mm;border-top:1px solid var(--line);font-size:7.5pt;color:var(--ink-2)}
.resumo b{font:700 8.5pt Poppins;color:var(--ink);white-space:nowrap}
.resumo .barra{flex:1;display:flex;height:3.2mm;border-radius:1.6mm;overflow:hidden;background:var(--surface)}
.resumo .barra i{display:block;height:100%}
.resumo .leg{display:flex;gap:3mm;white-space:nowrap}
.resumo .leg span{display:inline-flex;align-items:center;gap:1.2mm}
.resumo .leg i{width:2.4mm;height:2.4mm;border-radius:50%;display:inline-block}
.ft{border-top:1px solid var(--line);padding-top:1.2mm;text-align:center;font:700 8pt Poppins;color:var(--ink)}
.ft small{display:block;font:500 6.3pt Inter;color:var(--muted)}
`;

// Posição fixa de cada bloco (nomes de hoje e os antigos), para alinhar os dias: bloco sem atividade = vazio.
const ORDEM_BLOCOS = [['Ativação', 'Aquecimento'], ['Atividade 1', 'Preparatório'], ['Atividade 2'], ['Atividade 3'], ['Atividade 4'], ['Treino de goleiro', 'Complementos']];
function seisBlocos(blocks) {
  const usados = new Set();
  const slots = ORDEM_BLOCOS.map((nomes) => {
    const b = blocks.find((x, i) => !usados.has(i) && nomes.includes(x.phase));
    if (!b) return { phase: nomes[0], vazio: true };
    usados.add(blocks.indexOf(b));
    return b;
  });
  // bloco com nome fora da lista (renomeado à mão): ocupa a 1ª posição vazia
  blocks.forEach((b, i) => {
    if (usados.has(i)) return;
    const k = slots.findIndex((x) => x.vazio);
    if (k >= 0) slots[k] = b;
  });
  return slots;
}

function blocoHtml(b) {
  if (b.vazio) return `<div class="bl vz"><div class="ph"><span>${esc(b.phase)}</span></div><div class="ct">—</div></div>`;
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
  const corpo = p.blocks.length ? `<div class="blocos">${seisBlocos(p.blocks).map(blocoHtml).join('')}</div>` : '<div class="nada">Nenhuma atividade</div>';
  return `${rot ? `<div class="pr">${esc(rot)}</div>` : ''}${corpo}`;
}

function celulaDia(d) {
  if (d.kind === 'descanso') return '<div class="box rest"><b>Descanso</b></div>';
  if (d.kind === 'vazio') return '<div class="box none"><small>Sem registro</small></div>';
  return d.periodos.map((p) => periodoHtml(p, true)).join('');
}

function rodape(d) {
  if (d.kind !== 'dia' || !(d.minutes > 0 || d.km != null)) return '<div></div>';
  return `<div class="ft">${d.minutes}'${d.km != null ? ` · ${esc(F.dec1(d.km))} km` : ''}${d.split ? `<small>${esc(d.split)}</small>` : ''}${d.goleiro ? `<small>+${d.goleiro}' goleiros</small>` : ''}</div>`;
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
  return `<div class="wk" style="grid-template-columns:${cols};grid-template-rows:${rows}">${cells.join('')}</div>${resumo(vm)}`;
}

// Pé da página: total da semana + barra dos minutos por pilar (cor da borda dos blocos) e legenda.
// Treino de transição e avaliação não entram (como nas estatísticas).
function resumo(vm) {
  const por = {};
  let total = 0;
  for (const d of vm.days) {
    for (const p of d.periodos || []) {
      if (p.type !== 'training' || p.transicao) continue;
      for (const b of p.blocks || []) {
        if (/^treino de goleiro$/i.test(String(b.phase || '').trim())) continue; // paralelo: fora do resumo do grupo
        const m = Number(b.minutes) || 0;
        if (!m) continue;
        const k = b.pillar || 'outros';
        por[k] = (por[k] || 0) + m;
        total += m;
      }
    }
  }
  if (!total) return '';
  const ordem = ['tatico', 'fisico', 'tecnico', 'mental', 'outros'].filter((k) => por[k]);
  const barra = ordem.map((k) => `<i style="width:${(por[k] / total) * 100}%;background:${C.dimInfo(k).color}"></i>`).join('');
  const leg = ordem.map((k) => `<span><i style="background:${C.dimInfo(k).color}"></i>${esc(C.dimInfo(k).label)} ${Math.round((por[k] / total) * 100)}%</span>`).join('');
  return `<div class="resumo"><b>Semana: ${total}'</b><div class="barra">${barra}</div><div class="leg">${leg}</div></div>`;
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
