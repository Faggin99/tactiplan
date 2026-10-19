// PDF "Estatísticas de Treino" — estilo U.E.C. (Série D 2026):
// landscape, title strip verde, KPIs grandes, tabelas com header verde.
//
// Substitui o estilo antigo (portrait com donuts canvas) por um layout mais
// focado em tabelas + KPIs — mais limpo e consistente com os outros PDFs.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { deliverPdf } from '../lib/deliverFile';
import {
  PDF_THEME,
  addTitleStrip,
  addSubsectionPill,
  drawKpiPanel,
  drawCover,
  paginate,
  applyClubPrimaryColor,
  setFillHex,
  setTextHex,
  setDrawHex,
} from './pdfTheme';
import { DIM_LABELS, DIM_ORDER } from './statsCharts';

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function formatMinutes(min) {
  if (!min) return '0min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

const MODALITY_LABELS = {
  football_11: 'Futebol 11',
  football_7:  'Futebol 7',
  futsal:      'Futsal',
};

function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function generateStatsPDF(stats, opts = {}) {
  const { periodLabel = '', clubName = '', modality = '', primaryColor = null } = opts;
  if (!stats) { alert('Sem dados pra exportar.'); return; }

  const resetColor = applyClubPrimaryColor(primaryColor);
  try {
  const doc = new jsPDF({ orientation: PDF_THEME.orientation, unit: 'mm', format: PDF_THEME.pageFormat });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = PDF_THEME.margins;
  const totalW = pageW - M.left - M.right;
  const colGap = 4;
  const modalityLabel = MODALITY_LABELS[modality] || '';

  // ============ PÁGINA 1: Capa ============
  const periodSub = (stats.range?.start && stats.range?.end)
    ? `${fmtDate(stats.range.start)} – ${fmtDate(stats.range.end)}`
    : periodLabel;
  drawCover(doc, {
    title: 'Estatísticas de Treino',
    subtitle: modalityLabel,
    clubName,
    periodLabel: periodSub,
  });

  // ============ PÁGINA 2: Resumo + Distribuição por Pilar ============
  doc.addPage();
  let y = addTitleStrip(doc, { section: 'Desempenho dos Treinos', clubName });

  // KPIs de cima (4 colunas)
  const kpiW = (totalW - colGap * 3) / 4;
  const kpiH = 22;
  const t = stats.totals || {};
  [
    { label: 'Sessões\nde Treino',  value: String(t.sessions || 0) },
    { label: 'Atividades\nRealizadas',value: String(t.activities || 0) },
    { label: 'Tempo Total\nTrabalhado',value: formatMinutes(t.minutes || 0) },
    { label: 'Atividades\nDistintas', value: String(t.uniqueTemplates || 0) },
  ].forEach((k, i) => {
    drawKpiPanel(doc, { x: M.left + i * (kpiW + colGap), y: y + 4, w: kpiW, h: kpiH, label: k.label, value: k.value });
  });
  y += kpiH + 9;

  // Distribuição por pilar
  const totalAct = t.activities || 1;
  const dimRows = DIM_ORDER
    .map((dk) => {
      const d = (stats.byDimension || []).find((x) => x.dimension === dk);
      if (!d) return null;
      const pres = (stats.byDimensionPresence || []).find((x) => x.dimension === dk);
      const pct = ((d.count / totalAct) * 100).toFixed(0);
      return [DIM_LABELS[dk] || dk, String(pres?.sessions || 0), String(d.count), `${pct}%`, formatMinutes(d.minutes)];
    })
    .filter(Boolean);

  if (dimRows.length > 0) {
    y = addSubsectionPill(doc, 'Distribuição por Pilar', y);
    autoTable(doc, {
      startY: y,
      head: [['Pilar', 'Sessões', 'Atividades', 'Participação', 'Tempo']],
      body: dimRows,
      theme: 'plain',
      headStyles: { fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255, fontStyle: 'bold', fontSize: 10, cellPadding: 2.4 },
      bodyStyles: { fontSize: 10, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 2.2 },
      alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
        4: { halign: 'right' },
      },
      margin: { left: M.left, right: M.right },
      styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
    });
  }

  // ============ PÁGINA 3: Top Conteúdos por Pilar ============
  const byContent = stats.byContent || [];
  if (byContent.length > 0) {
    doc.addPage();
    y = addTitleStrip(doc, { section: 'Top Conteúdos por Pilar', clubName });

    // 4 colunas (uma por pilar)
    const pilarCols = DIM_ORDER.filter((dk) => byContent.some((c) => c.dimension === dk));
    const cw = (totalW - colGap * (pilarCols.length - 1)) / Math.max(1, pilarCols.length);
    let cx = M.left;
    let maxFinalY = y + 4;
    pilarCols.forEach((dk) => {
      const items = byContent
        .filter((c) => c.dimension === dk)
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 10);
      // Pill verde com nome do pilar
      setFillHex(doc, PDF_THEME.colors.primary);
      doc.roundedRect(cx, y + 4, cw, 8, 1, 1, 'F');
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(11);
      setTextHex(doc, PDF_THEME.colors.light);
      doc.text((DIM_LABELS[dk] || dk).toUpperCase(), cx + cw / 2, y + 9.4, { align: 'center' });

      autoTable(doc, {
        startY: y + 14,
        head: [['#', 'Conteúdo', 'Ativ.']],
        body: items.map((c, i) => [i + 1, c.name || c.label || '—', String(c.count || 0)]),
        theme: 'plain',
        headStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt), textColor: hexRgb(PDF_THEME.colors.text), fontStyle: 'bold', fontSize: 9, cellPadding: 1.6 },
        bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.5 },
        alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surface) },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: cx, right: pageW - (cx + cw) },
        tableWidth: cw,
        styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
      });
      const fY = doc.lastAutoTable.finalY;
      if (fY > maxFinalY) maxFinalY = fY;
      cx += cw + colGap;
    });
  }

  paginate(doc);
  const safe = (s) => String(s || '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  deliverPdf(doc, `Estatisticas_Treino_${safe(clubName)}_${safe(periodLabel || 'periodo')}.pdf`);
  } finally { resetColor(); }
}
