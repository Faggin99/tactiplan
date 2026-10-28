// Análise do adversário como "deck" de slides 16:9 (33,867 × 19,05 cm), no desenho do modelo do dono
// (Analise_Flamengo_Libertadores_2026.pptx, feito no PptxGenJS): capa verde-escura, título grande verde,
// cartões cinza-esverdeados com bolinha colorida, campinho com faixas e jogadores em círculo.
//
// O deck é uma lista de slides com ELEMENTOS SIMPLES em centímetros (caixa, texto, círculo, linha, imagem,
// vídeo). Dois pintores leem o MESMO deck: analiseHtml.js (PDF pelo Chromium) e analisePptx.js
// (PowerPoint, com os vídeos embutidos). Assim o PDF e o PowerPoint saem iguais.
//
// Elementos (x, y, w, h em cm):
//   { t:'box', x,y,w,h, fill, line?, raio? }                    caixa
//   { t:'text', x,y,w,h, txt | bullets[], size, bold?, color, align?, valign?, font? }
//   { t:'circ', x,y,d, fill, txt?, size?, color?, bold? }        círculo (com texto no meio)
//   { t:'line', x1,y1,x2,y2, color, w }                          linha
//   { t:'img', x,y,w,h, key }                                    imagem (key em vm.imagens)
//   { t:'video', x,y,w,h, key }                                  vídeo (só PowerPoint; key em vm.videos)
//   { ..., so: 'pdf' | 'pptx' }                                  só num dos formatos
const { vagasLivres } = require('./formacaoLivre');
const AA = require('../services/analiseAdversario');

const W = 33.867;
const H = 19.05;
// Paleta do modelo (tema do .pptx do dono)
const C = {
  escuro: '0B3D2E', // tx2: títulos, capa
  claro: 'EEF3F0', // bg2: cartões
  verde: '1F7A4D', // accent1
  amarelo: 'F2C14E', // accent2
  vermelho: 'C8553D', // accent3
  azul: '2E86AB', // accent4
  cinza: '5F6B66', // accent5: textos de apoio
  verdeClaro: 'A3C9A8', // accent6: rótulos da capa
  texto: '1A1A1A',
  branco: 'FFFFFF',
  campo: '1F7A4D',
  campoFaixa: '1A6B43',
  destaque: 'DCEBDF',
};

const M = 1.5; // margem lateral
const LARG = W - 2 * M; // 30,867
const TOPO = 3.3; // onde começa o conteúdo
const ALT = 14.1; // altura do conteúdo (até 17,4)

const box = (x, y, w, h, fill, extra = {}) => ({ t: 'box', x, y, w, h, fill, ...extra });
const text = (x, y, w, h, txt, size, extra = {}) => ({ t: 'text', x, y, w, h, txt, size, color: C.texto, ...extra });
const bullets = (x, y, w, h, lista, size = 15, extra = {}) => ({ t: 'text', x, y, w, h, bullets: lista, size, color: C.texto, ...extra });
const circ = (x, y, d, fill, extra = {}) => ({ t: 'circ', x, y, d, fill, ...extra });

/** Cartão cinza-esverdeado com bolinha + título (como no modelo). Devolve [elementos, yDoConteudo]. */
function cartao(x, y, w, h, titulo, { cor = C.verde, fill = C.claro, tag = null, corTag = C.amarelo } = {}) {
  const els = [box(x, y, w, h, fill, { raio: 0.25 })];
  let yc = y + 0.5;
  if (titulo) {
    els.push(circ(x + 0.5, y + 0.55, 0.85, cor));
    els.push(text(x + 1.6, y + 0.45, w - 2.1, 1.05, titulo, 16, { bold: true, color: C.escuro, valign: 'middle' }));
    yc = y + 1.8;
  }
  if (tag) {
    const tw = Math.min(w - 1, 0.24 * tag.length + 1.2);
    els.push(box(x + w - tw - 0.5, y + 0.55, tw, 0.8, corTag, { raio: 0.4 }));
    els.push(text(x + w - tw - 0.5, y + 0.55, tw, 0.8, tag.toUpperCase(), 9, { bold: true, color: C.escuro, align: 'center', valign: 'middle' }));
  }
  return [els, yc];
}

