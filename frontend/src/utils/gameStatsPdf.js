// PDF "Desempenho em Jogos" — espelha o relatório do C.I.U/U.E.C. (Série D 2026).
// Layout em LANDSCAPE com title-strip verde, KPI panels grandes, histórico de
// jogos com headers verdes, e gráficos de gols por tipo coloridos.
//
// Páginas:
//   1. Capa
//   2. Desempenho + Últimos jogos disputados + KPI panels (Pontos / Sequências)
//   3. Gols Pró e Contra (charts de tipo + minuto)
//   4. Destaques individuais (Artilharia / Assistência / Minutagem)

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { deliverPdf } from '../lib/deliverFile';
import {
  PDF_THEME,
  addTitleStrip,
  addSubsectionPill,
  drawKpiPanel,
  drawMiniKpi,
  drawCover,
  paginate,
  applyClubPrimaryColor,
  setFillHex,
  setTextHex,
  setDrawHex,
} from './pdfTheme';

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

const MODALITY_LABELS = {
  football_11: 'Futebol 11',
  football_7:  'Futebol 7',
  futsal:      'Futsal',
};

// Cores das fatias dos gráficos de gols por tipo
const GOAL_TYPE_PALETTE = [
  '#1e3a8a', '#7e22ce', '#f59e0b', '#ea580c', '#22c55e', '#0ea5e9', '#dc2626',
];

/**
 * @param {object} gameStats payload de /api/stats/games
 * @param {object} opts { periodLabel, clubName, modality, periodFrom, periodTo }
 */
