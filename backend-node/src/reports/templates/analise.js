// Análise do adversário em PDF: pinta o deck de slides 16:9 (analiseDeck.js) — o MESMO que vira
// PowerPoint (analisePptx.js). Cada slide é uma página de 33,867 × 19,05 cm com os elementos
// posicionados em centímetros. Vídeos não entram no PDF (só no PowerPoint): o slide da seção
// avisa "▶ N vídeos na versão PowerPoint".
// vm: buildAnalise (reports/index.js). POST /api/reports/analise { session_id }.
const F = require('../format');

const esc = F.esc;
const cm = (n) => `${Math.round(n * 1000) / 1000}cm`;
const cor = (c) => (c ? `#${c}` : 'transparent');

const CSS = `
@font-face{font-family:Poppins;font-weight:600;src:url(fonts/poppins-latin-600-normal.woff2)}
@font-face{font-family:Poppins;font-weight:700;src:url(fonts/poppins-latin-700-normal.woff2)}
@font-face{font-family:Inter;font-weight:400;src:url(fonts/inter-latin-400-normal.woff2)}
@font-face{font-family:Inter;font-weight:700;src:url(fonts/inter-latin-700-normal.woff2)}
@page{size:338.67mm 190.5mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,Arial,sans-serif;color:#1A1A1A}
.s{position:relative;width:33.867cm;height:19.05cm;overflow:hidden;break-after:page;page-break-after:always}
.s:last-child{break-after:auto;page-break-after:auto}
.e{position:absolute}
.t{display:flex;flex-direction:column;line-height:1.2;overflow:hidden;overflow-wrap:anywhere}
.t.m{justify-content:center}.t.b{justify-content:flex-end}
.t.ti{font-family:Poppins,Arial,sans-serif;letter-spacing:-.01em}
.t ul{margin:0;padding-left:.55cm}
.t li{margin-bottom:.35em}
.t li::marker{color:#1F7A4D}
.c{border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1}
img.e{object-fit:contain}
`;

function elemento(e, imagens) {
  if (e.so === 'pptx' || e.t === 'video') return '';
  const pos = `left:${cm(e.x)};top:${cm(e.y)};width:${cm(e.w)};height:${cm(e.h)}`;
  switch (e.t) {
    case 'box':
      return `<div class="e" style="${pos};background:${cor(e.fill)};${e.line ? `border:1px solid #${e.line};` : ''}${e.raio ? `border-radius:${cm(e.raio)}` : ''}"></div>`;
    case 'circ':
      return `<div class="e c" style="left:${cm(e.x)};top:${cm(e.y)};width:${cm(e.d)};height:${cm(e.d)};background:${cor(e.fill)};`
        + `${e.line ? `border:1px solid #${e.line};` : ''}color:#${e.color || 'FFFFFF'};font:${e.bold ? 700 : 400} ${e.size || 10}pt Poppins,Arial">${esc(e.txt || '')}</div>`;
    case 'line': {
      const x = Math.min(e.x1, e.x2);
      const y = Math.min(e.y1, e.y2);
      return `<svg class="e" style="left:${cm(x)};top:${cm(y - 0.05)};width:${cm(Math.abs(e.x2 - e.x1) || 0.1)};height:${cm(Math.abs(e.y2 - e.y1) + 0.1)};overflow:visible">`
        + `<line x1="${cm(e.x1 - x)}" y1="${cm(e.y1 - y + 0.05)}" x2="${cm(e.x2 - x)}" y2="${cm(e.y2 - y + 0.05)}" stroke="#${e.color}" stroke-width="${e.w || 1}pt"/></svg>`;
    }
    case 'img':
      return imagens[e.key] ? `<img class="e" src="${esc(imagens[e.key])}" style="${pos}" alt="">` : '';
    case 'text': {
      const cls = `e t${e.valign === 'middle' ? ' m' : e.valign === 'bottom' ? ' b' : ''}${e.font === 'titulo' ? ' ti' : ''}`;
      const st = `${pos};font-size:${e.size}pt;font-weight:${e.bold ? 700 : 400};color:#${e.color};text-align:${e.align || 'left'}`;
      const corpo = e.bullets
        ? `<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : e.link
          ? `<div><a href="${esc(e.link)}" style="color:inherit;text-decoration:underline">${esc(e.txt)}</a></div>`
          : `<div>${esc(e.txt)}</div>`;
      return `<div class="${cls}" style="${st}">${corpo}</div>`;
    }
    default:
      return '';
  }
}

// Segurança extra: se a estimativa do deck errou, reduz a fonte no navegador até caber.
const AJUSTE_JS = `
document.fonts.ready.then(function(){
  try {
    document.querySelectorAll('.t').forEach(function(el){
      var s = parseFloat(el.style.fontSize), min = Math.max(6.5, s * 0.6);
      while (el.scrollHeight > el.clientHeight + 1 && s > min) { s -= 0.5; el.style.fontSize = s + 'pt'; }
    });
  } catch (e) { window.__reportError = String(e && e.message || e); }
  window.__reportPages = document.querySelectorAll('.s').length;
  window.__reportReady = true;
});`;

/** deck: montarDeck(vm); imagens: chave do deck → URL do asset ('img/...'). */
function renderAnalise(deck, { titulo, imagens = {} }) {
  const slides = deck.slides.filter((s) => s.so !== 'pptx').map((s) => `<section class="s" style="background:${cor(s.fundo || 'FFFFFF')}">`
    + `${s.els.map((e) => elemento(e, imagens)).join('')}</section>`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>`
    + `<style>${CSS}</style></head><body>${slides.join('\n')}<script>${AJUSTE_JS}</script></body></html>`;
}

module.exports = { renderAnalise };
