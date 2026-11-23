// Programação da semana (A4 paisagem): o resumo da tela Programação, não as estatísticas.
// 22–23/11/2026: mesma estrutura da planilha, no visual do estilo GRAMADO da tela (campo listrado, dias em placas brancas,
// período tracejado, cartões brancos, descanso/jogo tracejados sobre a grama, total em pílula).
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
.campo{flex:1;min-height:0;display:flex;border-radius:4.5mm;padding:2.6mm;
  background:repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 calc(100% / 14),transparent calc(100% / 14) calc(100% / 7)),linear-gradient(#2f8f4e,#1f7a3f);
  box-shadow:inset 0 0 0 .9mm rgba(255,255,255,.55);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{flex:1;min-height:0;display:grid;column-gap:1.8mm;row-gap:1.5mm}
.dh{background:rgba(255,255,255,.96);color:#10241A;border-radius:3mm;padding:1.6mm 2mm;text-align:center;box-shadow:0 .8mm 2mm -1mm rgba(0,0,0,.45)}
.dh b{display:block;font:800 8.6pt Poppins}
.dh span{font:600 7pt Inter;color:#4B6454}
.pr{border:1.3px dashed rgba(255,255,255,.75);border-radius:2.6mm;padding:1mm 1.6mm;text-align:center;font:700 7.2pt Poppins;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr.tr{background:#fef3c7;border:0;color:#713f12}
.slot{display:flex;min-width:0}
.slot > .cd{flex:1}
.cd{background:#fff;border-radius:3mm;padding:1.4mm 1.9mm 1.6mm;min-width:0;display:flex;flex-direction:column;gap:.5mm;box-shadow:0 1mm 2.4mm -1.5mm rgba(0,0,0,.5)}
.cd .ph{display:flex;justify-content:space-between;gap:1mm;font-size:6.3pt;color:#4B6454}
.cd .ph i{font-style:normal;font-weight:700;color:#10241A;font-size:7pt}
.cd .ct{font:700 7.6pt/1.2 Poppins;color:#10241A;display:flex;gap:1.2mm;align-items:baseline}
.cd .ct u{flex-shrink:0;width:1.9mm;height:1.9mm;border-radius:50%;background:var(--c);text-decoration:none;transform:translateY(-.2mm)}
.cd .tt{font-size:6.8pt;line-height:1.3;color:#4B6454;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.cd.vz{background:rgba(255,255,255,.7);box-shadow:none}
.cd.vz .ct{color:#7D9585;font:500 7pt Inter}
.cd.gk{background:#F1F6EF}
.big{border-radius:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1mm;padding:3mm 1.5mm;min-width:0;
  background:rgba(255,255,255,.12);border:1.6px dashed rgba(255,255,255,.75);color:#fff}
.big svg{width:7mm;height:7mm;color:#fff}
.big b{font:800 8.6pt Poppins;letter-spacing:.02em;color:#fff}
.big span{font-size:7.4pt;color:rgba(255,255,255,.92);line-height:1.3;overflow-wrap:anywhere}
.big small{font-size:6.6pt;color:rgba(255,255,255,.85)}
.big.av{background:#fff;border:0;box-shadow:0 1mm 2.4mm -1.5mm rgba(0,0,0,.5)}
.big.av svg,.big.av b{color:#10241A}
.big.av span{color:#4B6454}
.big.rest b{font:700 8.6pt Poppins;letter-spacing:0}
.big.none small{color:rgba(255,255,255,.8)}
.tot{background:rgba(255,255,255,.96);border-radius:999px;padding:1.1mm 1.4mm;display:flex;align-items:center;justify-content:center;gap:1.4mm;flex-wrap:wrap;font:800 7.8pt Poppins;color:#14532d}
.tot svg{width:3mm;height:3mm}
.tot small{font:500 6.5pt Inter;color:#4B6454}
.tot.z{opacity:.6}
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
    d.periodos.forEach((p, i) => cols.push({ d, p, primeiro: i === 0, n: d.periodos.length, kind: p.type, w: p.type === 'training' ? 1.25 : 0.95 }));
  }
  return cols;
}

// Divide os dias em páginas pelo "peso" das colunas (treino 1,25 · jogo/avaliação 0,95 · descanso 0,75),
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

// Ícones (traço do lucide, os mesmos da tela)
const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  trofeu: ic('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
  lua: ic('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  prancheta: ic('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  relogio: ic('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
};

function cartao(b) {
  if (b.vazio) return `<div class="cd vz"><div class="ph"><span>${esc(b.phase)}</span></div><div class="ct">—</div></div>`;
  return `<div class="cd${ehGoleiro(b) ? ' gk' : ''}"><div class="ph"><span>${esc(b.phase)}</span>${b.minutes ? `<i class="mn">${b.minutes}'</i>` : ''}</div>`
    + `${b.content ? `<div class="ct">${b.pillar ? `<u style="--c:${cor(b.pillar)}"></u>` : ''}<span>${esc(b.content)}</span></div>` : ''}`
    + `${b.title ? `<div class="tt">${esc(b.title)}</div>` : ''}</div>`;
}

// Grade no visual da tela Programação: cabeçalho verde por dia (abrange os períodos), faixa "Manhã · Tático",
// os 6 blocos como cartões alinhados em linhas (mesma linha = mesmo bloco em todos os treinos), jogo/avaliação/
// descanso num cartão grande, e o total de cada treino numa pílula no pé.
function planilha(days) {
  const cols = colunasDe(days);
  const tpl = cols.map((c) => `minmax(0,${c.w}fr)`).join(' ');
  const R = { dia: 1, per: 2, b0: 3, pe: 9 }; // linhas: dia, período, 6 blocos (3–8), total
  const at = (r, c, extra = '') => `style="grid-row:${r};grid-column:${c}${extra ? `;${extra}` : ''}"`;
  const out = [];
  cols.forEach((c, k) => {
    const col = k + 1;
    if (!c.p || c.primeiro) {
      const span = c.p ? c.n : 1;
      out.push(`<div class="dh" ${at(R.dia, `${col} / span ${span}`)}><b>${esc(c.d.dn.replace('-feira', ''))}</b><span>${esc(c.d.dd)}</span></div>`);
    }
    if (!c.p) {
      const corpo = c.kind === 'descanso'
        ? `<div class="big rest" ${at(`${R.per} / ${R.pe + 1}`, col)}>${IC.lua}<b>Descanso</b></div>`
        : `<div class="big none" ${at(`${R.per} / ${R.pe + 1}`, col)}><small>Sem registro</small></div>`;
      out.push(corpo);
      return;
    }
    const p = c.p;
    const tipo = p.type === 'match' ? 'Jogo' : p.type === 'assessment' ? 'Avaliação' : (p.transicao ? 'Transição' : (p.pillar || 'Treino'));
    const rot = p.type === 'training' ? [p.label, tipo].filter(Boolean).join(' · ') : (p.label || tipo);
    out.push(`<div class="pr${p.transicao ? ' tr' : ''}" ${at(R.per, col)}>${esc(rot)}</div>`);
    if (p.type === 'match') {
      const j = jogoTxt(p);
      out.push(`<div class="big jogo" ${at(`${R.b0} / ${R.pe}`, col)}>${IC.trofeu}<b>JOGO</b><span>vs ${esc(j.adv)}</span>${j.placar ? `<small>${esc(j.placar)}</small>` : ''}</div>`);
    } else if (p.type === 'assessment') {
      out.push(`<div class="big av" ${at(`${R.b0} / ${R.pe}`, col)}>${IC.prancheta}<b>AVALIAÇÃO</b><span>${esc(tiposAv(p))}</span></div>`);
    } else {
      seis(p.blocks).forEach((b, r) => out.push(`<div ${at(R.b0 + r, col)} class="slot">${cartao(b)}</div>`));
      const km = c.primeiro && Number(c.d.km) > 0 ? `<small>· ${esc(F.dec1(c.d.km))} km</small>` : '';
      out.push(`<div class="tot mn${p.total ? '' : ' z'}" ${at(R.pe, col)}>${IC.relogio}${p.total ? `${p.total} min` : '0 min'}${p.goleiro ? `<small>+${p.goleiro}′ gol</small>` : ''}${km}</div>`);
    }
  });
  return `<div class="campo"><div class="pg" style="grid-template-columns:${tpl};grid-template-rows:auto auto repeat(6,minmax(auto,1fr)) auto">${out.join('')}</div></div>`;
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
