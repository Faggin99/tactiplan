import { useState, useEffect, useMemo } from 'react';
import { X, Trophy, Users, Plus, Trash2, Goal, Shield, AlertTriangle, Clock, UserPlus, Wand2, ArrowLeftRight, Square, RotateCcw, GripVertical, ClipboardList } from 'lucide-react';
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
import { OpponentAnalysisModal } from './OpponentAnalysisModal';
import { startLineupDrag } from '../../lib/lineupDrag';
import { SlotAthletePicker } from './SlotAthletePicker';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formationsFor, resolveFormation, buildSlots, slotCount, slotRole, remapFormation, suggestSlots, posicaoEmCampo } from '../../lib/formation';
import { computeMinutagem } from '../../lib/minutagem';
import { newWorkbook, addSheet, saveWorkbook, addMetaSheet } from '../../utils/excelTheme';
import { ExportMenu } from '../common/ExportMenu';
import { notify } from '../../lib/notify';
import { downloadReport } from '../../services/reportsService';

// Assinatura do que sai na convocação, para saber se há alteração não salva.
function lineupSig(players, formation, opponent, competitionId, matchRound, matchLocation, info = []) {
  return JSON.stringify([
    formation, String(opponent || ''), String(competitionId || ''), String(matchRound || ''), String(matchLocation || ''),
    info.map((v) => String(v || '')),
    players.map((p) => [p.athlete_id, p.status, p.slot ?? null, String(p.jersey_number ?? '')]),
  ]);
}

