import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Moon, Trophy, Paperclip, ClipboardCheck } from 'lucide-react';
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
import { safeFileName } from '../services/reportsService';
import { useReportPhotosExport } from '../components/reports/useReportPhotosExport';
import { periodosDoDia, rotuloPeriodo, periodoEfetivo, minutosDaSessao, distanciaDoDia, divisaoMinutos, rotuloLinhaPeriodo, rotulosAvaliacao } from '../lib/periodos';

export function TrainingPage() {
  const { colors } = useTheme();
  // "Exportar semana": com fotos na semana abre o modal "Fotos do relatório"
  const photoExport = useReportPhotosExport();
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
        ? 'Cada coluna é um dia. Toque num dia pra abrir as atividades. Pressione e segure (long-press) um dia pra mudar o tipo de sessão (Treino, Jogo, Descanso, Avaliação) ou adicionar outro período (Manhã, Tarde, Noite).'
        : 'Cada coluna é um dia. Clique em um dia pra abrir as atividades. Clique direito num dia pra trocar o tipo de sessão (Treino, Jogo, Descanso, Avaliação) ou adicionar outro período (Manhã, Tarde, Noite).',
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
  // Dia com 2+ períodos: o dia do menu (o período em exibição vai em selectedSession)
  const [selectedDay, setSelectedDay] = useState(null);

  // ---- Carrossel dos períodos (Manhã/Tarde/Noite) ----
  // Índice do período em exibição por data. Troca sozinho a cada ~6 s; pausa com
  // o mouse sobre a coluna, por 20 s depois de tocar/usar as setas, com modal
  // aberto, aba escondida ou prefers-reduced-motion.
  const TROCA_MS = 6000;
  const PAUSA_MS = 20000;
  const [periodoIdx, setPeriodoIdx] = useState({});
  const [periodoDir, setPeriodoDir] = useState({});
  const carrossel = useRef({ hover: null, pausaAte: {}, ultimaTroca: {}, toque: null });
  const [reduzMovimento] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const algumModalAberto = showUnifiedModal || showSummaryModal || showSessionTypeModal || showGameModal || showCreateTitle || !!photoExport.modal || tour.isOpen;
  const diasComPeriodos = (microcycle?.sessions || []).filter((s) => periodosDoDia(s)).map((s) => ({ date: s.date, n: s.periodos.length }));
  const chaveDiasComPeriodos = diasComPeriodos.map((d) => `${d.date}:${d.n}`).join(',');

  useEffect(() => {
    if (!chaveDiasComPeriodos || reduzMovimento || algumModalAberto) return undefined;
    const c = carrossel.current;
    const inicio = Date.now();
    for (const d of diasComPeriodos) c.ultimaTroca[d.date] = inicio; // recomeça a contar
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const agora = Date.now();
      const avancar = diasComPeriodos.filter((d) => c.hover !== d.date
        && (c.pausaAte[d.date] || 0) <= agora
        && agora - (c.ultimaTroca[d.date] || 0) >= TROCA_MS);
      if (!avancar.length) return;
      for (const d of avancar) c.ultimaTroca[d.date] = agora;
      setPeriodoDir((prev) => ({ ...prev, ...Object.fromEntries(avancar.map((d) => [d.date, 1])) }));
      setPeriodoIdx((prev) => {
        const n = { ...prev };
        for (const d of avancar) n[d.date] = ((prev[d.date] || 0) + 1) % d.n;
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [chaveDiasComPeriodos, reduzMovimento, algumModalAberto]); // eslint-disable-line react-hooks/exhaustive-deps

  function pausarCarrossel(date) {
    carrossel.current.pausaAte[date] = Date.now() + PAUSA_MS;
  }
  function passoPeriodo(date, n, delta) {
    pausarCarrossel(date);
    carrossel.current.ultimaTroca[date] = Date.now();
    setPeriodoDir((prev) => ({ ...prev, [date]: delta }));
    setPeriodoIdx((prev) => ({ ...prev, [date]: (((prev[date] || 0) + delta) % n + n) % n }));
  }
  function irParaPeriodo(date, i) {
    pausarCarrossel(date);
    carrossel.current.ultimaTroca[date] = Date.now();
    setPeriodoIdx((prev) => ({ ...prev, [date]: i }));
  }

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

  // Invalida o cache da semana e recarrega do servidor.
  async function recarregarSemana() {
    const k = `${selectedClub.id}-${currentWeek.identifier}`;
    setMicrocycleCache((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });
    await loadMicrocycle(true);
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

  // Pilar predominante do dia (1ª linha da Programação): soma os MINUTOS de cada
  // pilar (mesma regra por tempo dos conteúdos); sem tempo preenchido, conta atividades.
  // Empate mostra os dois.
  const PILAR_LABEL = { tatico: 'Tático', fisico: 'Físico', tecnico: 'Técnico', mental: 'Mental' };
  function getDayPillarSummary(session) {
    if (!session?.blocks || session.session_type === 'assessment') return [];
    const min = {};
    const cnt = {};
    session.blocks.forEach((block) => {
      const a = block.activity;
      if (!a?.contents?.length) return;
      const dims = Array.from(new Set(a.contents.map((c) => c.dimension).filter(Boolean)));
      const m = parseInt(a.duration_minutes) || 0;
      dims.forEach((d) => {
        min[d] = (min[d] || 0) + m;
        cnt[d] = (cnt[d] || 0) + 1;
      });
    });
    const dims = Object.keys(cnt);
    if (!dims.length) return [];
    const temTempo = dims.some((d) => min[d] > 0);
    const peso = (d) => (temTempo ? min[d] : cnt[d]);
    const max = Math.max(...dims.map(peso));
    return dims.filter((d) => peso(d) === max).map((d) => PILAR_LABEL[d] || d);
  }

  function getDayContentsSummary(session) {
    if (!session?.blocks || session.session_type === 'assessment') return [];

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
    if (!session?.blocks || session.session_type === 'assessment') return 0;

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
    gridTemplateColumns: isMobile ? undefined : 'repeat(7, minmax(0, 1fr))',
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
    minWidth: 0,
    flex: isMobile ? 1 : undefined,
    height: isMobile ? undefined : '100%',
    width: '100%',
  };

  const dayHeaderStyle = (isCurrentDay = false) => ({
    padding: isMobile ? '0.3rem' : '0.5rem',
    backgroundColor: isCurrentDay ? '#10b981' : colors.primary,
    color: isCurrentDay ? '#ffffff' : colors.primaryText,
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

  // 📎 discreto no nome do bloco quando a atividade tem anexos
  const anexosBadge = (activity) => (activity?.files_count > 0 ? (
    <span title={`${activity.files_count} anexo(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', marginLeft: '0.25rem', color: colors.primary, fontWeight: 600 }}>
      <Paperclip size={9} />{activity.files_count}
    </span>
  ) : null);

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

  // Programação da semana visível (resumo da tela: dias, períodos e blocos — não as
  // estatísticas), com as fotos dos anexos do microciclo, gerada no servidor.
  async function handleExportWeek() {
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monday = new Date(currentWeek.startDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    try {
      await photoExport.start('semana', {
        club_id: selectedClub.id,
        start_date: ymd(monday),
        end_date: ymd(sunday),
      }, `Programacao_${safeFileName(selectedClub.name)}_Semana_${currentWeek.week}_${currentWeek.year}.pdf`);
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
      {photoExport.modal}
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
                {periodosDoDia(session) && (
                  <div aria-label={`${session.periodos.length} períodos`} style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 3 }}>
                    {session.periodos.map((p) => <i key={p.id} style={{ width: 4, height: 4, borderRadius: 2, background: 'currentColor', opacity: 0.75 }} />)}
                  </div>
                )}
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
            // Dia com 2+ períodos: a coluna mostra UM período por vez (carrossel)
            const periodos = periodosDoDia(session);
            const nPer = periodos?.length || 1;
            const idxPer = periodos ? ((periodoIdx[session.date] || 0) % nPer) : 0;
            const shown = periodos ? periodos[idxPer] : session;
            return (
              <div
                key={session.id || `empty-${session.date}`}
                style={dayColumnStyle}
                data-periodos={periodos ? nPer : undefined}
                onMouseEnter={periodos ? () => { carrossel.current.hover = session.date; } : undefined}
                onMouseLeave={periodos ? () => { carrossel.current.hover = null; carrossel.current.ultimaTroca[session.date] = Date.now(); } : undefined}
                onTouchStart={periodos ? (e) => {
                  pausarCarrossel(session.date);
                  const t = e.touches[0];
                  carrossel.current.toque = { x: t.clientX, y: t.clientY, date: session.date };
                } : undefined}
                onTouchEnd={periodos ? (e) => {
                  // arraste lateral troca o período
                  const ini = carrossel.current.toque;
                  carrossel.current.toque = null;
                  const t = e.changedTouches[0];
                  if (!ini || ini.date !== session.date || !t) return;
                  const dx = t.clientX - ini.x;
                  const dy = t.clientY - ini.y;
                  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) passoPeriodo(session.date, nPer, dx < 0 ? 1 : -1);
                } : undefined}
              >
                <div
                  style={dayHeaderStyle(currentDay)}
                  onClick={() => {
                    setSelectedSession(session);
                    setShowSummaryModal(true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!podeEditarTreino) { notify.semPermissao('mudar o tipo do dia'); return; }
                    setSelectedSession(shown);
                    setSelectedDay(session);
                    setShowSessionTypeModal(true);
                  }}
                  onTouchStart={(e) => {
                    // Long press on mobile opens session type modal
                    const timer = setTimeout(() => {
                      if (!podeEditarTreino) { notify.semPermissao('mudar o tipo do dia'); return; }
                      setSelectedSession(shown);
                      setSelectedDay(session);
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

                {/* Pilar predominante do dia (tooltip: conteúdos predominantes) */}
                <Tooltip
                  content={
                    getDayContentsSummary(shown).length > 0
                      ? getDayContentsSummary(shown).map(c => c.full).join(' | ')
                      : null
                  }
                  position="bottom"
                  delay={400}
                  maxWidth={200}
                >
                  {periodos ? (
                    // 2+ períodos: nome do período + pilar dele, setas ‹ › e pontinhos
                    <div
                      style={{ ...contentsSummaryStyle, position: 'relative', justifyContent: 'space-between', flexWrap: 'nowrap', gap: '0.1rem', padding: isMobile ? '0.3rem 0.1rem' : '0.4rem 0.15rem' }}
                      aria-roledescription="carrossel"
                      aria-label={`Períodos do dia: ${periodos.map((p) => rotuloPeriodo(p.periodo)).join(', ')}`}
                    >
                      <button
                        type="button"
                        className="tp-periodo-seta"
                        aria-label="Período anterior"
                        onClick={(e) => { e.stopPropagation(); passoPeriodo(session.date, nPer, -1); }}
                        style={{ flex: 'none', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: isMobile ? '0.35rem 0.3rem' : '0.1rem 0.15rem', margin: isMobile ? '-0.35rem 0' : '-0.1rem 0', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                      >
                        <ChevronLeft size={isMobile ? 16 : 13} />
                      </button>
                      <span key={shown.id} className="tp-periodo-in" style={{ '--tp-periodo-dx': `${(periodoDir[session.date] || 1) * 6}px`, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} aria-live="polite">
                        {rotuloLinhaPeriodo(shown, getDayPillarSummary(shown))}
                      </span>
                      <button
                        type="button"
                        className="tp-periodo-seta"
                        aria-label="Próximo período"
                        onClick={(e) => { e.stopPropagation(); passoPeriodo(session.date, nPer, 1); }}
                        style={{ flex: 'none', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: isMobile ? '0.35rem 0.3rem' : '0.1rem 0.15rem', margin: isMobile ? '-0.35rem 0' : '-0.1rem 0', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                      >
                        <ChevronRight size={isMobile ? 16 : 13} />
                      </button>
                      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 2, display: 'flex', justifyContent: 'center', gap: 3, pointerEvents: 'none' }}>
                        {periodos.map((p, i) => (
                          <i
                            key={p.id}
                            onClick={(e) => { e.stopPropagation(); irParaPeriodo(session.date, i); }}
                            title={rotuloPeriodo(p.periodo)}
                            style={{ width: i === idxPer ? 10 : 4, height: 4, borderRadius: 2, background: i === idxPer ? colors.primary : colors.textSecondary, opacity: i === idxPer ? 1 : 0.35, transition: 'width 200ms ease, background-color 200ms ease', pointerEvents: 'auto', cursor: 'pointer' }}
                          />
                        ))}
                      </span>
                    </div>
                  ) : (
                  <div
                    style={contentsSummaryStyle}
                    onMouseEnter={(e) => {
                      if (getDayPillarSummary(shown).length > 0) {
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
                      // período único: o período também aparece ("Manhã · Tático"; Manhã é o
                      // padrão do dia sem nome), sem setas nem pontinhos. Jogo e descanso: como antes.
                      const pilares = getDayPillarSummary(shown);
                      const tipo = shown.session_type || 'training';
                      // treino e avaliação mostram o período ("Manhã · Avaliação")
                      const per = tipo === 'training' || tipo === 'assessment' ? rotuloPeriodo(periodoEfetivo(shown)) : null;
                      // uma linha só (não mexe na altura da grade); o texto inteiro fica no title
                      if (per) {
                        const t = rotuloLinhaPeriodo(shown, pilares);
                        return <span title={t} style={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>;
                      }
                      return pilares.length ? pilares.join(' | ') : '\u00A0';
                    })()}
                  </div>
                  )}
                </Tooltip>

              {/* Blocks container - third row */}
              <div
                key={periodos ? shown.id : undefined}
                className={periodos ? 'tp-periodo-in' : undefined}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minHeight: 0, overflow: 'hidden', ...(periodos ? { '--tp-periodo-dx': `${(periodoDir[session.date] || 1) * 8}px` } : {}) }}
              >
              {(() => {
                const sessionType = shown.session_type || 'training';

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

                // AVALIAÇÃO - estado próprio no lugar dos 6 blocos (padrão do JOGO/Descanso):
                // ícone + "AVALIAÇÃO" + os tipos. Sem blocos de atividade.
                if (sessionType === 'assessment') {
                  const tiposAv = rotulosAvaliacao(shown);
                  return (
                    <div
                      data-testid="dia-avaliacao"
                      style={{
                        ...blockStyle,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: colors.text,
                        gap: isMobile ? '0.3rem' : '0.5rem',
                        cursor: podeEditarTreino ? 'pointer' : 'default',
                        minWidth: 0,
                      }}
                      title={podeEditarTreino ? 'Trocar o tipo de avaliação' : undefined}
                      onClick={() => {
                        if (!podeEditarTreino) return;
                        setSelectedSession(shown);
                        setSelectedDay(session);
                        setShowSessionTypeModal(true);
                      }}
                    >
                      <ClipboardCheck size={isMobile ? 28 : 48} strokeWidth={1.5} />
                      <div style={{ fontSize: isMobile ? '0.9rem' : '1.2rem' }}>AVALIAÇÃO</div>
                      <div style={{ fontSize: isMobile ? '0.72rem' : '0.85rem', color: colors.textSecondary, fontWeight: 500, lineHeight: 1.35, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                        {tiposAv.length ? tiposAv.join(', ') : (podeEditarTreino ? 'Escolha o tipo' : 'Tipo não informado')}
                      </div>
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
                          setSelectedSession(shown);
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
                        {shown.opponent_name && (
                          <div style={{ fontSize: isMobile ? '0.75rem' : '1rem', color: colors.textSecondary }}>
                            vs {shown.opponent_name}
                          </div>
                        )}
                      </div>

                      {/* Bloco "Não relacionados" - ocupa 1/6 do espaço */}
                      {shown.blocks && shown.blocks.length > 0 && (
                        <div
                          style={{
                            ...blockStyle,
                            flex: '1 1 0',
                          }}
                          onClick={() => {
                            setSelectedSession(shown);
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
                          <div style={blockNameStyle}>Não relacionados{anexosBadge(shown.blocks[0]?.activity)}</div>
                          {shown.blocks[0]?.activity ? (
                            <div style={{ fontSize: '0.7rem', color: colors.text, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {/* Conteúdo em destaque; a atividade é o último nível (mais discreta) */}
                              {shown.blocks[0].activity.contents?.length > 0 && (
                                <Tooltip
                                  content={shown.blocks[0].activity.contents.map(c => c.name).join(' | ')}
                                  position="bottom"
                                  delay={400}
                                  maxWidth={180}
                                >
                                  <div style={{ fontWeight: '600', display: 'block', width: '100%' }}>
                                    {shown.blocks[0].activity.contents.map(c => abbreviateContent(c.name)).join(', ')}
                                  </div>
                                </Tooltip>
                              )}
                              {shown.blocks[0].activity.title?.title && (
                                <Tooltip
                                  content={shown.blocks[0].activity.title.title}
                                  position="bottom"
                                  delay={400}
                                  maxWidth={180}
                                >
                                  <div style={{ fontSize: '0.65rem', color: colors.textSecondary, display: 'block', width: '100%' }}>
                                    {shown.blocks[0].activity.title.title}
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
                return shown.blocks?.map((block, blockIndex) => {
                  const blockMatchesTheme = themeContentIds.length > 0 && block.activity?.contents?.some(c => {
                    const contentId = c.content?.id || c.content_id || c.id;
                    return themeContentIds.includes(contentId);
                  });
                  return (
                  <div
                    key={block.id || `empty-block-${shown.date}-${blockIndex}`}
                    style={{
                      ...blockStyle,
                      ...(blockMatchesTheme ? { borderLeft: '3px solid #2563eb', paddingLeft: '0.3rem' } : {}),
                    }}
                    onClick={() => {
                      setSelectedSession(shown);
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
                    <div style={blockNameStyle}>{block.name}{anexosBadge(block.activity)}</div>
                    {block.activity ? (
                      <div style={{ fontSize: '0.7rem', color: colors.text, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {/* Conteúdo em destaque; a atividade é o último nível (mais discreta) */}
                        {block.activity.contents?.length > 0 && (
                          <Tooltip
                            content={block.activity.contents.map(c => c.name).join(' | ')}
                            position="bottom"
                            delay={400}
                            maxWidth={180}
                          >
                            <div style={{ fontWeight: '600', display: 'block', width: '100%' }}>
                              {block.activity.contents.map(c => abbreviateContent(c.name)).join(', ')}
                            </div>
                          </Tooltip>
                        )}
                        {block.activity.title?.title && (
                          <Tooltip
                            content={block.activity.title.title}
                            position="bottom"
                            delay={400}
                            maxWidth={180}
                          >
                            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, display: 'block', width: '100%' }}>
                              {block.activity.title.title}
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
              {periodos ? (
                // dia inteiro em forma curta para caber SEMPRE numa linha (grade intacta):
                // "⏱150′ · 90+60 · 📍8,5". O texto completo fica no title.
                <div
                  // containerType: a largura não vem do texto (a coluna não alarga). Se ainda
                  // faltar espaço, só a divisão (90+60) encolhe com reticências; total e
                  // distância nunca somem.
                  style={{ ...durationBadgeStyle, flexWrap: 'nowrap', whiteSpace: 'nowrap', overflow: 'hidden', gap: '0.15rem', containerType: 'inline-size', paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: isMobile ? '0.68rem' : '0.76rem' }}
                  title={[
                    ...periodos.map((p) => (p.session_type === 'assessment' ? `${rotuloPeriodo(p.periodo)}: avaliação` : `${rotuloPeriodo(p.periodo)}: ${minutosDaSessao(p)} min`)),
                    ...(distanciaDoDia(periodos) !== null ? [`Distância ideal do dia: ${formatKm(distanciaDoDia(periodos), 1)} km`] : []),
                  ].join(' · ')}
                >
                  {/* forma curta (150′) só quando há divisão/distância disputando espaço; senão igual aos outros dias */}
                  <span style={{ flexShrink: 0 }}>{(divisaoMinutos(periodos) || distanciaDoDia(periodos) !== null)
                    ? `⏱${periodos.reduce((t, p) => t + minutosDaSessao(p), 0)}′`
                    : `⏱ ${periodos.reduce((t, p) => t + minutosDaSessao(p), 0)} min`}</span>
                  {/* "90+60" só quando 2+ períodos têm minutos (nunca "125+0") */}
                  {divisaoMinutos(periodos) && (
                    <span style={{ color: colors.textSecondary, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {divisaoMinutos(periodos)}</span>
                  )}
                  {distanciaDoDia(periodos) !== null && (
                    <span style={{ flexShrink: 0 }}><span style={{ color: colors.textSecondary, fontWeight: 500 }}>· </span>📍{formatKm(distanciaDoDia(periodos), 1)}</span>
                  )}
                </div>
              ) : (
              <div style={durationBadgeStyle}>
                <span>⏱</span>
                <span>{getTotalDuration(shown)} min</span>
                {toKm(shown.avg_distance_km) !== null && (shown.session_type || 'training') === 'training' && (
                  <span title="Distância ideal do dia" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.35rem', paddingLeft: '0.45rem', borderLeft: `1px solid ${colors.border}` }}>
                    <span>📍</span>
                    <span>{formatKm(shown.avg_distance_km, 1)} km</span>
                  </span>
                )}
              </div>
              )}
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
            // Dia com períodos: o período certo é o de mesmo id (não o 1º do dia).
            const todasAsSessoes = (freshMicrocycle?.sessions || []).flatMap((s) => periodosDoDia(s) || [s]);
            const currentSession = (freshSession?.id && todasAsSessoes.find((s) => s.id === freshSession.id))
              || freshMicrocycle?.sessions?.find(s => s.day_of_week === freshSession?.day_of_week)
              || freshSession;

            console.log('Current session for saving:', currentSession?.id, 'blocks:', currentSession?.blocks?.length);

            // THEN: Save each block's activity
            // Chave do bloco (no modal) → id REAL da atividade, pra subir os anexos depois.
            const activityIdByKey = {};
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
                activityIdByKey[blockIdOrIndex] = realBlock.activity.id;
              } else {
                // Create new activity
                console.log('Creating new activity for block:', realBlockId);
                const result = await trainingService.createActivity({
                  ...backendData,
                  block_id: realBlockId,
                });
                console.log('Create result:', result);
                activityIdByKey[blockIdOrIndex] = result?.data?.id;
              }
            }

            console.log('All blocks saved successfully');

            // Info do dia: distância média por jogador (usa o id REAL, pós-ensure)
            if (data.distanceChanged) {
              const sessionId = currentSession?.id || freshSession?.id;
              if (!sessionId) throw new Error('Sessão sem id para salvar a distância');
              await trainingService.updateSessionDistance(sessionId, data.avgDistanceKm);
            }

            // Anexos novos: cada um vai pra ATIVIDADE do seu bloco (já com id real)
            if (data.files && data.files.length > 0) {
              let falhas = 0;
              for (const fileData of data.files) {
                const activityId = activityIdByKey[fileData.blockKey];
                if (!activityId) { falhas++; continue; }
                try {
                  await trainingService.uploadActivityFile(activityId, fileData.file, fileData.title, currentSession?.id || freshSession?.id);
                } catch (error) {
                  console.error('Error uploading file:', fileData.name, error);
                  falhas++;
                }
              }
              if (falhas > 0) notify.error(`${falhas} anexo(s) não foram enviados. Abra o treino e tente de novo.`);
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
        day={selectedDay}
        podeApagar={can('training:delete')}
        onAddPeriod={async ({ atual, novo, ...tipoNovo }) => {
          try {
            let sessionId = selectedSession?.id;
            if (!sessionId) {
              // semana ainda não criada no banco: cria a estrutura antes
              const response = await trainingService.ensureMicrocycleStructure(currentWeek.identifier, selectedClub.id);
              sessionId = response.data?.sessions?.find((s) => s.day_of_week === selectedSession?.day_of_week)?.id;
              if (!sessionId) throw new Error('Falha ao criar sessão no banco de dados');
            }
            const r = await trainingService.addPeriod(sessionId, { atual, novo, ...tipoNovo });
            notify.success(`Período ${rotuloPeriodo(novo)} adicionado.`);
            setShowSessionTypeModal(false);
            await recarregarSemana();
            // mostra o período novo na coluna
            const lista = r.data?.periodos || [];
            const i = lista.findIndex((p) => p.id === r.data?.id);
            if (i >= 0) irParaPeriodo(selectedSession?.date, i);
          } catch (error) {
            notify.error(error.message || 'Não foi possível adicionar o período.');
          }
        }}
        onRenamePeriod={async (periodo, { fechar = true } = {}) => {
          try {
            let sessionId = selectedSession?.id;
            if (!sessionId) {
              // semana ainda não criada no banco: cria a estrutura antes (era o HTTP 404 em /sessions/null/periodo)
              const response = await trainingService.ensureMicrocycleStructure(currentWeek.identifier, selectedClub.id);
              sessionId = response.data?.sessions?.find((s) => s.day_of_week === selectedSession?.day_of_week)?.id;
              if (!sessionId) throw new Error('Falha ao criar sessão no banco de dados');
              setSelectedSession((s) => (s ? { ...s, id: sessionId } : s));
            }
            await trainingService.renamePeriod(sessionId, periodo);
            if (fechar) {
              setShowSessionTypeModal(false);
              await recarregarSemana();
            }
            return true;
          } catch (error) {
            notify.error(error.message || 'Não foi possível trocar o horário.');
            return false;
          }
        }}
        onRemovePeriod={async () => {
          try {
            const r = await trainingService.removePeriod(selectedSession.id);
            const n = r.data?.anexos_apagados || 0;
            notify.success(`Período ${rotuloPeriodo(selectedSession.periodo)} removido${n ? ` (com ${n} anexo${n > 1 ? 's' : ''})` : ''}.`);
            setShowSessionTypeModal(false);
            irParaPeriodo(selectedSession.date, 0);
            await recarregarSemana();
          } catch (error) {
            notify.error(error.message || 'Não foi possível remover o período.');
          }
        }}
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
