// Análise do adversário (A4 paisagem), no formato dos slides que o dono mandou
// (Analise_Flamengo_Libertadores_2026.pptx): capa + uma página por seção PREENCHIDA.
// O que não foi preenchido não aparece (nem o título da seção, nem o campo).
// vm: buildOpponentAnalysis (builders.js). POST /api/reports/analise { session_id }.
const F = require('../format');
const C = require('./components');
const { vagasLivres } = require('../formacaoLivre');

const esc = F.esc;

const CSS = `
@page{size:A4 landscape;margin:0}
.page{width:297mm;height:210mm}
.body{padding:7mm 12mm 3mm;gap:4.5mm}
.cover{flex:1;display:flex;flex-direction:column;justify-content:center;gap:6mm;padding:0 6mm}
.cover .eyebrow{font:700 9pt Poppins;letter-spacing:.2em;text-transform:uppercase;color:var(--team-ink)}
.cover h1{font:800 34pt/1.05 Poppins;margin:0;color:var(--ink)}
.cover h2{font:600 15pt Poppins;margin:0;color:var(--ink-2)}
.cover .facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm;margin-top:4mm}
.cover .fact{border:1px solid var(--line);border-radius:3mm;padding:3.5mm 4mm}
.cover .fact .l{font:600 6.5pt Inter;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
.cover .fact .v{font:700 13pt Poppins;margin-top:1mm;color:var(--ink)}
.cover .foot{font-size:8.5pt;color:var(--muted)}
.cover .crests{display:flex;align-items:center;gap:4mm}
.ttl{display:flex;align-items:baseline;gap:3mm}
.ttl h2{font:700 21pt Poppins;margin:0;color:var(--ink)}
.ttl small{font-size:10pt;color:var(--muted)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4mm}
.g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3.5mm}
.box{border:1px solid var(--line);border-radius:3mm;padding:4.5mm 5mm;min-width:0}
.fill{flex:1;min-height:0}
.fill>.box{display:flex;flex-direction:column}
.box h3{font:700 12.5pt Poppins;margin:0 0 2.5mm;color:var(--ink);display:flex;align-items:center;gap:2mm}
.box h3 .tag{font:600 7.5pt Inter;text-transform:uppercase;letter-spacing:.08em;padding:.6mm 2mm;border-radius:5mm;background:var(--team-soft);color:var(--team-ink)}
.box.hl{background:var(--team-softer);border-color:var(--team-soft)}
.box.ok{border-left:1.4mm solid var(--win)}
.box.bad{border-left:1.4mm solid var(--loss)}
ul.it{margin:0;padding-left:5mm;font-size:11pt;line-height:1.45;color:var(--ink)}
ul.it li{margin:1.2mm 0}
ul.it li::marker{color:var(--team-bar)}
.big{font:800 34pt/1 Poppins;color:var(--ink)}
.kp{border:1px solid var(--line);border-radius:3mm;padding:3mm 3.5mm}
.kp .l{font:600 6.5pt Inter;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.kp .v{font:800 22pt/1.1 Poppins;margin-top:.8mm;color:var(--ink)}
.kp .s{font-size:7.5pt;color:var(--muted)}
.ult{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2.5mm}
.ult .u{border:1px solid var(--line);border-radius:2.5mm;padding:2.5mm;text-align:center}
.ult .u .r{display:inline-grid;place-items:center;width:6.5mm;height:6.5mm;border-radius:50%;color:#fff;font:700 8pt Poppins}
.ult .u .r.V{background:var(--win)}.ult .u .r.E{background:var(--draw)}.ult .u .r.D{background:var(--loss)}.ult .u .r.x{background:var(--faint)}
.ult .u .a{font-size:9.5pt;font-weight:600;margin-top:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ult .u .p{font:700 12pt Poppins}
.tb{width:100%;border-collapse:collapse;font-size:11pt}
.tb th{font:600 6.5pt Inter;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-align:center;padding:1.5mm;border-bottom:1px solid var(--line)}
.tb td{text-align:center;padding:1.8mm;border-bottom:1px solid var(--line-2)}
.tb td:first-child,.tb th:first-child{text-align:left}
.tb tr.tot td{font-weight:700}
.note{font-size:10pt;color:var(--ink-2);line-height:1.45}
.src{font-size:7pt;color:var(--muted);margin-top:auto}
.pitch{position:relative;background:repeating-linear-gradient(180deg,#2c6f33 0 10%,#34803f 10% 20%);border-radius:2.5mm;overflow:hidden}
.pitch svg{position:absolute;inset:0;width:100%;height:100%}
.pitch .pl{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:22%}
.pitch .dot{width:6.5mm;height:6.5mm;border-radius:50%;background:#fff;color:#0f172a;border:.5mm solid #0f172a;display:grid;place-items:center;font:800 8pt Poppins}
.pitch.mini .dot{width:3.8mm;height:3.8mm;border-width:.35mm}
.pitch .nm{margin-top:.6mm;background:rgba(15,23,42,.85);color:#fff;font:600 7pt Inter;padding:.3mm 1.6mm;border-radius:1mm;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fmt{font:800 16pt Poppins;color:var(--ink)}
.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm}
.steps .box h3 .n{display:inline-grid;place-items:center;width:6mm;height:6mm;border-radius:50%;background:var(--team);color:var(--on-team);font:700 8pt Poppins}
.opts{display:flex;flex-direction:column;gap:1.2mm;margin-bottom:2mm}
.opt{display:flex;align-items:center;gap:2.5mm;font-size:11pt;color:var(--muted)}
.opt i{width:4.8mm;height:4.8mm;border-radius:1mm;border:1px solid var(--line);display:grid;place-items:center;font-style:normal;font-size:7pt}
.opt.on{color:var(--ink);font-weight:700}
.opt.on i{background:var(--team);border-color:var(--team);color:var(--on-team)}
.opt .pre{font:600 6.5pt Inter;text-transform:uppercase;letter-spacing:.08em;color:var(--team-ink);background:var(--team-soft);padding:.4mm 1.6mm;border-radius:4mm}
.ind{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2.5mm;margin-top:2mm}
.ind h4{font:700 8pt Inter;text-transform:uppercase;letter-spacing:.08em;margin:0 0 1mm}
.ind .f h4{color:var(--win)}.ind .w h4{color:var(--loss)}.ind .n h4{color:var(--team-ink)}
.who{display:flex;align-items:center;gap:2.5mm}
.who .num{display:grid;place-items:center;width:11mm;height:11mm;border-radius:50%;background:var(--team);color:var(--on-team);font:800 10pt Poppins}
.who b{font:700 15pt Poppins}
.who span{font-size:8.5pt;color:var(--muted)}
.msg{border-radius:3mm;padding:5mm 6mm;background:var(--team);color:var(--on-team)}
.msg .l{font:700 7pt Inter;text-transform:uppercase;letter-spacing:.14em;opacity:.85}
.msg .t{font:700 17pt/1.3 Poppins;margin-top:1.5mm}
.fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm}
`;

