import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { trainingService } from '../services/trainingService';
import { gameStatsService } from '../services/gameStatsService';
import { WeekSelector } from '../components/stats/WeekSelector';
import { TourGuide } from '../components/common/TourGuide';
import { useTour, useTourReplayListener } from '../hooks/useTour';
import { Calendar, Trophy } from 'lucide-react';
import { TrainingDashboard } from '../components/stats/TrainingDashboard';
import { GameStatsContent } from '../components/stats/GameStatsContent';
import { MonthlyThemeAdherenceCard } from '../components/stats/MonthlyThemeAdherenceCard';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { usePreference } from '../hooks/usePreference';
import { generateStatsExcel } from '../utils/statsExcel';
import { downloadReport, safeFileName } from '../services/reportsService';
import { useReportPhotosExport } from '../components/reports/useReportPhotosExport';
import { notify } from '../lib/notify';
import { ExportMenu } from '../components/common/ExportMenu';

export function TrainingStatsPage() {
  const { colors } = useTheme();
  // Exportar PDF de treino (1 microciclo com fotos) abre o modal "Fotos do relatório"
  const photoExport = useReportPhotosExport();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('training');
  const plan = usePlanFeatures();
  const [monthlyThemePref] = usePreference('pref_monthly_theme', 'disabled');
  const showThemeCard = plan.monthly_theme && monthlyThemePref === 'enabled';
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const tour = useTour('stats');
  useTourReplayListener('stats', () => tour.setIsOpen(true));
  const tourSteps = [
    { title: 'Estatísticas', content: 'Aqui você acompanha o que está sendo treinado e os jogos disputados.' },
    { selector: '[data-tour="stats-tabs"]', title: 'Treinos ou Jogos', content: 'Alterne entre estatísticas de treinos (dimensões, conteúdos, subconteúdos) e de jogos (gols, eventos).', placement: 'bottom' },
    { selector: '[data-tour="stats-filters"]', title: 'Períodos de análise', content: 'Filtre por 1 microciclo, últimas 4 semanas, semestre, ano ou período customizado.', placement: 'bottom' },
    { title: 'Donut + drill-down', content: 'O gráfico mostra a distribuição por pilar. Clique numa fatia (ou na legenda) pra ver os conteúdos daquela pilar. Se for Tático, também aparece um donut secundário com os submomentos.' },
    { title: 'Contagem vs Tempo', content: 'O toggle no topo da seção alterna entre "Nº atividades" (foco principal, quantas vezes apareceu) e "Tempo" (minutos trabalhados). O dashboard inteiro responde ao toggle.' },
    { title: 'Exportar relatório', content: 'O botão "Exportar" no canto superior gera o PDF (com gráficos plotados) ou Excel (com várias abas: Resumo, Pilar, Conteúdo, Submomentos, Top, Tendência) do período selecionado.' },
  ];

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [gameStats, setGameStats] = useState(null);
  const [filterType, setFilterType] = useState('1-micro');
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayNum = d.getDay() || 7;
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + (4 - dayNum));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    return `${thursday.getFullYear()}-${String(weekNo).padStart(2, '0')}`;
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function getWeekDateRange(weekIdentifier) {
    const [year, week] = weekIdentifier.split('-').map(Number);
    const startDate = getDateOfISOWeek(week, year);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] };
  }
  function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }
  function getWeeksInYearCount(year) {
    const lastWeek = new Date(year, 11, 31);
    const thursday = new Date(lastWeek);
    const dayOfWeek = lastWeek.getDay() || 7;
    thursday.setDate(lastWeek.getDate() + (4 - dayOfWeek));
    return thursday.getFullYear() === year ? 53 : 52;
  }
  function getSelectedWeekRange() {
    if (filterType !== '4-micros') return [];
    const [year, weekNum] = selectedWeek.split('-').map(Number);
    const range = [];
    for (let i = 0; i < 4; i++) {
      let cw = weekNum + i;
      let cy = year;
      let wiy = getWeeksInYearCount(cy);
      while (cw > wiy) { cw -= wiy; cy++; wiy = getWeeksInYearCount(cy); }
      range.push(`${cy}-${String(cw).padStart(2, '0')}`);
    }
    return range;
  }

  function getDateRangeParams() {
    let start_date, end_date;
    if (filterType === 'custom' || filterType === 'semester' || filterType === '1-year') {
      if (!startDate || !endDate) return null;
      start_date = startDate; end_date = endDate;
    } else if (filterType === '1-micro') {
      const r = getWeekDateRange(selectedWeek);
      start_date = r.start; end_date = r.end;
    } else if (filterType === '4-micros') {
      const r = getWeekDateRange(selectedWeek);
      start_date = r.start;
      const end = new Date(r.start);
      end.setDate(end.getDate() + (4 * 7) - 1);
      end_date = end.toISOString().split('T')[0];
    }
    return { start_date, end_date };
  }

  async function loadStats() {
    setLoading(true);
    try {
      const dr = getDateRangeParams();
      if (!dr) return;
      const params = { start_date: dr.start_date, end_date: dr.end_date, clubId: selectedClub?.id };
      const response = await trainingService.getStats(params);
      const data = response?.data || response;
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }
  async function loadGameStats() {
    setLoading(true);
    try {
      const dr = getDateRangeParams();
      if (!dr) return;
      const params = { start_date: dr.start_date, end_date: dr.end_date, clubId: selectedClub?.id };
      const data = await gameStatsService.getStats(params);
      setGameStats(data);
    } catch (err) {
      console.error('Error loading game stats:', err);
      setGameStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedClub?.id) {
      setStats(null); setGameStats(null); setLoading(true);
      if (filterType !== 'custom' && filterType !== 'semester' && filterType !== '1-year') {
        activeTab === 'training' ? loadStats() : loadGameStats();
      } else {
        setLoading(false);
      }
    }
  }, [selectedClub?.id]);

  useEffect(() => {
    if (selectedClub?.id && filterType !== 'custom' && filterType !== 'semester' && filterType !== '1-year') {
      activeTab === 'training' ? loadStats() : loadGameStats();
    }
  }, [filterType, selectedWeek, activeTab]);

  // Quando o usuário edita a data inicial manualmente, recalcula a final:
  // - 1 Ano: 1º jan → 31 dez do ano da data inicial
  // - Semestre: 1º jan → 30 jun OU 1º jul → 31 dez (semestre da data inicial)
  useEffect(() => {
    if (!startDate) return;
    const start = new Date(startDate + 'T00:00:00');
    const y = start.getFullYear();
    if (filterType === '1-year') {
      setEndDate(`${y}-12-31`);
    } else if (filterType === 'semester') {
      const firstHalf = start.getMonth() < 6;
      setEndDate(firstHalf ? `${y}-06-30` : `${y}-12-31`);
    }
  }, [filterType, startDate]);

  // Semestre / 1 Ano: auto-carrega quando o intervalo está pronto.
  // (Personalizado segue exigindo clique no "Buscar" pra evitar refetch a cada teclada.)
  useEffect(() => {
    if (!selectedClub?.id) return;
    if (filterType !== 'semester' && filterType !== '1-year') return;
    if (!startDate || !endDate) return;
    activeTab === 'training' ? loadStats() : loadGameStats();
  }, [filterType, startDate, endDate, activeTab, selectedClub?.id]);

  // Helper: ao trocar pra Semestre/1 Ano, pré-popula com a janela do ANO/SEMESTRE
  // VIGENTE (ano corrente: 1º jan → 31 dez; semestre: 1º jan→30 jun OU 1º jul→31 dez).
  // Usuário pode trocar a data inicial pra olhar anos anteriores se quiser.
  function pickRangeFilter(type) {
    setFilterType(type);
    if (type === '1-year') {
      const y = new Date().getFullYear();
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    } else if (type === 'semester') {
      const now = new Date();
      const y = now.getFullYear();
      const firstHalf = now.getMonth() < 6;
      setStartDate(firstHalf ? `${y}-01-01` : `${y}-07-01`);
      setEndDate(firstHalf ? `${y}-06-30` : `${y}-12-31`);
    }
  }

  // Styles
  const pageStyle = {
    // flex:1 — preenche a altura do main em telas altas (sem vazio embaixo).
    display: 'flex', flexDirection: 'column', minHeight: '100%', flex: 1,
    padding: isMobile ? '0.75rem 0.5rem' : '0.75rem 1rem', gap: '0.5rem',
  };
  const titleStyle = { fontSize: '1.25rem', fontWeight: 700, color: colors.text, margin: 0 };
  const filtersStyle = { display: 'flex', gap: isMobile ? '0.35rem' : '0.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 };
  const filterButtonStyle = (a) => ({
    padding: '0.4rem 0.75rem',
    border: `1px solid ${a ? colors.primary : colors.border}`,
    borderRadius: '0.375rem',
    backgroundColor: a ? colors.primary : colors.background,
    color: a ? colors.primaryText : colors.text,
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
  });
  const tabStyle = (a) => ({
    padding: '0.4rem 0.75rem', border: 'none',
    borderBottom: `2px solid ${a ? colors.primary : 'transparent'}`,
    backgroundColor: 'transparent', color: a ? colors.primary : colors.textSecondary,
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: '0.35rem',
  });
  const inputStyle = {
    padding: '0.4rem 0.6rem', border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem', backgroundColor: colors.background, color: colors.text, fontSize: '0.8rem',
  };
  // Estilos passados pra GameStatsContent
  const statsGridStyle = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0.75rem', flexShrink: 0 };
  const statCardStyle = { padding: '0.75rem', backgroundColor: colors.surface, borderRadius: '0.5rem', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '0.5rem' };
  const statIconStyle = { width: '36px', height: '36px', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}15`, color: colors.primary, flexShrink: 0 };
  const statContentStyle = { flex: 1, minWidth: 0 };
  const statLabelStyle = { fontSize: isMobile ? '0.8rem' : '0.7rem', color: colors.textSecondary, marginBottom: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const statValueStyle = { fontSize: isMobile ? '1.35rem' : '1.25rem', fontWeight: 700, color: colors.text, lineHeight: 1 };
  // flex:1 + auto-rows 1fr: os cards de gráfico esticam pra preencher a altura
  // que sobrar (telas altas), em vez de deixar um vazio com só o fundo.
  const chartsGridStyle = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gridAutoRows: '1fr', gap: '0.75rem', flex: 1, minHeight: 0 };
  const chartCardStyle = { padding: '0.75rem', display: 'flex', flexDirection: 'column', minHeight: '280px', position: 'relative' };
  const chartTitleStyle = { fontSize: '0.875rem', fontWeight: 600, color: colors.text, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 };
  const chartContentStyle = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'visible' };

  if (loading && !stats && !gameStats) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '3rem', color: colors.textSecondary }}>
          Carregando estatísticas...
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <TourGuide isOpen={tour.isOpen} onClose={tour.stop} steps={tourSteps} storageKey={tour.storageKey} />
      {photoExport.modal}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h1 style={titleStyle}>Estatísticas</h1>
          <div data-tour="stats-tabs" style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.border}` }}>
            <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>
              <Calendar size={16} /> Treino
            </button>
            <button style={tabStyle(activeTab === 'game')} onClick={() => setActiveTab('game')}>
              <Trophy size={16} /> Jogos
            </button>
          </div>
        </div>
        {(() => {
          const periodLabels = {
            '1-micro': '1 Microciclo', '4-micros': '4 Microciclos',
            'semester': 'Semestre', '1-year': '1 Ano', 'custom': 'Personalizado',
          };
          const exportOpts = {
            periodLabel: periodLabels[filterType] || '',
            clubName: selectedClub?.name || '',
            modality: selectedClub?.modality || '',
            periodFrom: startDate,
            periodTo:   endDate,
            primaryColor: selectedClub?.primary_color || null,
          };
          // PDF gerado no servidor (mesmos dados da tela, layout novo, fotos na semana)
          const exportPdf = async (tipo) => {
            const dr = getDateRangeParams();
            if (!dr || !selectedClub?.id) return;
            const prefix = tipo === 'jogos' ? 'Desempenho' : 'Estatisticas_Treino';
            try {
              await (tipo === 'treino' ? photoExport.start : downloadReport)(tipo, {
                club_id: selectedClub.id,
                start_date: dr.start_date,
                end_date: dr.end_date,
                filter_type: filterType,
                period_label: exportOpts.periodLabel,
              }, `${prefix}_${safeFileName(exportOpts.clubName)}_${safeFileName(exportOpts.periodLabel || 'periodo')}.pdf`);
            } catch (err) {
              notify.error(err.message || 'Não foi possível gerar o PDF.');
            }
          };
          if (activeTab === 'training' && stats && (stats.totals?.activities > 0 || stats.distance?.daysWithData > 0)) {
            return (
              <ExportMenu
                onExportPDF={() => exportPdf('treino')}
                onExportExcel={() => generateStatsExcel(stats, exportOpts)}
              />
            );
          }
          if (activeTab === 'game' && gameStats && (gameStats.totalMatches || 0) > 0) {
            return (
              <ExportMenu
                onExportPDF={() => exportPdf('jogos')}
                onExportExcel={null}
              />
            );
          }
          return null;
        })()}
      </div>

      <div style={filtersStyle} data-tour="stats-filters">
        <button style={filterButtonStyle(filterType === '1-micro')} onClick={() => setFilterType('1-micro')}>1 Microciclo</button>
        <button style={filterButtonStyle(filterType === '4-micros')} onClick={() => setFilterType('4-micros')}>4 Microciclos</button>
        <button style={filterButtonStyle(filterType === 'semester')} onClick={() => pickRangeFilter('semester')}>Semestre</button>
        <button style={filterButtonStyle(filterType === '1-year')} onClick={() => pickRangeFilter('1-year')}>1 Ano</button>
        <button style={filterButtonStyle(filterType === 'custom')} onClick={() => setFilterType('custom')}>Personalizado</button>
      </div>

      {filterType === '1-micro' || filterType === '4-micros' ? (
        <WeekSelector
          value={selectedWeek}
          onChange={setSelectedWeek}
          selectedRange={getSelectedWeekRange()}
          rangeCount={filterType === '4-micros' ? 4 : 1}
          label={filterType === '1-micro' ? 'Semana' : 'Primeira semana'}
        />
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: colors.textSecondary, fontWeight: 500 }}>
            {filterType === 'custom' ? 'Período:' : 'Data inicial:'}
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value) {
                const start = new Date(e.target.value);
                const end = new Date(start);
                if (filterType === 'semester') end.setMonth(end.getMonth() + 6);
                else if (filterType === '1-year') end.setFullYear(end.getFullYear() + 1);
                setEndDate(end.toISOString().split('T')[0]);
              }
            }}
            style={inputStyle}
          />
          {(filterType === 'semester' || filterType === '1-year') && startDate && (
            <>
              <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>até</span>
              <span style={{ fontSize: '0.875rem', color: colors.text, fontWeight: 500 }}>
                {new Date(endDate).toLocaleDateString('pt-BR')}
              </span>
            </>
          )}
          {filterType === 'custom' && (
            <>
              <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>até</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </>
          )}
          <button
            onClick={() => (activeTab === 'training' ? loadStats() : loadGameStats())}
            disabled={!startDate || !endDate}
            style={{
              padding: '0.4rem 0.75rem',
              border: `1px solid ${colors.primary}`,
              borderRadius: '0.375rem',
              backgroundColor: (!startDate || !endDate) ? colors.background : colors.primary,
              color: (!startDate || !endDate) ? colors.textSecondary : '#fff',
              cursor: (!startDate || !endDate) ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem', fontWeight: 500,
              opacity: (!startDate || !endDate) ? 0.5 : 1,
            }}
          >
            Buscar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeTab === 'training' && showThemeCard && selectedClub?.id && (
          <MonthlyThemeAdherenceCard clubId={selectedClub.id} month={currentMonth} />
        )}
        {activeTab === 'training' && (
          <TrainingDashboard stats={stats} colors={colors} />
        )}
        {activeTab === 'game' && (
          <GameStatsContent
            gameStats={gameStats}
            loading={loading}
            colors={colors}
            statsGridStyle={statsGridStyle}
            statCardStyle={statCardStyle}
            statIconStyle={statIconStyle}
            statContentStyle={statContentStyle}
            statLabelStyle={statLabelStyle}
            statValueStyle={statValueStyle}
            chartsGridStyle={chartsGridStyle}
            chartCardStyle={chartCardStyle}
            chartTitleStyle={chartTitleStyle}
            chartContentStyle={chartContentStyle}
          />
        )}
      </div>
    </div>
  );
}
