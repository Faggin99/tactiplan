// Renderiza a escalação no PDF: quadra/gramado limpo + chips dos jogadores,
// cada um na VAGA (slot) da formação do jogo — a mesma geometria da tela
// (lib/formation.js). Titular sem vaga não entra no desenho.
// Aceita um photoMap (athlete_id → dataURL) pra pintar a foto do atleta dentro
// do círculo. Sem foto, mostra as iniciais do nome.

import { readJersey } from '../lib/lineupLayout';
import { buildSlots, resolveFormation, initials, shortName } from '../lib/formation';

const RGB = {
  white:    [255, 255, 255],
  navy:     [15, 23, 42],
  muted:    [100, 116, 139],
  futsalBg: [27, 64, 161],     // cobalto profundo
  grass1:   [52, 128, 63],
  grass2:   [44, 111, 51],
  shadow:   [0, 0, 0],
};

function setColor(doc, kind, [r, g, b]) {
  if (kind === 'fill')   doc.setFillColor(r, g, b);
  else if (kind === 'stroke') doc.setDrawColor(r, g, b);
  else if (kind === 'text')   doc.setTextColor(r, g, b);
}

function detectImgFmt(dataUrl) {
  if (!dataUrl) return 'JPEG';
  if (dataUrl.startsWith('data:image/png'))  return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

// ----------- Desenha o gramado / a quadra -----------
function drawField(doc, { x, y, w, h, modality }) {
  const isFutsal = modality === 'futsal';
  const px = (pct) => x + (pct / 100) * w;
  const py = (pct) => y + (pct / 100) * h;
  // Linha branca proporcional à largura do campo
  const LW = Math.max(0.3, w * 0.006);

  if (isFutsal) {
    setColor(doc, 'fill', RGB.futsalBg);
    doc.rect(x, y, w, h, 'F');
  } else {
    // Listras horizontais alternadas — estilo gramado
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      setColor(doc, 'fill', i % 2 === 0 ? RGB.grass1 : RGB.grass2);
      doc.rect(x, y + (i / stripes) * h, w, h / stripes, 'F');
    }
  }

  // Marcações brancas
  setColor(doc, 'stroke', RGB.white);
  setColor(doc, 'fill', RGB.white);
  doc.setLineWidth(LW);

  // Borda principal
  const bx = x + w * 0.04, by = y + h * 0.025, bw = w * 0.92, bh = h * 0.95;
  doc.rect(bx, by, bw, bh, 'S');

  // Linha do meio
  doc.line(bx, py(50), bx + bw, py(50));

  // Círculo central (claramente visível)
  const cr = isFutsal ? w * 0.09 : w * 0.1;
  doc.circle(px(50), py(50), cr, 'S');
  doc.circle(px(50), py(50), LW * 1.4, 'F');

  if (isFutsal) {
    // Área (D) inferior e superior — sketch usando segmentos curtos pq jsPDF não tem arc completo
    drawArc(doc, px(50), py(95), w * 0.30, Math.PI, 2 * Math.PI, LW);    // D inferior abre pra cima
    drawArc(doc, px(50), py(5),  w * 0.30, 0, Math.PI, LW);              // D superior abre pra baixo
    // Marca do pênalti (6m) e segundo pênalti (10m)
    [88, 12, 78, 22].forEach((pct) => {
      doc.circle(px(50), py(pct), LW * 1.3, 'F');
    });
  } else {
    // Grande / pequena área inferior
    doc.rect(bx + bw * 0.18, py(80), bw * 0.64, h * 0.18, 'S');
    doc.rect(bx + bw * 0.34, py(91), bw * 0.32, h * 0.07, 'S');
    doc.circle(px(50), py(86), LW * 1.3, 'F');
    drawArc(doc, px(50), py(80), w * 0.13, Math.PI, 2 * Math.PI, LW);
    // Grande / pequena área superior
    doc.rect(bx + bw * 0.18, py(2),  bw * 0.64, h * 0.18, 'S');
    doc.rect(bx + bw * 0.34, py(2),  bw * 0.32, h * 0.07, 'S');
    doc.circle(px(50), py(14), LW * 1.3, 'F');
    drawArc(doc, px(50), py(20), w * 0.13, 0, Math.PI, LW);
  }

  // Gols (retângulos brancos cheios — pequenos toques nas pontas)
  setColor(doc, 'fill', RGB.white);
  doc.rect(x + w * 0.42, y, w * 0.16, h * 0.018, 'F');
  doc.rect(x + w * 0.42, y + h * 0.982, w * 0.16, h * 0.018, 'F');
}

// Desenha um arco aproximado por segmentos (jsPDF v2 tem .ellipse mas não arcos parciais).
function drawArc(doc, cx, cy, r, a0, a1, lw) {
  doc.setLineWidth(lw);
  const steps = 24;
  let prevX = cx + r * Math.cos(a0);
  let prevY = cy + r * Math.sin(a0);
  for (let i = 1; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    const nx = cx + r * Math.cos(t);
    const ny = cy + r * Math.sin(t);
    doc.line(prevX, prevY, nx, ny);
    prevX = nx; prevY = ny;
  }
}