export function generateGameStatsPDF(gameStats, opts = {}) {
  const { periodLabel = '', clubName = '', modality = '', periodFrom = '', periodTo = '', primaryColor = null } = opts;
  if (!gameStats || (gameStats.totalMatches || 0) === 0) {
    alert('Sem jogos registrados no período pra exportar.');
    return;
  }
  const resetColor = applyClubPrimaryColor(primaryColor);
  try {

  const doc = new jsPDF({
    orientation: PDF_THEME.orientation,
    unit: 'mm',
    format: PDF_THEME.pageFormat,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = PDF_THEME.margins;

  const modalityLabel = MODALITY_LABELS[modality] || '';
  const periodSub = (periodFrom && periodTo) ? `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}` : periodLabel;

  // ============ PÁGINA 1: Capa ============
  drawCover(doc, {
    title: 'Desempenho em Jogos',
    subtitle: modalityLabel ? `${modalityLabel}` : '',
    clubName: clubName || '',
    periodLabel: periodSub,
  });

  // ============ PÁGINA 2: Desempenho + Histórico de jogos + KPIs ============
  doc.addPage();
  let y = addTitleStrip(doc, { section: 'Desempenho', clubName });

  // Esquerda: tabela "Últimos Jogos Disputados"
  // Direita: 4 painéis de KPI (Pontos Disputados, Pontos Ganhos, Seq. Vitórias, Seq. Invicta/Empates)
  const totalW = pageW - M.left - M.right;
  const colGap = 4;
  const leftW = totalW * 0.62 - colGap / 2;
  const rightW = totalW * 0.38 - colGap / 2;

  // Subsection: histórico
  addSubsectionPill(doc, 'Últimos Jogos Disputados', y, { width: leftW });

  // Tabela: Rodada / Local / Jogo (placar embutido)
  const history = (gameStats.matchesHistory || []).slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const body = history.map((m) => [
    `${m.match_round || '—'}`,
    m.match_location === 'home' ? 'Casa' : m.match_location === 'away' ? 'Fora' : m.match_location === 'neutral' ? 'Neutro' : '—',
    // "ADV X×Y NOSSO" estilo U.E.C.: formato compacto baseado no local
    formatMatchLabel(m, clubName),
    m.result === 'win' ? 'V' : m.result === 'loss' ? 'D' : 'E',
  ]);

  autoTable(doc, {
    startY: y + 11,
    head: [['Rodada', 'Local', 'Jogo', 'Res.']],
    body,
    theme: 'plain',
    headStyles: {
      fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255,
      fontStyle: 'bold', fontSize: 9, cellPadding: 2,
    },
    bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.8, valign: 'middle' },
    alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: leftW - 18 - 18 - 14, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const t = data.cell.text[0];
        if (t === 'V') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.win);
        else if (t === 'D') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.loss);
        else if (t === 'E') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.draw);
      }
    },
    margin: { left: M.left, right: M.right + rightW + colGap },
    styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
  });
  const leftFinalY = doc.lastAutoTable.finalY;

  // ---- Direita: KPI panels grandes ----
  const w = gameStats.wins || 0, e = gameStats.draws || 0, l = gameStats.losses || 0;
  const pw = gameStats.pointsWon ?? (w * 3 + e);
  const pp = gameStats.pointsPlayed ?? ((w + e + l) * 3);
  const apr = pp > 0 ? ((pw / pp) * 100).toFixed(0) + '%' : '—';
  const kpiX = M.left + leftW + colGap;
  let kpiY = y + 11;
  const kpiH = 22;
  const kpiGap = 3;
  const kpis = [
    { label: 'Pontos\nDisputados', value: pp },
    { label: 'Pontos\nGanhos',     value: pw, valueColor: PDF_THEME.colors.win },
    { label: 'Sequência de\nVitórias',  value: gameStats.winStreak || 0 },
    { label: 'Sequência\nInvicta',     value: gameStats.unbeatenStreak || 0 },
    { label: 'Aproveitamento',     value: apr, valueColor: PDF_THEME.colors.primary },
  ];
  kpis.forEach((k) => {
    drawKpiPanel(doc, { x: kpiX, y: kpiY, w: rightW, h: kpiH, label: k.label, value: k.value, valueColor: k.valueColor });
    kpiY += kpiH + kpiGap;
  });

  // ============ PÁGINA 3: Gols Pró e Contra ============
  doc.addPage();
  y = addTitleStrip(doc, { section: 'Gols Pró e Contra', clubName });

  // 2 painéis pequenos à esquerda (Formas de Gols Feitos / Sofridos) + 1 grande à direita
  // (Gols por minuto). Como não temos chart engine no PDF, usamos barras horizontais SVG-feitas
  // diretamente no doc.

  const leftHalfW  = totalW * 0.42 - colGap / 2;
  const rightHalfW = totalW * 0.58 - colGap / 2;

  // ESQUERDA: dois quadros empilhados
  const leftBlockH = (pageH - y - M.bottom - 14 - 8) / 2 - 4;
  const gstY = y + 5;
  const gctY = gstY + leftBlockH + 8;

  drawBarChartBlock(doc, {
    x: M.left, y: gstY, w: leftHalfW, h: leftBlockH,
    title: 'Formas de Gols Feitos',
    items: aggregateByType(gameStats.goalsScoredByType || []),
  });

  drawBarChartBlock(doc, {
    x: M.left, y: gctY, w: leftHalfW, h: leftBlockH,
    title: 'Formas de Gols Sofridos',
    items: aggregateByType(gameStats.goalsConcededByType || []),
  });

  // DIREITA: gráfico de gols por minuto (lado a lado V/D)
  const rightX = M.left + leftHalfW + colGap;
  const rightH = pageH - y - M.bottom - 14;
  drawMinuteChartBlock(doc, {
    x: rightX, y: y + 5, w: rightHalfW, h: rightH,
    title: 'Gols Feitos e Sofridos por Período',
    scored:   gameStats.goalsScoredByMinute   || [],
    conceded: gameStats.goalsConcededByMinute || [],
  });

  // ============ PÁGINA 4: Destaques Individuais ============
  const hasScorers   = (gameStats.topScorers   || []).length > 0;
  const hasAssisters = (gameStats.topAssisters || []).length > 0;
  const hasMinutes   = (gameStats.topMinutes   || []).length > 0;
  if (hasScorers || hasAssisters || hasMinutes) {
    doc.addPage();
    y = addTitleStrip(doc, { section: 'Destaques Individuais', clubName });
    const cols = [hasScorers, hasAssisters, hasMinutes].filter(Boolean).length;
    const colW = (totalW - colGap * (cols - 1)) / cols;
    let cx = M.left;
    if (hasScorers) {
      drawIndividualBlock(doc, { x: cx, y: y + 5, w: colW, title: 'Artilharia', items: (gameStats.topScorers || []).slice(0, 10).map(p => ({ name: p.name, value: p.goals })) });
      cx += colW + colGap;
    }
    if (hasAssisters) {
      drawIndividualBlock(doc, { x: cx, y: y + 5, w: colW, title: 'Assistências', items: (gameStats.topAssisters || []).slice(0, 10).map(p => ({ name: p.name, value: p.assists })) });
      cx += colW + colGap;
    }
    if (hasMinutes) {
      drawIndividualBlock(doc, { x: cx, y: y + 5, w: colW, title: 'Minutagem', items: (gameStats.topMinutes || []).slice(0, 10).map(p => ({ name: p.name, value: `${p.minutes}min` })) });
    }
  }

  paginate(doc);
  const safe = (s) => String(s).replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  const fileName = `Desempenho_${safe(clubName)}_${safe(periodLabel || 'periodo')}.pdf`;
  deliverPdf(doc, fileName);
  } finally { resetColor(); }
}