/** Campinho com faixas, linhas brancas e as vagas da formação. jogadores: [{vaga, numero, nome}] ou null (só pontos). */
function campo(x, y, w, h, formacao, jogadores = null) {
  const els = [box(x, y, w, h, C.campo, { raio: 0.2 })];
  const faixas = 10;
  for (let i = 1; i < faixas; i += 2) els.push(box(x, y + (i * h) / faixas, w, h / faixas, C.campoFaixa));
  const lw = 0.03 * w; // inset das linhas
  const L = 'FFFFFF';
  els.push(box(x + lw, y + lw, w - 2 * lw, h - 2 * lw, null, { line: L }));
  els.push({ t: 'line', x1: x + lw, y1: y + h / 2, x2: x + w - lw, y2: y + h / 2, color: L, w: 1 });
  const cd = w * 0.27;
  els.push(circ(x + w / 2 - cd / 2, y + h / 2 - cd / 2, cd, null, { line: L }));
  const aw = w * 0.53;
  const ah = h * 0.157;
  els.push(box(x + (w - aw) / 2, y + lw, aw, ah, null, { line: L }));
  els.push(box(x + (w - aw) / 2, y + h - lw - ah, aw, ah, null, { line: L }));
  const vagas = vagasLivres(formacao);
  if (vagas.length <= 1) return els;
  const porVaga = new Map((jogadores || []).map((j) => [j.vaga, j]));
  for (const v of vagas) {
    const cx = x + (v.x / 100) * w;
    const cy = y + (v.y / 100) * h;
    if (!jogadores) {
      const d = Math.min(0.75, w * 0.11);
      els.push(circ(cx - d / 2, cy - d / 2, d, C.amarelo));
      continue;
    }
    const j = porVaga.get(v.vaga);
    if (!j) continue;
    const d = Math.min(0.95, w * 0.105);
    els.push(circ(cx - d / 2, cy - d / 2 - 0.25, d, C.vermelho, { txt: j.numero != null ? String(j.numero) : '', size: 11, bold: true, color: C.branco }));
    const nw = Math.min(2.9, w * 0.25);
    els.push(box(cx - nw / 2, cy + d / 2 - 0.15, nw, 0.6, C.escuro, { raio: 0.1 }));
    els.push(text(cx - nw / 2, cy + d / 2 - 0.15, nw, 0.6, j.nome, 8, { bold: true, color: C.branco, align: 'center', valign: 'middle' }));
  }
  return els;
}

/** Escudo (imagem) ou um círculo com as iniciais. */
function escudo(x, y, d, chave, nome, imagens, { fill = C.amarelo, cor = C.escuro } = {}) {
  if (chave && imagens[chave]) return [{ t: 'img', x, y, w: d, h: d, key: chave }];
  const ini = String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return [circ(x, y, d, fill, { txt: ini, size: Math.round(d * 11), bold: true, color: cor })];
}

// Cabeçalho dos slides de conteúdo: título grande + "Clube × Adversário" com os dois escudos (pedido de 28/10).
function cromo(vm, titulo, sub, secao) {
  const els = [text(M, 0.9, 20.5, 1.6, titulo, 30, { bold: true, color: C.escuro, valign: 'middle', font: 'titulo' })];
  if (sub) els.push(text(M, 2.45, 22, 0.7, sub, 12, { color: C.cinza }));
  els.push(text(22.4, 0.95, 8.1, 0.6, 'ADVERSÁRIO', 9, { bold: true, color: C.cinza, align: 'right' }));
  els.push(text(22.4, 1.5, 8.1, 0.9, vm.adversario, 15, { bold: true, color: C.escuro, align: 'right', valign: 'middle', font: 'titulo' }));
  els.push(...escudo(30.85, 0.85, 1.6, 'adversario', vm.adversario, vm.imagens));
  const xb = 23.6;
  const nv = (vm.videosPorSecao[secao] || []).length;
  if (nv) {
    els.push(box(xb + 1.9, 2.55, 7.1, 0.65, C.claro, { raio: 0.3, so: 'pdf' }));
    els.push(text(xb + 1.9, 2.55, 7.1, 0.65, `▶ ${nv} ${nv === 1 ? 'vídeo' : 'vídeos'} na versão PowerPoint`, 9, { color: C.verde, bold: true, align: 'center', valign: 'middle', so: 'pdf' }));
  }
  return els;
}

const rodape = (vm, n, chaveFonte) => {
  const els = [text(W - 3, H - 1.15, 1.5, 0.6, String(n), 10, { color: C.cinza, align: 'right' })];
  if (chaveFonte && vm.fontes[chaveFonte]) els.push(text(M, H - 1.15, 26, 0.6, `Fontes: ${vm.fontes[chaveFonte]}`, 9, { color: C.cinza }));
  return els;
};

