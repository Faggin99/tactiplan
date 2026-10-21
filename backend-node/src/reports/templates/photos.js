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
  const hero = lay === 'mosaico';
  const fig = (p, extra = '', unit = true) => {
    const t = legendas && p.caption?.title ? `<b>${esc(p.caption.title)}</b>` : '';
    const c = legendas && showContext && p.caption?.context ? `<span>${esc(p.caption.context)}</span>` : '';
    return `<figure class="ph-item${extra}"${unit ? ' data-unit' : ''} style="margin:0"><div class="img"><img src="${esc(p.src)}" alt=""></div>`
      + (t || c ? `<figcaption class="cap">${t}${c}</figcaption>` : '') + '</figure>';
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