// ---------- helpers ----------

function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Monta a string "ADV 0×1 NOSSO" / "NOSSO 1×2 ADV" estilo U.E.C. baseando no
// match_location. Usa o nome do clube ou um placeholder curto.
function formatMatchLabel(m, ourName) {
  const ours = (ourName || 'Nosso clube').toUpperCase();
  const opp  = (m.opponent || 'Adversário').toUpperCase();
  const g    = m.goals_scored ?? 0;
  const c    = m.goals_conceded ?? 0;
  if (m.match_location === 'away') return `${opp} ${c}×${g} ${ours}`;
  return `${ours} ${g}×${c} ${opp}`;
}

// Agrupa por nome (ex.: "Organização Ofensiva" → "Organização")
function aggregateByType(items) {
  // Mapeamento amigável do back-end → categoria curta (U.E.C. estilo)
  const MAP = {
    'offensive_org':        'Organização',
    'offensive_transition': 'Transição',
    'free_kick':            'Bola Parada',
    'corner':               'Bola Parada',
    'penalty':              'Penalti',
  };
  const out = new Map();
  for (const it of items) {
    const name = MAP[it.key || it.type] || it.name || it.label || 'Outros';
    out.set(name, (out.get(name) || 0) + (it.value || it.count || 0));
  }
  // Ordem fixa: Bola Parada, Penalti, Organização, Transição, Outros
  const ORDER = ['Bola Parada', 'Penalti', 'Organização', 'Transição', 'Outros'];
  return ORDER.map((k) => ({ name: k, value: out.get(k) || 0 }));
}

function drawBarChartBlock(doc, { x, y, w, h, title, items }) {
  // Pill verde com o título
  setFillHex(doc, PDF_THEME.colors.primary);
  doc.roundedRect(x, y, w * 0.85, 7, 1, 1, 'F');
  doc.setFont(PDF_THEME.fonts.family, 'bold');
  doc.setFontSize(10);
  setTextHex(doc, PDF_THEME.colors.light);
  doc.text(title.toUpperCase(), x + w * 0.425, y + 4.8, { align: 'center' });

  // Área do gráfico
  const chartY = y + 9;
  const chartH = h - 9 - 6;
  const labelH = 6;
  const innerH = chartH - labelH;
  const max = Math.max(1, ...items.map((i) => i.value));
  const barAreaW = w - 6;
  const barGap = 2;
  const barW = (barAreaW - barGap * (items.length - 1)) / items.length;

  // Eixo Y discreto: linhas de referência
  setDrawHex(doc, PDF_THEME.colors.border);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= 4; i++) {
    const lineY = chartY + (innerH * i) / 4;
    doc.line(x + 3, lineY, x + w - 3, lineY);
  }

  items.forEach((it, i) => {
    const bx = x + 3 + i * (barW + barGap);
    const bh = max > 0 ? (innerH * it.value) / max : 0;
    const by = chartY + (innerH - bh);
    const color = GOAL_TYPE_PALETTE[i % GOAL_TYPE_PALETTE.length];
    setFillHex(doc, color);
    doc.rect(bx, by, barW, bh, 'F');

    // Valor em cima
    if (it.value > 0) {
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(9);
      setTextHex(doc, PDF_THEME.colors.text);
      doc.text(String(it.value), bx + barW / 2, by - 1, { align: 'center' });
    }

    // Label
    doc.setFont(PDF_THEME.fonts.family, 'bold');
    doc.setFontSize(7);
    setTextHex(doc, PDF_THEME.colors.text);
    doc.text(it.name.toUpperCase(), bx + barW / 2, chartY + chartH - 1.5, { align: 'center' });
  });
}