// Distribui n colunas em `larg` com espaço `gap`.
function colunas(n, x0 = M, larg = LARG, gap = 0.6) {
  const w = (larg - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
}

// ---------------------------------------------------------------- slides

function capa(vm) {
  const els = [];
  els.push(text(2.0, 3.6, 21, 1.1, 'ANÁLISE DE ADVERSÁRIO', 12, { bold: true, color: C.verdeClaro, font: 'titulo' }));
  els.push(text(2.0, 4.6, 21, 3.4, vm.adversario, vm.adversario.length > 22 ? 40 : 48, { bold: true, color: C.branco, valign: 'middle', font: 'titulo' }));
  if (vm.subtitulo) els.push(text(2.0, 8.2, 21, 1.6, vm.subtitulo, 22, { color: C.amarelo, valign: 'middle' }));
  const fatos = vm.fatos.slice(0, 4);
  colunas(fatos.length || 1, 2.0, 20.3, 0.2).forEach((c, i) => {
    const f = fatos[i];
    if (!f) return;
    els.push(box(c.x, 12.1, c.w, 0.75, C.verdeClaro));
    els.push(text(c.x + 0.25, 12.1, c.w - 0.5, 0.75, f.l.toUpperCase(), 10, { bold: true, color: C.escuro, valign: 'middle' }));
    els.push(text(c.x + 0.25, 12.95, c.w - 0.5, 1.6, f.v, 14, { color: C.branco, valign: 'top' }));
  });
  if (vm.capaRodape) els.push(text(2.0, 16.0, 20.3, 0.9, vm.capaRodape, 12, { color: C.verdeClaro, valign: 'middle' }));
  // à direita: o escudo do adversário grande e o nosso menor ("Clube × Adversário")
  els.push(box(24.4, 2.0, 7.9, 15.0, null, { line: C.verdeClaro, raio: 0.3 }));
  els.push(...escudo(25.35, 3.0, 6.0, 'adversario', vm.adversario, vm.imagens));
  els.push(text(24.4, 9.35, 7.9, 0.9, vm.adversario, 15, { bold: true, color: C.branco, align: 'center', valign: 'middle' }));
  els.push(text(24.4, 10.4, 7.9, 0.9, '×', 22, { bold: true, color: C.amarelo, align: 'center', valign: 'middle' }));
  els.push(...escudo(26.85, 11.5, 3.0, 'nosso', vm.nossoNome, vm.imagens, { fill: C.branco, cor: C.escuro }));
  els.push(text(24.4, 14.8, 7.9, 0.9, vm.nossoNome, 13, { bold: true, color: C.branco, align: 'center', valign: 'middle' }));
  return { fundo: C.escuro, els };
}

function campanha(vm, n) {
  const c = vm.a.campanha;
  const els = cromo(vm, 'Campanha', c.situacao, 'campanha');
  const kpis = [];
  const ved = [c.vitorias, c.empates, c.derrotas];
  if (ved.some((x) => x !== null)) kpis.push({ v: ved.map((x, i) => (x !== null ? `${x}${'VED'[i]}` : null)).filter(Boolean).join(' '), l: 'Campanha', cor: C.escuro });
  if (c.gols_pro !== null) kpis.push({ v: String(c.gols_pro), l: 'Gols pró', cor: C.verde });
  if (c.gols_contra !== null) kpis.push({ v: String(c.gols_contra), l: 'Gols contra', cor: C.vermelho });
  if (c.gols_pro !== null && c.gols_contra !== null) {
    const s = c.gols_pro - c.gols_contra;
    kpis.push({ v: s > 0 ? `+${s}` : String(s), l: 'Saldo de gols', cor: C.escuro });
  }
  if (c.posse !== null) kpis.push({ v: `${c.posse}%`, l: 'Posse média', cor: C.verde });
  let y = TOPO;
  if (kpis.length) {
    colunas(kpis.length).forEach((col, i) => {
      const k = kpis[i];
      els.push(box(col.x, y, col.w, 3.6, C.claro, { raio: 0.25 }));
      els.push(text(col.x + 0.45, y + 0.25, col.w - 0.9, 2.0, k.v, k.v.length > 8 ? 26 : 34, { bold: true, color: k.cor, valign: 'middle', font: 'titulo' }));
      els.push(text(col.x + 0.45, y + 2.4, col.w - 0.9, 0.9, k.l, 12, { color: C.cinza }));
    });
    y += 4.3;
  }
  const temTabela = ['casa', 'fora'].some((k) => Object.values(c[k]).some((v) => v !== null));
  const blocos = [];
  if (c.ultimos.length) blocos.push('ultimos');
  if (temTabela || c.observacao) blocos.push('tabela');
  const h = TOPO + ALT - y;
  colunas(Math.max(blocos.length, 1)).forEach((col, i) => {
    const b = blocos[i];
    if (b === 'ultimos') {
      const ult = c.ultimos.slice(-5);
      const [e, yc] = cartao(col.x, y, col.w, h, `Últimos ${ult.length} jogos`);
      els.push(...e);
      colunas(ult.length, col.x + 0.4, col.w - 0.8, 0.25).forEach((uc, j) => {
        const u = ult[j];
        const cor = u.resultado === 'V' ? C.verde : u.resultado === 'D' ? C.vermelho : u.resultado === 'E' ? C.amarelo : C.cinza;
        const d = Math.min(1.8, uc.w * 0.8);
        els.push(circ(uc.x + (uc.w - d) / 2, yc + 0.2, d, cor, { txt: u.resultado || '·', size: 18, bold: true, color: u.resultado === 'E' ? C.escuro : C.branco }));
        els.push(text(uc.x, yc + d + 0.35, uc.w, 1.0, `${u.adversario}${u.mando ? ` (${u.mando})` : ''}`, 10, { bold: true, align: 'center' }));
        els.push(text(uc.x, yc + d + 1.35, uc.w, 0.7, u.placar, 12, { color: C.cinza, align: 'center' }));
      });
      els.push(text(col.x + 0.5, y + h - 1.0, col.w - 1, 0.7, 'Mais antigo → mais recente · placar do adversário primeiro', 9.5, { color: C.cinza }));
    } else if (b === 'tabela') {
      const [e, yc] = cartao(col.x, y, col.w, h, temTabela ? 'Desempenho e gols' : 'Observação', { cor: C.verde });
      els.push(...e);
      let yt = yc;
      if (temTabela) {
        const cols = ['', 'J', 'V', 'E', 'D', 'GP', 'GC'];
        const cw = (col.w - 1) / 7.6;
        const xs = cols.map((_, k) => col.x + 0.5 + (k === 0 ? 0 : 1.6 * cw + (k - 1) * cw));
        cols.forEach((t, k) => els.push(text(xs[k], yt, k === 0 ? 1.6 * cw : cw, 0.7, t, 10, { bold: true, color: C.cinza, align: k ? 'center' : 'left' })));
        yt += 0.8;
        const linhas = [['Casa', c.casa], ['Fora', c.fora]].filter(([, t]) => Object.values(t).some((v) => v !== null));
        if (linhas.length === 2) linhas.push(['Total', Object.fromEntries(['j', 'v', 'e', 'd', 'gp', 'gc'].map((k) => [k, (c.casa[k] ?? 0) + (c.fora[k] ?? 0)]))]);
        for (const [nome, t] of linhas) {
          els.push({ t: 'line', x1: col.x + 0.5, y1: yt, x2: col.x + col.w - 0.5, y2: yt, color: 'D5DFD9', w: 0.75 });
          const vals = [nome, t.j, t.v, t.e, t.d, t.gp, t.gc].map((v) => (v === null || v === undefined ? '—' : String(v)));
          vals.forEach((v, k) => els.push(text(xs[k], yt + 0.1, k === 0 ? 1.6 * cw : cw, 0.8, v, 13, { bold: nome === 'Total', align: k ? 'center' : 'left', valign: 'middle' })));
          yt += 0.95;
        }
        yt += 0.3;
      }
      if (c.observacao) els.push(text(col.x + 0.5, yt, col.w - 1, y + h - yt - 0.4, c.observacao, 11, { color: C.cinza }));
    }
  });
  return { els: [...els, ...rodape(vm, n, 'campanha')] };
}

function sistema(vm, n) {
  const s = vm.a.sistema;
  const lados = [['ofensivo', 'Ofensivo', C.verde], ['defensivo', 'Defensivo', C.escuro]]
    .filter(([k]) => s[k].formacao || s[k].descricao || s[k].itens.length);
  const els = cromo(vm, 'Sistema inicial', null, 'sistema');
  colunas(lados.length, M, LARG, 0.8).forEach((col, i) => {
    const [k, rot, cor] = lados[i];
    const l = s[k];
    const temCampo = vagasLivres(l.formacao).length > 1;
    const pw = temCampo ? Math.min(col.w * 0.45, 9.1) : 0;
    const ph = pw / 0.648;
    if (temCampo) els.push(...campo(col.x, TOPO, pw, Math.min(ph, ALT), l.formacao));
    const cx = col.x + (temCampo ? pw + 0.5 : 0);
    const cw = col.w - (temCampo ? pw + 0.5 : 0);
    const [e, yc] = cartao(cx, TOPO, cw, ALT, rot, { cor });
    els.push(...e);
    let y = yc;
    if (l.formacao) { els.push(text(cx + 0.5, y, cw - 1, 2.0, l.formacao, 40, { bold: true, color: C.escuro, valign: 'middle', font: 'titulo' })); y += 2.1; }
    if (l.descricao) { els.push(text(cx + 0.5, y, cw - 1, 1.2, l.descricao, 12, { color: C.cinza })); y += 1.3; }
    if (l.itens.length) els.push(bullets(cx + 0.5, y, cw - 1, TOPO + ALT - y - 0.4, l.itens, 15));
  });
  return { els: [...els, ...rodape(vm, n, 'sistema')] };
}

function variacoes(vm, n, parte) {
  const vs = parte;
  const els = cromo(vm, 'Variações do sistema', null, 'variacoes');
  colunas(vs.length).forEach((col, i) => {
    const v = vs[i];
    const [e, yc] = cartao(col.x, TOPO, col.w, ALT, null);
    els.push(...e);
    let y = TOPO + 0.5;
    if (v.fase) {
      const tw = Math.min(col.w - 1, 0.25 * v.fase.length + 1.2);
      els.push(box(col.x + 0.5, y, tw, 0.8, C.verdeClaro, { raio: 0.4 }));
      els.push(text(col.x + 0.5, y, tw, 0.8, v.fase.toUpperCase(), 9, { bold: true, color: C.escuro, align: 'center', valign: 'middle' }));
      y += 1.1;
    }
    if (v.formacao) { els.push(text(col.x + 0.5, y, col.w - 1, 1.5, v.formacao, 30, { bold: true, color: C.escuro, valign: 'middle', font: 'titulo' })); y += 1.6; }
    if (v.formacao && vagasLivres(v.formacao).length > 1) {
      const ph = 6.4;
      const pw = ph * 0.648;
      els.push(...campo(col.x + (col.w - pw) / 2, y, pw, ph, v.formacao));
      y += ph + 0.4;
    }
    if (v.quando) { els.push(text(col.x + 0.5, y, col.w - 1, 1.1, `Quando: ${v.quando}`, 11, { color: C.cinza })); y += 1.15; }
    if (v.itens.length) els.push(bullets(col.x + 0.5, y, col.w - 1, TOPO + ALT - y - 0.3, v.itens, 14));
    void yc;
  });
  return { els: [...els, ...rodape(vm, n, 'variacoes')] };
}

function escalacao(vm, n) {
  const e = vm.a.escalacao;
  const els = cromo(vm, 'Provável escalação', [e.formacao, e.observacao].filter(Boolean).join(' · '), 'escalacao');
  const temCampo = e.jogadores.length && vagasLivres(e.formacao).length > 1;
  let x0 = M;
  if (temCampo) {
    els.push(...campo(M, TOPO, 9.1, ALT, e.formacao, e.jogadores));
    x0 = M + 9.7;
  }
  const cards = [];
  if (!temCampo && e.jogadores.length) cards.push(['Titulares', e.jogadores.map((j) => `${j.numero != null ? `${j.numero} ` : ''}${j.nome}`), C.verde]);
  if (e.banco.length) cards.push(['Opções no banco', e.banco, C.verde]);
  if (e.desfalques.length) cards.push(['Desfalques', e.desfalques, C.vermelho]);
  if (e.duvidas.length) cards.push(['Dúvidas', e.duvidas, C.amarelo]);
  const larg = M + LARG - x0;
  if (cards.length === 3) {
    const [c1, c2] = colunas(2, x0, larg);
    const hh = (ALT - 0.6) / 2;
    [[c1.x, TOPO, c1.w, ALT], [c2.x, TOPO, c2.w, hh], [c2.x, TOPO + hh + 0.6, c2.w, hh]].forEach(([x, y, w, h], i) => {
      const [ce, yc] = cartao(x, y, w, h, cards[i][0], { cor: cards[i][2] });
      els.push(...ce, bullets(x + 0.5, yc, w - 1, y + h - yc - 0.3, cards[i][1], 15));
    });
  } else {
    colunas(Math.max(cards.length, 1), x0, larg).forEach((col, i) => {
      if (!cards[i]) return;
      const [ce, yc] = cartao(col.x, TOPO, col.w, ALT, cards[i][0], { cor: cards[i][2] });
      els.push(...ce, bullets(col.x + 0.5, yc, col.w - 1, TOPO + ALT - yc - 0.3, cards[i][1], 15));
    });
  }
  return { els: [...els, ...rodape(vm, n, 'escalacao')] };
}

function individuais(vm, n, parte, rotParte) {
  const els = cromo(vm, `Análise individual${rotParte}`, null, 'individuais');
  colunas(2).forEach((col, i) => {
    const p = parte[i];
    if (!p) return;
    els.push(box(col.x, TOPO, col.w, ALT, C.claro, { raio: 0.25 }));
    els.push(circ(col.x + 0.5, TOPO + 0.5, 1.7, C.verde, { txt: p.numero != null ? String(p.numero) : '·', size: 18, bold: true, color: C.branco }));
    els.push(text(col.x + 2.5, TOPO + 0.45, col.w - 3, 1.0, p.nome, 20, { bold: true, color: C.escuro, valign: 'middle', font: 'titulo' }));
    els.push(text(col.x + 2.5, TOPO + 1.4, col.w - 3, 0.7, [p.posicao, p.destaque].filter(Boolean).join(' · '), 11, { color: C.cinza }));
    const grupos = [['PONTOS FORTES', p.fortes, C.verde], ['PONTOS FRACOS', p.fracos, C.vermelho], ['COMO NEUTRALIZAR', p.neutralizar, C.azul]]
      .filter(([, l]) => l.length);
    colunas(Math.max(grupos.length, 1), col.x + 0.5, col.w - 1, 0.4).forEach((g, j) => {
      const gr = grupos[j];
      if (!gr) return;
      els.push(box(g.x, TOPO + 2.7, g.w, 0.12, gr[2]));
      els.push(text(g.x, TOPO + 2.95, g.w, 0.7, gr[0], 9.5, { bold: true, color: gr[2] }));
      els.push(bullets(g.x, TOPO + 3.7, g.w, ALT - 4.0, gr[1], 14));
    });
  });
  return { els: [...els, ...rodape(vm, n, 'individuais')] };
}

const FASES = [['construcao', 'Construção'], ['segunda_fase', '2ª fase de construção'], ['criacao', 'Criação'], ['finalizacao', 'Finalização']];
function ataque(vm, n) {
  const a = vm.a.ataque;
  const fases = FASES.filter(([k]) => a[k].length);
  const els = cromo(vm, AA.TITULOS.ataque, 'Como o adversário joga com a bola, da construção à finalização', 'ataque');
  const cols = colunas(fases.length, M, LARG, 0.9);
  cols.forEach((col, i) => {
    const [k, rot] = fases[i];
    els.push(box(col.x, TOPO, col.w, ALT, C.claro, { raio: 0.25 }));
    els.push(circ(col.x + 0.5, TOPO + 0.5, 1.2, C.verde, { txt: String(i + 1), size: 15, bold: true, color: C.branco }));
    els.push(text(col.x + 2.0, TOPO + 0.5, col.w - 2.4, 1.2, rot, 15, { bold: true, color: C.escuro, valign: 'middle' }));
    els.push(text(col.x + 0.5, TOPO + 1.85, col.w - 1, 0.6, 'ATAQUE →', 9, { bold: true, color: C.verde }));
    els.push(bullets(col.x + 0.5, TOPO + 2.6, col.w - 1, ALT - 2.9, a[k], 15));
    if (i < cols.length - 1) els.push(text(col.x + col.w, TOPO + ALT / 2 - 0.6, 0.9, 1.2, '›', 26, { bold: true, color: C.verde, align: 'center', valign: 'middle' }));
  });
  return { els: [...els, ...rodape(vm, n, 'ataque')] };
}

const BLOCOS = [['alto', 'Bloco alto'], ['medio', 'Bloco médio'], ['baixo', 'Bloco baixo']];
const FREQ = { predominante: 'Predominante', frequente: 'Frequente', pontual: 'Pontual', raro: 'Raro' };
function defesa(vm, n) {
  const d = vm.a.defesa;
  const bl = BLOCOS.filter(([k]) => d[k].frequencia || d[k].itens.length);
  const els = cromo(vm, AA.TITULOS.defesa, 'Como o adversário se organiza sem a bola', 'defesa');
  colunas(bl.length).forEach((col, i) => {
    const [k, rot] = bl[i];
    const pred = d[k].frequencia === 'predominante';
    const [e, yc] = cartao(col.x, TOPO, col.w, ALT, rot, {
      cor: pred ? C.amarelo : C.verde, fill: pred ? C.destaque : C.claro,
      tag: d[k].frequencia ? FREQ[d[k].frequencia] : null, corTag: pred ? C.amarelo : C.verdeClaro,
    });
    els.push(...e, bullets(col.x + 0.5, yc + 0.2, col.w - 1, TOPO + ALT - yc - 0.5, d[k].itens, 15));
  });
  return { els: [...els, ...rodape(vm, n, 'defesa')] };
}

const OPC = {
  perder: [['pressionam', 'Pressionam (contrapressão)'], ['temporizam', 'Temporizam'], ['recuam', 'Recuam e recompõem o bloco']],
  recuperar: [['verticais', 'Passes verticais (contra-ataque)'], ['laterais', 'Passes laterais'], ['tras', 'Passes para trás (retêm a posse)']],
};
function transicoes(vm, n) {
  const t = vm.a.transicoes;
  const lados = [['perder', 'Quando perdem a bola', C.vermelho], ['recuperar', 'Quando roubam a bola', C.verde]]
    .filter(([k]) => t[k].comportamento || t[k].itens.length);
  const els = cromo(vm, 'Transições', null, 'transicoes');
  colunas(lados.length).forEach((col, i) => {
    const [k, rot, cor] = lados[i];
    const o = t[k];
    const [e, yc] = cartao(col.x, TOPO, col.w, ALT, rot, { cor });
    els.push(...e);
    let y = yc;
    if (o.comportamento) {
      els.push(text(col.x + 0.5, y, col.w - 1, 0.6, 'Comportamento observado:', 10, { color: C.cinza }));
      y += 0.7;
      for (const [op, r] of OPC[k]) {
        const on = o.comportamento === op;
        els.push(box(col.x + 0.5, y + 0.15, 0.55, 0.55, on ? C.verde : C.branco, { line: on ? C.verde : 'B8C4BE', raio: 0.08 }));
        if (on) els.push(text(col.x + 0.5, y + 0.15, 0.55, 0.55, '✓', 9, { bold: true, color: C.branco, align: 'center', valign: 'middle' }));
        els.push(text(col.x + 1.3, y, col.w - 5.2, 0.85, r, 12, { bold: on, color: on ? C.texto : C.cinza, valign: 'middle' }));
        if (on) {
          els.push(box(col.x + col.w - 3.6, y + 0.12, 3.1, 0.6, C.amarelo, { raio: 0.3 }));
          els.push(text(col.x + col.w - 3.6, y + 0.12, 3.1, 0.6, 'PREDOMINANTE', 8.5, { bold: true, color: C.escuro, align: 'center', valign: 'middle' }));
        }
        y += 0.9;
      }
      y += 0.4;
    }
    if (o.itens.length) els.push(bullets(col.x + 0.5, y, col.w - 1, TOPO + ALT - y - 0.4, o.itens, 15));
  });
  return { els: [...els, ...rodape(vm, n, 'transicoes')] };
}

function bpOfensiva(vm, n) {
  const b = vm.a.bp_ofensiva;
  const els = cromo(vm, AA.TITULOS.bp_ofensiva, null, 'bp_ofensiva');
  let y = TOPO;
  if (b.resumo) {
    els.push(box(M, y, LARG, 2.2, C.destaque, { raio: 0.25 }));
    els.push(text(M + 0.6, y + 0.15, LARG - 1.2, 1.9, b.resumo, 13, { color: C.escuro, valign: 'middle' }));
    y += 2.8;
  }
  const cards = [['escanteios', 'Escanteios'], ['faltas', 'Faltas'], ['laterais', 'Laterais'], ['penaltis', 'Pênaltis']].filter(([k]) => b[k].length);
  colunas(Math.max(cards.length, 1)).forEach((col, i) => {
    if (!cards[i]) return;
    const [e, yc] = cartao(col.x, y, col.w, TOPO + ALT - y, cards[i][1]);
    els.push(...e, bullets(col.x + 0.5, yc, col.w - 1, TOPO + ALT - yc - 0.3, b[cards[i][0]], 15));
  });
  return { els: [...els, ...rodape(vm, n, 'bp_ofensiva')] };
}

function bpDefensiva(vm, n) {
  const b = vm.a.bp_defensiva;
  const els = cromo(vm, AA.TITULOS.bp_defensiva, null, 'bp_defensiva');
  let y = TOPO;
  const campos = [['Marcação', b.marcacao], ['Homens na área', b.homens_area], ['Jogador na trave', b.trave], ['Barreira', b.barreira]]
    .filter(([, v]) => v !== null && v !== '');
  if (campos.length) {
    colunas(campos.length).forEach((col, i) => {
      els.push(box(col.x, y, col.w, 2.7, C.claro, { raio: 0.25 }));
      els.push(text(col.x + 0.45, y + 0.3, col.w - 0.9, 0.6, campos[i][0].toUpperCase(), 9.5, { bold: true, color: C.cinza }));
      els.push(text(col.x + 0.45, y + 0.95, col.w - 0.9, 1.5, String(campos[i][1]), 18, { bold: true, color: C.escuro, valign: 'middle' }));
    });
    y += 3.3;
  }
  const cards = [];
  if (b.contra_ataque) cards.push(['Quem fica na frente', [b.contra_ataque], C.verde]);
  if (b.goleiro.length) cards.push(['Goleiro', b.goleiro, C.amarelo]);
  if (b.itens.length) cards.push(['Observações', b.itens, C.escuro]);
  colunas(Math.max(cards.length, 1)).forEach((col, i) => {
    if (!cards[i]) return;
    const [e, yc] = cartao(col.x, y, col.w, TOPO + ALT - y, cards[i][0], { cor: cards[i][2] });
    els.push(...e, bullets(col.x + 0.5, yc, col.w - 1, TOPO + ALT - yc - 0.3, cards[i][1], 15));
  });
  return { els: [...els, ...rodape(vm, n, 'bp_defensiva')] };
}

function pontos(vm, n) {
  const p = vm.a.pontos;
  const lados = [['positivos', 'Pontos positivos', 'O que fazem bem e precisa ser neutralizado', C.verde],
    ['explorar', 'Pontos a serem explorados', 'Fragilidades que podem ser atacadas', C.vermelho]].filter(([k]) => p[k].length);
  const els = cromo(vm, AA.TITULOS.pontos, null, 'pontos');
  colunas(lados.length).forEach((col, i) => {
    const [k, rot, sub, cor] = lados[i];
    els.push(box(col.x, TOPO, col.w, ALT, C.claro, { raio: 0.25 }));
    els.push(box(col.x, TOPO, 0.3, ALT, cor));
    els.push(text(col.x + 0.8, TOPO + 0.5, col.w - 1.3, 1.0, rot, 18, { bold: true, color: C.escuro, valign: 'middle' }));
    els.push(text(col.x + 0.8, TOPO + 1.5, col.w - 1.3, 0.7, sub, 11, { color: C.cinza }));
    els.push(bullets(col.x + 0.8, TOPO + 2.5, col.w - 1.3, ALT - 2.8, p[k], 15));
  });
  return { els: [...els, ...rodape(vm, n, 'pontos')] };
}

function final(vm, n) {
  const f = vm.a.final;
  const els = cromo(vm, AA.TITULOS.final, null, 'final');
  let y = TOPO;
  const hMsg = f.mensagem ? 5.0 : 0;
  if (f.observacoes.length) {
    const h = ALT - (hMsg ? hMsg + 0.6 : 0);
    els.push(box(M, y, LARG, h, C.claro, { raio: 0.25 }));
    els.push(bullets(M + 0.6, y + 0.5, LARG - 1.2, h - 0.8, f.observacoes, 18));
    y += h + 0.6;
  }
  if (f.mensagem) {
    els.push(box(M, y, LARG, TOPO + ALT - y, C.escuro, { raio: 0.25 }));
    els.push(text(M + 0.8, y + 0.5, LARG - 1.6, 0.7, 'MENSAGEM PRINCIPAL PARA O JOGO', 11, { bold: true, color: C.amarelo }));
    els.push(text(M + 0.8, y + 1.3, LARG - 1.6, TOPO + ALT - y - 1.6, f.mensagem, 19, { bold: true, color: C.branco, valign: 'middle' }));
  }
  return { els: [...els, ...rodape(vm, n, 'final')] };
}

// Vídeo da seção (só PowerPoint): um slide por vídeo, depois da seção.
function slideVideo(vm, n, v) {
  const els = cromo(vm, `Vídeo · ${AA.TITULOS[v.secao] || ''}`, v.titulo || null, null);
  const w = 24.8;
  const h = (w * 9) / 16;
  els.push(box((W - w) / 2, TOPO, w, h, '000000'));
  els.push({ t: 'video', x: (W - w) / 2, y: TOPO, w, h, key: v.id });
  return { els: [...els, ...rodape(vm, n, null)], so: 'pptx' };
}

/**
 * vm: { a (normalizada), adversario, nossoNome, subtitulo, fatos[{l,v}], capaRodape, fontes,
 *       imagens {nosso?, adversario?}, videos [{id, secao, titulo}] }
 * Devolve { largura, altura, slides: [{ fundo?, els, so? }] }.
 */
function montarDeck(vm) {
  const v = { ...vm, videosPorSecao: {} };
  for (const vid of vm.videos || []) (v.videosPorSecao[vid.secao] = v.videosPorSecao[vid.secao] || []).push(vid);
  const slides = [capa(v)];
  const n = () => slides.length + 1;
  const comVideos = (secao) => { for (const vid of v.videosPorSecao[secao] || []) slides.push(slideVideo(v, n(), vid)); };
  const preenchidas = new Set(AA.secoesPreenchidas(v.a));
  // seção vazia com vídeo: o vídeo entra mesmo assim (slide próprio, só no PowerPoint)
  for (const k of AA.SECOES.filter((x) => preenchidas.has(x) || (v.videosPorSecao[x] || []).length)) {
    if (!preenchidas.has(k)) {
      comVideos(k);
      continue;
    }
    if (k === 'variacoes') {
      const vs = v.a.variacoes;
      for (let i = 0; i < vs.length; i += 3) slides.push(variacoes(v, n(), vs.slice(i, i + 3)));
    } else if (k === 'individuais') {
      const ps = v.a.individuais;
      const total = Math.ceil(ps.length / 2);
      for (let i = 0; i < ps.length; i += 2) slides.push(individuais(v, n(), ps.slice(i, i + 2), total > 1 ? ` (${i / 2 + 1}/${total})` : ''));
    } else {
      const f = { campanha, sistema, escalacao, ataque, defesa, transicoes, bp_ofensiva: bpOfensiva, bp_defensiva: bpDefensiva, pontos, final }[k];
      slides.push(f(v, n()));
    }
    comVideos(k);
  }
  for (const s of slides) for (const e of s.els) if (e.t === 'text') e.size = caber(e);
  return { largura: W, altura: H, slides };
}

// Diminui a fonte até o texto caber na caixa (estimativa pela largura média do caractere — igual
// para o PDF e o PowerPoint, que assim quebram parecido). Nunca abaixo de 60% nem de 7pt.
const PT = 0.03528; // cm por ponto
function linhas(txt, larg, size, recuo = 0) {
  const porLinha = Math.max(4, Math.floor((larg - recuo) / (size * PT * 0.52)));
  return String(txt).split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(p.length / porLinha)), 0);
}
function caber(e) {
  const min = Math.max(7, e.size * 0.6);
  for (let s = e.size; s > min; s -= 0.5) {
    const n = e.bullets ? e.bullets.reduce((t, b) => t + linhas(b, e.w, s, 0.55), 0) : linhas(e.txt, e.w, s);
    const extra = e.bullets ? e.bullets.length * s * PT * 0.35 : 0;
    if (n * s * PT * 1.22 + extra <= e.h) return s;
  }
  return min;
}

module.exports = { montarDeck, W, H, C };