export function GameModal({ isOpen, onClose, session, onSave }) {
  const { colors } = useTheme();
  const { athletes } = useAthletes();
  const sport = useSportConfig();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile(820);

  const [opponentName, setOpponentName] = useState('');
  const [showAnalise, setShowAnalise] = useState(false);
  // Horário, local do jogo e apresentação (aparecem na Convocação)
  const [matchKickoff, setMatchKickoff] = useState('');
  const [matchVenue, setMatchVenue] = useState('');
  const [matchMeetTime, setMatchMeetTime] = useState('');
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
  const [savedSig, setSavedSig] = useState(null);

  // Sub-modais
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

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
      setMatchKickoff(session.match_kickoff || '');
      setMatchVenue(session.match_venue || '');
      setMatchMeetTime(session.match_meet_time || '');
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

      const loaded = matchData.players.map(p => ({
        athlete_id: p.athlete_id,
        status: p.status,
        slot: (p.status === 'starter' && Number.isInteger(p.slot) && p.slot >= 0 && p.slot < total) ? p.slot : null,
        minutes_played: p.minutes_played || 0,
        minutes_manual: !!p.minutes_manual,
        // Camisa por JOGO: usa o override se existir, senão o nº permanente do plantel
        jersey_number: (p.jersey_number != null && p.jersey_number !== '') ? p.jersey_number : (p.athlete?.jersey_number ?? ''),
        athlete: p.athlete,
        name: p.athlete?.name,
      }));
      setSelectedPlayers(loaded);
      setSavedSig(lineupSig(loaded, f, session.opponent_name, session.competition_id, session.match_round, session.match_location,
        [session.match_kickoff, session.match_venue, session.match_meet_time]));

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
      // Minutagem calculada das substituições/expulsão (o servidor refaz a mesma conta);
      // ajuste manual explícito vai marcado e não é recalculado. Futsal não rastreia.
      const playersToSave = selectedPlayers.map((p) => ({
        ...p,
        minutes_played: sport.tracksMinutes ? (minutagem[p.athlete_id]?.minutes ?? 0) : 0,
        minutes_manual: sport.tracksMinutes ? !!p.minutes_manual : false,
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
        match_kickoff: matchKickoff || null,
        match_venue: matchVenue || null,
        match_meet_time: matchMeetTime || null,
        subs_check: true,
      });

      onSave?.({
        opponent_name: opponentName,
        match_duration: matchDuration,
        competition_id: competitionId || null,
        match_round: matchRound || null,
        match_location: matchLocation || null,
        video_full_url: videoFullUrl || null,
        match_kickoff: matchKickoff || null,
        match_venue: matchVenue || null,
        match_meet_time: matchMeetTime || null,
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
        minutes_manual: !!prev?.minutes_manual,
      };
    }));
    setMovingId(null);
    setShowPlayerModal(false);
  };

  // ---------- Escalação no campo (por vaga) ----------
  const slots = useMemo(() => buildSlots(formation), [formation]);
  const occupantOf = (slot) => selectedPlayers.find(p => p.status === 'starter' && p.slot === slot) || null;

  // Minutagem ao vivo: substituições + expulsão (lib/minutagem.js), ajuste manual respeitado.
  const minutagem = useMemo(
    () => computeMinutagem({ players: selectedPlayers, events, duration: matchDuration }),
    [selectedPlayers, events, matchDuration],
  );

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

  // Arrastar um atleta (do campo, das reservas ou dos titulares sem vaga) para uma vaga.
  // Titular troca de vaga com quem estiver lá; reserva entra e quem estava vai para as reservas.
  const dropOnSlot = (athleteId, slot) => {
    setMovingId(null);
    const mover = selectedPlayers.find(p => p.athlete_id === athleteId);
    if (!mover || (mover.status === 'starter' && mover.slot === slot)) return;
    const occupant = occupantOf(slot);
    const eraTitular = mover.status === 'starter';
    const fromSlot = eraTitular ? mover.slot : null;
    setSelectedPlayers(selectedPlayers.map(p => {
      if (p.athlete_id === mover.athlete_id) return { ...p, status: 'starter', slot };
      if (occupant && p.athlete_id === occupant.athlete_id) {
        return eraTitular ? { ...p, slot: fromSlot } : { ...p, status: 'substitute', slot: null };
      }
      return p;
    }));
    if (occupant && !eraTitular) notify.success(`${occupant.name || occupant.athlete?.name} foi para as reservas`);
  };
  const arrastar = (player) => (e) => startLineupDrag(e, {
    athleteId: player.athlete_id, label: player.name || player.athlete?.name || 'Atleta', onDrop: dropOnSlot,
  });
  // Alça de arrastar das listas (o dedo arrasta só pela alça; o resto da linha rola a lista)
  const alca = (player) => (
    <span
      onPointerDown={arrastar(player)}
      title="Arraste para uma vaga do campo"
      aria-label={`Arrastar ${player.name || player.athlete?.name} para uma vaga`}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', touchAction: 'none', color: colors.textSecondary, padding: '0 0.1rem', flexShrink: 0 }}
    >
      <GripVertical size={14} />
    </span>
  );

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
    if (editingEvent) {
      setEvents(events.map(e => (e === editingEvent || (e.id != null && e.id === editingEvent.id)) ? { ...e, ...event, id: e.id } : e));
    } else {
      setEvents([...events, { ...event, id: Date.now() }]);
    }
    setEditingEvent(null);
    setShowEventModal(false);
  };

  // Substituição gravada antes do formulário novo pode estar incompleta (sem quem sai
  // ou sem quem entra) ou inconsistente (titular como "quem entrou"): mostra o aviso e
  // abre para corrigir. Enquanto isso ela não conta na minutagem.
  const subProblem = (event) => {
    if (event.event_type !== 'substitution') return null;
    if (!event.player_id || !event.secondary_player_id) return 'incompleta';
    const pin = selectedPlayers.find(p => p.athlete_id === event.player_id);
    if (pin && pin.status === 'starter') return 'titular';
    return null;
  };
  const openEditEvent = (event) => { setEditingEvent(event); setShowEventModal(true); };

  const handleRemoveEvent = (eventId) => {
    setEvents(events.filter(e => e.id !== eventId));
  };

  // Minutos jogados: automáticos (substituições/expulsão). Ajuste manual explícito
  // fica marcado (minutes_manual) e não é sobrescrito; "↺" volta ao automático.
  const setManualMinutes = (athleteId, raw) => {
    const v = raw === '' ? 0 : Math.max(0, Math.min(200, parseInt(raw, 10) || 0));
    setSelectedPlayers(selectedPlayers.map(p => p.athlete_id === athleteId ? { ...p, minutes_manual: true, minutes_played: v } : p));
  };
  const resetManualMinutes = (athleteId) => {
    setSelectedPlayers(selectedPlayers.map(p => p.athlete_id === athleteId ? { ...p, minutes_manual: false } : p));
  };

  // Duas pessoas com a mesma camisa no jogo: destaca (quase sempre é digitação sem querer)
  const camisaRepetida = (player) => {
    const n = player.jersey_number;
    if (n === '' || n == null) return false;
    return selectedPlayers.filter((p) => String(p.jersey_number ?? '') === String(n)).length > 1;
  };

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

  const nameOf = (id, fallback) => {
    if (!id) return fallback?.name || null;
    const p = selectedPlayers.find(sp => sp.athlete_id === id);
    return p?.name || p?.athlete?.name || fallback?.name || athletes.find(a => a.id === id)?.name || null;
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'goal_scored': return <Goal size={16} color="#22c55e" />;
      case 'goal_conceded': return <Shield size={16} color="#ef4444" />;
      case 'yellow_card': return <Square size={14} color="#eab308" fill="#eab308" />;
      case 'red_card': return <Square size={14} color="#dc2626" fill="#dc2626" />;
      case 'substitution': return <ArrowLeftRight size={16} color="#3b82f6" />;
      case 'accumulated_foul':
      case 'sixth_foul': return <AlertTriangle size={16} color="#f59e0b" />;
      default: return <Clock size={14} color={colors.textSecondary} />;
    }
  };

  const getEventLabel = (event) => {
    const own = event.team === 'own' || !event.team;
    switch (event.event_type) {
      case 'goal_scored': return 'Gol';
      case 'goal_conceded': return 'Gol sofrido';
      case 'yellow_card': return own ? 'Amarelo' : 'Amarelo (adv.)';
      case 'red_card': return own ? 'Expulsão' : 'Expulsão (adv.)';
      case 'substitution': return 'Substituição';
      case 'accumulated_foul': return 'Falta acumulada';
      case 'sixth_foul': return '6ª falta';
      default: return event.event_type || 'Evento';
    }
  };

  // Quem participou do evento, em texto: gol → autor (assist.), sub → Sai X · Entra Y.
  const getEventDetail = (event) => {
    const p1 = nameOf(event.player_id, event.player);
    const p2 = nameOf(event.secondary_player_id, event.secondary_player);
    if (event.event_type === 'substitution' && subProblem(event)) {
      const prob = subProblem(event);
      return (
        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
          {prob === 'incompleta'
            ? <>⇄ Substituição (incompleta){p2 ? `: sai ${p2}` : ''}{p1 ? `: entra ${p1}` : ''}. Toque para completar.</>
            : <>⇄ {p1} é titular e está como "quem entrou". Toque para corrigir.</>}
        </span>
      );
    }
    if (event.event_type === 'substitution') {
      return (
        <>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>↓</span> Sai <b>{p2 || '—'}</b>
          <span style={{ margin: '0 0.3rem', color: colors.textSecondary }}>·</span>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>↑</span> Entra <b>{p1 || '—'}</b>
        </>
      );
    }
    if (event.event_type === 'goal_scored') {
      if (!p1 && !p2) return null;
      return <>{p1 ? <b>{p1}</b> : 'Sem autor'}{p2 ? <span style={{ color: colors.textSecondary }}> · assist. {p2}</span> : null}</>;
    }
    return p1 ? <b>{p1}</b> : null;
  };

  // Rótulos dos tipos de gol (valores novos org_off… e os antigos).
  const getGoalTypeLabel = (goalType) => {
    if (!goalType) return '';
    const legacy = { offensive_org: 'Org. ofensiva', offensive_transition: 'Transição of.', free_kick: 'Falta', corner: 'Escanteio', penalty: 'Pênalti' };
    if (legacy[goalType]) return legacy[goalType];
    const m = String(goalType).match(/^(org|trans|bp)_(off|def)(?:_(.+))?$/);
    if (!m) return '';
    const of = m[2] === 'off';
    if (m[1] === 'org') return of ? 'Org. ofensiva' : 'Org. defensiva';
    if (m[1] === 'trans') return of ? 'Transição of.' : 'Transição def.';
    const bp = {
      falta: 'Falta', falta_frontal: 'Falta frontal', falta_lateral: 'Falta lateral', corner: 'Escanteio', lateral: 'Lateral',
      penalty: 'Pênalti', shootout: 'Shootout', tiro_livre: 'Tiro livre', falta_acumulada: 'Falta acumulada',
    };
    return `Bola parada${m[3] && bp[m[3]] ? ` · ${bp[m[3]]}` : ''}`;
  };

  // PDF da convocação gerado no servidor (POST /api/reports/convocacao), a partir
  // do jogo SALVO: com alteração pendente no modal, pede para salvar antes.
  // tamanho: 'normal' | 'grande' | 'muito_grande' (letra dos nomes no campo e nas listas)
  const exportToPdf = async (tamanho = 'normal') => {
    if (selectedPlayers.length === 0) {
      notify.error('Selecione jogadores antes de exportar');
      return;
    }
    if (savedSig && savedSig !== lineupSig(selectedPlayers, formation, opponentName, competitionId, matchRound, matchLocation, [matchKickoff, matchVenue, matchMeetTime])) {
      notify.info('Salve o jogo antes de exportar: o PDF usa a convocação salva.', { duration: 5000 });
      return;
    }
    const gameDate = session?.date ? session.date.split('-').reverse().join('/') : '';
    const opponent = opponentName || 'Adversário';
    const fileName = `Convocacao_${opponent.replace(/\s+/g, '_')}_${gameDate.replace(/\//g, '-')}.pdf`;
    try {
      await downloadReport('convocacao', { session_id: session.id, tamanho_fonte: tamanho }, fileName);
    } catch (err) {
      notify.error(err.message || 'Não foi possível gerar o PDF.');
    }
  };

  // Relatório de UM jogo (placar, lances, minutos/gols/cartões por atleta), também do jogo SALVO.
  const exportGameReport = async () => {
    if (savedSig && savedSig !== lineupSig(selectedPlayers, formation, opponentName, competitionId, matchRound, matchLocation, [matchKickoff, matchVenue, matchMeetTime])) {
      notify.info('Salve o jogo antes de exportar: o relatório usa o jogo salvo.', { duration: 5000 });
      return;
    }
    const gameDate = session?.date ? session.date.split('-').reverse().join('-') : '';
    const opponent = opponentName || 'Adversário';
    try {
      await downloadReport('jogo', { session_id: session.id }, `Jogo_${opponent.replace(/\s+/g, '_')}_${gameDate}.pdf`);
    } catch (err) {
      notify.error(err.message || 'Não foi possível gerar o PDF.');
    }
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
    starters.forEach((p, i) => allRows.push([i + 1, 'Titular', (posicaoEmCampo(formation, p.slot, sport.modality) || slotRole(formation, p.slot) || 'Sem vaga'), p.jersey_number || '', p.name || p.athlete?.name || '']));
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
              {session?.id && (
                <button
                  type="button"
                  onClick={() => setShowAnalise(true)}
                  title="Preencher a análise do adversário e gerar o PDF"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem',
                    padding: '0.3rem 0.65rem', borderRadius: '0.4rem', cursor: 'pointer',
                    border: `1px solid ${colors.primary}`, background: `${colors.primary}14`, color: colors.primary,
                    fontSize: '0.78rem', fontWeight: 600,
                  }}
                >
                  <ClipboardList size={14} /> Análise do adversário
                </button>
              )}
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
                        : 'minmax(150px, 2fr) 80px 70px minmax(150px, 1.6fr) 55px 92px 92px minmax(130px, 1.4fr) minmax(110px, 1.2fr) 110px',
                      gap: '0.5rem',
                      alignItems: 'end',
                    }}>
                      <div>
                        <label style={labelStyle}>Adversário</label>
                        <input type="text" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Nome do adversário" style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Mando</label>
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
                        <label style={labelStyle}>Horário</label>
                        <input type="time" value={matchKickoff} onChange={(e) => setMatchKickoff(e.target.value)} style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Apresentação</label>
                        <input type="time" value={matchMeetTime} onChange={(e) => setMatchMeetTime(e.target.value)} style={compactInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Local do jogo</label>
                        <input type="text" maxLength={120} value={matchVenue} onChange={(e) => setMatchVenue(e.target.value)} placeholder="Estádio / campo" style={compactInput} />
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
                  gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(230px, 280px) minmax(0, 1fr) minmax(0, 1fr)',
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
                        onDropAthlete={dropOnSlot}
                        movingAthleteId={movingId}
                        maxWidth={isMobile ? 'min(100%, 300px)' : 'min(100%, 264px, calc((95vh - 250px) * 68 / 105))'}
                      />

                      {unplaced.length > 0 && (
                        <div style={{
                          width: '100%', maxWidth: 300, boxSizing: 'border-box',
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
                                  onPointerDown={arrastar(p)}
                                  title="Arraste para a vaga, ou toque e depois escolha a vaga no campo"
                                  style={{
                                    minHeight: 32, padding: '0.25rem 0.55rem', borderRadius: '999px',
                                    border: `1px solid ${ativo ? '#facc15' : '#f59e0b88'}`,
                                    backgroundColor: ativo ? '#facc1533' : colors.background,
                                    color: colors.text, fontSize: '0.74rem', fontWeight: 600, cursor: 'grab',
                                    touchAction: 'none',
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
                            pdfLabel="Convocação (PDF)"
                            onExportPDF={() => exportToPdf('normal')}
                            extraPdfItems={[
                              { label: 'Convocação · letra grande (PDF)', onClick: () => exportToPdf('grande') },
                              { label: 'Convocação · letra muito grande (PDF)', onClick: () => exportToPdf('muito_grande') },
                              { label: 'Relatório do jogo (PDF)', onClick: exportGameReport },
                              { label: 'Análise do adversário (PDF)', onClick: () => downloadReport('analise', { session_id: session.id },
                                `Analise_${(opponentName || 'Adversario').replace(/\s+/g, '_')}_${session?.date ? session.date.split('-').reverse().join('-') : ''}.pdf`).catch((e) => notify.error(e.message || 'Não foi possível gerar o PDF.')) },
                            ]}
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
                                // etiqueta: posição EM CAMPO pela vaga (futsal 4-0 não define → papel da linha)
                                const label = role ? (posicaoEmCampo(formation, player.slot, sport.modality) || role) : null;
                                return (
                                <div key={player.athlete_id} style={playerRowStyle}>
                                  {alca(player)}
                                  <button
                                    type="button"
                                    onClick={() => (role ? setPickerSlot(player.slot) : setMovingId(movingId === player.athlete_id ? null : player.athlete_id))}
                                    title={role ? `Vaga ${label} no campo` : 'Sem vaga no campo — toque e escolha a vaga'}
                                    style={{
                                      width: 38, flexShrink: 0, padding: '0.12rem 0', borderRadius: '0.25rem',
                                      fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer',
                                      border: `1px solid ${role ? colors.border : '#f59e0b99'}`,
                                      backgroundColor: role ? colors.background : '#f59e0b1f',
                                      color: role ? colors.textSecondary : '#f59e0b',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {label || 'S/V'}
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={player.jersey_number ?? ''}
                                    onChange={(e) => updatePlayerJersey(player.athlete_id, e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    title={camisaRepetida(player) ? `Camisa ${player.jersey_number} repetida neste jogo` : 'Camisa neste jogo'}
                                    placeholder="–"
                                    style={{
                                      width: '34px', height: '24px', borderRadius: '50%',
                                      backgroundColor: '#22c55e20',
                                      border: camisaRepetida(player) ? '1px solid #ef4444' : '1px solid #22c55e40',
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
                                    <MinutesCell
                                      info={minutagem[player.athlete_id]}
                                      onManual={(v) => setManualMinutes(player.athlete_id, v)}
                                      onReset={() => resetManualMinutes(player.athlete_id)}
                                    />
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
                                  {alca(player)}
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={player.jersey_number ?? ''}
                                    onChange={(e) => updatePlayerJersey(player.athlete_id, e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    title={camisaRepetida(player) ? `Camisa ${player.jersey_number} repetida neste jogo` : 'Camisa neste jogo'}
                                    placeholder="–"
                                    style={{
                                      width: '34px', height: '24px', borderRadius: '50%',
                                      backgroundColor: '#f59e0b20',
                                      border: camisaRepetida(player) ? '1px solid #ef4444' : '1px solid #f59e0b40',
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
                                    <MinutesCell
                                      info={minutagem[player.athlete_id]}
                                      onManual={(v) => setManualMinutes(player.athlete_id, v)}
                                      onReset={() => resetManualMinutes(player.athlete_id)}
                                    />
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
                        onClick={() => { setEditingEvent(null); setShowEventModal(true); }}
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
                            Clique em "Adicionar" para registrar gols, cartões{sport.tracksMinutes ? ' e substituições' : ''}
                          </span>
                        </div>
                      ) : (
                        [...events]
                          .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
                          .map((event) => (
                          <div
                            key={event.id}
                            style={{ ...eventRowStyle, ...(event.event_type === 'substitution' ? { cursor: 'pointer' } : {}), ...(subProblem(event) ? { border: '1px dashed #f59e0b99', backgroundColor: '#f59e0b10' } : {}) }}
                            onClick={event.event_type === 'substitution' ? () => openEditEvent(event) : undefined}
                            title={event.event_type === 'substitution' ? 'Toque para editar a substituição' : undefined}
                          >
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
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.8rem', fontWeight: 600, color: colors.text }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', fontWeight: 700, color: colors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                                  <Clock size={10} />{event.minute != null ? `${event.minute}'` : '—'}
                                </span>
                                <span>{getEventLabel(event)}</span>
                                {getGoalTypeLabel(event.goal_type) && (
                                  <span style={{ fontSize: '0.68rem', color: colors.textSecondary, fontWeight: 400 }}>
                                    {getGoalTypeLabel(event.goal_type)}
                                  </span>
                                )}
                              </div>
                              {getEventDetail(event) && (
                                <div style={{ fontSize: '0.74rem', color: colors.text, marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {getEventDetail(event)}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(ev) => { ev.stopPropagation(); handleRemoveEvent(event.id); }}
                              title="Excluir evento"
                              aria-label="Excluir evento"
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
        onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
        onAdd={handleAddEvent}
        editingEvent={editingEvent}
        matchDuration={matchDuration}
        selectedPlayers={selectedPlayers}
        events={events}
      />

      <OpponentAnalysisModal
        isOpen={showAnalise}
        onClose={() => setShowAnalise(false)}
        session={session}
        opponentName={opponentName}
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

// Minutos do atleta no jogo: automático (substituições/expulsão) com ajuste manual.
// Tocar no número edita; o valor manual fica marcado e não é recalculado; ↺ volta ao automático.
function MinutesCell({ info, onManual, onReset }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const minutes = info?.minutes ?? 0;
  const manual = !!info?.manual;
  const hint = !info ? '' : [
    info.started ? 'Titular' : (info.entered ? `Entrou aos ${info.enteredAt}'` : 'Não entrou'),
    info.sentOffAt != null ? `expulso aos ${info.sentOffAt}'` : (info.leftAt != null ? `saiu aos ${info.leftAt}'` : null),
  ].filter(Boolean).join(' · ');
  const title = manual
    ? `Ajuste manual (automático seria ${info?.auto ?? 0} min). ${hint}`
    : `Automático pelas substituições. ${hint}. Toque para ajustar.`;
  const marker = info && !manual
    ? (info.sentOffAt != null ? { t: `exp. ${info.sentOffAt}'`, c: '#dc2626' }
      : info.entered ? { t: `↑${info.enteredAt}'`, c: '#22c55e' }
        : (info.leftAt != null && info.started ? { t: `↓${info.leftAt}'`, c: '#ef4444' } : null))
    : null;
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0, minWidth: 64, justifyContent: 'flex-end' }}>
      {marker && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: marker.c, fontVariantNumeric: 'tabular-nums' }}>{marker.t}</span>}
      {manual && (
        <button type="button" onClick={onReset} title="Voltar ao automático" aria-label="Voltar minutagem ao automático"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#f59e0b1f', border: '1px solid #f59e0b66', borderRadius: 4, color: '#f59e0b', fontSize: '0.56rem', fontWeight: 700, padding: '0.05rem 0.25rem', cursor: 'pointer', textTransform: 'uppercase' }}>
          manual <RotateCcw size={9} />
        </button>
      )}
      {editing ? (
        <input
          type="number" min="0" max="200" autoFocus
          defaultValue={minutes}
          onBlur={(e) => { setEditing(false); if (String(e.target.value) !== String(minutes)) onManual(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
          aria-label="Minutos jogados"
          style={{ width: 44, padding: '0.1rem 0.2rem', borderRadius: 4, border: `1px solid ${colors.primary}`, background: colors.background, color: colors.text, fontSize: '0.8rem', fontWeight: 600, textAlign: 'right' }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} aria-label={`${minutes} minutos — ajustar`}
          style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.15rem', background: 'none', border: 'none', borderBottom: `1px dashed ${manual ? '#f59e0b' : 'transparent'}`, padding: '0.1rem 0', cursor: 'pointer', color: colors.text }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: manual ? '#f59e0b' : colors.text }}>{minutes}</span>
          <span style={{ fontSize: '0.65rem', color: colors.textSecondary }}>min</span>
        </button>
      )}
    </div>
  );
}
