import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, ArrowRight, Pencil, LayoutGrid,
  Save, FolderOpen, Film, Undo2, Redo2, Trash2, Eye,
  Keyboard, Pause, Plus, X, Cone, Smartphone, ArrowLeft, ChevronUp,
  PenLine, Square as SquareIcon, Circle as CircleIcon, Type, RotateCcw, RotateCw,
} from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useClub } from '../../../contexts/ClubContext';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useSportConfig } from '../../../hooks/useSportConfig';
import { notify } from '../../../lib/notify';
import { onNativeBackButton } from '../../../lib/platform';
import TacticalCanvas from '../components/canvas/TacticalCanvas';
import { ROTATABLE_MARKERS } from '../components/canvas/MarkerToken';
import FrameControls from '../components/toolbar/FrameControls';
import PlaybackControls from '../components/toolbar/PlaybackControls';
import PlayerPalette from '../components/toolbar/PlayerPalette';
import SavePlayModal from '../components/modals/SavePlayModal';
import LoadPlayModal from '../components/modals/LoadPlayModal';
import { useTacticalBoard } from '../hooks/useTacticalBoard';
import { usePlayback } from '../hooks/usePlayback';
import { useVideoExport } from '../hooks/useVideoExport';
import { usePlays } from '../hooks/usePlays';
import { TourGuide } from '../../../components/common/TourGuide';
import { useTour, useTourReplayListener } from '../../../hooks/useTour';
import { getFormationsForFieldType, mirrorFormation } from '../utils/defaultFormations';
import { FIELD_TYPES, FIELD_VIEWS } from '../utils/fieldDimensions';

// ─────────────────────────────────────────────────────────────────
// Catálogos
// ─────────────────────────────────────────────────────────────────
const ARROW_TOOLS = [
  { id: 'arrow_run',     mode: 'arrow_straight', dash: [],     label: 'Corrida',  desc: 'Seta contínua',  color: '#ffffff' },
  { id: 'arrow_pass',    mode: 'arrow_straight', dash: [8, 5], label: 'Passe',    desc: 'Seta tracejada', color: '#fbbf24' },
  { id: 'arrow_dribble', mode: 'arrow_straight', dash: [3, 3], label: 'Drible',   desc: 'Seta pontilhada', color: '#22c55e' },
  { id: 'arrow_curved',  mode: 'arrow_curved',   dash: [],     label: 'Curva',    desc: 'Seta curva',     color: '#ffffff' },
];

const MARKER_TYPES = [
  { type: 'cone',       label: 'Cone baixo',   icon: '▲' },
  { type: 'cone_tall',  label: 'Cone alto',    icon: '⧋' },
  { type: 'disc',       label: 'Disco',        icon: '●' },
  { type: 'barrier',    label: 'Barreira',     icon: '▬' },
  { type: 'pole',       label: 'Estaca',       icon: '│' },
  { type: 'flag',       label: 'Bandeira',     icon: '⚑' },
  { type: 'ladder',     label: 'Escada',       icon: '☰' },
  { type: 'mannequin',  label: 'Manequim',     icon: '♟' },
  { type: 'hoop',       label: 'Arco',         icon: '○' },
  { type: 'mini_goal',  label: 'Mini gol',     icon: '⊓' },
];

const FIELD_VIEW_OPTIONS = [
  { view: FIELD_VIEWS.FULL,        label: 'Campo inteiro' },
  { view: FIELD_VIEWS.LEFT_HALF,   label: 'Metade esquerda' },
  { view: FIELD_VIEWS.RIGHT_HALF,  label: 'Metade direita' },
  { view: FIELD_VIEWS.THIRD_LEFT,  label: 'Terço esquerdo' },
  { view: FIELD_VIEWS.THIRD_RIGHT, label: 'Terço direito' },
];

const FIELD_TYPE_OPTIONS = [
  { type: FIELD_TYPES.FOOTBALL_11, label: 'Futebol 11' },
  { type: FIELD_TYPES.FOOTBALL_7,  label: 'Futebol 7' },
  { type: FIELD_TYPES.FUTSAL,      label: 'Futsal' },
];

const DRAWING_COLORS = ['#ffffff', '#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ec4899'];

