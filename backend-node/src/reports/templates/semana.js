// Programação da semana (A4 paisagem): o resumo da tela Programação, não as estatísticas.
// 21/11/2026 (escolha do dono entre 3 alternativas): PLANILHA DE PERIODIZAÇÃO — linhas = os 6 blocos
// (Ativação, Atividade 1–4, Treino de goleiro), colunas = cada treino (dia · período); avaliação, jogo,
// descanso e dia vazio ocupam a coluna inteira. Semana com muitos dias duplos (colunas demais) continua
// na página seguinte, sem partir um dia ao meio. Pé: total de cada treino e barra da semana por pilar.
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
.body{padding:4.5mm 10mm 3mm}
.mn{font-variant-numeric:tabular-nums}
.cont{font:600 7pt Inter;color:var(--muted);text-align:right;margin-top:1.5mm}
.resumo{display:flex;align-items:center;gap:4mm;margin-top:auto;padding-top:2mm;border-top:1px solid var(--line);font-size:7.5pt;color:var(--ink-2)}
.resumo b{font:700 8.5pt Poppins;color:var(--ink);white-space:nowrap}
.resumo b small{font:500 7pt Inter;color:var(--muted)}
.resumo .barra{flex:1;display:flex;height:3mm;border-radius:1.5mm;overflow:hidden;background:var(--surface)}
.resumo .barra i{display:block;height:100%}
.resumo .leg{display:flex;gap:3mm;white-space:nowrap}
.resumo .leg span{display:inline-flex;align-items:center;gap:1.2mm}
.resumo .leg i{width:2.4mm;height:2.4mm;border-radius:50%;display:inline-block}
.pl{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:6.8pt}
.pl th,.pl td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.3mm 1.6mm;vertical-align:top;text-align:left;min-width:0;overflow-wrap:anywhere}
.pl tr > :first-child{border-left:1px solid var(--line)}
.pl thead th{background:var(--team);color:var(--on-team);border-color:rgba(255,255,255,.25);text-align:center;font:700 7.6pt Poppins;padding:1.5mm 1mm}
.pl thead th small{display:block;font:500 6.3pt Inter;opacity:.85}
.pl thead tr:first-child th:first-child{border-top-left-radius:2mm}
.pl thead tr:first-child th:last-child{border-top-right-radius:2mm}
.pl thead tr.sub th{background:var(--team-softer);color:var(--team-ink);font:700 6.8pt Poppins}
.pl thead tr.sub th span{display:block;font:600 6.2pt Inter;color:var(--ink-2)}
.pl tbody td,.pl tbody th{height:16mm}
.pl tbody th{vertical-align:middle;background:var(--surface);font:600 6.6pt Inter;color:var(--ink-2);text-transform:uppercase;letter-spacing:.03em;width:21mm}
.pl td{position:relative;padding-left:2.4mm}
.pl td.f::before{content:"";position:absolute;left:0;top:1.2mm;bottom:1.2mm;width:.9mm;background:var(--c);border-radius:.5mm}
.pl td b{display:block;font:700 7pt/1.2 Poppins;color:var(--ink)}
.pl td span{display:block;color:var(--ink-2);line-height:1.25;margin-top:.3mm}
.pl td em{font-style:normal;font-weight:700;color:var(--ink);float:right;margin-left:1mm}
.pl td.vz{color:var(--faint);text-align:center}
.pl td.full{vertical-align:middle;text-align:center;font:700 7pt Poppins;letter-spacing:0;color:var(--ink-2);overflow-wrap:normal;word-break:keep-all;padding:1.3mm .8mm}
.pl td.full span{font:500 6.6pt Inter;letter-spacing:0}
.pl td.jogo{background:var(--team-softer);color:var(--team-ink)}
.pl td.rest{background:repeating-linear-gradient(135deg,var(--surface) 0 2mm,#fff 2mm 4mm);color:var(--muted)}
.pl tr.gk th,.pl tr.gk td{background:var(--surface);border-top:1px dashed var(--line)}
.pl tfoot td{font:700 8pt Poppins;color:var(--ink);text-align:center;border-bottom:0;padding-top:1.6mm}
.pl tfoot td small{display:block;font:500 6.2pt Inter;color:var(--muted)}
.pl tfoot td,.pl tfoot th{border:0!important;background:none}
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

const ehGoleiro = (b) => /^(treino de goleiro|complementos)$/i.test(String(b.phase || '').trim());
const cor = (pillar) => (pillar ? C.dimInfo(pillar).color : 'var(--line)');
const tiposAv = (p) => (p.assessment?.types?.length ? p.assessment.types.join(' · ') : 'Tipo não informado');
const jogoTxt = (p) => {
  const g = p.game || {};
  return { adv: g.opponent || 'Adversário', placar: g.score ? `${g.score}${g.result ? ` · ${g.result}` : ''}` : '' };
};
const seis = seisBlocos;

// Colunas da semana: cada período de cada dia; dia sem período (descanso/vazio) = 1 coluna estreita.
function colunasDe(days) {
  const cols = [];
  for (const d of days) {
    if (d.kind !== 'dia' || !d.periodos.length) { cols.push({ d, kind: d.kind === 'dia' ? 'vazio' : d.kind, w: 0.75 }); continue; }
    d.periodos.forEach((p, i) => cols.push({ d, p, primeiro: i === 0, n: d.periodos.length, kind: p.type, w: p.type === 'training' ? 1.25 : 0.85 }));
  }
  return cols;
}

// Divide os dias em páginas pelo "peso" das colunas (treino 1,25 · jogo/avaliação 0,85 · descanso 0,75),
// nunca partindo um dia: até ~8 colunas de treino por página.
const PESO_MAX = 10.5;
function paginasDeDias(days) {
  const pags = [[]];
  let peso = 0;
  for (const d of days) {
    const w = colunasDe([d]).reduce((t, c) => t + c.w, 0);
    if (pags[pags.length - 1].length && peso + w > PESO_MAX) { pags.push([]); peso = 0; }
    pags[pags.length - 1].push(d);
    peso += w;
  }
  return pags;
}

function planilha(days) {
  // colunas: cada período de cada dia (dia sem período = 1 coluna estreita)
  const cols = [];
  cols.push(...colunasDe(days));
  const somaW = cols.reduce((t, c) => t + c.w, 0);
  const colgroup = `<colgroup><col style="width:21mm">${cols.map((c) => `<col style="width:${((c.w / somaW) * 100).toFixed(2)}%">`).join('')}</colgroup>`;
  // cabeçalho: dia (com span pelos períodos) e linha dos períodos
  const head1 = []; const head2 = [];
  for (const c of cols) {
    if (c.p && !c.primeiro) continue;
    const span = c.p ? c.n : 1;
    head1.push(`<th colspan="${span}">${esc(c.d.dn.replace('-feira', ''))}<small>${esc(c.d.dd)}</small></th>`);
  }
  for (const c of cols) {
    if (!c.p) { head2.push('<th></th>'); continue; }
    const tipo = c.p.type === 'match' ? 'Jogo' : c.p.type === 'assessment' ? 'Avaliação' : (c.p.transicao ? 'Transição' : (c.p.pillar || 'Treino'));
    head2.push(`<th>${esc(c.p.label || '')}<span>${esc(tipo)}</span></th>`);
  }
  const NOMES = ['Ativação', 'Atividade 1', 'Atividade 2', 'Atividade 3', 'Atividade 4', 'Treino de goleiro'];
  const slotsPorCol = cols.map((c) => (c.p && c.p.type === 'training' ? seis(c.p.blocks) : null));
  const linhas = NOMES.map((nome, r) => {
    const tds = cols.map((c, k) => {
      if (r === 0 && !slotsPorCol[k]) {
        if (c.kind === 'descanso') return '<td class="full rest" rowspan="6">Descanso</td>';
        if (c.kind === 'vazio') return '<td class="full vz" rowspan="6">—</td>';
        if (c.kind === 'match') { const j = jogoTxt(c.p); return `<td class="full jogo" rowspan="6">Jogo<span>vs ${esc(j.adv)}</span>${j.placar ? `<span>${esc(j.placar)}</span>` : ''}</td>`; }
        if (c.kind === 'assessment') return `<td class="full" rowspan="6">Avaliação<span>${esc(tiposAv(c.p))}</span></td>`;
      }
      if (!slotsPorCol[k]) return '';
      const b = slotsPorCol[k][r];
      if (b.vazio) return '<td class="vz">—</td>';
      return `<td class="f" style="--c:${cor(b.pillar)}">${b.minutes ? `<em class="mn">${b.minutes}'</em>` : ''}${b.content ? `<b>${esc(b.content)}</b>` : ''}${b.title ? `<span>${esc(b.title)}</span>` : ''}</td>`;
    }).join('');
    return `<tr${r === 5 ? ' class="gk"' : ''}><th>${esc(nome)}</th>${tds}</tr>`;
  }).join('');
  const pe = cols.map((c) => {
    if (!c.p || c.p.type !== 'training') return '<td></td>';
    const km = c.primeiro && c.d.km != null ? `<small>${esc(F.dec1(c.d.km))} km</small>` : '';
    return `<td class="mn">${c.p.total ? `${c.p.total}'` : '—'}${c.p.goleiro ? `<small>+${c.p.goleiro}' gol</small>` : ''}${km}</td>`;
  }).join('');
  return `<table class="pl">${colgroup}<thead><tr><th rowspan="2" style="background:var(--team)"></th>${head1.join('')}</tr><tr class="sub">${head2.join('')}</tr></thead>`
    + `<tbody>${linhas}</tbody><tfoot><tr><th></th>${pe}</tr></tfoot></table>`;
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
  // a planilha pode ocupar mais de uma página (muitos dias com 2+ treinos): o resumo vai na última
  const pags = paginasDeDias(vm.days);
  const pages = onlyPhotos ? [] : pags.map((days, i) => C.page({
    header: i === 0 ? header : C.compactHeader({ team, reportName, subtitle: 'Programação (continuação)', right: vm.right }),
    subtitle: 'Programação',
    body: planilha(days) + (i === pags.length - 1 ? resumo(vm) : '<div class="cont">continua na próxima página →</div>'),
    foot,
  }));
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