const ul = (lista) => (lista && lista.length ? `<ul class="it">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const fonte = (vm, k) => (vm.fontes[k] ? `<div class="src">Fontes: ${esc(vm.fontes[k])}</div>` : '');
const titulo = (t, sub = '') => `<div class="ttl"><h2>${esc(t)}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;

// Campo com as vagas da formação (livre). jogadores: [{vaga, numero, nome}] ou null (só pontos).
function campo(formacao, jogadores = null, { mini = false, w = '100%', h = '100%' } = {}) {
  const vagas = vagasLivres(formacao);
  const porVaga = new Map((jogadores || []).map((j) => [j.vaga, j]));
  const pls = vagas.map((v) => {
    const j = porVaga.get(v.vaga);
    if (jogadores && !j) return '';
    const num = j?.numero != null ? String(j.numero) : '';
    return `<div class="pl" style="left:${v.x}%;top:${v.y}%"><div class="dot">${esc(mini ? '' : num)}</div>`
      + `${j && !mini ? `<div class="nm">${esc(j.nome)}</div>` : ''}</div>`;
  }).join('');
  const linhas = `<svg viewBox="0 0 68 105" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".4">
    <rect x="2" y="2" width="64" height="101"/><line x1="2" y1="52.5" x2="66" y2="52.5"/>
    <rect x="15.85" y="2" width="36.3" height="16.5"/><rect x="15.85" y="86.5" width="36.3" height="16.5"/></svg>`;
  return `<div class="pitch${mini ? ' mini' : ''}" style="width:${w};height:${h}">${linhas}${pls}</div>`;
}

function capa(vm) {
  const fatos = vm.fatos.map((f) => `<div class="fact"><div class="l">${esc(f.l)}</div><div class="v">${esc(f.v)}</div></div>`).join('');
  return `<div class="cover">
    <div class="crests">${C.crest(vm.team)}<div class="eyebrow">Análise de adversário</div></div>
    <h1>${esc(vm.adversario)}</h1>
    ${vm.subtitulo ? `<h2>${esc(vm.subtitulo)}</h2>` : ''}
    ${fatos ? `<div class="facts">${fatos}</div>` : ''}
    ${vm.capaRodape ? `<div class="foot">${esc(vm.capaRodape)}</div>` : ''}
  </div>`;
}

function campanha(vm) {
  const c = vm.a.campanha;
  const kps = [];
  if (c.situacao) kps.push(`<div class="kp" style="grid-column:span 2"><div class="l">Situação</div><div class="v" style="font-size:12pt">${esc(c.situacao)}</div></div>`);
  const ved = [c.vitorias, c.empates, c.derrotas];
  if (ved.some((n) => n !== null)) {
    kps.push(`<div class="kp"><div class="l">Campanha</div><div class="v">${ved.map((n, i) => (n !== null ? `${n}${'VED'[i]}` : null)).filter(Boolean).join(' ')}</div></div>`);
  }
  if (c.gols_pro !== null) kps.push(`<div class="kp"><div class="l">Gols pró</div><div class="v">${c.gols_pro}</div></div>`);
  if (c.gols_contra !== null) kps.push(`<div class="kp"><div class="l">Gols contra</div><div class="v">${c.gols_contra}</div></div>`);
  if (c.gols_pro !== null && c.gols_contra !== null) kps.push(`<div class="kp"><div class="l">Saldo</div><div class="v">${F.signed(c.gols_pro - c.gols_contra)}</div></div>`);
  if (c.posse !== null) kps.push(`<div class="kp"><div class="l">Posse média</div><div class="v">${c.posse}%</div></div>`);
  const ult = c.ultimos.length ? `<div class="box"><h3>Últimos jogos</h3><div class="ult" style="grid-template-columns:repeat(${Math.min(c.ultimos.length, 5)},minmax(0,1fr))">${c.ultimos.slice(0, 10).map((u) => `<div class="u">`
    + `<span class="r ${esc(u.resultado || 'x')}">${esc(u.resultado || '·')}</span><div class="a">${esc(u.adversario)}${u.mando ? ` (${esc(u.mando)})` : ''}</div>`
    + `<div class="p">${esc(u.placar)}</div></div>`).join('')}</div></div>` : '';
  const linhas = [['Casa', c.casa], ['Fora', c.fora]].filter(([, t]) => Object.values(t).some((v) => v !== null));
  let tabela = '';
  if (linhas.length) {
    const cel = (v) => (v === null ? '—' : v);
    const tot = linhas.length === 2 ? Object.fromEntries(['j', 'v', 'e', 'd', 'gp', 'gc'].map((k) => [k, (c.casa[k] ?? 0) + (c.fora[k] ?? 0)])) : null;
    const tr = (n, t, cls = '') => `<tr class="${cls}"><td>${n}</td>${['j', 'v', 'e', 'd', 'gp', 'gc'].map((k) => `<td>${cel(t[k])}</td>`).join('')}</tr>`;
    tabela = `<div class="box"><h3>Desempenho</h3><table class="tb"><thead><tr><th></th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th></tr></thead>
      <tbody>${linhas.map(([n, t]) => tr(n, t)).join('')}${tot ? tr('Total', tot, 'tot') : ''}</tbody></table></div>`;
  }
  return titulo('Campanha')
    + (kps.length ? `<div class="g4">${kps.join('')}</div>` : '')
    + (ult || tabela ? `<div class="${ult && tabela ? 'g2' : ''}">${ult}${tabela}</div>` : '')
    + (c.observacao ? `<div class="note">${esc(c.observacao)}</div>` : '')
    + fonte(vm, 'campanha');
}

function sistema(vm) {
  const s = vm.a.sistema;
  const esquerda = `<div style="display:flex;flex-direction:column;gap:3mm;min-width:0">
    ${s.formacao ? `<div><div class="big">${esc(s.formacao)}</div>${s.descricao ? `<div class="note" style="margin-top:1mm">${esc(s.descricao)}</div>` : ''}</div>`
      : (s.descricao ? `<div class="note">${esc(s.descricao)}</div>` : '')}
    ${s.com_bola.length ? `<div class="box"><h3>Com bola</h3>${ul(s.com_bola)}</div>` : ''}
    ${s.sem_bola.length ? `<div class="box"><h3>Sem bola</h3>${ul(s.sem_bola)}</div>` : ''}</div>`;
  const temCampo = s.formacao && vagasLivres(s.formacao).length > 1;
  return titulo('Sistema inicial')
    + `<div style="display:grid;grid-template-columns:${temCampo ? '1fr 78mm' : '1fr'};gap:6mm;flex:1;min-height:0">${esquerda}`
    + `${temCampo ? `<div style="display:flex;justify-content:center">${campo(s.formacao, null, { w: '78mm', h: '120mm' })}</div>` : ''}</div>`
    + fonte(vm, 'sistema');
}

function variacoes(vm) {
  const vs = vm.a.variacoes;
  const card = (v) => `<div class="box" style="display:flex;flex-direction:column;gap:2mm">
    ${v.fase ? `<h3><span class="tag">${esc(v.fase)}</span></h3>` : ''}
    ${v.formacao ? `<div class="fmt">${esc(v.formacao)}</div>` : ''}
    ${v.formacao && vagasLivres(v.formacao).length > 1 ? `<div style="display:flex;justify-content:center">${campo(v.formacao, null, { mini: true, w: '44mm', h: '68mm' })}</div>` : ''}
    ${v.quando ? `<div class="note"><b>Quando:</b> ${esc(v.quando)}</div>` : ''}${ul(v.itens)}</div>`;
  return titulo('Variações do sistema')
    + `<div class="g${Math.min(Math.max(vs.length, 2), 3)} fill">${vs.map(card).join('')}</div>` + fonte(vm, 'variacoes');
}

function escalacao(vm) {
  const e = vm.a.escalacao;
  const temCampo = e.jogadores.length && vagasLivres(e.formacao).length > 1;
  const lado = [
    e.banco.length ? `<div class="box"><h3>Opções no banco</h3>${ul(e.banco)}</div>` : '',
    e.desfalques.length ? `<div class="box bad"><h3>Desfalques</h3>${ul(e.desfalques)}</div>` : '',
    e.duvidas.length ? `<div class="box"><h3>Dúvidas</h3>${ul(e.duvidas)}</div>` : '',
    // jogadores sem campo (formação não informada): lista
    e.jogadores.length && !temCampo ? `<div class="box"><h3>Titulares</h3>${ul(e.jogadores.map((j) => `${j.numero != null ? `${j.numero} ` : ''}${j.nome}`))}</div>` : '',
  ].filter(Boolean).join('');
  return titulo('Provável escalação', e.formacao || '')
    + `<div style="display:grid;grid-template-columns:${temCampo ? '92mm 1fr' : '1fr'};gap:6mm;flex:1;min-height:0">`
    + `${temCampo ? campo(e.formacao, e.jogadores, { w: '92mm', h: '140mm' }) : ''}`
    + `<div style="display:flex;flex-direction:column;gap:3mm;min-width:0">${lado}${e.observacao ? `<div class="note">${esc(e.observacao)}</div>` : ''}</div></div>`
    + fonte(vm, 'escalacao');
}

const ROT_BLOCO = { alto: 'Bloco alto', medio: 'Bloco médio', baixo: 'Bloco baixo' };
const ROT_FREQ = { predominante: 'Predominante', frequente: 'Frequente', pontual: 'Pontual', raro: 'Raro' };
function defesa(vm) {
  const d = vm.a.defesa;
  const blocos = ['alto', 'medio', 'baixo'].filter((b) => d[b].frequencia || d[b].itens.length);
  return titulo('Como defendem')
    + `<div class="g${Math.max(blocos.length, 2)} fill">${blocos.map((b) => `<div class="box${d[b].frequencia === 'predominante' ? ' hl' : ''}">`
      + `<h3>${ROT_BLOCO[b]}${d[b].frequencia ? ` <span class="tag">${ROT_FREQ[d[b].frequencia]}</span>` : ''}</h3>${ul(d[b].itens)}</div>`).join('')}</div>`
    + fonte(vm, 'defesa');
}

const ROT_FASE = { construcao: 'Construção', segunda_fase: '2ª fase de construção', criacao: 'Criação', finalizacao: 'Finalização' };
function ataque(vm) {
  const a = vm.a.ataque;
  const fases = Object.keys(ROT_FASE).filter((f) => a[f].length);
  return titulo('Como jogam com bola')
    + `<div class="steps fill" style="grid-template-columns:repeat(${fases.length},minmax(0,1fr))">${fases.map((f, i) => `<div class="box">`
      + `<h3><span class="n">${i + 1}</span>${ROT_FASE[f]}</h3>${ul(a[f])}</div>`).join('')}</div>`
    + fonte(vm, 'ataque');
}

const OPC_PERDER = [['pressionam', 'Pressionam (contrapressão)'], ['temporizam', 'Temporizam'], ['recuam', 'Recuam e recompõem o bloco']];
const OPC_RECUPERAR = [['verticais', 'Passes verticais (contra-ataque)'], ['laterais', 'Passes laterais'], ['tras', 'Passes para trás (retêm a posse)']];
function transicoes(vm) {
  const t = vm.a.transicoes;
  const lado = (rot, o, opcoes) => {
    if (!o.comportamento && !o.itens.length) return '';
    const ops = o.comportamento ? `<div class="opts">${opcoes.map(([k, r]) => `<div class="opt${o.comportamento === k ? ' on' : ''}">`
      + `<i>${o.comportamento === k ? '✓' : ''}</i>${esc(r)}${o.comportamento === k ? ' <span class="pre">Predominante</span>' : ''}</div>`).join('')}</div>` : '';
    return `<div class="box"><h3>${esc(rot)}</h3>${ops}${ul(o.itens)}</div>`;
  };
  return titulo('Transições')
    + `<div class="g2 fill">${lado('Quando perdem a bola', t.perder, OPC_PERDER)}${lado('Quando roubam a bola', t.recuperar, OPC_RECUPERAR)}</div>`
    + fonte(vm, 'transicoes');
}

function individuo(p) {
  const col = (cls, rot, l) => (l.length ? `<div class="${cls}"><h4>${rot}</h4>${ul(l)}</div>` : '');
  const cols = [col('f', 'Pontos fortes', p.fortes), col('w', 'Pontos fracos', p.fracos), col('n', 'Como neutralizar', p.neutralizar)].filter(Boolean);
  return `<div class="box"><div class="who"><div class="num">${p.numero != null ? esc(p.numero) : '·'}</div>`
    + `<div><b>${esc(p.nome)}</b>${p.posicao ? ` <span>· ${esc(p.posicao)}</span>` : ''}${p.destaque ? `<div class="note">${esc(p.destaque)}</div>` : ''}</div></div>`
    + `${cols.length ? `<div class="ind" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))">${cols.join('')}</div>` : ''}</div>`;
}

