import { useState, useEffect, useMemo } from 'react';
import { deliverPdf } from '../../lib/deliverFile';
import { X, Trophy, Users, Plus, Trash2, Goal, Shield, AlertTriangle, Clock, UserPlus, Wand2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../common/Button';
import { PlayerSelectionModal } from './PlayerSelectionModal';
import { EventModal } from './EventModal';
import { gameService } from '../../services/gameService';
import { useAthletes } from '../../modules/training-management/hooks/useAthletes';
import { useSportConfig } from '../../hooks/useSportConfig';
import { useClub } from '../../contexts/ClubContext';
import { competitionService } from '../../services/competitionService';
import { LineupField } from './LineupField';
import { SlotAthletePicker } from './SlotAthletePicker';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formationsFor, resolveFormation, buildSlots, slotCount, slotRole, remapFormation, suggestSlots } from '../../lib/formation';
import { preloadAthletePhotos } from '../../modules/training-management/utils/pdfGenerator';
import { drawLineupOnPdf } from '../../utils/pdfLineupRender';
import { readJersey, computeMinutesPlayed } from '../../lib/lineupLayout';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_THEME, addTitleStrip, drawCover, paginate, applyClubPrimaryColor, setFillHex, setTextHex, setDrawHex } from '../../utils/pdfTheme';
import { newWorkbook, addSheet, saveWorkbook, addMetaSheet } from '../../utils/excelTheme';
import { ExportMenu } from '../common/ExportMenu';
import { notify } from '../../lib/notify';