function drawMinuteChartBlock(doc, { x, y, w, h, title, scored, conceded }) {
  setFillHex(doc, PDF_THEME.colors.primary);
  doc.roundedRect(x, y, w * 0.9, 7, 1, 1, 'F');
  doc.setFont(PDF_THEME.fonts.family, 'bold');
  doc.setFontSize(10);
  setTextHex(doc, PDF_THEME.colors.light);
  doc.text(title.toUpperCase(), x + w * 0.45, y + 4.8, { align: 'center' });

  // Legenda
  const legendY = y + 11;
  doc.setFont(PDF_THEME.fonts.family, 'bold');
  doc.setFontSize(8);
  // Verde — Gols Feitos
  setFillHex(doc, PDF_THEME.colors.win); doc.circle(x + 6, legendY, 1.4, 'F');
  setTextHex(doc, PDF_THEME.colors.text); doc.text('GOLS FEITOS', x + 9, legendY + 1);
  // Vermelho — Gols Sofridos
  setFillHex(doc, PDF_THEME.colors.loss); doc.circle(x + 50, legendY, 1.4, 'F');
  setTextHex(doc, PDF_THEME.colors.text); doc.text('GOLS SOFRIDOS', x + 53, legendY + 1);

  // Combina os ranges de minuto que existem em ambos os arrays
  const all = new Map();
  scored.forEach((p) => all.set(p.name || p.label || p.range, { feitos: p.value, sofridos: 0 }));
  conceded.forEach((p) => {
    const k = p.name || p.label || p.range;
    if (all.has(k)) all.get(k).sofridos = p.value;
    else all.set(k, { feitos: 0, sofridos: p.value });
  });
  const items = Array.from(all.entries()).map(([k, v]) => ({ name: k, ...v }));

  const chartY = legendY + 5;
  const chartH = h - (chartY - y) - 8;
  const labelH = 6;
  const innerH = chartH - labelH;
  const max = Math.max(1, ...items.flatMap((i) => [i.feitos, i.sofridos]));
  const barAreaW = w - 6;
  const groupGap = 1;
  const barGap = 0.6;
  const groupW = (barAreaW - groupGap * (items.length - 1)) / items.length;
  const barW = (groupW - barGap) / 2;

  setDrawHex(doc, PDF_THEME.colors.border);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= 4; i++) {
    const lineY = chartY + (innerH * i) / 4;
    doc.line(x + 3, lineY, x + w - 3, lineY);
  }

  items.forEach((it, i) => {
    const gx = x + 3 + i * (groupW + groupGap);
    // Feitos
    const fH = max > 0 ? (innerH * it.feitos) / max : 0;
    const fY = chartY + (innerH - fH);
    setFillHex(doc, PDF_THEME.colors.win);
    doc.rect(gx, fY, barW, fH, 'F');
    if (it.feitos > 0) {
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(7);
      setTextHex(doc, PDF_THEME.colors.text);
      doc.text(String(it.feitos), gx + barW / 2, fY - 0.5, { align: 'center' });
    }
    // Sofridos
    const sH = max > 0 ? (innerH * it.sofridos) / max : 0;
    const sY = chartY + (innerH - sH);
    setFillHex(doc, PDF_THEME.colors.loss);
    doc.rect(gx + barW + barGap, sY, barW, sH, 'F');
    if (it.sofridos > 0) {
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(7);
      setTextHex(doc, PDF_THEME.colors.text);
      doc.text(String(it.sofridos), gx + barW + barGap + barW / 2, sY - 0.5, { align: 'center' });
    }
    // Label rotacionado
    doc.setFont(PDF_THEME.fonts.family, 'normal');
    doc.setFontSize(6.5);
    setTextHex(doc, PDF_THEME.colors.textMuted);
    doc.text(String(it.name), gx + groupW / 2, chartY + chartH - 0.5, { align: 'center', angle: 0 });
  });
}

function drawIndividualBlock(doc, { x, y, w, title, items }) {
  // Pill verde com o título
  setFillHex(doc, PDF_THEME.colors.primary);
  doc.roundedRect(x, y, w, 8, 1, 1, 'F');
  doc.setFont(PDF_THEME.fonts.family, 'bold');
  doc.setFontSize(11);
  setTextHex(doc, PDF_THEME.colors.light);
  doc.text(title.toUpperCase(), x + w / 2, y + 5.4, { align: 'center' });

  autoTable(doc, {
    startY: y + 10,
    head: [['#', 'Jogador', 'Total']],
    body: items.map((p, i) => [i + 1, p.name || '—', String(p.value)]),
    theme: 'plain',
    headStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt), textColor: hexRgb(PDF_THEME.colors.text), fontStyle: 'bold', fontSize: 9, cellPadding: 2 },
    bodyStyles: { fontSize: 9.5, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 2 },
    alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surface) },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: x, right: doc.internal.pageSize.getWidth() - (x + w) },
    tableWidth: w,
    styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
  });
}
