// "Relatório do Clube" — PDF executivo consolidado pra mandar à diretoria.
// Estilo U.E.C. (landscape, pills verdes, KPIs grandes).
//
// Páginas:
//   1. Capa
//   2. Desempenho (KPIs grandes + histórico de jogos)
//   3. Treinos (distribuição por pilar + top conteúdos)
//   4. Plantel (por grupo)

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Entrega do PDF: no navegador baixa direto; no app nativo (Capacitor WebView o
// `doc.save()` não funciona) grava em Cache e abre a folha de compartilhamento.
async function deliverPdf(doc, filename) {
  const { isNative } = await import('../lib/platform');
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const dataUri = doc.output('datauristring'); // data:application/pdf;...;base64,XXXX
    const base64 = dataUri.slice(dataUri.indexOf('base64,') + 'base64,'.length);
    const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, url: written.uri, dialogTitle: 'Compartilhar relatório' });
    } catch (err) {
      // Usuário fechou o share sheet — não é erro
      if (!/cancel/i.test(String(err?.message || err))) throw err;
    }
    return;
  }
  doc.save(filename);
}

export async function generateClubReportPDF({
  athletes = [],
  trainingStats = null,
  gameStats = null,
  clubName = '',
  modality = '',
  periodFrom = '',
  periodTo = '',
  periodLabel = '',
  primaryColor = null,
} = {}) {
  const resetColor = applyClubPrimaryColor(primaryColor);
  try {
  const doc = new jsPDF({ orientation: PDF_THEME.orientation, unit: 'mm', format: PDF_THEME.pageFormat });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = PDF_THEME.margins;
  const totalW = pageW - M.left - M.right;
  const colGap = 4;
  const modalityLabel = MODALITY_LABELS[modality] || '';
  const periodSub = (periodFrom && periodTo) ? `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}` : periodLabel;

  // ============ PÁGINA 1: Capa ============
  drawCover(doc, {
    title: 'Relatório do Clube',
    subtitle: modalityLabel,
    clubName,
    periodLabel: periodSub,
  });

  // ============ PÁGINA 2: Desempenho ============
  if (gameStats && (gameStats.totalMatches || 0) > 0) {
    doc.addPage();
    let y = addTitleStrip(doc, { section: 'Desempenho', clubName });

    const w = gameStats.wins || 0, e = gameStats.draws || 0, l = gameStats.losses || 0;
    const pw = gameStats.pointsWon ?? (w * 3 + e);
    const pp = gameStats.pointsPlayed ?? ((w + e + l) * 3);
    const apr = pp > 0 ? ((pw / pp) * 100).toFixed(0) + '%' : '—';
    const gd = gameStats.goalDifference || 0;

    // 3 colunas de KPIs em cima
    const kpiW = (totalW - colGap * 2) / 3;
    const kpiH = 22;
    const kpiY = y + 4;
    const row1 = [
      { label: 'Jogos\nDisputados', value: gameStats.totalMatches || 0 },
      { label: 'Pontos\nGanhos', value: `${pw}/${pp}`, valueColor: PDF_THEME.colors.win },
      { label: 'Aproveitamento', value: apr, valueColor: PDF_THEME.colors.primary },
    ];
    row1.forEach((k, i) => {
      drawKpiPanel(doc, { x: M.left + i * (kpiW + colGap), y: kpiY, w: kpiW, h: kpiH, label: k.label, value: k.value, valueColor: k.valueColor });
    });
    const row2 = [
      { label: 'Vitórias·Empates·Derrotas', value: `${w}·${e}·${l}` },
      { label: 'Sequência V / Invicta', value: `${gameStats.winStreak || 0} / ${gameStats.unbeatenStreak || 0}` },
      { label: 'Saldo de Gols', value: (gd >= 0 ? '+' : '') + gd, valueColor: gd > 0 ? PDF_THEME.colors.win : gd < 0 ? PDF_THEME.colors.loss : PDF_THEME.colors.text },
    ];
    row2.forEach((k, i) => {
      drawKpiPanel(doc, { x: M.left + i * (kpiW + colGap), y: kpiY + kpiH + 3, w: kpiW, h: kpiH, label: k.label, value: k.value, valueColor: k.valueColor });
    });

    y = kpiY + 2 * kpiH + 6 + 4;

    // Tabela "Últimos jogos"
    const history = (gameStats.matchesHistory || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    if (history.length > 0) {
      y = addSubsectionPill(doc, 'Histórico de Jogos', y);
      autoTable(doc, {
        startY: y,
        head: [['Data', 'Rodada', 'Local', 'Adversário', 'Placar', 'Result.']],
        body: history.map((m) => [
          fmtDate(m.date),
          m.match_round || '—',
          m.match_location === 'home' ? 'Casa' : m.match_location === 'away' ? 'Fora' : m.match_location === 'neutral' ? 'Neutro' : '—',
          m.opponent || '—',
          `${m.goals_scored ?? 0}×${m.goals_conceded ?? 0}`,
          m.result === 'win' ? 'V' : m.result === 'loss' ? 'D' : 'E',
        ]),
        theme: 'plain',
        headStyles: { fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 2 },
        bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.8 },
        alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
        columnStyles: {
          0: { cellWidth: 26, halign: 'center' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const t = data.cell.text[0];
            if (t === 'V') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.win);
            else if (t === 'D') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.loss);
            else if (t === 'E') data.cell.styles.textColor = hexRgb(PDF_THEME.colors.draw);
          }
        },
        margin: { left: M.left, right: M.right },
        styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
      });
    }
  }

  // ============ PÁGINA 3: Treinos ============
  if (trainingStats && (trainingStats.totals?.activities || 0) > 0) {
    doc.addPage();
    let y = addTitleStrip(doc, { section: 'Treinos', clubName });

    const t = trainingStats.totals || {};
    const kpiW = (totalW - colGap * 2) / 3;
    const kpiH = 22;
    [
      { label: 'Sessões\nde Treino', value: t.sessions || 0 },
      { label: 'Atividades\nRealizadas', value: t.activities || 0 },
      { label: 'Minutos\nTrabalhados', value: t.minutes || 0 },
    ].forEach((k, i) => {
      drawKpiPanel(doc, { x: M.left + i * (kpiW + colGap), y: y + 4, w: kpiW, h: kpiH, label: k.label, value: k.value });
    });
    y += kpiH + 10;

    // Distribuição por dimensão
    const byDim = (trainingStats.byDimension || trainingStats.dimensions || []).slice()
      .sort((a, b) => (b.count || b.value || 0) - (a.count || a.value || 0));
    if (byDim.length > 0) {
      y = addSubsectionPill(doc, 'Distribuição por Pilar', y);
      const totalCount = byDim.reduce((s, d) => s + (d.count || d.value || 0), 0) || 1;
      autoTable(doc, {
        startY: y,
        head: [['Pilar', 'Atividades', 'Participação']],
        body: byDim.map((d) => [
          d.label || d.name || d.dimension || '—',
          String(d.count || d.value || 0),
          (((d.count || d.value || 0) / totalCount) * 100).toFixed(0) + '%',
        ]),
        theme: 'plain',
        headStyles: { fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 2 },
        bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.8 },
        alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
        columnStyles: {
          0: { cellWidth: 'auto', fontStyle: 'bold' },
          1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 40, halign: 'center' },
        },
        margin: { left: M.left, right: M.right + totalW / 2 + colGap / 2 },
        styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
      });
      const dimEndY = doc.lastAutoTable.finalY;

      // Top conteúdos do lado direito
      const byContent = (trainingStats.byContent || trainingStats.contents || []).slice()
        .sort((a, b) => (b.count || b.value || 0) - (a.count || a.value || 0))
        .slice(0, 10);
      if (byContent.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Conteúdo', 'Pilar', 'Atividades']],
          body: byContent.map((c) => [c.name || c.label || '—', c.dimensionLabel || c.dimension || '—', String(c.count || c.value || 0)]),
          theme: 'plain',
          headStyles: { fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 2 },
          bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.8 },
          alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 26, halign: 'center' },
            2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          },
          margin: { left: M.left + totalW / 2 + colGap / 2, right: M.right },
          styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
        });
      }
    }
  }

  // ============ PÁGINA 4: Plantel ============
  if (athletes.length > 0) {
    doc.addPage();
    let y = addTitleStrip(doc, { section: 'Plantel', clubName });

    const byGroup = { '1': [], '2': [], '3': [], 'Transição': [], 'DM': [], 'Sem grupo': [] };
    athletes.forEach((a) => {
      const k = ['1', '2', '3', 'Transição', 'DM'].includes(String(a.group)) ? String(a.group) : 'Sem grupo';
      byGroup[k].push(a);
    });
    const labels = { '1': 'Grupo 1', '2': 'Grupo 2', '3': 'Grupo 3', 'Transição': 'Transição', 'DM': 'DM', 'Sem grupo': 'Sem grupo' };
    const groupsWithPlayers = Object.entries(byGroup).filter(([, list]) => list.length > 0);
    const cols = Math.min(3, groupsWithPlayers.length);
    if (cols === 0) return;
    const colW = (totalW - colGap * (cols - 1)) / cols;
    let cx = M.left;
    let cyMax = y + 4;
    groupsWithPlayers.forEach(([key, list], idx) => {
      const cy = y + 4;
      // Pill verde
      setFillHex(doc, PDF_THEME.colors.primary);
      doc.roundedRect(cx, cy, colW, 8, 1, 1, 'F');
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(11);
      setTextHex(doc, PDF_THEME.colors.light);
      doc.text(`${labels[key]} (${list.length})`.toUpperCase(), cx + colW / 2, cy + 5.4, { align: 'center' });

      autoTable(doc, {
        startY: cy + 10,
        head: [['#', 'Camisa', 'Nome', 'Pos.']],
        body: list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map((p, i) => [i + 1, p.jersey_number || '-', p.name || '—', p.position || '—']),
        theme: 'plain',
        headStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt), textColor: hexRgb(PDF_THEME.colors.text), fontStyle: 'bold', fontSize: 8.5, cellPadding: 1.6 },
        bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.5 },
        alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surface) },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 12, halign: 'center' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: cx, right: pageW - (cx + colW) },
        tableWidth: colW,
        styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
      });
      const finalY = doc.lastAutoTable.finalY;
      if (finalY > cyMax) cyMax = finalY;
      cx += colW + colGap;
      // Se for múltiplo de cols, vai pra linha de baixo
      if ((idx + 1) % cols === 0 && idx + 1 < groupsWithPlayers.length) {
        cx = M.left;
        y = cyMax + 4;
      }
    });
  }

  paginate(doc);
  const safe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  await deliverPdf(doc, `Relatorio_${safe(clubName)}_${safe(periodLabel || 'periodo')}.pdf`);
  } finally { resetColor(); }
}