const SHORTCUTS = [
  ['Espaço',          'Play / Pause'],
  ['← / →',           'Frame anterior / próximo'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / Refazer'],
  ['Ctrl+S',          'Salvar jogada'],
  ['Delete',          'Remover seleção'],
  ['Esc',             'Cancelar / fechar painéis'],
  ['F11',             'Tela cheia'],
];

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────
export default function TacticalBoardPage() {
  const { colors, isDark } = useTheme();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Chrome imersivo: controles somem por inatividade e voltam ao mexer/tocar.
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimerRef = useRef(null);
  // Orientação — no mobile exigimos paisagem pra ter espaço de campo.
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentPlayId, setCurrentPlayId] = useState(null);
  const [currentPlayName, setCurrentPlayName] = useState('');
  const [currentPlayDescription, setCurrentPlayDescription] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drawing mode
  const [drawingMode, setDrawingMode] = useState(null);
  const [activeToolId, setActiveToolId] = useState(null);
  const [drawingColor, setDrawingColor] = useState('#ffffff');
  const [drawingDash, setDrawingDash] = useState([]);
  const [drawingStrokeWidth] = useState(2.5);

  // Sidebar flyout
  const [openSection, setOpenSection] = useState(null); // 'players' | 'arrows' | 'draw' | 'objects' | 'formations' | 'view'

  // Alvo da formação: 'A' | 'B' | 'both'
  const [formationTarget, setFormationTarget] = useState('A');

  const [athletes, setAthletes] = useState([]);
  useEffect(() => {
    import('../../training-management/services/athleteService').then((mod) => {
      const service = mod.athleteService || mod.default;
      if (service?.getAll) service.getAll().then(setAthletes).catch(() => {});
    }).catch(() => {});
  }, [selectedClub]);

  const sport = useSportConfig();
  const board = useTacticalBoard({ initialFieldType: sport.defaultFieldType });
  const playback = usePlayback(board.frames, board.currentFrameIndex, board.goToFrame);
  const videoExport = useVideoExport(canvasRef, board.frames, board.fieldType);
  const plays = usePlays();

  const tour = useTour('tactical-board');
  useTourReplayListener('tactical-board', () => tour.setIsOpen(true));
  const tourSteps = useMemo(() => [
    { title: 'Quadro Tático', content: 'Aqui você cria jogadas animadas pra mostrar ao time. Sidebar à esquerda agrupa todas as ferramentas.' },
    { title: 'Formações', content: 'Em "Formações", escolha Time A, Time B ou Ambos e aplique com 1 clique — o Time B entra espelhado, e nada do que você desenhou é apagado.' },
    { title: 'Animação', content: 'Use a barra inferior pra criar frames. Em cada frame, mova as peças onde quiser. O play interpola entre frames.' },
    { title: 'Salvar/Exportar', content: 'Salve sua jogada pra reusar depois ou exporte como vídeo pra mandar pro grupo do clube.' },
    { title: 'Atalhos', content: 'Espaço pra play, ← → pra frames, Del pra remover, Ctrl+Z pra desfazer, Ctrl+S pra salvar. Veja todos no botão "?" no canto.' },
  ], []);

  const displayElements = videoExport.exportElements
    ? videoExport.exportElements
    : (playback.isPlaying && playback.interpolatedElements)
      ? playback.interpolatedElements
      : board.currentFrame.elements;
  const displayDrawings = board.currentFrame.drawings || [];
  const nextFrameElements = board.nextFrame?.elements || null;

  // ── Tela cheia / Saída ──
  // Ao ENTRAR pedimos tela cheia de verdade (Fullscreen API) onde há suporte —
  // navegador, notebook, TV, tablet. Pedimos no <html> (document.documentElement),
  // NÃO só no container do quadro: assim modais e toasts (react-modal /
  // react-hot-toast, que renderizam via portal no <body>) ficam DENTRO do
  // elemento em tela cheia e aparecem normalmente. (Fullscreen só no container
  // escondia Salvar/Carregar/Exportar e os avisos — bug reportado.)
  // Perder a tela cheia (Esc, modal, gesto do SO) NÃO fecha o quadro: ele segue
  // ocupando a tela via layout fixed inset:0 e 100% funcional. Sair é só pelo
  // botão voltar — evita perder trabalho não salvo por um Esc acidental.
  const leavingRef = useRef(false);

  const leaveBoard = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (document.fullscreenElement) { try { document.exitFullscreen?.(); } catch { /* noop */ } }
    navigate('/home');
  }, [navigate]);
  const exitToHome = leaveBoard;

  const requestFs = useCallback(() => {
    // iOS (iPhone/iPad): a Fullscreen API sobrepõe um "✕" NATIVO do sistema
    // (não removível) que cobre nosso botão voltar. E no iOS o layout
    // fixed inset:0 já ocupa a tela inteira — fullscreen não acrescenta nada.
    // Então não pedimos fullscreen lá.
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    const el = document.documentElement;
    if (!document.fullscreenElement && el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // Pede tela cheia ao entrar. Browsers exigem gesto do usuário, então tentamos
  // no mount E no primeiro toque/clique no quadro (garantido).
  useEffect(() => {
    requestFs();
    const onFirstGesture = () => { requestFs(); window.removeEventListener('pointerdown', onFirstGesture); };
    window.addEventListener('pointerdown', onFirstGesture);
    return () => window.removeEventListener('pointerdown', onFirstGesture);
  }, [requestFs]);

  // Só acompanha o estado da tela cheia (referência interna). NÃO navegamos ao
  // perdê-la — ver comentário acima: o quadro segue funcional em modo janela.
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Botão físico "voltar" do celular (app nativo): sai do quadro.
  useEffect(() => {
    const cleanup = onNativeBackButton(() => { leaveBoard(); });
    return cleanup;
  }, [leaveBoard]);

  // ── Aviso de alterações não salvas ao fechar a aba ──
  useEffect(() => {
    if (!board.isDirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [board.isDirty]);

  // ── Drawing helpers ──
  const activateDrawingTool = useCallback((toolId, mode, dash = [], color = null) => {
    if (activeToolId === toolId) {
      setDrawingMode(null); setActiveToolId(null); setDrawingDash([]); return;
    }
    setDrawingMode(mode); setActiveToolId(toolId); setDrawingDash(dash);
    if (color) setDrawingColor(color);
    board.setSelectedElementId(null);
    board.setSelectedDrawingId(null);
  }, [activeToolId, board]);
  const clearDrawingMode = useCallback(() => { setDrawingMode(null); setActiveToolId(null); setDrawingDash([]); }, []);
  const handleDrawingComplete = useCallback((d) => board.addDrawing(d), [board]);

  // ── Elementos ──
  const handleAddPlayer = useCallback((teamOrData) => {
    clearDrawingMode();
    let team, jerseyNumber, name, athleteId, isGoalkeeper;
    if (typeof teamOrData === 'string') {
      team = teamOrData;
      jerseyNumber = board.nextGenericJersey(team);
      name = ''; athleteId = null; isGoalkeeper = false;
    } else {
      ({ team, jerseyNumber, name, athleteId } = teamOrData); isGoalkeeper = teamOrData.isGoalkeeper || false;
    }
    board.addElement({
      type: 'player', team, jerseyNumber, name, athleteId, isGoalkeeper,
      x: 50 + (Math.random() - 0.5) * 20, y: 50 + (Math.random() - 0.5) * 20,
    });
  }, [board, clearDrawingMode]);

  const handleAddGoalkeeper = useCallback((team) => {
    clearDrawingMode();
    board.addElement({
      type: 'player', team, jerseyNumber: 1, name: 'GOL', athleteId: null, isGoalkeeper: true,
      x: team === 'A' ? 5 : 95, y: 50,
    });
  }, [board, clearDrawingMode]);

  const handleAddBall = useCallback(() => {
    clearDrawingMode();
    board.addElement({ type: 'ball', team: null, x: 50, y: 50 });
  }, [board, clearDrawingMode]);

  const handleAddMarker = useCallback((markerType) => {
    clearDrawingMode();
    board.addElement({
      type: 'marker', team: null, markerType,
      x: 50 + (Math.random() - 0.5) * 30, y: 50 + (Math.random() - 0.5) * 30,
    });
  }, [board, clearDrawingMode]);

  const handleRemoveSelected = useCallback(() => {
    if (board.selectedElementId) board.removeElement(board.selectedElementId);
    if (board.selectedDrawingId) board.removeDrawing(board.selectedDrawingId);
  }, [board]);

  // ── Salvar ──
  const persistPlay = useCallback(async ({ name, description, asNew = false }) => {
    const playData = { ...board.getPlayData(), name, description, club_id: selectedClub?.id || null };
    if (currentPlayId && !asNew) {
      await plays.updatePlay(currentPlayId, playData);
    } else {
      const created = await plays.createPlay(playData);
      setCurrentPlayId(created.id);
    }
    setCurrentPlayName(name);
    setCurrentPlayDescription(description || '');
    board.markSaved();
  }, [board, currentPlayId, plays, selectedClub]);

  // Salvar em 1 clique quando a jogada já existe; modal só na primeira vez
  const handleSaveClick = useCallback(async () => {
    if (currentPlayId && currentPlayName) {
      try {
        await persistPlay({ name: currentPlayName, description: currentPlayDescription });
        notify.success('Jogada salva');
      } catch {
        notify.error('Não foi possível salvar. Tente novamente.');
      }
    } else {
      setSaveModalOpen(true);
    }
  }, [currentPlayId, currentPlayName, currentPlayDescription, persistPlay]);

  const handleLoad = useCallback((play) => {
    board.loadPlay(play);
    setCurrentPlayId(play.id);
    setCurrentPlayName(play.name || '');
    setCurrentPlayDescription(play.description || '');
    clearDrawingMode();
    setOpenSection(null);
  }, [board, clearDrawingMode]);

  const handleReset = useCallback(async () => {
    const ok = await notify.confirm('Limpar todo o quadro tático?', { confirmText: 'Limpar', cancelText: 'Cancelar' });
    if (!ok) return;
    board.resetBoard();
    setCurrentPlayId(null);
    setCurrentPlayName('');
    setCurrentPlayDescription('');
    clearDrawingMode();
  }, [board, clearDrawingMode]);

  // ── Formações (por time, não-destrutivo) ──
  const handleApplyFormation = useCallback((formationKey) => {
    clearDrawingMode();
    const formations = getFormationsForFieldType(board.fieldType);
    const formation = formations[formationKey];
    if (!formation) return;

    // Coordenadas % são relativas à vista atual — formação só faz sentido no
    // campo inteiro. Força a vista full antes de aplicar.
    if (board.fieldView !== FIELD_VIEWS.FULL) {
      board.setFieldView(FIELD_VIEWS.FULL);
      notify.info('Vista ajustada para campo inteiro');
    }

    const applications = [];
    if (formationTarget === 'A' || formationTarget === 'both') {
      applications.push({ team: 'A', positions: formation.positions });
    }
    if (formationTarget === 'B' || formationTarget === 'both') {
      applications.push({ team: 'B', positions: mirrorFormation(formation.positions) });
    }

    const { kept } = board.applyFormations(applications);

    const targetLabel = formationTarget === 'both' ? 'aos dois times'
      : formationTarget === 'B' ? 'ao Time B' : 'ao Time A';
    const keptSuffix = kept > 0 ? ` · ${kept} jogador${kept > 1 ? 'es' : ''} mantido${kept > 1 ? 's' : ''} fora da formação` : '';
    notify.success(`${formation.label} aplicada ${targetLabel}${keptSuffix}`);
  }, [board, formationTarget, clearDrawingMode]);

  // ── Troca de tipo de campo ──
  const handleSetFieldType = useCallback((type) => {
    if (type === board.fieldType) return;
    board.setFieldType(type);
    const hasPieces = (board.currentFrame.elements || []).length > 0;
    if (hasPieces) {
      const label = FIELD_TYPE_OPTIONS.find(o => o.type === type)?.label || type;
      notify.info(`Formações disponíveis atualizadas para ${label}`);
    }
  }, [board]);

  // ── Atalhos ──
  useEffect(() => {
    const onKey = (e) => {
      // Ctrl+S SEMPRE previne o "Salvar página" do navegador, mesmo em inputs
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') handleSaveClick();
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') handleRemoveSelected();
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); board.undo(); }
      else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) { e.preventDefault(); board.redo(); }
      else if (e.key === ' ') { e.preventDefault(); playback.isPlaying ? playback.pause() : playback.play(); }
      else if (e.key === 'ArrowRight') board.goToNextFrame();
      else if (e.key === 'ArrowLeft')  board.goToPrevFrame();
      else if (e.key === 'Escape') { setPaletteOpen(false); setOpenSection(null); clearDrawingMode(); setShortcutsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, playback, handleRemoveSelected, clearDrawingMode, handleSaveClick]);

  const formations = getFormationsForFieldType(board.fieldType);
  const selectedElement = useMemo(
    () => board.currentFrame.elements.find(el => el.id === board.selectedElementId) || null,
    [board.currentFrame.elements, board.selectedElementId]
  );
  const selectedDrawing = useMemo(
    () => (board.currentFrame.drawings || []).find(d => d.id === board.selectedDrawingId) || null,
    [board.currentFrame.drawings, board.selectedDrawingId]
  );

  // Atletas já em campo (pra PlayerPalette indicar e evitar duplicar)
  const athleteIdsOnBoard = useMemo(() => {
    const set = new Set();
    for (const frame of board.frames) {
      for (const el of frame.elements) {
        if (el.type === 'player' && el.athleteId) set.add(el.athleteId);
      }
    }
    return set;
  }, [board.frames]);

  // Seleções mutuamente exclusivas — sem isso o painel mostra "Jogador" mas
  // o Delete remove também um desenho selecionado antes
  const handleSelectElement = useCallback((id) => {
    board.setSelectedElementId(id);
    if (id) board.setSelectedDrawingId(null);
  }, [board]);
  const handleSelectDrawing = useCallback((id) => {
    board.setSelectedDrawingId(id);
    if (id) board.setSelectedElementId(null);
  }, [board]);

  // Duplo-clique numa peça: seleciona e garante painel aberto
  const handleElementEdit = useCallback((elementId) => {
    board.setSelectedElementId(elementId);
    board.setSelectedDrawingId(null);
  }, [board]);

  // ── Chrome imersivo: revela ao mexer/tocar, some após inatividade ──
  // Mantém FIXO visível enquanto o usuário está trabalhando (painel/ferramenta
  // aberta, seleção, modal) pra não brigar com o auto-hide.
  const keepChrome = !!openSection || !!drawingMode
    || !!board.selectedElementId || !!board.selectedDrawingId
    || paletteOpen || saveModalOpen || loadModalOpen || shortcutsOpen
    || videoExport.isExporting;

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3500);
  }, []);

  // Toque no campo vazio ALTERNA o chrome: some pra deixar só o campo; toca de
  // novo e ele volta. Diferente do reveal por atividade (que só mostra).
  // IMPORTANTE: no touch, o Konva dispara onTap E onClick pro mesmo toque, então
  // deduplicamos chamadas em <400ms (senão alternaria 2x e voltaria ao mesmo).
  const lastTapRef = useRef(0);
  const toggleChromeOnTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) return;
    lastTapRef.current = now;
    setChromeVisible((v) => {
      const next = !v;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (next) hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3500);
      return next;
    });
  }, []);

  useEffect(() => {
    revealChrome();
    // NÃO revelamos no pointerdown nem no toque — senão o toque no campo (que
    // serve pra ESCONDER a barra) a re-revelaria. Só o MOUSE se movendo (desktop)
    // e o teclado revelam.
    const onActivity = (e) => {
      if (e && e.type === 'pointermove' && e.pointerType !== 'mouse') return;
      revealChrome();
    };
    window.addEventListener('pointermove', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointermove', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [revealChrome]);

  // Fixa o chrome visível enquanto trabalha; solta o auto-hide quando termina.
  useEffect(() => {
    if (keepChrome) {
      setChromeVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      revealChrome();
    }
  }, [keepChrome, revealChrome]);

  // Orientação (mobile exige paisagem).
  useEffect(() => {
    const upd = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', upd);
    window.addEventListener('orientationchange', upd);
    return () => {
      window.removeEventListener('resize', upd);
      window.removeEventListener('orientationchange', upd);
    };
  }, []);

  // ─────────────────── Renderização ───────────────────
  const chromeStyle = {
    opacity: chromeVisible ? 1 : 0,
    transition: 'opacity 0.28s ease',
    pointerEvents: chromeVisible ? 'auto' : 'none',
  };

  return (
    <div ref={containerRef} style={{
      // IMERSIVO: ocupa a tela inteira (a rota não usa o Layout, sem header).
      // position:fixed + inset:0 preenche a viewport e ACOMPANHA a rotação
      // sozinho — sem depender de 100vh (que não atualizava no WebView e
      // causava a "tela azul").
      position: 'fixed', inset: 0,
      backgroundColor: '#0b1220',
      overflow: 'hidden',
      color: colors.text,
      touchAction: 'none',
    }}>
      <TourGuide isOpen={tour.isOpen} onClose={tour.stop} steps={tourSteps} storageKey={tour.storageKey} />

      {/* ═══ CANVAS — camada base, campo ocupa TODO o espaço ═══ */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <TacticalCanvas
          ref={canvasRef}
          fieldType={board.fieldType}
          fieldView={board.fieldView}
          elements={displayElements}
          drawings={displayDrawings}
          nextFrameElements={nextFrameElements}
          teamAColor={board.teamAColor}
          teamBColor={board.teamBColor}
          isPlaying={playback.isPlaying || videoExport.isExporting}
          drawingMode={drawingMode}
          drawingColor={drawingColor}
          drawingDash={drawingDash}
          drawingStrokeWidth={drawingStrokeWidth}
          onElementMove={board.updateElementPosition}
          onElementSelect={handleSelectElement}
          onElementEdit={handleElementEdit}
          onDrawingSelect={handleSelectDrawing}
          onDrawingComplete={handleDrawingComplete}
          onDrawingUpdate={board.updateDrawing}
          onBackgroundTap={toggleChromeOnTap}
          selectedElementId={board.selectedElementId}
          selectedDrawingId={board.selectedDrawingId}
        />
      </div>

      {/* Indicador de modo de desenho (sempre visível quando ativo) */}
      {drawingMode && !videoExport.isExporting && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderRadius: '0.5rem',
          padding: '0.3rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.75rem', color: 'white',
        }}>
          <PenLine size={13} style={{ opacity: 0.7 }} />
          <span style={{ fontWeight: 600 }}>{describeMode(drawingMode)}</span>
          <button onClick={clearDrawingMode}
            style={{ border: 'none', background: 'rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: '0.25rem', cursor: 'pointer', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
            Sair (Esc)
          </button>
        </div>
      )}

      {/* Progresso do export de vídeo */}
      {videoExport.isExporting && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 31,
          backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: '0.5rem',
          padding: '0.35rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
          border: '1px solid rgba(200,255,0,0.35)', fontSize: '0.78rem', color: 'white',
        }}>
          <Film size={14} style={{ color: '#c8ff00' }} />
          <span style={{ fontWeight: 600 }}>Gerando vídeo… {Math.round(videoExport.progress)}%</span>
          <button onClick={videoExport.cancelExport}
            style={{ border: 'none', background: 'rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: '0.25rem', cursor: 'pointer', padding: '0.15rem 0.45rem', fontSize: '0.7rem' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Painel de propriedades da seleção (parte do "trabalhar" — sempre visível) */}
      {(selectedElement || selectedDrawing) && !playback.isPlaying && !videoExport.isExporting && (
        <SelectionPanel
          element={selectedElement}
          drawing={selectedDrawing}
          teamAColor={board.teamAColor}
          teamBColor={board.teamBColor}
          onPatchElement={(patch) => board.updateElementProps(selectedElement.id, patch)}
          onPatchDrawing={(patch) => board.updateDrawing(selectedDrawing.id, patch)}
          onRemove={handleRemoveSelected}
          isMobile={isMobile}
        />
      )}

      {/* ═══ CHROME FLUTUANTE (auto-hide) ═══ */}
      {/* Topo-esquerda: voltar + nome da jogada */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 25, display: 'flex', alignItems: 'center', gap: 8, ...chromeStyle }}>
        <FloatBtn onClick={exitToHome} title="Voltar ao início">
          <ArrowLeft size={18} />
        </FloatBtn>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.4rem 0.7rem', borderRadius: 10,
          backgroundColor: 'rgba(11,18,32,0.72)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span
            onClick={() => setSaveModalOpen(true)}
            title="Renomear / salvar como nova jogada"
            style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 130 : 240, cursor: 'pointer' }}>
            {currentPlayName || 'Sem nome'}
          </span>
          {board.isDirty && <span title="Alterações não salvas" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#fbbf24', flexShrink: 0 }} />}
        </div>
      </div>

      {/* Topo-direita: vista, atalhos */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 25, display: 'flex', gap: 6, ...chromeStyle }}>
        <FloatBtn onClick={() => setOpenSection(openSection === 'view' ? null : 'view')} title="Vista / tipo de campo" active={openSection === 'view'}>
          <Eye size={17} />
        </FloatBtn>
        {!isMobile && (
          <FloatBtn onClick={() => setShortcutsOpen(true)} title="Atalhos de teclado">
            <Keyboard size={17} />
          </FloatBtn>
        )}
      </div>

      {/* Rail de ferramentas — esquerda, centralizado vertical */}
      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 25, ...chromeStyle }}>
        <Sidebar
          openSection={openSection}
          setOpenSection={(s) => { setOpenSection(s); clearDrawingMode(); }}
          canUndo={board.canUndo}
          canRedo={board.canRedo}
          onUndo={board.undo}
          onRedo={board.redo}
          onSave={handleSaveClick}
          onLoad={() => setLoadModalOpen(true)}
          onExport={() => board.totalFrames > 1 && !videoExport.isExporting && videoExport.startExport(currentPlayName || 'jogada')}
          canExport={board.totalFrames > 1 && !videoExport.isExporting}
          exporting={videoExport.isExporting}
          onReset={handleReset}
          primary={colors.primary}
        />
      </div>

      {/* Barra inferior flutuante — playback + frames */}
      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        maxWidth: 'calc(100vw - 20px)',
        backgroundColor: 'rgba(11,18,32,0.82)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        ...chromeStyle,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PlaybackControls
            isPlaying={playback.isPlaying}
            speed={playback.speed}
            currentFrameIndex={board.currentFrameIndex}
            totalFrames={board.totalFrames}
            onPlay={playback.play}
            onPause={playback.pause}
            onRewind={playback.rewind}
            onSpeedChange={playback.setSpeed}
          />
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <FrameControls
            currentFrameIndex={board.currentFrameIndex}
            totalFrames={board.totalFrames}
            onAddFrame={board.addFrame}
            onDeleteFrame={board.deleteFrame}
            onGoToFrame={board.goToFrame}
            onGoToPrevFrame={board.goToPrevFrame}
            onGoToNextFrame={board.goToNextFrame}
          />
        </div>
      </div>

      {/* Dica pra reexibir os controles quando escondidos */}
      {!chromeVisible && !(isMobile && isPortrait) && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 24,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0.3rem 0.7rem', borderRadius: 999,
          backgroundColor: 'rgba(11,18,32,0.6)', color: 'rgba(255,255,255,0.6)',
          fontSize: '0.72rem', pointerEvents: 'none',
        }}>
          <ChevronUp size={13} /> {isMobile ? 'Toque' : 'Mova o mouse'} para ver os controles
        </div>
      )}

      {/* ═══ FLYOUT (painel da seção aberta) — flutuante à esquerda ═══ */}
      {openSection && (
        <div style={{ position: 'absolute', left: 62, top: 10, bottom: 10, zIndex: 40, display: 'flex' }}>
          <Flyout
            title={SECTIONS_TITLES[openSection]}
            onClose={() => setOpenSection(null)}
            floating
          >
            {openSection === 'players' && (
              <PlayersFlyout
                teamAColor={board.teamAColor} teamBColor={board.teamBColor}
                setTeamAColor={board.setTeamAColor} setTeamBColor={board.setTeamBColor}
                onAddA={() => handleAddPlayer('A')} onAddB={() => handleAddPlayer('B')}
                onAddGKA={() => handleAddGoalkeeper('A')} onAddGKB={() => handleAddGoalkeeper('B')}
                onAddBall={handleAddBall}
                onOpenPalette={() => { setPaletteOpen(true); setOpenSection(null); }}
              />
            )}
            {openSection === 'arrows' && (
              <ArrowsFlyout
                activeToolId={activeToolId}
                onActivate={(t) => activateDrawingTool(t.id, t.mode, t.dash, t.color)}
                drawingColor={drawingColor}
                setDrawingColor={setDrawingColor}
              />
            )}
            {openSection === 'draw' && (
              <DrawFlyout
                activeToolId={activeToolId}
                onActivate={activateDrawingTool}
                drawingColor={drawingColor}
                setDrawingColor={setDrawingColor}
              />
            )}
            {openSection === 'objects' && (
              <ObjectsFlyout onAdd={handleAddMarker} isMobile={isMobile} />
            )}
            {openSection === 'formations' && (
              <FormationsFlyout
                formations={formations}
                target={formationTarget}
                setTarget={setFormationTarget}
                teamAColor={board.teamAColor}
                teamBColor={board.teamBColor}
                onApply={handleApplyFormation}
                isMobile={isMobile}
              />
            )}
            {openSection === 'view' && (
              <ViewFlyout
                fieldType={board.fieldType} setFieldType={handleSetFieldType}
                fieldView={board.fieldView} setFieldView={board.setFieldView}
              />
            )}
          </Flyout>
        </div>
      )}

      {/* PALETTE (drawer direito) */}
      {paletteOpen && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 45,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        }}>
          <PlayerPalette
            athletes={athletes}
            athleteIdsOnBoard={athleteIdsOnBoard}
            onAddPlayer={handleAddPlayer}
            nextGenericJersey={board.nextGenericJersey}
            teamAColor={board.teamAColor}
            teamBColor={board.teamBColor}
            isOpen={paletteOpen}
            onClose={() => setPaletteOpen(false)}
          />
        </div>
      )}

      {/* Gate de paisagem no mobile */}
      {isMobile && isPortrait && <LandscapeGate onBack={exitToHome} />}

      {/* Modais */}
      <SavePlayModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={persistPlay}
        initialData={{ name: currentPlayName, description: currentPlayDescription }}
        existingPlayName={currentPlayId ? currentPlayName : null}
      />
      <LoadPlayModal
        isOpen={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        onLoad={handleLoad}
        onDelete={plays.deletePlay}
        plays={plays.plays}
        loading={plays.loading}
        error={plays.error}
        onFetch={() => plays.fetchPlays(selectedClub?.id)}
        isDirty={board.isDirty}
      />

      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────────
const SECTIONS_TITLES = {
  players:    'Peças',
  arrows:     'Setas',
  draw:       'Desenho',
  objects:    'Objetos',
  formations: 'Formações',
  view:       'Vista do campo',
};

function describeMode(m) {
  switch (m) {
    case 'arrow_straight': return 'Seta reta';
    case 'arrow_curved':   return 'Seta curva';
    case 'free_draw':      return 'Desenho livre';
    case 'zone_rect':      return 'Zona retangular';
    case 'zone_circle':    return 'Zona circular';
    case 'text':           return 'Texto';
    default: return m;
  }
}

// ── Painel de propriedades editável da seleção ──
function SelectionPanel({ element, drawing, teamAColor, teamBColor, onPatchElement, onPatchDrawing, onRemove, isMobile }) {
  const isPlayer = element?.type === 'player';
  const [jersey, setJersey] = useState(isPlayer ? String(element.jerseyNumber ?? '') : '');
  const [name, setName] = useState(isPlayer ? (element.name || '') : '');

  // Ressincroniza quando muda a seleção
  useEffect(() => {
    if (isPlayer) {
      setJersey(String(element.jerseyNumber ?? ''));
      setName(element.name || '');
    }
  }, [element?.id, element?.jerseyNumber, element?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitJersey = () => {
    if (!isPlayer) return;
    const n = parseInt(jersey, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99 && n !== element.jerseyNumber) {
      onPatchElement({ jerseyNumber: n });
    } else {
      setJersey(String(element.jerseyNumber ?? ''));
    }
  };
  const commitName = () => {
    if (!isPlayer) return;
    const v = name.trim().slice(0, 12);
    if (v !== (element.name || '')) onPatchElement({ name: v });
  };

  const stop = (e) => e.stopPropagation();

  const panelStyle = isMobile
    ? {
        // No mobile fica no TOPO-centro (abaixo do chrome) pra não colidir com a
        // barra de playback, que fica embaixo-centro.
        position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 26,
        backgroundColor: 'rgba(12,12,28,0.94)', backdropFilter: 'blur(14px)',
        borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.12)',
        padding: '0.55rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxWidth: 'calc(100vw - 24px)',
      }
    : {
        position: 'absolute', bottom: 12, right: 12, zIndex: 22,
        backgroundColor: 'rgba(12,12,28,0.94)', backdropFilter: 'blur(14px)',
        borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.12)',
        padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxWidth: 380,
      };

  const inputBase = {
    backgroundColor: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '0.3rem',
    color: '#fff',
    fontSize: '0.78rem',
    padding: '0.28rem 0.4rem',
    outline: 'none',
  };

  if (isPlayer) {
    return (
      <div style={panelStyle} onKeyDown={stop}>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jogador</span>
        <input
          type="number" min={1} max={99} value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          onBlur={commitJersey}
          onKeyDown={(e) => { stop(e); if (e.key === 'Enter') e.currentTarget.blur(); }}
          title="Número da camisa"
          style={{ ...inputBase, width: 48, textAlign: 'center' }}
        />
        <input
          type="text" maxLength={12} value={name} placeholder="Nome"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { stop(e); if (e.key === 'Enter') e.currentTarget.blur(); }}
          title="Nome exibido"
          style={{ ...inputBase, width: 96 }}
        />
        {/* Toggle de time */}
        <div style={{ display: 'flex', gap: 3 }}>
          {['A', 'B'].map((t) => {
            const tColor = t === 'A' ? teamAColor : teamBColor;
            const active = element.team === t;
            return (
              <button key={t}
                onClick={() => !active && onPatchElement({ team: t })}
                title={`Time ${t}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '0.26rem 0.5rem', borderRadius: '0.3rem', cursor: 'pointer',
                  border: `1px solid ${active ? tColor : 'rgba(255,255,255,0.15)'}`,
                  backgroundColor: active ? `${tColor}30` : 'transparent',
                  color: '#fff', fontSize: '0.72rem', fontWeight: active ? 700 : 400,
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: tColor }} />
                {t}
              </button>
            );
          })}
        </div>
        {/* Toggle goleiro */}
        <button
          onClick={() => onPatchElement({ isGoalkeeper: !element.isGoalkeeper })}
          title="Alternar goleiro"
          style={{
            padding: '0.26rem 0.5rem', borderRadius: '0.3rem', cursor: 'pointer',
            border: `1px solid ${element.isGoalkeeper ? '#fbbf24' : 'rgba(255,255,255,0.15)'}`,
            backgroundColor: element.isGoalkeeper ? 'rgba(251,191,36,0.18)' : 'transparent',
            color: element.isGoalkeeper ? '#fbbf24' : 'rgba(255,255,255,0.75)',
            fontSize: '0.72rem', fontWeight: 600,
          }}>
          GK
        </button>
        <button onClick={onRemove}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.55rem', background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.3rem', fontSize: '0.72rem', cursor: 'pointer' }}>
          <Trash2 size={12} /> Remover
        </button>
      </div>
    );
  }

  if (drawing) {
    return (
      <div style={panelStyle} onKeyDown={stop}>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desenho</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {DRAWING_COLORS.map((c) => (
            <button key={c}
              onClick={() => onPatchDrawing(drawing.drawType?.startsWith('zone') ? { color: hexToRgbaStr(c, 0.15), strokeColor: hexToRgbaStr(c, 0.5) } : { color: c })}
              title={c}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                border: (drawing.color === c || drawing.strokeColor?.includes(hexPartial(c))) ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                backgroundColor: c, cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>
        {['arrow_straight', 'arrow_curved', 'free_draw'].includes(drawing.drawType) && (
          <input
            type="range" min={1} max={6} step={0.5}
            value={drawing.strokeWidth || 2.5}
            onChange={(e) => onPatchDrawing({ strokeWidth: Number(e.target.value) })}
            title="Espessura"
            style={{ width: 70 }}
          />
        )}
        <button onClick={onRemove}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.55rem', background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.3rem', fontSize: '0.72rem', cursor: 'pointer' }}>
          <Trash2 size={12} /> Remover
        </button>
      </div>
    );
  }

  // Bola / marcador
  const canRotate = element?.type === 'marker' && ROTATABLE_MARKERS.has(element.markerType);
  const rot = ((element?.rotation || 0) % 360 + 360) % 360;
  const rotate = (delta) => {
    const next = (((element.rotation || 0) + delta) % 360 + 360) % 360;
    onPatchElement({ rotation: next });
  };
  const rotBtnStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: '0.3rem', cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.07)',
    color: '#fff',
  };
  return (
    <div style={panelStyle}>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
        {element?.type === 'ball' ? 'Bola' : 'Objeto'}
      </span>
      {canRotate && (
        <>
          <button onClick={() => rotate(-45)} title="Girar 45° anti-horário" style={rotBtnStyle}>
            <RotateCcw size={13} />
          </button>
          <input
            type="range" min={0} max={345} step={15} value={rot}
            onChange={(e) => onPatchElement({ rotation: Number(e.target.value) })}
            title="Rotação fina (passos de 15°)"
            style={{ width: 84 }}
          />
          <button onClick={() => rotate(45)} title="Girar 45° horário" style={rotBtnStyle}>
            <RotateCw size={13} />
          </button>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>
            {rot}°
          </span>
        </>
      )}
      <button onClick={onRemove}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.55rem', background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.3rem', fontSize: '0.72rem', cursor: 'pointer' }}>
        <Trash2 size={12} /> Remover
      </button>
    </div>
  );
}

function hexToRgbaStr(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function hexPartial(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── Sidebar (compacta, só ícones com tooltip) ──
function Sidebar({ openSection, setOpenSection, canUndo, canRedo, onUndo, onRedo, onSave, onLoad, onExport, canExport, exporting, onReset, primary }) {
  const item = (key, Icon, label, onClick, opts = {}) => {
    const active = openSection === key;
    const disabled = opts.disabled;
    return (
      <button
        key={key || label}
        onClick={() => { if (disabled) return; onClick ? onClick() : setOpenSection(active ? null : key); }}
        title={label}
        aria-label={label}
        style={{
          width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? `${primary}30` : 'transparent',
          border: 'none',
          borderLeft: active ? `2px solid ${primary}` : '2px solid transparent',
          color: disabled ? 'rgba(255,255,255,0.25)' : (active ? primary : 'rgba(255,255,255,0.85)'),
          cursor: disabled ? 'default' : 'pointer',
          transition: 'all 0.12s',
        }}
        onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={(e) => { if (!disabled && !active) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={19} strokeWidth={1.85} />
      </button>
    );
  };
  const divider = (
    <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0.3rem 0.5rem' }} />
  );

  return (
    <div style={{
      width: 44,
      flexShrink: 0,
      backgroundColor: 'rgba(11,18,32,0.82)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: '0.3rem',
      paddingBottom: '0.3rem',
      maxHeight: 'calc(100dvh - 20px)',
      overflowY: 'auto',
    }}>
      {item('players',    UserPlus,   'Peças')}
      {item('formations', LayoutGrid, 'Formações')}
      {item('arrows',     ArrowRight, 'Setas')}
      {item('draw',       Pencil,     'Desenho')}
      {item('objects',    Cone,       'Objetos')}
      {divider}
      {item(null, Save,       'Salvar jogada (Ctrl+S)',   onSave)}
      {item(null, FolderOpen, 'Abrir jogada',    onLoad)}
      {item(null, exporting ? Pause : Film, canExport ? 'Exportar vídeo' : 'Crie um 2º frame para animar (botão +)', onExport, { disabled: !canExport })}
      {divider}
      {item(null, Undo2, 'Desfazer (Ctrl+Z)', onUndo, { disabled: !canUndo })}
      {item(null, Redo2, 'Refazer (Ctrl+Y)',  onRedo, { disabled: !canRedo })}
      {divider}
      {item(null, Trash2, 'Limpar tudo', onReset)}
    </div>
  );
}

// Botão flutuante do chrome imersivo (sobre o campo).
function FloatBtn({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 40, height: 40, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, cursor: 'pointer',
        backgroundColor: active ? 'rgba(200,255,0,0.16)' : 'rgba(11,18,32,0.72)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${active ? 'rgba(200,255,0,0.5)' : 'rgba(255,255,255,0.12)'}`,
        color: active ? '#c8ff00' : '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </button>
  );
}

// Gate de paisagem no mobile — o campo precisa de tela deitada pra ser usável.
function LandscapeGate({ onBack }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      backgroundColor: '#0b1220',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '1.1rem', padding: '2rem', textAlign: 'center',
    }}>
      <div style={{
        width: 76, height: 76, borderRadius: '50%',
        backgroundColor: 'rgba(200,255,0,0.12)', color: '#c8ff00',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'tp-rotate-hint 2.4s ease-in-out infinite',
      }}>
        <RotateCw size={36} />
      </div>
      <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>Gire o aparelho</div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', maxWidth: 300 }}>
        O Quadro Tático usa a tela deitada (paisagem) pra o campo caber inteiro.
      </div>
      <button onClick={onBack}
        style={{
          marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer',
          backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.8)',
          fontSize: '0.82rem',
        }}>
        <ArrowLeft size={15} /> Voltar
      </button>
      <style>{`@keyframes tp-rotate-hint { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-90deg)} }`}</style>
    </div>
  );
}

// ── Flyout (painel flutuante ao lado do rail de ferramentas) ──
function Flyout({ title, onClose, children }) {
  const isMobile = useIsMobile();
  // No modo imersivo o wrapper já posiciona o Flyout; aqui é só o cartão.
  const containerStyle = {
    width: isMobile ? 'min(260px, calc(100vw - 84px))' : 260,
    maxHeight: '100%',
    backgroundColor: 'rgba(11,18,32,0.92)',
    backdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  };
  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 2 }}>
          <X size={15} />
        </button>
      </div>
      <div style={{ padding: '0.65rem 0.7rem', overflowY: 'auto', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Flyouts específicos ──
function PlayersFlyout({ teamAColor, teamBColor, setTeamAColor, setTeamBColor, onAddA, onAddB, onAddGKA, onAddGKB, onAddBall, onOpenPalette }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <FlyoutLabel>Times</FlyoutLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <FlyBtn onClick={onAddA} color={teamAColor}><Plus size={11} /> Jogador A</FlyBtn>
          <FlyBtn onClick={onAddB} color={teamBColor}><Plus size={11} /> Jogador B</FlyBtn>
          <FlyBtn onClick={onAddGKA} color={teamAColor} small>GK Time A</FlyBtn>
          <FlyBtn onClick={onAddGKB} color={teamBColor} small>GK Time B</FlyBtn>
        </div>
      </div>
      <div>
        <FlyoutLabel>Bola e plantel</FlyoutLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <FlyBtn onClick={onAddBall}>Bola</FlyBtn>
          <FlyBtn onClick={onOpenPalette}><Users size={12} /> Plantel</FlyBtn>
        </div>
      </div>
      <div>
        <FlyoutLabel>Cores das equipes</FlyoutLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ColorRow label="Time A" color={teamAColor} setColor={setTeamAColor} />
          <ColorRow label="Time B" color={teamBColor} setColor={setTeamBColor} />
        </div>
      </div>
    </div>
  );
}

function ArrowsFlyout({ activeToolId, onActivate, drawingColor, setDrawingColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <FlyoutLabel>Tipo de seta</FlyoutLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ARROW_TOOLS.map((t) => (
            <FlyBtn key={t.id} onClick={() => onActivate(t)} active={activeToolId === t.id}>
              <ArrowRight size={13} style={{ color: t.color }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{t.label}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{t.desc}</span>
            </FlyBtn>
          ))}
        </div>
      </div>
      <div>
        <FlyoutLabel>Cor</FlyoutLabel>
        <ColorPalette current={drawingColor} onPick={setDrawingColor} />
      </div>
    </div>
  );
}

function DrawFlyout({ activeToolId, onActivate, drawingColor, setDrawingColor }) {
  const tools = [
    { id: 'free_draw',   mode: 'free_draw',   icon: PenLine,    label: 'Desenho livre' },
    { id: 'zone_rect',   mode: 'zone_rect',   icon: SquareIcon, label: 'Zona retangular' },
    { id: 'zone_circle', mode: 'zone_circle', icon: CircleIcon, label: 'Zona circular' },
    { id: 'text',        mode: 'text',        icon: Type,       label: 'Texto' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <FlyoutLabel>Ferramenta</FlyoutLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <FlyBtn key={t.id} onClick={() => onActivate(t.id, t.mode)} active={activeToolId === t.id}>
                <Icon size={13} /><span>{t.label}</span>
              </FlyBtn>
            );
          })}
        </div>
      </div>
      <div>
        <FlyoutLabel>Cor</FlyoutLabel>
        <ColorPalette current={drawingColor} onPick={setDrawingColor} />
      </div>
    </div>
  );
}

