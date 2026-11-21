// Grade de fotos (registro fotográfico da ficha / fotos da semana).
// Layouts: grande (1/linha), medio (2), compacto (3), mosaico (1 destaque 2×2 + 3/linha).
// Proporção: null = a de antes (4:3 na ficha, 3:2 na semana), '4:3', '1:1',
// 'original' (sem corte: a foto inteira dentro da caixa).
const { esc, plural } = require('../format');
const C = require('./components');
const { effectiveLayout } = require('../photoConfig');

const LAYOUT_CLASS = { grande: 'c1', medio: 'c2', compacto: 'c3', mosaico: 'c3 mosaic' };
const RATIO_CLASS = { '4:3': 'r43', '1:1': 'r11', original: 'rorig' };

// items: [{ src, caption: { title, context } }]
function photoGrid(items, { layout = 'compacto', proporcao = null, legendas = true, showContext = true, tamanho = 100 } = {}) {
  const lay = effectiveLayout(layout, items.length); // mosaico com 1–2 fotos vira grande/médio
  if (lay === 'lado') return photoRows(items, { proporcao, legendas, tamanho });
  const hero = lay === 'mosaico';
  const fig = (p, extra = '', unit = true) => {
    const t = legendas && p.caption?.title ? `<b>${esc(p.caption.title)}</b>` : '';
    const c = legendas && showContext && p.caption?.context ? `<span>${esc(p.caption.context)}</span>` : '';
    // legenda EM CIMA da foto: o título é a atividade
    return `<figure class="ph-item${extra}"${unit ? ' data-unit' : ''} style="margin:0">`
      + (t || c ? `<figcaption class="cap">${t}${c}</figcaption>` : '')
      + `<div class="img"><img src="${esc(p.src)}" alt=""></div></figure>`;
  };
  // Mosaico: o destaque e as 2 fotos ao lado formam UMA unidade (o paginador
  // nunca separa o destaque das vizinhas; as demais quebram uma a uma).
  const cells = hero
    ? `<div class="ph-hero" data-unit>${fig(items[0], ' hero', false)}${fig(items[1], '', false)}${fig(items[2], '', false)}</div>`
      + items.slice(3).map((p) => fig(p)).join('')
    : items.map((p) => fig(p)).join('');
  const cls = ['photos', LAYOUT_CLASS[lay] || 'c3', RATIO_CLASS[proporcao] || '']
    .filter(Boolean).join(' ');
  const largura = tamanho && tamanho < 100 ? ` style="width:${Math.round(tamanho)}%"` : '';
  return `<div class="${cls}"${largura}>${cells}</div>`;
}

// "Lado a lado": cada foto numa linha, a imagem à esquerda e a atividade à direita
// (título, bloco/legenda, conteúdos · minutos e a descrição). Cada linha é uma unidade do paginador.
function photoRows(items, { proporcao = null, legendas = true, tamanho = 100 } = {}) {
  const linha = (p) => {
    const d = p.caption?.detalhe || {};
    const meta = [d.conteudos, d.minutos ? `${d.minutos} min` : null].filter(Boolean).join(' · ');
    const texto = legendas
      ? `<div class="ph-txt">${p.caption?.title ? `<b>${esc(p.caption.title)}</b>` : ''}`
        + `${p.caption?.context ? `<span class="ctx">${esc(p.caption.context)}</span>` : ''}`
        + `${meta ? `<span class="meta">${esc(meta)}</span>` : ''}`
        + `${d.descricao ? `<p>${esc(d.descricao)}</p>` : ''}</div>`
      : '<div class="ph-txt"></div>';
    return `<figure class="ph-row" data-unit style="margin:0"><div class="img"><img src="${esc(p.src)}" alt=""></div>${texto}</figure>`;
  };
  const cls = ['photos', 'lado', RATIO_CLASS[proporcao] || ''].filter(Boolean).join(' ');
  const largura = tamanho && tamanho < 100 ? ` style="width:${Math.round(tamanho)}%"` : '';
  return `<div class="${cls}"${largura}>${items.map(linha).join('')}</div>`;
}

// Corpo da página de fotos. photos = { items, groups|null, hidden, total, grid }
//   groups: [{ label, dd, items }] (semana agrupada por dia) ou null (lista corrida)
function photoPageBody(title, photos) {
  const head = `<div>${C.sec(title, esc(plural(photos.total, 'foto', 'fotos')))}</div>`;
  const grid = photos.grid;
  let body;
  if (photos.groups) {
    body = photos.groups.map((g) => `<div class="ph-day" data-split="[data-unit]"><div class="dh">${esc(g.label)} <small>${esc(g.dd)}</small></div>`
      + photoGrid(g.items, grid) + '</div>').join('');
  } else {
    body = `<div data-split="[data-unit]">${photoGrid(photos.items, grid)}</div>`;
  }
  const more = photos.hidden > 0 ? `<div class="ph-more">+${plural(photos.hidden, 'foto não exibida', 'fotos não exibidas')}</div>` : '';
  return head + body + more;
}

module.exports = { photoGrid, photoPageBody };
