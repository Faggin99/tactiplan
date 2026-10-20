// Prévia das páginas de fotos no modal "Fotos do relatório" (iframe srcdoc no
// app). O HTML é o MESMO do PDF; aqui só se embutem fontes e imagens como
// data: (o iframe roda isolado, sem acesso à rede da API) e um estilo de tela
// (páginas separadas, com sombra). O paginador avisa o app via postMessage.
const { fontBuffer } = require('./renderer');

const PREVIEW_CSS = 'html,body{background:transparent!important}'
  + '.page{margin:0 0 6mm;box-shadow:0 1px 6px rgba(15,23,42,.22)}.page:last-of-type{margin-bottom:0}';

const fontData = new Map();
function fontDataUri(name) {
  if (!fontData.has(name)) {
    const buf = fontBuffer(name);
    fontData.set(name, buf ? `data:font/woff2;base64,${buf.toString('base64')}` : null);
  }
  return fontData.get(name);
}

function toPreviewHtml(html, assets) {
  return String(html)
    .replace(/url\(fonts\/([a-z0-9-]+\.woff2)\)/gi, (m, name) => {
      const uri = fontDataUri(name);
      return uri ? `url(${uri})` : m;
    })
    .replace(/src="(img\/[^"]+)"/g, (m, key) => {
      const a = assets && assets.get(key);
      return a ? `src="data:${a.contentType};base64,${Buffer.from(a.body).toString('base64')}"` : m;
    })
    .replace('</head>', `<style>${PREVIEW_CSS}</style></head>`);
}

module.exports = { toPreviewHtml, PREVIEW_CSS };
