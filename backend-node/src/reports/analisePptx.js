// Análise do adversário em PowerPoint: pinta o MESMO deck do PDF (analiseDeck.js) com o PptxGenJS
// — a ferramenta com que o modelo do dono foi feito — e embute os vídeos de cada seção num slide
// próprio logo depois dela. Tudo editável no PowerPoint (caixas, textos, campinhos).
const PptxGenJS = require('pptxgenjs');

const IN = 1 / 2.54; // cm → polegadas (unidade do PptxGenJS)
const FONTE = 'Arial';

function pintar(slide, pptx, e, imagens, videos) {
  if (e.so === 'pdf') return;
  const pos = { x: e.x * IN, y: e.y * IN, w: (e.w ?? e.d) * IN, h: (e.h ?? e.d) * IN };
  switch (e.t) {
    case 'box':
      slide.addShape(e.raio ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        ...pos,
        fill: e.fill ? { color: e.fill } : { type: 'none' },
        line: e.line ? { color: e.line, width: 1 } : { type: 'none' },
        ...(e.raio ? { rectRadius: e.raio * IN } : {}),
      });
      break;
    case 'circ':
      slide.addText(e.txt || '', {
        ...pos, shape: pptx.ShapeType.ellipse, margin: 0,
        fill: e.fill ? { color: e.fill } : { type: 'none' },
        line: e.line ? { color: e.line, width: 1 } : { type: 'none' },
        fontFace: FONTE, fontSize: e.size || 10, bold: !!e.bold, color: e.color || 'FFFFFF', align: 'center', valign: 'middle',
      });
      break;
    case 'line':
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(e.x1, e.x2) * IN, y: Math.min(e.y1, e.y2) * IN,
        w: Math.abs(e.x2 - e.x1) * IN, h: Math.abs(e.y2 - e.y1) * IN,
        line: { color: e.color, width: e.w || 1 },
      });
      break;
    case 'img': {
      const img = imagens[e.key];
      if (img) slide.addImage({ ...pos, data: img, sizing: { type: 'contain', w: pos.w, h: pos.h } });
      break;
    }
    case 'video': {
      const v = videos[e.key];
      if (v) slide.addMedia({ ...pos, type: 'video', path: v.path, extn: v.extn });
      break;
    }
    case 'text': {
      const base = { fontFace: FONTE, fontSize: e.size, bold: !!e.bold, color: e.color };
      const conteudo = e.bullets
        ? e.bullets.map((b) => ({ text: b, options: { bullet: { indent: 12 }, breakLine: true, paraSpaceAfter: e.size * 0.35 } }))
        : e.txt;
      slide.addText(conteudo, {
        ...pos, ...base, margin: 0, align: e.align || 'left', valign: e.valign === 'middle' ? 'middle' : e.valign === 'bottom' ? 'bottom' : 'top',
        lineSpacingMultiple: 1.1, fit: 'shrink',
        ...(e.link ? { hyperlink: { url: e.link } } : {}),
      });
      break;
    }
    default:
  }
}

/**
 * deck: montarDeck(vm); imagens: chave → 'image/png;base64,...'; videos: id → { path, extn }.
 * Devolve o Buffer do .pptx.
 */
async function gerarPptx(deck, { titulo, autor, imagens = {}, videos = {} }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'ANALISE', width: deck.largura * IN, height: deck.altura * IN });
  pptx.layout = 'ANALISE';
  pptx.title = titulo;
  if (autor) pptx.author = autor;
  pptx.company = 'TactiPlan';
  for (const s of deck.slides) {
    if (s.so === 'pdf') continue;
    const slide = pptx.addSlide();
    slide.background = { color: s.fundo || 'FFFFFF' };
    for (const e of s.els) pintar(slide, pptx, e, imagens, videos);
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { gerarPptx };
