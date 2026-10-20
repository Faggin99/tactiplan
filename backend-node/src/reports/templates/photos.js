// Grade de fotos (registro fotográfico da ficha / fotos da semana).
const { esc } = require('../format');

// items: [{ src, caption: { title, context } }]
function photoGrid(items, { cols = 3, showContext = true } = {}) {
  const cells = items.map((p) => {
    const t = p.caption?.title ? `<b>${esc(p.caption.title)}</b>` : '';
    const c = showContext && p.caption?.context ? `<span>${esc(p.caption.context)}</span>` : '';
    return `<figure class="ph-item" style="margin:0"><div class="img"><img src="${esc(p.src)}" alt=""></div>`
      + (t || c ? `<figcaption class="cap">${t}${c}</figcaption>` : '') + '</figure>';
  }).join('');
  return `<div class="photos c${cols === 2 ? 2 : 3}">${cells}</div>`;
}

module.exports = { photoGrid };