function bpOfensiva(vm) {
  const b = vm.a.bp_ofensiva;
  const cards = [['escanteios', 'Escanteios'], ['faltas', 'Faltas'], ['laterais', 'Laterais'], ['penaltis', 'Pênaltis']].filter(([k]) => b[k].length);
  return titulo('Bolas paradas ofensivas')
    + (b.resumo ? `<div class="box hl note">${esc(b.resumo)}</div>` : '')
    + (cards.length ? `<div class="g${Math.max(cards.length, 2)} fill">${cards.map(([k, r]) => `<div class="box"><h3>${r}</h3>${ul(b[k])}</div>`).join('')}</div>` : '')
    + fonte(vm, 'bp_ofensiva');
}

function bpDefensiva(vm) {
  const b = vm.a.bp_defensiva;
  const campos = [['Marcação', b.marcacao], ['Homens na área', b.homens_area], ['Jogador na trave', b.trave], ['Barreira', b.barreira]]
    .filter(([, v]) => v !== null && v !== '');
  return titulo('Bolas paradas defensivas')
    + (campos.length ? `<div class="fields">${campos.map(([l, v]) => `<div class="kp"><div class="l">${l}</div><div class="v" style="font-size:12pt">${esc(v)}</div></div>`).join('')}</div>` : '')
    + `<div class="g2 fill">${b.contra_ataque ? `<div class="box"><h3>Quem fica na frente</h3><div class="note">${esc(b.contra_ataque)}</div></div>` : ''}`
    + `${b.goleiro.length ? `<div class="box"><h3>Goleiro</h3>${ul(b.goleiro)}</div>` : ''}${b.itens.length ? `<div class="box"><h3>Observações</h3>${ul(b.itens)}</div>` : ''}</div>`
    + fonte(vm, 'bp_defensiva');
}