function ObjectsFlyout({ onAdd, isMobile }) {
  return (
    <div>
      <FlyoutLabel>Adicionar objeto</FlyoutLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {MARKER_TYPES.map((m) => (
          <FlyBtn key={m.type} onClick={() => onAdd(m.type)} minHeight={isMobile ? 44 : undefined}>
            <span style={{ width: 14, textAlign: 'center', fontSize: '0.85rem' }}>{m.icon}</span>
            <span>{m.label}</span>
          </FlyBtn>
        ))}
      </div>
    </div>
  );
}

// Mini-campo SVG do card de formação: um ponto por posição.
// Espelha ao vivo quando o alvo é o Time B.
function FormationPreview({ positions, mirrored, color }) {
  const pts = mirrored ? mirrorFormation(positions) : positions;
  return (
    <svg width={72} height={46} viewBox="0 0 100 64" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={0.5} y={0.5} width={99} height={63} rx={3} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={50} y1={0.5} x2={50} y2={63.5} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      <circle cx={50} cy={32} r={9} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={(p.y / 100) * 64} r={3.2} fill={color} opacity={p.isGoalkeeper ? 0.75 : 1} />
      ))}
    </svg>
  );
}

function FormationsFlyout({ formations, target, setTarget, teamAColor, teamBColor, onApply, isMobile }) {
  const entries = Object.entries(formations || {});
  if (entries.length === 0) return <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Sem formações para esse tipo de campo.</div>;

  const chips = [
    { key: 'A',    label: 'Time A', dot: teamAColor },
    { key: 'B',    label: 'Time B', dot: teamBColor },
    { key: 'both', label: 'Ambos',  dot: null },
  ];
  const previewColor = target === 'B' ? teamBColor : teamAColor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <FlyoutLabel>Aplicar em</FlyoutLabel>
        <div style={{ display: 'flex', gap: 4 }}>
          {chips.map((c) => {
            const active = target === c.key;
            return (
              <button key={c.key}
                onClick={() => setTarget(c.key)}
                style={{
                  flex: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '0.4rem 0.3rem',
                  minHeight: isMobile ? 44 : undefined,
                  backgroundColor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '0.4rem',
                  color: '#fff', fontSize: '0.72rem', fontWeight: active ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>
                {c.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />}
                {c.key === 'both' && (
                  <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: teamAColor }} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: teamBColor, marginLeft: -3 }} />
                  </span>
                )}
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FlyoutLabel>Formação</FlyoutLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([key, f]) => (
            <button key={key}
              onClick={() => onApply(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.45rem 0.55rem',
                minHeight: isMobile ? 44 : undefined,
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '0.45rem',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '0.78rem', fontWeight: 600,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
            >
              <FormationPreview positions={f.positions} mirrored={target === 'B'} color={previewColor} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
        Reposiciona apenas o time escolhido. O outro time, a bola e os desenhos não mudam. Ctrl+Z desfaz.
      </div>
    </div>
  );
}

function ViewFlyout({ fieldType, setFieldType, fieldView, setFieldView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <FlyoutLabel>Tipo de campo</FlyoutLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {FIELD_TYPE_OPTIONS.map((o) => (
            <FlyBtn key={o.type} onClick={() => setFieldType(o.type)} active={fieldType === o.type}>{o.label}</FlyBtn>
          ))}
        </div>
      </div>
      <div>
        <FlyoutLabel>Vista do campo</FlyoutLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {FIELD_VIEW_OPTIONS.map((v) => (
            <FlyBtn key={v.view} onClick={() => setFieldView(v.view)} active={fieldView === v.view}>{v.label}</FlyBtn>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Primitivos visuais ──
function FlyoutLabel({ children }) {
  return (
    <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>
      {children}
    </div>
  );
}

function FlyBtn({ onClick, active, children, color, small, minHeight }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '0.32rem 0.5rem' : '0.42rem 0.55rem',
        minHeight,
        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '0.35rem',
        color: color || 'rgba(255,255,255,0.9)',
        fontSize: small ? '0.7rem' : '0.74rem',
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
    >
      {children}
    </button>
  );
}

function ColorPalette({ current, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {DRAWING_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          title={c}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            border: current === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.18)',
            backgroundColor: c, cursor: 'pointer', padding: 0,
          }}
        />
      ))}
    </div>
  );
}

function ColorRow({ label, color, setColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', width: 50 }}>{label}</span>
      <input
        type="color" value={color} onChange={(e) => setColor(e.target.value)}
        style={{ width: 28, height: 22, border: 'none', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}
      />
      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{color}</span>
    </div>
  );
}

function TopBtn({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.08)',
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        color: '#fff', cursor: 'pointer',
        borderRadius: '0.35rem',
      }}
    >
      {children}
    </button>
  );
}

// Hint discreto no topo pra sugerir modo paisagem. Some após 5s
// ou quando o usuário rotaciona pra landscape.
function MobileRotateHint({ colors }) {
  const [visible, setVisible] = useState(true);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  );
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  if (!visible || isLandscape) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 90,
      backgroundColor: 'rgba(15,23,42,0.9)',
      color: '#fff',
      padding: '0.5rem 0.9rem',
      borderRadius: '999px',
      fontSize: '0.72rem',
      fontWeight: 600,
      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', gap: '0.4rem',
      pointerEvents: 'none',
    }}>
      <Smartphone size={13} />
      Gire o aparelho pra paisagem — cabe mais campo
    </div>
  );
}

function ShortcutsModal({ onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 380,
        backgroundColor: '#0f0f1e', color: '#fff',
        borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>Atalhos de teclado</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '0.85rem 1rem' }}>
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <kbd style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.45rem', borderRadius: '0.25rem', color: '#fff' }}>{keys}</kbd>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