// ----------- Desenha um chip de jogador -----------
function drawPlayerChip(doc, { cx, cy, num, name, photoDataUrl, chipR, maxNameW }) {
  const R = chipR;

  // Sombra
  setColor(doc, 'fill', RGB.shadow);
  doc.circle(cx + R * 0.1, cy + R * 0.15, R, 'F');

  // Foto: tenta usar como base do círculo (clipping circular com fundo branco se falhar)
  if (photoDataUrl) {
    // Fundo branco como anel
    setColor(doc, 'fill', RGB.white);
    doc.circle(cx, cy, R, 'F');
    try {
      // Foto cobre quase todo o disco (deixa um anel branco como borda)
      const imgR = R * 0.86;
      doc.addImage(photoDataUrl, detectImgFmt(photoDataUrl),
        cx - imgR, cy - imgR, imgR * 2, imgR * 2, undefined, 'FAST');
    } catch (err) { /* ignora — fica só o círculo branco */ }
  } else {
    // Sem foto: círculo branco com o nº da camisa (ou as iniciais, sem nº)
    setColor(doc, 'fill', RGB.white);
    doc.circle(cx, cy, R, 'F');
    const hasNum = num != null && num !== '';
    const center = hasNum ? String(num) : initials(name);
    setColor(doc, 'text', RGB.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(R * (hasNum ? 3.2 : 2.4));
    doc.text(center, cx - doc.getTextWidth(center) / 2, cy + R * (hasNum ? 0.4 : 0.3));
  }

  // Aro escuro
  setColor(doc, 'stroke', RGB.navy);
  doc.setLineWidth(R * 0.16);
  doc.circle(cx, cy, R, 'S');

  // Badge inferior preto com nº (sobrescrevendo a foto/círculo só na parte de baixo)
  // Só com foto: o nº vai numa tag no canto (sem foto ele já está no centro).
  const numTxt = (photoDataUrl && num != null && num !== '') ? String(num) : '';
  if (numTxt) {
    // Pequena tag circular preta no canto superior direito do chip — não cobre o rosto
    const tagR = R * 0.55;
    const tagCX = cx + R * 0.65;
    const tagCY = cy - R * 0.55;
    setColor(doc, 'fill', RGB.navy);
    doc.circle(tagCX, tagCY, tagR, 'F');
    setColor(doc, 'stroke', RGB.white);
    doc.setLineWidth(R * 0.08);
    doc.circle(tagCX, tagCY, tagR, 'S');
    setColor(doc, 'text', RGB.white);
    doc.setFont('helvetica', 'bold');
    const fSize = tagR * 4.2;
    doc.setFontSize(fSize);
    const tw = doc.getTextWidth(numTxt);
    doc.text(numTxt, tagCX - tw / 2, tagCY + tagR * 0.45);
  }

  // Sobrenome embaixo do chip — fundo escuro arredondado
  let last = shortName(name);
  if (last) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(R * 2.3);
    const padX = R * 0.35, padY = R * 0.45;
    // Corta o nome pra não invadir a vaga vizinha
    if (maxNameW) {
      while (last.length > 3 && doc.getTextWidth(last) + padX * 2 > maxNameW) last = last.slice(0, -1);
      if (last !== shortName(name)) last = `${last.slice(0, -1)}.`;
    }
    const tw = doc.getTextWidth(last);
    const boxW = tw + padX * 2;
    const boxH = R * 1.25;
    const boxX = cx - boxW / 2;
    const boxY = cy + R * 1.15;
    setColor(doc, 'fill', RGB.navy);
    doc.roundedRect(boxX, boxY, boxW, boxH, R * 0.25, R * 0.25, 'F');
    setColor(doc, 'text', RGB.white);
    doc.text(last, cx - tw / 2, boxY + padY + R * 0.55);
  }
}

/**
 * Renderiza a escalação dentro do retângulo (x, y, w, h) em mm no PDF.
 * @param {jsPDF} doc
 * @param {object} opts - { x, y, w, h, players, formation, modality, photoMap }
 */
export function drawLineupOnPdf(doc, { x, y, w, h, players = [], formation, modality = 'football_11', photoMap }) {
  drawField(doc, { x, y, w, h, modality });

  const slots = buildSlots(resolveFormation(modality, formation));
  const positioned = players
    .filter((p) => p.status === 'starter' && p.slot != null && slots[p.slot])
    .map((p) => ({ p, coords: slots[p.slot] }));
  if (positioned.length === 0) return;

  // Chip menor pra não invadir bordas/linhas. ~4% da largura é o ponto de equilíbrio.
  const chipR = w * 0.042;
  // Inseta as coordenadas pra chips não vazarem nas bordas (margem proporcional à camisa)
  const insetMargin = chipR * 1.6;
  const usableW = w - 2 * insetMargin;
  const usableH = h - 2 * insetMargin - chipR * 1.3; // dá espaço pra tag de nome embaixo

  positioned.forEach(({ p, coords }) => {
    // Reescala 0..100 → área útil dentro da quadra
    const cx = x + insetMargin + (coords.x / 100) * usableW;
    const cy = y + insetMargin + (coords.y / 100) * usableH;
    drawPlayerChip(doc, {
      cx, cy,
      num: readJersey(p),
      name: p.name || p.athlete?.name || 'Jogador',
      photoDataUrl: photoMap?.get(p.athlete_id),
      chipR,
      maxNameW: (coords.spacing / 100) * usableW * 0.96,
    });
  });
}