function pontos(vm) {
  const p = vm.a.pontos;
  return titulo('Pontos positivos e pontos a explorar')
    + `<div class="g2 fill">${p.positivos.length ? `<div class="box ok"><h3>Pontos positivos</h3><div class="note" style="margin-bottom:1.5mm">O que fazem bem e precisa ser neutralizado</div>${ul(p.positivos)}</div>` : ''}`
    + `${p.explorar.length ? `<div class="box bad"><h3>Pontos a explorar</h3><div class="note" style="margin-bottom:1.5mm">Fragilidades que podem ser atacadas</div>${ul(p.explorar)}</div>` : ''}</div>`
    + fonte(vm, 'pontos');
}

function final(vm) {
  const f = vm.a.final;
  return titulo('Observações finais')
    + (f.observacoes.length ? `<div class="box">${ul(f.observacoes)}</div>` : '')
    + (f.mensagem ? `<div class="msg"><div class="l">Mensagem principal para o jogo</div><div class="t">${esc(f.mensagem)}</div></div>` : '')
    + fonte(vm, 'final');
}

const SECOES = {
  campanha, sistema, variacoes, escalacao, defesa, ataque, transicoes, bp_ofensiva: bpOfensiva, bp_defensiva: bpDefensiva, pontos, final,
};
const SUBTITULO = {
  campanha: 'Campanha', sistema: 'Sistema', variacoes: 'Variações', escalacao: 'Escalação', defesa: 'Defesa', ataque: 'Ataque',
  transicoes: 'Transições', individuais: 'Individual', bp_ofensiva: 'Bolas paradas', bp_defensiva: 'Bolas paradas', pontos: 'Pontos', final: 'Observações',
};

