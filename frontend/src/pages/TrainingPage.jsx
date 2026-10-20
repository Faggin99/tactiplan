import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Moon, Trophy } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { Tooltip } from '../components/common/Tooltip';
import { UnifiedTrainingModal } from '../components/training/UnifiedTrainingModal';
import { TrainingSummaryModal } from '../components/training/TrainingSummaryModal';
import { CreateTitleModal } from '../components/training/CreateTitleModal';
import { SessionTypeModal } from '../components/training/SessionTypeModal';
import { GameModal } from '../components/training/GameModal';
import { WeekSelector } from '../components/stats/WeekSelector';
import { trainingService } from '../services/trainingService';
import { MonthlyThemeBanner } from '../components/training/MonthlyThemeBanner';
import { themeService } from '../services/themeService';
import { usePreference } from '../hooks/usePreference';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { TourGuide } from '../components/common/TourGuide';
import { useTour, useTourReplayListener } from '../hooks/useTour';
import { notify } from '../lib/notify';
import { useCan } from '../hooks/useCan';
import { formatKm, toKm } from '../utils/distancia';
import { ExportMenu } from '../components/common/ExportMenu';
import { downloadReport, safeFileName } from '../services/reportsService';

export function TrainingPage() {
  const { colors } = useTheme();
  // Membro sem "Editar treinos": vê o resumo do dia no lugar do formulário
  // e recebe um aviso de como pedir a permissão (em vez de erro ao salvar).
  const { can } = useCan();
  const podeEditarTreino = can('training:edit');
  const { selectedClub } = useClub();
  const isMobile = useIsMobile();
  const [monthlyThemePref] = usePreference('pref_monthly_theme', 'disabled');
  const plan = usePlanFeatures();
  const showMonthlyTheme = monthlyThemePref === 'enabled' && plan.monthly_theme;
  const tour = useTour('training');
  useTourReplayListener('training', () => tour.setIsOpen(true));

  const isMobileDevice = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const tourSteps = [
    {
      title: 'Bem-vindo ao TactiPlan!',
      content: 'Vamos te mostrar rapidinho como funciona a tela de treinos. Você pode pular a qualquer momento usando ESC, ou navegar com as setas do teclado.',
    },
    {
      selector: '[data-tour="week-selector"]',
      title: 'Seletor de microciclo',
      content: 'Aqui você navega entre semanas. Cada microciclo tem 7 sessões — uma por dia. Use as setas para ir pra semanas anteriores ou futuras.',
      placement: 'bottom',
    },
    ...(showMonthlyTheme ? [{
      selector: '[data-tour="monthly-theme"]',
      title: 'Tema do mês',
      content: 'Defina um foco tático para o mês (ex: "Saída de bola"). A plataforma acompanha automaticamente quanto dos seus treinos estão aderindo ao tema. Você pode desligar essa feature em Configurações → Preferências.',
      placement: 'bottom',
    }] : []),
    {
      selector: '[data-tour="calendar"]',
      title: 'Calendário da semana',
      content: isMobileDevice
        ? 'Cada coluna é um dia. Toque num dia pra abrir as atividades. Pressione e segure (long-press) um dia pra mudar o tipo de sessão (Treino, Jogo, Descanso).'
        : 'Cada coluna é um dia. Clique em um dia pra abrir as atividades. Clique direito num dia pra trocar o tipo de sessão (Treino, Jogo, Descanso).',
      placement: 'top',
    },
    {
      title: 'Cadastrando uma atividade',
      content: 'Vou abrir o modal de uma sessão pra você ver como funciona. Clique em "Próximo".',
      beforeEnter: () => {
        // Pega primeira sessão de treino do microcycle atual (com fallback pra primeira sessão)
        const firstTraining = microcycle?.sessions?.find((s) => s.session_type === 'training' || !s.session_type);
        const targetSession = firstTraining || microcycle?.sessions?.[0];
        if (targetSession) {
          setSelectedSession(targetSession);
          setShowUnifiedModal(true);
        }
      },
      waitForSelector: '[data-tour="unified-modal-body"]',
      waitMs: 250,
    },
    {
      selector: '[data-tour="unified-modal-body"]',
      title: 'Estrutura do dia',
      content: 'Aqui dentro você vê os blocos da sessão (Aquecimento, Preparatório, Atividade 1, 2, 3, Complementar). Clique nas abas pra trocar entre blocos.',
      placement: 'auto',
    },
    {
      title: 'Pilar + Conteúdo + Submomentos',
      content: 'Em cada bloco escolha o Pilar (Tático/Físico/Técnico/Mental), depois o Conteúdo daquele pilar. Se for Tático, aparecem também os Submomentos (OO, OD, TO, TD, BPO, BPD). Em seguida selecione a Atividade.',
      placement: 'auto',
    },
    {
      title: 'Fechando o modal',
      content: 'Vou fechar pra continuar com o calendário. Próximo →',
      afterLeave: () => setShowUnifiedModal(false),
    },
    {
      title: 'Trocando treino por jogo',
      content: isMobileDevice
        ? 'Pressione e segure (long-press) um dia → "Mudar tipo de sessão" → escolha Jogo. Aí você define adversário, escala titulares/reservas e registra eventos em tempo real.'
        : 'Clique direito num dia → "Mudar tipo de sessão" → Jogo. Você define adversário, escala titulares/reservas e registra eventos. A convocação sai em PDF/Excel pelo botão Exportar do modal.',
    },
    {
      title: 'Detalhes do jogo: campeonato, rodada, local e vídeo',
      content: 'Dentro do modal de Jogo você pode marcar de qual campeonato é o jogo (cadastre os campeonatos antes em Minha Equipe → Campeonatos), informar a rodada, se foi em Casa, Fora ou Neutro, e colar a URL de vídeo do jogo. Esses dados aparecem depois em Estatísticas → Jogos, com cálculo automático de aproveitamento, sequência de vitórias e invicta — estilo PDF de desempenho de clube profissional.',
    },
    {
      title: 'Escalação no campo (Lineup)',
      content: 'No modal de Jogo, na coluna de jogadores, há um toggle "Lista / Campo". O modo Campo desenha os titulares nas posições que estão cadastradas no plantel (futebol 11/7 ou quadra de futsal). Útil pra revisar a escalação visualmente antes de salvar.',
    },
    {
      title: 'Exportações',
      content: 'Em vários lugares (Plantel, Convocação, Resumo do dia, Estatísticas) você verá o botão "Exportar" — escolha entre PDF (pra imprimir/compartilhar) ou Excel (pra editar/filtrar). Os PDFs seguem layout padronizado TactiPlan.',
    },
    {
      title: 'Próximos passos',
      content: 'Explore o menu: Estatísticas (gráficos por pilar/conteúdo), Cadastros (Plantel, Conteúdos, Atividades) e Quadro Tático. Pra revisitar este tour, vá em Configurações → Preferências → Ver tutorial.',
    },
  ];
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    // Default to today's day index (0=Mon, 6=Sun)
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1;
  });
  const [currentWeek, setCurrentWeek] = useState(() => {
    // Try to load saved week from localStorage
    const savedWeek = localStorage.getItem('selectedTrainingWeek');
    if (savedWeek) {
      try {
        const { startDate } = JSON.parse(savedWeek);
        const week = getWeekInfo(new Date(startDate));
        console.log('Loaded week from localStorage:', week);
        return week;
      } catch (e) {
        console.log('Error parsing saved week, using current week:', e);
        // If parsing fails, fall back to current week
        return getWeekInfo(new Date());
      }
    }
    console.log('No saved week, using current week');
    const currentWeekInfo = getWeekInfo(new Date());
    console.log('Current week:', currentWeekInfo);
    return currentWeekInfo;
  });
  const [microcycle, setMicrocycle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState(0);
  const [showCreateTitle, setShowCreateTitle] = useState(false);
  const [showSessionTypeModal, setShowSessionTypeModal] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [microcycleCache, setMicrocycleCache] = useState({});
  const [themeContentIds, setThemeContentIds] = useState([]);

  // Get current month from the microcycle start date
  const currentMonth = (() => {
    if (microcycle?.start_date) {
      const [y, m] = microcycle.start_date.split('-');
      return `${y}-${m}`;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Load microcycle when week or club changes
  useEffect(() => {
    if (selectedClub?.id) {
      loadMicrocycle();
    }
  }, [currentWeek, selectedClub?.id]);

  // Clear cache and reload when club changes
  useEffect(() => {
    if (selectedClub?.id) {
      console.log('Club changed, clearing cache and reloading:', selectedClub.id);
      setMicrocycleCache({});
      setMicrocycle(null); // Clear current microcycle immediately
      loadMicrocycle(true); // Force reload from server
    }
  }, [selectedClub?.id]);

  // Save selected week to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedTrainingWeek', JSON.stringify({
      identifier: currentWeek.identifier,
      startDate: currentWeek.startDate.toISOString(),
    }));
  }, [currentWeek]);

  // Load theme content IDs for block highlighting
  useEffect(() => {
    if (selectedClub?.id && currentMonth) {
      themeService.getTheme(currentMonth, selectedClub.id)
        .then(theme => {
          if (theme && theme.primary_content_id) {
            const ids = [theme.primary_content_id];
            if (theme.secondary_content_id) ids.push(theme.secondary_content_id);
            setThemeContentIds(ids);
          } else {
            setThemeContentIds([]);
          }
        })
        .catch(() => setThemeContentIds([]));
    }
  }, [selectedClub?.id, currentMonth]);

  async function loadMicrocycle(forceReload = false) {
    // Require club to be selected
    if (!selectedClub?.id) {
      console.log('No club selected, skipping load');
      setMicrocycle(null);
      setInitialLoad(false);
      return;
    }

    // Check cache first (skip if forceReload) - include club in cache key
    const cacheKey = `${selectedClub.id}-${currentWeek.identifier}`;
    if (!forceReload && microcycleCache[cacheKey]) {
      console.log('Loading from cache:', cacheKey);
      setMicrocycle(microcycleCache[cacheKey]);
      setInitialLoad(false);
      return;
    }

    console.log('Loading microcycle:', cacheKey);
    setLoading(true);
    try {
      const response = await trainingService.getMicrocycle(currentWeek.identifier, selectedClub.id);
      const microcycleData = response.data; // Extract data from { data: microcycle }
      console.log('Microcycle loaded:', microcycleData);
      setMicrocycle(microcycleData);
      // Cache the result
      setMicrocycleCache(prev => ({
        ...prev,
        [cacheKey]: microcycleData,
      }));
    } catch (error) {
      console.error('Error loading microcycle:', error);
      setMicrocycle(null); // Clear microcycle on error
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }

  function getWeekInfo(date) {
    // Use local date (Brazil timezone) for week calculation
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNum = d.getDay() || 7; // Get day of week (1=Mon, 7=Sun)

    // Adjust to Thursday of current week for ISO week calculation
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + (4 - dayNum));

    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);

    return {
      year: thursday.getFullYear(),
      week: weekNo,
      identifier: `${thursday.getFullYear()}-${String(weekNo).padStart(2, '0')}`,
      startDate: getMonday(date),
    };
  }

  function getMonday(d) {
    // Get Monday of the week in local timezone (Brazil)
    const date = new Date(d);
    const day = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0); // Set to start of day
    return monday;
  }

  function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }

  function navigateWeek(direction) {
    const newDate = new Date(currentWeek.startDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentWeek(getWeekInfo(newDate));
  }

  function isToday(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const [y, m, d] = dateString.split('-').map(Number);
    return today.getFullYear() === y && today.getMonth() === m - 1 && today.getDate() === d;
  }

  function abbreviateContent(contentName) {
    const abbreviations = {
      'Bola Parada Ofensiva': 'BP Of',
      'Bola Parada Defensiva': 'BP Def',
      'Transição Ofensiva': 'Trans Of',
      'Transição Defensiva': 'Trans Def',
      'Organização Ofensiva': 'Org Of',
      'Organização Defensiva': 'Org Def',
    };
    return abbreviations[contentName] || contentName;
  }

  function getDayContentsSummary(session) {
    if (!session?.blocks) return [];

    // Conta ocorrências de cada conteúdo nas atividades do dia
    const contentCounts = {};
    const contentMinutes = {};
    session.blocks.forEach((block) => {
      if (block.activity?.contents) {
        const min = parseInt(block.activity.duration_minutes) || 0;
        block.activity.contents.forEach((content) => {
          contentCounts[content.name] = (contentCounts[content.name] || 0) + 1;
          contentMinutes[content.name] = (contentMinutes[content.name] || 0) + min;
        });
      }
    });

    if (Object.keys(contentCounts).length === 0) return [];

    // Predominância POR TEMPO (igual às Estatísticas): ganha o conteúdo com mais
    // minutos no dia, de qualquer pilar. Sem tempo preenchido: nº de atividades.
    const temTempo = Object.values(contentMinutes).some((m) => m > 0);
    const eligible = Object.keys(contentCounts).map((name) => [name, temTempo ? contentMinutes[name] : contentCounts[name]]);

    const max = Math.max(...eligible.map(([, v]) => v));
    return eligible
      .filter(([, v]) => v === max)
      .map(([name]) => ({
        abbreviated: abbreviateContent(name),
        full: name,
      }));
  }

  function getTotalDuration(session) {
    if (!session?.blocks) return 0;

    return session.blocks.reduce((total, block) => {
      const duration = block.activity?.duration_minutes || 0;
      return total + parseInt(duration);
    }, 0);
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: isMobile ? 'flex-start' : 'center',
    marginBottom: isMobile ? '0.5rem' : '1rem',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? '0.5rem' : 0,
  };

  const weekNavStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '0.4rem' : '0.75rem',
  };

  const weekTitleStyle = {
    fontSize: isMobile ? '1rem' : '1.25rem',
    fontWeight: '600',
    color: colors.text,
  };

  const calendarStyle = {
    display: isMobile ? 'flex' : 'grid',
    flexDirection: isMobile ? 'column' : undefined,
    gridTemplateColumns: isMobile ? undefined : 'repeat(7, 1fr)',
    gridAutoRows: isMobile ? undefined : '1fr',
    gap: isMobile ? '0.35rem' : '0.5rem',
    // Mobile também preenche a altura disponível (flex:1): os blocos do dia
    // (que já têm flex:1) distribuem o espaço em telas altas (tablet/iPhone
    // grande) em vez de deixar um vazio embaixo. Em telas curtas o conteúdo
    // passa da altura e o scroll segue normal.
    flex: isMobile ? 1 : undefined,
    minHeight: 0,
    height: isMobile ? undefined : '100%',
    overflow: 'auto',
    width: '100%',
  };

  const dayColumnStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    minHeight: 0,
    flex: isMobile ? 1 : undefined,
    height: isMobile ? undefined : '100%',
    width: '100%',
  };

  const dayHeaderStyle = (isCurrentDay = false) => ({
    padding: isMobile ? '0.3rem' : '0.5rem',
    backgroundColor: isCurrentDay ? '#10b981' : colors.primary,
    color: '#ffffff',
    borderRadius: '0.375rem',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: isMobile ? '0.75rem' : '0.875rem',
    boxShadow: isCurrentDay ? '0 0 0 2px rgba(16, 185, 129, 0.5)' : 'none',
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    flexShrink: 0,
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  });

  const blockStyle = {
    padding: isMobile ? '0.3rem' : '0.4rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flex: '1 1 0',
    minHeight: isMobile ? '45px' : '0',
  };

  const blockNameStyle = {
    fontSize: isMobile ? '0.6rem' : '0.65rem',
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: '0.2rem',
  };

  const blockContentStyle = {
    fontSize: isMobile ? '0.65rem' : '0.7rem',
    color: colors.textMuted,
  };

  const mobileDaySelectorStyle = {
    display: 'flex',
    gap: '0.25rem',
    marginBottom: '0.75rem',
    overflowX: 'auto',
    flexShrink: 0,
    WebkitOverflowScrolling: 'touch',
  };

  const mobileDayButtonStyle = (isActive, isCurrentDay) => ({
    flex: '1 0 auto',
    padding: '0.5rem 0.6rem',
    border: 'none',
    borderRadius: '0.375rem',
    backgroundColor: isActive
      ? (isCurrentDay ? '#10b981' : colors.primary)
      : (isCurrentDay ? '#10b98130' : colors.surface),
    color: isActive ? '#ffffff' : colors.text,
    fontSize: '0.8rem',
    fontWeight: isActive ? '700' : '500',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    minWidth: 0,
  });

  const contentsSummaryStyle = {
    padding: isMobile ? '0.3rem 0.4rem' : '0.4rem 0.5rem',
    backgroundColor: `${colors.primary}10`,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    fontSize: isMobile ? '0.65rem' : '0.75rem',
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
    minHeight: isMobile ? '28px' : '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: isMobile ? '0.2rem' : '0.3rem',
    overflow: 'hidden',
    cursor: 'default',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  };

  const durationBadgeStyle = {
    padding: isMobile ? '0.3rem 0.4rem' : '0.4rem 0.5rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    fontSize: isMobile ? '0.7rem' : '0.8rem',
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '0.3rem',
    rowGap: '0.15rem',
    flexShrink: 0,
  };

  // Relatório de treino da semana visível (o mesmo das Estatísticas, com as
  // fotos dos anexos do microciclo), gerado no servidor.
  async function handleExportWeek() {
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monday = new Date(currentWeek.startDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    try {
      await downloadReport('treino', {
        club_id: selectedClub.id,
        start_date: ymd(monday),
        end_date: ymd(sunday),
        filter_type: '1-micro',
      }, `Estatisticas_Treino_${safeFileName(selectedClub.name)}_Semana_${currentWeek.week}_${currentWeek.year}.pdf`);
    } catch (err) {
      notify.error(err.message || 'Não foi possível gerar o PDF da semana.');
    }
  }

  const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const dayNamesShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  // Show initial loading without content
  if (initialLoad && loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.2rem', color: colors.text }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TourGuide isOpen={tour.isOpen} onClose={tour.stop} steps={tourSteps} storageKey={tour.storageKey} />
      {/* Loading overlay - only shows when reloading with existing data */}
      <LoadingOverlay isLoading={loading && !initialLoad} message="Atualizando..." />
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', flexWrap: isMobile ? 'wrap' : 'nowrap' }} data-tour="week-selector">
          <WeekSelector
            value={currentWeek.identifier}
            onChange={(newIdentifier) => {
              const [year, week] = newIdentifier.split('-').map(Number);
              const monday = getDateOfISOWeek(week, year);
              setCurrentWeek({
                year,
                week,
                identifier: newIdentifier,
                startDate: monday,
              });
            }}
            label="Microciclo"
            rangeCount={1}
          />
          {selectedClub?.id && microcycle?.sessions?.some((s) => s.id) && (
            <ExportMenu
              size="sm"
              variant="outline"
              label="Exportar semana"
              onExportPDF={handleExportWeek}
              onExportExcel={null}
            />
          )}
        </div>

        {showMonthlyTheme && selectedClub?.id && (
          <div data-tour="monthly-theme">
            <MonthlyThemeBanner clubId={selectedClub.id} currentMonth={currentMonth} inline />
          </div>
        )}
      </div>

      {/* Mobile Day Selector */}
      {isMobile && microcycle?.sessions && (
        <div style={mobileDaySelectorStyle}>
          {microcycle.sessions.map((session, idx) => {
            const currentDay = isToday(session.date);
            return (
              <button
                key={idx}
                style={mobileDayButtonStyle(selectedDayIndex === idx, currentDay)}
                onClick={() => setSelectedDayIndex(idx)}
              >
                <div>{dayNamesShort[idx]}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.15rem' }}>
                  {(() => { const [y,m,d] = (session.date || '').split('-'); return d && m ? `${d}/${m}` : ''; })()}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-tour="calendar">
        <div style={calendarStyle}>
          {(isMobile
            ? microcycle?.sessions?.filter((_, idx) => idx === selectedDayIndex)
            : microcycle?.sessions
          )?.map((session, dayIndex) => {
            const currentDay = isToday(session.date);
            return (
              <div key={session.id || `empty-${session.date}`} style={dayColumnStyle}>
                <div
                  style={dayHeaderStyle(currentDay)}
                  onClick={() => {
                    setSelectedSession(session);
                    setShowSummaryModal(true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!podeEditarTreino) { notify.semPermissao('mudar o tipo do dia'); return; }
                    setSelectedSession(session);
                    setShowSessionTypeModal(true);
                  }}
                  onTouchStart={(e) => {
                    // Long press on mobile opens session type modal
                    const timer = setTimeout(() => {
                      if (!podeEditarTreino) { notify.semPermissao('mudar o tipo do dia'); return; }
                      setSelectedSession(session);
                      setShowSessionTypeModal(true);
                    }, 600);
                    e.currentTarget._longPressTimer = timer;
                  }}
                  onTouchEnd={(e) => {
                    clearTimeout(e.currentTarget._longPressTimer);
                  }}
                  onTouchMove={(e) => {
                    clearTimeout(e.currentTarget._longPressTimer);
                  }}
                  onMouseEnter={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = currentDay
                        ? '0 4px 12px rgba(16, 185, 129, 0.4)'
                        : `0 4px 12px ${colors.primary}60`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = currentDay
                        ? '0 0 0 2px rgba(16, 185, 129, 0.5)'
                        : 'none';
                    }
                  }}
                  title={isMobile ? 'Toque: Ver resumo | Segure: Tipo de sessão' : 'Clique esquerdo: Ver resumo | Clique direito: Tipo de sessão'}
                >
                  {session.day_name}
                  <div style={{ fontSize: isMobile ? '0.65rem' : '0.75rem', opacity: 0.9, marginTop: isMobile ? '0.15rem' : '0.25rem' }}>
                    {(() => { const [y,m,d] = (session.date || '').split('-'); return d && m ? `${d}/${m}` : ''; })()}
                  </div>
                </div>

                {/* Contents Summary - Always visible for alignment */}
                <Tooltip
                  content={
                    getDayContentsSummary(session).length > 0
                      ? getDayContentsSummary(session).map(c => c.full).join(' | ')
                      : null
                  }
                  position="bottom"
                  delay={400}
                  maxWidth={200}
                >
                  <div
                    style={contentsSummaryStyle}
                    onMouseEnter={(e) => {
                      if (getDayContentsSummary(session).length > 0) {
                        e.currentTarget.style.backgroundColor = `${colors.primary}20`;
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = `0 2px 8px ${colors.primary}40`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${colors.primary}10`;
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {(() => {
                      const items = getDayContentsSummary(session);
                      if (items.length === 0) return '\u00A0';
                      // Limita a 3 vis\u00EDveis; em empates grandes mostra "+N"
                      if (items.length <= 3) return items.map(c => c.abbreviated).join(' | ');
                      const visible = items.slice(0, 2).map(c => c.abbreviated).join(' | ');
                      return `${visible} +${items.length - 2}`;
                    })()}
                  </div>
                </Tooltip>

              {/* Blocks container - third row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {(() => {
                const sessionType = session.session_type || 'training';

                // DESCANSO - Bloco único
                if (sessionType === 'rest') {
                  return (
                    <div
                      style={{
                        ...blockStyle,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isMobile ? '0.9rem' : '1.2rem',
                        fontWeight: '600',
                        color: colors.textSecondary,
                        gap: isMobile ? '0.3rem' : '0.5rem',
                      }}
                    >
                      <Moon size={isMobile ? 28 : 48} strokeWidth={1.5} />
                      <div style={{ fontSize: isMobile ? '0.9rem' : '1.2rem' }}>Descanso</div>
                    </div>
                  );
                }

                // JOGO - Nome do adversário + Bloco "Não relacionados"
                if (sessionType === 'match') {
                  return (
                    <>
                      {/* Informação do Jogo - ocupa 5/6 do espaço */}
                      <div
                        style={{
                          ...blockStyle,
                          flex: '5 1 0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isMobile ? '0.9rem' : '1.2rem',
                          fontWeight: '600',
                          color: colors.text,
                          gap: isMobile ? '0.3rem' : '0.5rem',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setSelectedSession(session);
                          setShowGameModal(true);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = colors.primary;
                          e.currentTarget.style.backgroundColor = colors.surfaceHover;
                          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                          e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = colors.border;
                          e.currentTarget.style.backgroundColor = colors.surface;
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <Trophy size={isMobile ? 28 : 48} strokeWidth={1.5} />
                        <div style={{ fontSize: isMobile ? '0.9rem' : '1.2rem' }}>JOGO</div>
                        {session.opponent_name && (
                          <div style={{ fontSize: isMobile ? '0.75rem' : '1rem', color: colors.textSecondary }}>
                            vs {session.opponent_name}
                          </div>
                        )}
                      </div>

                      {/* Bloco "Não relacionados" - ocupa 1/6 do espaço */}
                      {session.blocks && session.blocks.length > 0 && (
                        <div
                          style={{
                            ...blockStyle,
                            flex: '1 1 0',
                          }}
                          onClick={() => {
                            setSelectedSession(session);
                            if (!podeEditarTreino) {
                              setShowSummaryModal(true);
                              notify.semPermissao('editar treinos');
                              return;
                            }
                            setInitialModalTab(0);
                            setShowUnifiedModal(true);
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = colors.primary;
                            e.currentTarget.style.backgroundColor = colors.surfaceHover;
                            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                            e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = colors.border;
                            e.currentTarget.style.backgroundColor = colors.surface;
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={blockNameStyle}>Não relacionados</div>
                          {session.blocks[0]?.activity ? (
                            <div style={{ fontSize: '0.7rem', color: colors.text, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {session.blocks[0].activity.title?.title && (
                                <Tooltip
                                  content={session.blocks[0].activity.title.title}
                                  position="bottom"
                                  delay={400}
                                  maxWidth={180}
                                >
                                  <div style={{ fontWeight: '600', display: 'block', width: '100%' }}>
                                    {session.blocks[0].activity.title.title}
                                  </div>
                                </Tooltip>
                              )}
                              {session.blocks[0].activity.contents?.length > 0 && (
                                <Tooltip
                                  content={session.blocks[0].activity.contents.map(c => c.name).join(' | ')}
                                  position="bottom"
                                  delay={400}
                                  maxWidth={180}
                                >
                                  <div style={{ fontSize: '0.65rem', color: colors.textSecondary, display: 'block', width: '100%' }}>
                                    {session.blocks[0].activity.contents.map(c => abbreviateContent(c.name)).join(', ')}
                                  </div>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <div style={blockContentStyle}>{podeEditarTreino ? 'Clique para editar' : 'Clique para ver'}</div>
                          )}
                        </div>
                      )}
                    </>
                  );
                }

                // TREINO NORMAL - 6 blocos
                return session.blocks?.map((block, blockIndex) => {
                  const blockMatchesTheme = themeContentIds.length > 0 && block.activity?.contents?.some(c => {
                    const contentId = c.content?.id || c.content_id || c.id;
                    return themeContentIds.includes(contentId);
                  });
                  return (
                  <div
                    key={block.id || `empty-block-${session.date}-${blockIndex}`}
                    style={{
                      ...blockStyle,
                      ...(blockMatchesTheme ? { borderLeft: '3px solid #2563eb', paddingLeft: '0.3rem' } : {}),
                    }}
                    onClick={() => {
                      setSelectedSession(session);
                      if (!podeEditarTreino) {
                        setShowSummaryModal(true);
                        notify.semPermissao('editar treinos');
                        return;
                      }
                      setInitialModalTab(blockIndex);
                      setShowUnifiedModal(true);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.primary;
                      e.currentTarget.style.backgroundColor = colors.surfaceHover;
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = colors.border;
                      e.currentTarget.style.backgroundColor = colors.surface;
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={blockNameStyle}>{block.name}</div>
                    {block.activity ? (
                      <div style={{ fontSize: '0.7rem', color: colors.text, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {block.activity.title?.title && (
                          <Tooltip
                            content={block.activity.title.title}
                            position="bottom"
                            delay={400}
                            maxWidth={180}
                          >
                            <div style={{ fontWeight: '600', display: 'block', width: '100%' }}>
                              {block.activity.title.title}
                            </div>
                          </Tooltip>
                        )}
                        {block.activity.contents?.length > 0 && (
                          <Tooltip
                            content={block.activity.contents.map(c => c.name).join(' | ')}
                            position="bottom"
                            delay={400}
                            maxWidth={180}
                          >
                            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, display: 'block', width: '100%' }}>
                              {block.activity.contents.map(c => abbreviateContent(c.name)).join(', ')}
                            </div>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <div style={blockContentStyle}>{podeEditarTreino ? 'Clique para editar' : 'Clique para ver'}</div>
                    )}
                  </div>
                  );
                });
              })()}
              </div>

              {/* Duration Badge - always visible to maintain alignment - fourth row */}
              <div style={durationBadgeStyle}>
                <span>⏱</span>
                <span>{getTotalDuration(session)} min</span>
                {toKm(session.avg_distance_km) !== null && (session.session_type || 'training') === 'training' && (
                  <span title="Distância ideal do dia" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.35rem', paddingLeft: '0.45rem', borderLeft: `1px solid ${colors.border}` }}>
                    <span>📍</span>
                    <span>{formatKm(session.avg_distance_km, 1)} km</span>
                  </span>
                )}
              </div>
              </div>
            );
          })}
        </div>
      </div>

      <UnifiedTrainingModal
        isOpen={showUnifiedModal}
        onClose={() => setShowUnifiedModal(false)}
        session={selectedSession}
        initialTab={initialModalTab}
        isMatchDay={selectedSession?.session_type === 'match'}
        onSave={async (data) => {
          console.log('Saving unified training data:', data);
          try {
            // FIRST: Ensure database structure exists (microcycle, sessions, blocks)
            // This is called ONLY when actually saving data
            // IMPORTANTE: usamos as variáveis locais (freshMicrocycle/freshSession) abaixo
            // em vez de ler do state — setSelectedSession/setMicrocycle são assíncronos.
            let freshMicrocycle = microcycle;
            let freshSession = selectedSession;

            if (!selectedSession?.id) {
              console.log('No session ID - ensuring database structure exists...');
              const response = await trainingService.ensureMicrocycleStructure(currentWeek.identifier, selectedClub.id);
              const microcycleData = response.data;

              // Find the session for the current day
              const realSession = microcycleData.sessions.find(s =>
                s.day_of_week === selectedSession.day_of_week
              );

              if (!realSession) {
                throw new Error('Falha ao criar sessão no banco de dados');
              }

              console.log('Database structure created. Session ID:', realSession.id);

              // Atualiza state pra próximo render (assíncrono)
              setSelectedSession(realSession);
              setMicrocycle(microcycleData);

              // Mas USA imediatamente as versões locais (síncronas) pra continuar o save
              freshMicrocycle = microcycleData;
              freshSession = realSession;

              // Cache the new microcycle (include club in cache key)
              const cacheKey = `${selectedClub.id}-${currentWeek.identifier}`;
              setMicrocycleCache(prev => ({
                ...prev,
                [cacheKey]: microcycleData,
              }));
            }

            // Get the current session with real IDs — sempre do snapshot fresh,
            // não do state (que pode estar stale após o setMicrocycle assíncrono).
            const currentSession = freshMicrocycle?.sessions?.find(s =>
              s.day_of_week === freshSession?.day_of_week
            ) || freshSession;

            console.log('Current session for saving:', currentSession?.id, 'blocks:', currentSession?.blocks?.length);

            // THEN: Save each block's activity
            for (const [blockIdOrIndex, activityData] of Object.entries(data.blockData)) {
              // Check if ALL fields are empty
              const isEmpty = !activityData.titleId &&
                             !activityData.description &&
                             (!activityData.selectedContents || activityData.selectedContents.length === 0) &&
                             (!activityData.selectedStages || activityData.selectedStages.length === 0) &&
                             !activityData.durationMinutes;

              // Find the real block - either by ID if it exists, or by order/index
              let realBlock = null;

              // Check if key is in format "order_X" (used for new blocks without DB id)
              if (blockIdOrIndex && blockIdOrIndex.startsWith('order_')) {
                const orderNum = parseInt(blockIdOrIndex.replace('order_', ''));
                if (!isNaN(orderNum)) {
                  realBlock = currentSession?.blocks?.find(b => b.order === orderNum);
                }
              }
              // Otherwise try to find by ID
              else if (blockIdOrIndex && blockIdOrIndex !== 'null' && blockIdOrIndex !== 'undefined') {
                realBlock = currentSession?.blocks?.find(b => b.id === blockIdOrIndex);
              }

              // If not found by ID, try to find by order from activityData
              if (!realBlock && activityData.blockOrder !== undefined) {
                realBlock = currentSession?.blocks?.find(b => b.order === activityData.blockOrder);
              }

              // Last resort: if blockIdOrIndex is a number string, use it as order
              if (!realBlock) {
                const orderNum = parseInt(blockIdOrIndex);
                if (!isNaN(orderNum)) {
                  realBlock = currentSession?.blocks?.find(b => b.order === orderNum);
                }
              }

              const realBlockId = realBlock?.id;

              if (isEmpty) {
                // Delete existing activity if block is now empty
                if (realBlockId) {
                  console.log('Block is empty, deleting any existing activity:', realBlockId);
                  try {
                    await trainingService.deleteActivityByBlockId(realBlockId);
                  } catch (err) {
                    console.log('No activity to delete or error:', err.message);
                  }
                }
                continue;
              }

              // Skip if we couldn't find a real block ID
              if (!realBlockId) {
                console.warn('Could not find real block ID for:', blockIdOrIndex, 'skipping...');
                continue;
              }

              console.log('Saving block:', realBlockId, '(original key:', blockIdOrIndex, ')', activityData);

              // Convert camelCase to snake_case for backend
              const backendData = {
                ...activityData,
                duration_minutes: activityData.durationMinutes,
                // Ensure groups is always an array, never null
                groups: activityData.selectedGroups || [],
              };
              delete backendData.durationMinutes;
              delete backendData.selectedGroups;
              delete backendData.blockOrder; // Remove helper field

              if (realBlock?.activity?.id) {
                // Update existing activity
                console.log('Updating activity:', realBlock.activity.id);
                const result = await trainingService.updateActivity(realBlock.activity.id, backendData);
                console.log('Update result:', result);
              } else {
                // Create new activity
                console.log('Creating new activity for block:', realBlockId);
                const result = await trainingService.createActivity({
                  ...backendData,
                  block_id: realBlockId,
                });
                console.log('Create result:', result);
              }
            }

            console.log('All blocks saved successfully');

            // Info do dia: distância média por jogador (usa o id REAL, pós-ensure)
            if (data.distanceChanged) {
              const sessionId = currentSession?.id || freshSession?.id;
              if (!sessionId) throw new Error('Sessão sem id para salvar a distância');
              await trainingService.updateSessionDistance(sessionId, data.avgDistanceKm);
            }

            // Upload files to session
            if (data.files && data.files.length > 0) {
              console.log('Uploading files:', data.files.length);
              for (const fileData of data.files) {
                try {
                  await trainingService.uploadSessionFile(selectedSession.id, fileData.file, fileData.title);
                } catch (error) {
                  console.error('Error uploading file:', fileData.name, error);
                  // Continue with other files even if one fails
                }
              }
            }

            // Invalidate cache for this week to force fresh data (include club in cache key)
            const invalidateCacheKey = `${selectedClub.id}-${currentWeek.identifier}`;
            setMicrocycleCache(prev => {
              const newCache = { ...prev };
              delete newCache[invalidateCacheKey];
              return newCache;
            });

            // Reload data first, then close modal (force reload to bypass cache)
            await loadMicrocycle(true);
            setShowUnifiedModal(false);
          } catch (error) {
            console.error('Error saving training data:', error);
            notify.error('Erro ao salvar treino: ' + error.message);
          }
        }}
      />

      <CreateTitleModal
        isOpen={showCreateTitle}
        onClose={() => setShowCreateTitle(false)}
        onSave={() => setShowCreateTitle(false)}
      />

      <TrainingSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        session={selectedSession}
      />

      <SessionTypeModal
        isOpen={showSessionTypeModal}
        onClose={() => setShowSessionTypeModal(false)}
        session={selectedSession}
        onSave={async (data) => {
          try {
            // FIRST: Ensure database structure exists if session doesn't have ID
            if (!selectedSession?.id) {
              console.log('No session ID - ensuring database structure exists...');
              const response = await trainingService.ensureMicrocycleStructure(currentWeek.identifier, selectedClub.id);
              const microcycleData = response.data;

              // Find the session for the current day
              const realSession = microcycleData.sessions.find(s =>
                s.day_of_week === selectedSession.day_of_week
              );

              if (!realSession) {
                throw new Error('Falha ao criar sessão no banco de dados');
              }

              console.log('Database structure created. Session ID:', realSession.id);

              // Update selectedSession with the real session from database
              setSelectedSession(realSession);

              // Update data with real session ID
              data.sessionId = realSession.id;
            }

            // THEN: Update session type
            const sessionId = selectedSession?.id || data.sessionId;
            await trainingService.updateSessionType(sessionId, data);
            setShowSessionTypeModal(false);

            // Invalidate cache and reload microcycle (include club in cache key)
            const invalidateCacheKey = `${selectedClub.id}-${currentWeek.identifier}`;
            setMicrocycleCache(prev => {
              const newCache = { ...prev };
              delete newCache[invalidateCacheKey];
              return newCache;
            });
            await loadMicrocycle(true); // Force reload to bypass cache
          } catch (error) {
            console.error('Error updating session type:', error);
            notify.error('Erro ao atualizar tipo de sessão: ' + error.message);
          }
        }}
      />

      <GameModal
        isOpen={showGameModal}
        onClose={() => setShowGameModal(false)}
        session={selectedSession}
        onSave={async (data) => {
          // Invalidate cache and reload microcycle
          const invalidateCacheKey = `${selectedClub.id}-${currentWeek.identifier}`;
          setMicrocycleCache(prev => {
            const newCache = { ...prev };
            delete newCache[invalidateCacheKey];
            return newCache;
          });
          await loadMicrocycle(true);
        }}
      />
    </div>
  );
}