export function GameModal({ isOpen, onClose, session, onSave }) {
  const { colors } = useTheme();
  const { athletes } = useAthletes();
  const sport = useSportConfig();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile(820);

  const [opponentName, setOpponentName] = useState('');
  const [matchDuration, setMatchDuration] = useState(sport.defaultDuration);
  const [competitionId, setCompetitionId] = useState('');
  const [matchRound, setMatchRound] = useState('');
  const [matchLocation, setMatchLocation] = useState(''); // 'home' | 'away' | ''
  const [videoFullUrl, setVideoFullUrl] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [formation, setFormation] = useState(() => resolveFormation(sport.modality, null));
  // Vaga aberta no seletor de atleta (índice) e atleta sendo movido de vaga.
  const [pickerSlot, setPickerSlot] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sub-modais
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  useEffect(() => {
    if (isOpen && session) {
      loadMatchData();
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen || !selectedClub?.id) return;
    let cancel = false;
    (async () => {
      try {
        const list = await competitionService.list({ clubId: selectedClub.id });
        if (!cancel) setCompetitions(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('Erro ao carregar campeonatos:', err);
      }
    })();
    return () => { cancel = true; };
  }, [isOpen, selectedClub?.id]);

  const loadMatchData = async () => {
    if (!session?.id) return;

    setLoading(true);
    try {
      // Carregar dados existentes
      setOpponentName(session.opponent_name || '');
      setMatchDuration(session.match_duration || sport.defaultDuration);
      setCompetitionId(session.competition_id || '');
      setMatchRound(session.match_round || '');
      setMatchLocation(session.match_location || '');
      setVideoFullUrl(session.video_full_url || '');

      const matchData = await gameService.getMatchData(session.id);
      // Jogo sem formação (antigo) → padrão da modalidade; titulares sem vaga
      // ficam em "sem vaga" pro usuário encaixar.
      const f = resolveFormation(sport.modality, matchData.formation ?? session.formation);
      const total = slotCount(f);
      setFormation(f);
      setPickerSlot(null);
      setMovingId(null);

      setSelectedPlayers(matchData.players.map(p => ({
        athlete_id: p.athlete_id,
        status: p.status,
        slot: (p.status === 'starter' && Number.isInteger(p.slot) && p.slot >= 0 && p.slot < total) ? p.slot : null,
        minutes_played: p.minutes_played || 0,
        // Camisa por JOGO: usa o override se existir, senão o nº permanente do plantel
        jersey_number: (p.jersey_number != null && p.jersey_number !== '') ? p.jersey_number : (p.athlete?.jersey_number ?? ''),
        athlete: p.athlete,
        name: p.athlete?.name,
      })));

      setEvents(matchData.events.map(e => ({
        id: e.id,
        event_type: e.event_type,
        team: e.team,
        goal_type: e.goal_type,
        minute: e.minute,
        player: e.player,
        secondary_player: e.secondary_player,
        player_id: e.player_id,
        secondary_player_id: e.secondary_player_id,
      })));
    } catch (error) {
      console.error('Erro ao carregar dados do jogo:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session?.id) return;

    setSaving(true);
    try {
      // Recalcula minutos jogados a partir dos eventos antes de salvar.
      // Em futsal o cálculo retorna 0 pra todos (não rastreamos).
      const playersToSave = selectedPlayers.map((p) => ({
        ...p,
        minutes_played: sport.tracksMinutes
          ? computeMinutesPlayed(p, events, matchDuration)
          : 0,
      }));
      await gameService.saveAllMatchData(session.id, {
        formation,
        opponent_name: opponentName,
        match_duration: matchDuration,
        players: playersToSave,
        events: events,
        competition_id: competitionId || null,
        match_round: matchRound || null,
        match_location: matchLocation || null,
        video_full_url: videoFullUrl || null,
      });

      onSave?.({
        opponent_name: opponentName,
        match_duration: matchDuration,
        competition_id: competitionId || null,
        match_round: matchRound || null,
        match_location: matchLocation || null,
        video_full_url: videoFullUrl || null,
      });

      onClose();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      notify.error(error?.message ? `Erro ao salvar dados do jogo: ${error.message}` : 'Erro ao salvar dados do jogo');
    } finally {
      setSaving(false);
    }
  };

  const handlePlayersConfirm = (players) => {
    // Mantém vaga, camisa do jogo e dados do atleta de quem já estava no jogo.
    // Quem virou reserva (ou saiu) perde a vaga no campo.
    setSelectedPlayers(players.map(p => {
      const prev = selectedPlayers.find(sp => sp.athlete_id === p.athlete_id);
      const athlete = prev?.athlete || athletes.find(a => a.id === p.athlete_id) || p.athlete;
      return {
        ...p,
        athlete,
        jersey_number: prev ? prev.jersey_number : (p.jersey_number ?? ''),
        slot: p.status === 'starter' ? (prev?.slot ?? null) : null,
        minutes_played: prev?.minutes_played || 0,
      };
    }));
    setMovingId(null);
    setShowPlayerModal(false);
  };

  // ---------- Escalação no campo (por vaga) ----------
  const slots = useMemo(() => buildSlots(formation), [formation]);
  const occupantOf = (slot) => selectedPlayers.find(p => p.status === 'starter' && p.slot === slot) || null;

  // Coloca um atleta do plantel numa vaga. Se ele já estava em outra vaga,
  // as duas trocam; quem estava na vaga e não tem pra onde ir vira reserva.
  const placeAthlete = (slot, athlete) => {
    const occupant = occupantOf(slot);
    const existing = selectedPlayers.find(p => p.athlete_id === athlete.id);
    if (existing && existing.status === 'starter' && existing.slot === slot) return;
    const fromSlot = existing && existing.status === 'starter' ? existing.slot : null;

    let next = selectedPlayers.map(p => {
      if (p.athlete_id === athlete.id) return { ...p, status: 'starter', slot };
      if (occupant && p.athlete_id === occupant.athlete_id) {
        return fromSlot != null ? { ...p, slot: fromSlot } : { ...p, status: 'substitute', slot: null };
      }
      return p;
    });
    if (!existing) {
      next = [...next, {
        athlete_id: athlete.id,
        status: 'starter',
        slot,
        minutes_played: 0,
        jersey_number: athlete.jersey_number ?? '',
        athlete,
        name: athlete.name,
      }];
    }
    setSelectedPlayers(next);
    if (occupant && fromSlot == null) notify.success(`${occupant.name || occupant.athlete?.name} foi para as reservas`);
  };

  // Move o atleta em "movingId" para a vaga clicada (troca com quem estiver lá).
  const moveTo = (slot) => {
    const mover = selectedPlayers.find(p => p.athlete_id === movingId);
    setMovingId(null);
    if (!mover || mover.slot === slot) return;
    const occupant = occupantOf(slot);
    const fromSlot = mover.status === 'starter' ? mover.slot : null;
    setSelectedPlayers(selectedPlayers.map(p => {
      if (p.athlete_id === mover.athlete_id) return { ...p, status: 'starter', slot };
      if (occupant && p.athlete_id === occupant.athlete_id) return { ...p, slot: fromSlot };
      return p;
    }));
  };

  const handleSlotClick = (slot) => {
    if (movingId) { moveTo(slot); return; }
    setPickerSlot(slot);
  };

  const removeFromField = (athleteId) => {
    setSelectedPlayers(selectedPlayers.map(p => p.athlete_id === athleteId ? { ...p, status: 'substitute', slot: null } : p));
  };

  const removeFromGame = (athleteId) => {
    if (movingId === athleteId) setMovingId(null);
    setSelectedPlayers(selectedPlayers.filter(p => p.athlete_id !== athleteId));
  };

  const changeFormation = (next) => {
    if (next === formation) return;
    const { players, displaced } = remapFormation(selectedPlayers, formation, next);
    setSelectedPlayers(players);
    setFormation(next);
    setMovingId(null);
    if (displaced.length > 0) {
      const nomes = displaced.map(p => p.name || p.athlete?.name).filter(Boolean).join(', ');
      notify.info(`${displaced.length === 1 ? '1 atleta ficou' : `${displaced.length} atletas ficaram`} sem vaga na ${next}: ${nomes}. Toque no atleta destacado para reposicionar.`, { icon: '⚠️', duration: 6000 });
    }
  };

  const applySuggestion = () => {
    const before = selectedPlayers.filter(p => p.status === 'starter' && p.slot == null).length;
    const next = suggestSlots(selectedPlayers, formation);
    const after = next.filter(p => p.status === 'starter' && p.slot == null).length;
    setSelectedPlayers(next);
    if (before - after > 0) notify.success(`${before - after} encaixado(s) pela posição cadastrada. Confira e ajuste se precisar.`);
  };

  const handleAddEvent = (event) => {
    setEvents([...events, { ...event, id: Date.now() }]);
    setShowEventModal(false);
  };

  const handleRemoveEvent = (eventId) => {
    setEvents(events.filter(e => e.id !== eventId));
  };

  // Minutos jogados não são editáveis manualmente — vêm dos eventos de
  // substituição (calculados em tempo real). Em futsal nem rastreamos.

  const updatePlayerJersey = (athleteId, raw) => {
    const v = raw === '' ? '' : Math.min(99, Math.max(1, parseInt(raw) || 0));
    setSelectedPlayers(selectedPlayers.map(p =>
      p.athlete_id === athleteId ? { ...p, jersey_number: v } : p
    ));
  };

  if (!isOpen) return null;

  // Titulares em ordem de vaga; quem está sem vaga vai para o fim.
  const starters = selectedPlayers
    .filter(p => p.status === 'starter')
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  const unplaced = starters.filter(p => p.slot == null);
  const freeSlots = slots.length - (starters.length - unplaced.length);
  const substitutes = selectedPlayers.filter(p => p.status === 'substitute');

  const goalsScored = events.filter(e => e.event_type === 'goal_scored').length;
  const goalsConceded = events.filter(e => e.event_type === 'goal_conceded').length;

  const getEventIcon = (type) => {
    switch (type) {
      case 'goal_scored': return <Goal size={16} color="#22c55e" />;
      case 'goal_conceded': return <Shield size={16} color="#ef4444" />;
      case 'red_card': return <AlertTriangle size={16} color="#dc2626" />;
      default: return null;
    }
  };

  const getEventLabel = (event) => {
    switch (event.event_type) {
      case 'goal_scored': return 'Gol Feito';
      case 'goal_conceded': return 'Gol Tomado';
      case 'red_card': return `Expulsão (${event.team === 'own' ? 'Nosso' : 'Adv.'})`;
      default: return '';
    }
  };

  const getGoalTypeLabel = (goalType) => {
    const types = {
      'offensive_org': 'Org. Ofensiva',
      'offensive_transition': 'Transição Of.',
      'free_kick': 'Falta',
      'corner': 'Escanteio',
      'penalty': 'Pênalti',
    };
    return types[goalType] || '';
  };

  const exportToPdf = async () => {
    if (selectedPlayers.length === 0) {
      notify.error('Selecione jogadores antes de exportar');
      return;
    }
    const resetColor = applyClubPrimaryColor(selectedClub?.primary_color || null);
    try {

    const gameDate = session?.date ? session.date.split('-').reverse().join('/') : '';
    const opponent = opponentName || 'Adversário';
    const clubName = selectedClub?.name || '';

    // Pré-carrega fotos
    const photoMap = await preloadAthletePhotos(
      selectedPlayers.map(p => ({ id: p.athlete_id, photo_url: p.athlete?.photo_url }))
    );
    const detectFmt = (dataUrl) => dataUrl?.startsWith('data:image/png') ? 'PNG'
      : dataUrl?.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';

    // LANDSCAPE — estilo U.E.C.
    const doc = new jsPDF({ orientation: PDF_THEME.orientation, unit: 'mm', format: PDF_THEME.pageFormat });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = PDF_THEME.margins;
    const totalW = pageW - M.left - M.right;
    const colGap = 4;

    // ============ PÁGINA 1: Capa ============
    drawCover(doc, {
      title: 'Convocação',
      subtitle: `vs ${opponent}`,
      clubName,
      periodLabel: gameDate,
    });

    // ============ PÁGINA 2: Tabelas (Titulares | Reservas em colunas) ============
    doc.addPage();
    let y = addTitleStrip(doc, { section: `Convocação · vs ${opponent}`, clubName });

    const hexRgb = (hex) => {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };

    const PHOTO_W = 10;
    const drawTable = (label, rows, startIdx, x, w) => {
      // Pill do título
      setFillHex(doc, PDF_THEME.colors.primary);
      doc.roundedRect(x, y + 4, w, 8, 1, 1, 'F');
      doc.setFont(PDF_THEME.fonts.family, 'bold');
      doc.setFontSize(11);
      setTextHex(doc, PDF_THEME.colors.light);
      doc.text(`${label} (${rows.length})`.toUpperCase(), x + w / 2, y + 9.5, { align: 'center' });

      autoTable(doc, {
        startY: y + 14,
        head: [['', '#', 'Cam.', 'Nome', 'Pos.']],
        body: rows.map((p, idx) => [
          '',
          startIdx + idx + 1,
          readJersey(p) ?? '-',
          p.name || p.athlete?.name,
          slotRole(formation, p.slot) || (p.status === 'starter' ? 'S/V' : (p.athlete?.position || '—')),
        ]),
        theme: 'plain',
        headStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt), textColor: hexRgb(PDF_THEME.colors.text), fontStyle: 'bold', fontSize: 9, cellPadding: 1.8 },
        bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 1.8, minCellHeight: 11, valign: 'middle' },
        alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surface) },
        columnStyles: {
          0: { cellWidth: PHOTO_W, halign: 'center' },
          1: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 16, halign: 'center' },
        },
        margin: { left: x, right: pageW - (x + w) },
        tableWidth: w,
        styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
        didDrawCell: (hookData) => {
          if (hookData.section !== 'body' || hookData.column.index !== 0) return;
          const player = rows[hookData.row.index];
          const dataUrl = player && photoMap.get(player.athlete_id);
          if (!dataUrl) return;
          const { x, y, width, height } = hookData.cell;
          const side = Math.min(width, height) - 1.2;
          const cx = x + (width - side) / 2;
          const cy = y + (height - side) / 2;
          try { doc.addImage(dataUrl, detectFmt(dataUrl), cx, cy, side, side, undefined, 'FAST'); }
          catch (err) { /* ignora */ }
        },
      });
    };

    // 2 colunas: Titulares (esquerda) | Reservas (direita)
    const halfW = (totalW - colGap) / 2;
    if (starters.length > 0)    drawTable('Titulares', starters, 0, M.left, halfW);
    if (substitutes.length > 0) drawTable('Reservas',  substitutes, starters.length, M.left + halfW + colGap, halfW);

    // ============ PÁGINA 3: Escalação no campo ============
    if (starters.length > 0) {
      doc.addPage();
      y = addTitleStrip(doc, { section: `Escalação · ${formation}`, clubName });

      // Campo no centro da página
      const fH = pageH - y - M.bottom - 12;
      const fW = fH / 1.5;
      const fX = (pageW - fW) / 2;
      const fY = y + 4;
      drawLineupOnPdf(doc, {
        x: fX, y: fY, w: fW, h: fH,
        players: selectedPlayers,
        formation,
        modality: sport.modality,
        photoMap,
      });

      // Legenda (+ titulares que ainda não têm vaga no campo)
      doc.setFont(PDF_THEME.fonts.family, 'normal');
      doc.setFontSize(8);
      setTextHex(doc, PDF_THEME.colors.textMuted);
      if (unplaced.length > 0) {
        const nomes = unplaced.map(p => p.name || p.athlete?.name).filter(Boolean).join(', ');
        doc.text(doc.splitTextToSize(`Titulares sem vaga no campo: ${nomes}`, totalW)[0], M.left, pageH - M.bottom - 6);
      }
      doc.text('Camisas exibidas são as deste jogo (fallback: nº permanente do plantel).', M.left, pageH - M.bottom - 2);
    }

    paginate(doc);
    const fileName = `Convocacao_${opponent.replace(/\s+/g, '_')}_${gameDate.replace(/\//g, '-')}.pdf`;
    deliverPdf(doc, fileName);
    } finally { resetColor(); }
  };

  const exportToExcel = () => {
    if (selectedPlayers.length === 0) {
      notify.error('Selecione jogadores antes de exportar');
      return;
    }
    const gameDate = session?.date ? session.date.split('-').reverse().join('/') : '';
    const opponent = opponentName || 'Adversário';

    const wb = newWorkbook({ title: `Convocação vs ${opponent}` });
    addMetaSheet(wb, {
      title: `Convocação vs ${opponent}`,
      period: gameDate,
      totals: [
        ['Total de jogadores', selectedPlayers.length],
        ['Titulares', starters.length],
        ['Reservas', substitutes.length],
      ],
    });

    const allRows = [['#', 'Status', `Vaga (${formation})`, 'Camisa', 'Nome']];
    starters.forEach((p, i) => allRows.push([i + 1, 'Titular', slotRole(formation, p.slot) || 'Sem vaga', p.jersey_number || '', p.name || p.athlete?.name || '']));
    substitutes.forEach((p, i) => allRows.push([starters.length + i + 1, 'Reserva', '', p.jersey_number || '', p.name || p.athlete?.name || '']));
    addSheet(wb, 'Convocação', allRows, { widths: [6, 12, 14, 10, 32], freezeHeader: true, autoFilter: true });

    saveWorkbook(wb, `Convocacao_${opponent.replace(/\s+/g, '_')}_${gameDate.replace(/\//g, '-')}.xlsx`);
  };

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: isMobile ? 0 : '1rem',
    backdropFilter: 'blur(2px)',
  };

  const modalStyle = {
    backgroundColor: colors.background,
    borderRadius: isMobile ? 0 : '0.75rem',
    width: '100%',
    maxWidth: '1400px',
    height: isMobile ? '100dvh' : '95vh',
    maxHeight: isMobile ? '100dvh' : '95vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    border: `1px solid ${colors.border}`,
  };

  const headerStyle = {
    padding: '0.6rem 1.25rem',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  };

  const contentStyle = {
    flex: 1,
    overflow: 'auto',
    padding: isMobile ? '0.65rem 0.75rem' : '0.75rem 1.25rem',
    minHeight: 0,
  };

  const footerStyle = {
    padding: '0.6rem 1.25rem',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    flexShrink: 0,
  };

  const inputStyle = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: '0.9rem',
    outline: 'none',
  };

  const sectionStyle = {
    backgroundColor: colors.surface,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
    padding: '0.6rem 0.7rem',
    height: isMobile ? 'auto' : '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  };

  const sectionTitleStyle = {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
  };

  const playerRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0',
    borderBottom: `1px solid ${colors.border}20`,
  };

  const eventRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: colors.background,
    borderRadius: '0.375rem',
    marginBottom: '0.5rem',
  };

  return (
    <>
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          {/* Header — compacto: título inline com a data */}
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Trophy size={18} style={{ color: colors.primary }} />
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>
                Dados do Jogo
              </h2>
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                · {session?.day_name} {session?.date ? session.date.split('-').reverse().join('/') : ''}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                color: colors.textSecondary,
              }}
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div style={contentStyle}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: colors.textSecondary }}>
                Carregando...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: '100%' }}>
                {/* Topo COMPACTO: todos os metadados em UMA faixa horizontal + placar inline.
                    O label de cada campo vira chip pequeno acima do input. */}
                {(() => {
                  const labelStyle = { display: 'block', marginBottom: '0.18rem', fontSize: '0.62rem', fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.02em' };
                  const compactInput = { ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.78rem' };
                  return (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile
                        ? 'repeat(2, minmax(0, 1fr))'
                        : 'minmax(160px, 2.2fr) 80px 75px minmax(160px, 1.8fr) 55px minmax(140px, 1.5fr) 110px',
                      gap: '0.5rem',
                      alignItems: 'end',
                    }}>
                      <div>
                        <label style={labelStyle}>Adversário</label>
                        <input type="text" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Nome do adversário" style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Local</label>
                        <select value={matchLocation} onChange={(e) => setMatchLocation(e.target.value)} style={compactInput}>
                          <option value="">—</option>
                          <option value="home">Casa</option>
                          <option value="away">Fora</option>
                          <option value="neutral">Neutro</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Duração</label>
                        <input type="number" value={matchDuration} onChange={(e) => setMatchDuration(parseInt(e.target.value) || sport.defaultDuration)} min="1" max="150" style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Campeonato</label>
                        <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} style={compactInput}>
                          <option value="">— sem campeonato —</option>
                          {competitions.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}{c.season ? ` · ${c.season}` : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Rodada</label>
                        <input type="text" value={matchRound} onChange={(e) => setMatchRound(e.target.value)} placeholder="Nº" style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Vídeo</label>
                        <input type="url" value={videoFullUrl} onChange={(e) => setVideoFullUrl(e.target.value)} placeholder="YouTube / Drive" style={compactInput} />
                      </div>
                      {/* Placar inline minimalista */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.4rem',
                        backgroundColor: `${colors.primary}10`,
                        borderRadius: '0.35rem',
                        border: `1px solid ${colors.border}`,
                        height: 'fit-content',
                      }}>
                        <div style={{ textAlign: 'center', minWidth: 24 }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{goalsScored}</div>
                          <div style={{ fontSize: '0.5rem', color: colors.textSecondary, marginTop: 1 }}>FEITOS</div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: colors.textSecondary, fontWeight: 600 }}>×</div>
                        <div style={{ textAlign: 'center', minWidth: 24 }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>{goalsConceded}</div>
                          <div style={{ fontSize: '0.5rem', color: colors.textSecondary, marginTop: 1 }}>SOFRIDOS</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Row 2: 3 colunas - Campo | Jogadores | Eventos */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(280px, 330px) minmax(0, 1fr) minmax(0, 1fr)',
                  gap: '0.65rem',
                  flex: 1,
                  minHeight: 0,
                }}>
                  {/* Coluna 1: Campo — vagas da formação; clicar numa vaga escolhe o atleta */}
                  <div style={sectionStyle}>
                    <div style={{ ...sectionTitleStyle, justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Trophy size={18} color={colors.primary} />
                        <span>Escalação no campo</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 600 }}>
                        Formação
                        <select
                          value={formation}
                          onChange={(e) => changeFormation(e.target.value)}
                          aria-label="Formação tática"
                          style={{ ...inputStyle, width: 'auto', padding: '0.3rem 0.45rem', fontSize: isMobile ? '16px' : '0.8rem', fontWeight: 700 }}
                        >
                          {formationsFor(sport.modality).map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </label>
                    </div>

                    {movingId && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem',
                        padding: '0.4rem 0.55rem', borderRadius: '0.4rem',
                        backgroundColor: '#facc1522', border: '1px solid #facc1566',
                        fontSize: '0.75rem', color: colors.text,
                      }}>
                        <span style={{ flex: 1 }}>
                          Toque na vaga para onde vai <b>{(() => { const m = selectedPlayers.find(p => p.athlete_id === movingId); return m?.name || m?.athlete?.name; })()}</b>
                        </span>
                        <button type="button" onClick={() => setMovingId(null)} style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', color: colors.text, fontSize: '0.72rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </div>
                    )}

                    <div style={{ flex: isMobile ? 'none' : 1, minHeight: 0, overflowY: 'auto', padding: '0.15rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <LineupField
                        players={selectedPlayers}
                        formation={formation}
                        modality={sport.modality}
                        onSlotClick={handleSlotClick}
                        movingAthleteId={movingId}
                      />

                      {unplaced.length > 0 && (
                        <div style={{
                          width: '100%', maxWidth: 430, boxSizing: 'border-box',
                          padding: '0.45rem 0.55rem', borderRadius: '0.4rem',
                          backgroundColor: '#f59e0b14', border: '1px dashed #f59e0b99',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                            <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                              Titulares sem vaga ({unplaced.length})
                            </span>
                            {freeSlots > 0 && (
                              <button
                                type="button"
                                onClick={applySuggestion}
                                title="Encaixa nas vagas livres usando a posição cadastrada como sugestão"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', color: colors.text, fontSize: '0.68rem', padding: '0.2rem 0.45rem', cursor: 'pointer' }}
                              >
                                <Wand2 size={12} /> Encaixar sugestão
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {unplaced.map((p) => {
                              const ativo = movingId === p.athlete_id;
                              return (
                                <button
                                  key={p.athlete_id}
                                  type="button"
                                  onClick={() => setMovingId(ativo ? null : p.athlete_id)}
                                  title="Toque e depois escolha a vaga no campo"
                                  style={{
                                    minHeight: 32, padding: '0.25rem 0.55rem', borderRadius: '999px',
                                    border: `1px solid ${ativo ? '#facc15' : '#f59e0b88'}`,
                                    backgroundColor: ativo ? '#facc1533' : colors.background,
                                    color: colors.text, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                                    touchAction: 'manipulation',
                                  }}
                                >
                                  {p.name || p.athlete?.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {starters.length === 0 && (
                        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, textAlign: 'center' }}>
                          Toque numa vaga para escolher o atleta.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Coluna 2: Jogadores */}
                  <div style={sectionStyle}>
                    <div style={{ ...sectionTitleStyle, justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={18} color={colors.primary} />
                        <span>Jogadores ({selectedPlayers.length})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {selectedPlayers.length > 0 && (
                          <ExportMenu
                            size="sm"
                            variant="outline"
                            onExportPDF={exportToPdf}
                            onExportExcel={exportToExcel}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setShowPlayerModal(true)}
                          icon={<UserPlus size={14} />}
                        >
                          Selecionar
                        </Button>
                      </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      {selectedPlayers.length === 0 ? (
                        <div style={{
                          textAlign: 'center',
                          padding: '2rem 1rem',
                          color: colors.textSecondary,
                          fontSize: '0.85rem',
                        }}>
                          Nenhum jogador selecionado
                          <br />
                          <span style={{ fontSize: '0.75rem' }}>
                            Toque numa vaga do campo para escalar, ou em "Selecionar" para relacionar reservas
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Titulares */}
                          {starters.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <div style={{
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                color: '#22c55e',
                                marginBottom: '0.25rem',
                                textTransform: 'uppercase',
                              }}>
                                Titulares ({starters.length})
                              </div>
                              {starters.map((player) => {
                                const role = slotRole(formation, player.slot);
                                return (
                                <div key={player.athlete_id} style={playerRowStyle}>
                                  <button
                                    type="button"
                                    onClick={() => (role ? setPickerSlot(player.slot) : setMovingId(movingId === player.athlete_id ? null : player.athlete_id))}
                                    title={role ? `Vaga ${role} no campo` : 'Sem vaga no campo — toque e escolha a vaga'}
                                    style={{
                                      width: 38, flexShrink: 0, padding: '0.12rem 0', borderRadius: '0.25rem',
                                      fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer',
                                      border: `1px solid ${role ? colors.border : '#f59e0b99'}`,
                                      backgroundColor: role ? colors.background : '#f59e0b1f',
                                      color: role ? colors.textSecondary : '#f59e0b',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {role || 'S/V'}
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={player.jersey_number ?? ''}
                                    onChange={(e) => updatePlayerJersey(player.athlete_id, e.target.value)}
                                    title="Camisa neste jogo"
                                    placeholder="–"
                                    style={{
                                      width: '34px', height: '24px', borderRadius: '50%',
                                      backgroundColor: '#22c55e20',
                                      border: '1px solid #22c55e40',
                                      color: '#22c55e',
                                      fontSize: '0.7rem', fontWeight: 700,
                                      textAlign: 'center', flexShrink: 0,
                                      padding: 0, outline: 'none',
                                    }}
                                  />
                                  <span style={{
                                    flex: 1,
                                    fontSize: '0.8rem',
                                    color: colors.text,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}>
                                    {player.name || player.athlete?.name}
                                  </span>
                                  {sport.tracksMinutes && (
                                    <div
                                      title="Calculado das substituições"
                                      style={{
                                        display: 'flex', alignItems: 'baseline', gap: '0.2rem',
                                        flexShrink: 0,
                                        minWidth: 52,
                                        justifyContent: 'flex-end',
                                      }}
                                    >
                                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                                        {computeMinutesPlayed(player, events, matchDuration)}
                                      </span>
                                      <span style={{ fontSize: '0.65rem', color: colors.textSecondary }}>min</span>
                                    </div>
                                  )}
                                  <RemoveBtn onClick={() => removeFromGame(player.athlete_id)} />
                                </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Reservas */}
                          {substitutes.length > 0 && (
                            <div>
                              <div style={{
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                color: '#f59e0b',
                                marginBottom: '0.25rem',
                                textTransform: 'uppercase',
                              }}>
                                Reservas ({substitutes.length})
                              </div>
                              {substitutes.map((player) => (
                                <div key={player.athlete_id} style={playerRowStyle}>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={player.jersey_number ?? ''}
                                    onChange={(e) => updatePlayerJersey(player.athlete_id, e.target.value)}
                                    title="Camisa neste jogo"
                                    placeholder="–"
                                    style={{
                                      width: '34px', height: '24px', borderRadius: '50%',
                                      backgroundColor: '#f59e0b20',
                                      border: '1px solid #f59e0b40',
                                      color: '#f59e0b',
                                      fontSize: '0.7rem', fontWeight: 700,
                                      textAlign: 'center', flexShrink: 0,
                                      padding: 0, outline: 'none',
                                    }}
                                  />
                                  <span style={{
                                    flex: 1,
                                    fontSize: '0.8rem',
                                    color: colors.text,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}>
                                    {player.name || player.athlete?.name}
                                  </span>
                                  {sport.tracksMinutes && (
                                    <div
                                      title="Calculado das substituições"
                                      style={{
                                        display: 'flex', alignItems: 'baseline', gap: '0.2rem',
                                        flexShrink: 0,
                                        minWidth: 52,
                                        justifyContent: 'flex-end',
                                      }}
                                    >
                                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                                        {computeMinutesPlayed(player, events, matchDuration)}
                                      </span>
                                      <span style={{ fontSize: '0.65rem', color: colors.textSecondary }}>min</span>
                                    </div>
                                  )}
                                  <RemoveBtn onClick={() => removeFromGame(player.athlete_id)} />
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Coluna 3: Eventos */}
                  <div style={sectionStyle}>
                    <div style={{ ...sectionTitleStyle, justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Goal size={18} color={colors.primary} />
                        <span>Eventos ({events.length})</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowEventModal(true)}
                        icon={<Plus size={14} />}
                      >
                        Adicionar
                      </Button>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      {events.length === 0 ? (
                        <div style={{
                          textAlign: 'center',
                          padding: '2rem 1rem',
                          color: colors.textSecondary,
                          fontSize: '0.85rem',
                        }}>
                          Nenhum evento registrado
                          <br />
                          <span style={{ fontSize: '0.75rem' }}>
                            Clique em "Adicionar" para registrar gols e cartões
                          </span>
                        </div>
                      ) : (
                        events
                          .sort((a, b) => a.minute - b.minute)
                          .map((event) => (
                          <div key={event.id} style={eventRowStyle}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: colors.surface,
                              border: `1px solid ${colors.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {getEventIcon(event.event_type)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: '500', color: colors.text }}>
                                {getEventLabel(event)}
                                {event.goal_type && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    color: colors.textSecondary,
                                    fontWeight: '400',
                                    marginLeft: '0.5rem'
                                  }}>
                                    ({getGoalTypeLabel(event.goal_type)})
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontSize: '0.7rem',
                                color: colors.textSecondary,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}>
                                <Clock size={10} />
                                {event.minute}'
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveEvent(event.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0.25rem',
                                color: colors.textSecondary,
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={footerStyle}>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Sub-modais */}
      <PlayerSelectionModal
        isOpen={showPlayerModal}
        onClose={() => setShowPlayerModal(false)}
        athletes={athletes}
        selectedPlayers={selectedPlayers}
        onConfirm={handlePlayersConfirm}
      />

      <SlotAthletePicker
        isOpen={pickerSlot != null}
        onClose={() => setPickerSlot(null)}
        slot={pickerSlot != null ? slots[pickerSlot] : null}
        formation={formation}
        occupant={pickerSlot != null ? occupantOf(pickerSlot) : null}
        athletes={athletes}
        players={selectedPlayers}
        isMobile={isMobile}
        onPick={(athlete) => { placeAthlete(pickerSlot, athlete); setPickerSlot(null); }}
        onMove={() => { const o = occupantOf(pickerSlot); setPickerSlot(null); if (o) setMovingId(o.athlete_id); }}
        onRemoveFromField={() => { const o = occupantOf(pickerSlot); setPickerSlot(null); if (o) removeFromField(o.athlete_id); }}
      />

      <EventModal
        isOpen={showEventModal}
        onClose={() => setShowEventModal(false)}
        onAdd={handleAddEvent}
        matchDuration={matchDuration}
        selectedPlayers={selectedPlayers}
      />
    </>
  );
}

// Tira o atleta do jogo (sai da lista e do campo).
function RemoveBtn({ onClick }) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      title="Tirar do jogo"
      aria-label="Tirar do jogo"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem', color: colors.textSecondary, display: 'flex', flexShrink: 0 }}
    >
      <X size={14} />
    </button>
  );
}