function renderAnalise(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Análise do adversário';
  const cab = (sub) => C.compactHeader({ team, reportName, subtitle: sub, right: vm.right });
  const pages = [C.page({ header: '', subtitle: 'Capa', body: capa(vm), foot })];
  for (const k of vm.secoes) {
    if (k === 'individuais') {
      // 2 jogadores por página, como nos slides
      const ps = vm.a.individuais;
      for (let i = 0; i < ps.length; i += 2) {
        const parte = ps.length > 2 ? ` (${i / 2 + 1}/${Math.ceil(ps.length / 2)})` : '';
        pages.push(C.page({ header: cab(SUBTITULO[k]), subtitle: SUBTITULO[k],
          body: titulo(`Análise individual${parte}`) + `<div class="g2 fill">${ps.slice(i, i + 2).map(individuo).join('')}</div>` + fonte(vm, 'individuais'), foot }));
      }
      continue;
    }
    pages.push(C.page({ header: cab(SUBTITULO[k]), subtitle: SUBTITULO[k], body: SECOES[k](vm), foot }));
  }
  const html = C.documentHtml({ title: `${reportName} · ${vm.adversario}`, palette: team.palette, pages, contHeader: cab(''), foot });
  const at = html.indexOf('<style>:root{');
  const pos = at >= 0 ? at : html.indexOf('</head>');
  return html.slice(0, pos) + `<style>${CSS}</style>` + html.slice(pos);
}

module.exports = { renderAnalise };
