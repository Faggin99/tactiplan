import { newWorkbook, addFormattedSheet, addSummarySheet, saveWorkbook, formatMinutes } from './excelTheme';
import { notify } from '../lib/notify';
import { formatKm } from './distancia';

const DIM_LABELS = { tatico: 'Tático', tecnico: 'Técnico', fisico: 'Físico', mental: 'Mental' };
const DIM_ORDER = ['tatico', 'fisico', 'tecnico', 'mental'];

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// Helper: dado um índice de coluna (1-based), retorna a letra Excel (A, B, ..., Z, AA, ...)
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const MODALITY_LABELS_XLSX = {
  football_11: 'Futebol 11',
  football_7:  'Futebol 7',
  futsal:      'Futsal',
};

export function generateStatsExcel(stats, opts = {}) {
  const { periodLabel = '', clubName = '', modality = '' } = opts;
  if (!stats) { notify.info('Sem dados pra exportar.'); return; }

  const wb = newWorkbook({ title: 'Estatísticas de Treino' });
  const periodStr = `${fmtDate(stats.range?.start)} – ${fmtDate(stats.range?.end)}`;
  const modalityLabel = MODALITY_LABELS_XLSX[modality] || '';

  addSummarySheet(wb, {
    title: 'Estatísticas de Treino',
    period: `${periodLabel} (${periodStr})`,
    club: modalityLabel ? `${clubName} (${modalityLabel})` : clubName,
    totals: [
      ['Atividades', stats.totals?.activities || 0],
      ['Tempo total', formatMinutes(stats.totals?.minutes || 0)],
      ['Sessões', stats.totals?.sessions || 0],
      ['Sessões com atividade', stats.sessionsWithActivity || 0],
      ['Atividades distintas', stats.totals?.uniqueTemplates || 0],
      ...(stats.distance?.daysWithData > 0 ? [
        ['Distância ideal', `${formatKm(stats.distance.avgKm, 2)} km (${stats.distance.daysWithData} dias com registro)`],
        ['Distância acumulada por jogador', `${formatKm(stats.distance.totalKm, 2)} km`],
      ] : []),
    ],
  });

  // Por Pilar — Sessões (presença) + Atividades + Tempo
  const totalAct = stats.totals?.activities || 1;
  const dimRows = DIM_ORDER
    .map((dk) => {
      const d = (stats.byDimension || []).find((x) => x.dimension === dk);
      if (!d) return null;
      const presD = (stats.byDimensionPresence || []).find((x) => x.dimension === dk);
      const pct = ((d.count / totalAct) * 100).toFixed(1) + '%';
      return [
        DIM_LABELS[dk],
        Number(presD?.sessions || 0),
        d.count,
        pct,
        d.minutes,
        formatMinutes(d.minutes),
      ];
    })
    .filter(Boolean);
  addFormattedSheet(wb, 'Por Pilar',
    ['Pilar', 'Sessões', 'Atividades', '%', 'Tempo (min)', 'Tempo'],
    dimRows,
    {
      widths: [16, 14, 14, 10, 14, 16],
      title: 'Distribuição por Pilar (Sessões = em quantas sessões o pilar apareceu)',
      columnAlignments: ['left', 'center', 'center', 'center', 'right', 'right'],
    });

  // Por Sessão — presença binária (frequência por sessão)
  const presList = stats.byContentPresence || [];
  if (presList.length > 0) {
    addFormattedSheet(wb, 'Por Sessão',
      ['Conteúdo', 'Pilar', 'Sessões'],
      presList.map((p) => [p.name, DIM_LABELS[p.dimension] || p.dimension, Number(p.sessions)]),
      {
        widths: [30, 16, 14],
        title: 'Conteúdo por sessão (1× por sessão em que apareceu)',
        columnAlignments: ['left', 'left', 'right'],
      });
  }

  // Por Conteúdo
  const contentRows = (stats.byContent || []).map((c) => [
    DIM_LABELS[c.dimension] || c.dimension,
    c.name,
    c.count,
    c.minutes,
    formatMinutes(c.minutes),
  ]);
  addFormattedSheet(wb, 'Por Conteúdo',
    ['Pilar', 'Conteúdo', 'Atividades', 'Tempo (min)', 'Tempo'],
    contentRows,
    {
      widths: [14, 30, 14, 14, 16],
      title: 'Distribuição por Conteúdo',
      columnAlignments: ['left', 'left', 'center', 'right', 'right'],
    });

  // Submomentos (Tático) — sem tempo: dividir minutos distorce; somar duplica.
  const subs = (stats.bySubcontent || []).filter((s) => s.dimension === 'tatico');
  const sortedSubs = [...subs].sort((a, b) => b.count - a.count);
  if (sortedSubs.length > 0) {
    addFormattedSheet(wb, 'Submomentos',
      ['Submomento', 'Aparições'],
      sortedSubs.map((s) => [s.name, s.count]),
      {
        widths: [36, 18],
        title: 'Submomentos do Tático',
        columnAlignments: ['left', 'center'],
      });
  }

  // Presença de submomentos por sessão (binária — quantas sessões trabalharam cada)
  const subPresence = stats.bySubcontentPredominance || [];
  if (subPresence.length > 0) {
    addFormattedSheet(wb, 'Submomentos por Sessão',
      ['Submomento', 'Sessões'],
      subPresence.map((s) => [s.name, Number(s.sessions || 0)]),
      {
        widths: [36, 18],
        title: 'Submomentos: presença por sessão',
        columnAlignments: ['left', 'center'],
      });
  }

  // Top Atividades
  const tops = stats.topTitles || [];
  if (tops.length > 0) {
    addFormattedSheet(wb, 'Top Atividades',
      ['#', 'Atividade', 'Pilar', 'Usos', 'Tempo (min)', 'Tempo'],
      tops.map((t, i) => [i + 1, t.title, DIM_LABELS[t.dimension] || '', t.count, t.minutes, formatMinutes(t.minutes)]),
      {
        widths: [6, 36, 14, 10, 14, 16],
        title: 'Atividades mais usadas',
        columnAlignments: ['center', 'left', 'left', 'center', 'right', 'right'],
      });
  }

  // Tendência (gráfico stackado nativo)
  const trend = stats.trend || [];
  if (trend.length > 0) {
    addFormattedSheet(wb, 'Tendência',
      ['Período', 'Início', 'Fim', 'Atividades', 'Tempo (min)', 'Tático', 'Físico', 'Técnico', 'Mental'],
      trend.map((b) => [
        b.period, fmtDate(b.startDate), fmtDate(b.endDate),
        b.total, b.minutes,
        b.byDimension?.tatico || 0,
        b.byDimension?.fisico || 0,
        b.byDimension?.tecnico || 0,
        b.byDimension?.mental || 0,
      ]),
      {
        widths: [12, 14, 14, 14, 14, 12, 12, 12, 12],
        title: 'Tendência no período',
        orientation: 'landscape',
        columnAlignments: ['center', 'center', 'center', 'center', 'right', 'center', 'center', 'center', 'center'],
      });
  }

  // Distância ideal (série do gráfico + lista por dia)
  const dist = stats.distance;
  const distSeries = dist?.daysWithData > 0 ? (dist.series || []) : [];
  const distPorSemana = dist?.granularity === 'week';
  if (distSeries.length > 0) {
    addFormattedSheet(wb, 'Distância',
      [distPorSemana ? 'Semana' : 'Dia', 'Início', 'Fim', 'Dias com registro', 'Distância ideal (km)'],
      distSeries.map((s) => [s.label, fmtDate(s.start), fmtDate(s.end), s.days, Number(s.avgKm)]),
      {
        widths: [12, 14, 14, 18, 22],
        title: `Distância ideal ${distPorSemana ? 'por semana' : 'por dia de treino'} · média do período ${formatKm(dist.avgKm, 2)} km`,
        columnAlignments: ['center', 'center', 'center', 'center', 'right'],
      });
    if (distPorSemana && (dist.byDay || []).length > 0) {
      addFormattedSheet(wb, 'Distância por dia',
        ['Data', 'Distância ideal (km)'],
        dist.byDay.map((d) => [fmtDate(d.date), Number(d.km)]),
        { widths: [14, 22], title: 'Distância ideal — dias com registro', columnAlignments: ['center', 'right'] });
    }
  }

  // ─────────── Charts nativos (injetados via OOXML) ───────────
  const chartSpecs = [];

  if (distSeries.length > 0) {
    const lastRow = 1 + distSeries.length;
    chartSpecs.push({
      sheetName: 'Distância',
      type: 'stackedColumn',
      title: 'Distância ideal (km)',
      catRange: `$A$2:$A$${lastRow}`,
      seriesList: [{ name: 'Distância ideal (km)', range: `$E$2:$E$${lastRow}`, color: 'F59E0B' }],
      anchor: { from: { col: 6, row: 1 }, to: { col: 16, row: 18 } },
    });
  }

  // Donut porPilar na aba "Por Pilar"
  if (dimRows.length > 0) {
    const lastRow = 1 + dimRows.length; // header + N
    chartSpecs.push({
      sheetName: 'Por Pilar',
      type: 'pie',
      title: 'Distribuição por Pilar',
      catRange: `$A$2:$A$${lastRow}`,
      valRange: `$B$2:$B$${lastRow}`,
      anchor: { from: { col: 6, row: 1 }, to: { col: 14, row: 18 } },
    });
  }

  // Donut Submomentos na aba "Submomentos"
  if (sortedSubs.length > 0) {
    const lastRow = 1 + sortedSubs.length;
    chartSpecs.push({
      sheetName: 'Submomentos',
      type: 'pie',
      title: 'Submomentos do Tático',
      catRange: `$A$2:$A$${lastRow}`,
      valRange: `$B$2:$B$${lastRow}`,
      anchor: { from: { col: 5, row: 1 }, to: { col: 13, row: 18 } },
    });
  }

  // Stacked column Tendência na aba "Tendência"
  if (trend.length > 0) {
    const lastRow = 1 + trend.length;
    chartSpecs.push({
      sheetName: 'Tendência',
      type: 'stackedColumn',
      title: 'Tendência no período',
      catRange: `$A$2:$A$${lastRow}`,
      seriesList: [
        { name: 'Tático',  range: `$F$2:$F$${lastRow}`, color: '3B82F6' },
        { name: 'Físico',  range: `$G$2:$G$${lastRow}`, color: 'F59E0B' },
        { name: 'Técnico', range: `$H$2:$H$${lastRow}`, color: 'A855F7' },
        { name: 'Mental',  range: `$I$2:$I$${lastRow}`, color: '10B981' },
      ],
      anchor: { from: { col: 10, row: 1 }, to: { col: 22, row: 18 } },
    });
  }

  const safe = (periodLabel || 'periodo').replace(/[^a-zA-Z0-9-]/g, '_');
  saveWorkbook(wb, `estatisticas_${safe}_${stats.range?.start || ''}.xlsx`, chartSpecs);
}
