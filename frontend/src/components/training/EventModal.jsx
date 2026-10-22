import { useState, useEffect, useMemo } from 'react';
import { X, Goal, Shield, AlertTriangle, Clock, Plus, Target, ArrowLeftRight, Square } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useSportConfig } from '../../hooks/useSportConfig';
import { Button } from '../common/Button';
import { notify } from '../../lib/notify';
import { emCampo, reservasDisponiveis, validarSubstituicao } from '../../lib/minutagem';

// ───────────────────────────────────────────────────────────────
// Helpers de goal_type — momento do jogo + subtipo de bola parada.
// Valores armazenados: 'org_off'|'trans_off'|'bp_off_falta'|'bp_off_corner'|'bp_off_lateral'|'bp_off_penalty'
//                      'org_def'|'trans_def'|'bp_def_falta'|'bp_def_corner'|'bp_def_lateral'|'bp_def_penalty'
// Compat: aceita também os valores antigos: 'offensive_org','offensive_transition','free_kick','corner','penalty'
// ───────────────────────────────────────────────────────────────
function parseGoalType(gt) {
  if (!gt) return { moment: 'org', bpSubtype: 'falta' };
  const legacy = {
    offensive_org:        { moment: 'org',   bpSubtype: 'falta' },
    offensive_transition: { moment: 'trans', bpSubtype: 'falta' },
    free_kick:            { moment: 'bp',    bpSubtype: 'falta' },
    corner:               { moment: 'bp',    bpSubtype: 'corner' },
    penalty:              { moment: 'bp',    bpSubtype: 'penalty' },
  };
  if (legacy[gt]) return legacy[gt];
  if (gt.startsWith('org_'))   return { moment: 'org',   bpSubtype: 'falta' };
  if (gt.startsWith('trans_')) return { moment: 'trans', bpSubtype: 'falta' };
  if (gt.startsWith('bp_')) {
    const sub = gt.split('_').slice(2).join('_') || 'falta';
    return { moment: 'bp', bpSubtype: sub };
  }
  return { moment: 'org', bpSubtype: 'falta' };
}

function serializeGoalType(moment, bpSubtype, eventType) {
  // Sufixo of/def conforme tipo do gol
  const orient = eventType === 'goal_conceded' ? 'def' : 'off';
  if (moment === 'org')   return `org_${orient}`;
  if (moment === 'trans') return `trans_${orient}`;
  if (moment === 'bp')    return `bp_${orient}_${bpSubtype || 'falta'}`;
  return `org_${orient}`;
}

// Subtipos de bola parada por modalidade — substitui a constante antiga.
// Mapeia os values do sportConfig.bolaParadaSubtypes pros values usados no goal_type.
const SUBTYPE_KEY_MAP = {
  falta_frontal: 'falta_frontal',
  falta_lateral: 'falta_lateral',
  falta: 'falta',
  escanteio: 'corner',
  lateral: 'lateral',
  penalti: 'penalty',
  shootout: 'shootout',
  tiro_livre: 'tiro_livre',
  falta_acumulada: 'falta_acumulada',
};

export function EventModal({ isOpen, onClose, onAdd, matchDuration = 90, editingEvent = null, selectedPlayers = [], events = [] }) {
  const { colors } = useTheme();
  const sport = useSportConfig();
  const BP_SUBTYPES = sport.bolaParadaSubtypes.map(b => ({
    value: SUBTYPE_KEY_MAP[b.value] || b.value,
    label: b.label,
  }));
  const [eventType, setEventType] = useState('goal_scored');
  const [team, setTeam] = useState('own');
  // Estrutura nova: momento do jogo + (opcional) subtipo de bola parada
  // momento: 'org' | 'trans' | 'bp'  — orientação derivada do eventType (gol feito=of, tomado=def)
  const [moment, setMoment] = useState('org');
  const [bpSubtype, setBpSubtype] = useState('falta'); // só usado se moment === 'bp'
  const [half, setHalf] = useState(1);
  const [minuteInHalf, setMinuteInHalf] = useState(1);
  const [stoppageTime, setStoppageTime] = useState(0);
  const [playerId, setPlayerId] = useState('');           // protagonista (gol, cartão, quem entrou)
  const [secondaryPlayerId, setSecondaryPlayerId] = useState(''); // assist OU quem saiu

  // half-time math
  const half1Max = Math.floor(matchDuration / 2);
  const half2Max = matchDuration - half1Max;

  const calculateTotalMinute = () => {
    if (half === 1) return stoppageTime > 0 ? half1Max + stoppageTime : minuteInHalf;
    return stoppageTime > 0 ? matchDuration + stoppageTime : half1Max + minuteInHalf;
  };

  const parseMinute = (totalMin) => {
    if (totalMin <= half1Max) return { half: 1, minuteInHalf: totalMin, stoppageTime: 0 };
    if (totalMin <= half1Max + 7) return { half: 1, minuteInHalf: half1Max, stoppageTime: totalMin - half1Max };
    if (totalMin <= matchDuration) return { half: 2, minuteInHalf: totalMin - half1Max, stoppageTime: 0 };
    return { half: 2, minuteInHalf: half2Max, stoppageTime: totalMin - matchDuration };
  };

  useEffect(() => {
    if (!isOpen) return;
    if (editingEvent) {
      setEventType(editingEvent.event_type || 'goal_scored');
      setTeam(editingEvent.team || 'own');
      const parsedGoal = parseGoalType(editingEvent.goal_type);
      setMoment(parsedGoal.moment);
      setBpSubtype(parsedGoal.bpSubtype);
      const parsed = parseMinute(editingEvent.minute || 0);
      setHalf(parsed.half);
      setMinuteInHalf(parsed.minuteInHalf);
      setStoppageTime(parsed.stoppageTime);
      setPlayerId(editingEvent.player_id || editingEvent.player?.id || '');
      setSecondaryPlayerId(editingEvent.secondary_player_id || editingEvent.secondary_player?.id || '');
    } else {
      setEventType('goal_scored');
      setTeam('own');
      setMoment('org');
      setBpSubtype(BP_SUBTYPES[0]?.value || 'falta');
      setHalf(1);
      setMinuteInHalf(1);
      setStoppageTime(0);
      setPlayerId('');
      setSecondaryPlayerId('');
    }
  }, [isOpen, editingEvent, matchDuration]);

  // Lista de jogadores ordenada por nome — useMemo PRECISA vir antes de qualquer
  // return condicional pra manter ordem estável dos hooks entre renders.
  const playersList = useMemo(() => {
    return (selectedPlayers || [])
      .map(p => ({
        id: p.athlete_id || p.athlete?.id,
        name: p.name || p.athlete?.name || '—',
        jersey_number: p.jersey_number || p.athlete?.jersey_number,
      }))
      .filter(p => p.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedPlayers]);

  if (!isOpen) return null;

  // Tipos de evento por modalidade.
  // Comuns: gol feito/tomado, amarelo, vermelho, substituição.
  // Futsal adiciona: falta acumulada e 6ª falta.
  const baseEventTypes = [
    { value: 'goal_scored',  label: 'Gol Feito',     icon: Goal,            color: '#22c55e' },
    { value: 'goal_conceded',label: 'Gol Tomado',    icon: Shield,          color: '#ef4444' },
    { value: 'yellow_card',  label: 'Amarelo',       icon: Square,          color: '#eab308' },
    { value: 'red_card',     label: 'Vermelho',      icon: AlertTriangle,   color: '#dc2626' },
    { value: 'substitution', label: 'Substituição',  icon: ArrowLeftRight,  color: '#3b82f6' },
  ];
  const futsalExtras = [
    { value: 'accumulated_foul', label: 'Falta Acum.',  icon: AlertTriangle, color: '#f59e0b' },
    { value: 'sixth_foul',       label: '6ª Falta',     icon: AlertTriangle, color: '#b91c1c' },
  ];
  const eventTypes = sport.modality === 'futsal'
    ? [...baseEventTypes.filter(t => t.value !== 'substitution'), ...futsalExtras] // futsal: troca livre, sem evento de substituição
    : baseEventTypes;

  const isGoal = eventType === 'goal_scored' || eventType === 'goal_conceded';
  const isCard = eventType === 'yellow_card' || eventType === 'red_card';
  const isSub  = eventType === 'substitution';
  const showGoalType = isGoal;
  const showTeamOption = isCard;
  const forcedTeam = eventType === 'goal_scored' ? 'own'
                    : eventType === 'goal_conceded' ? 'opponent'
                    : eventType === 'substitution' ? 'own'
                    : team;

  // Momentos disponíveis dependem do tipo de gol (ofensivo vs defensivo)
  const orient = eventType === 'goal_conceded' ? 'def' : 'off';
  const momentOptions = orient === 'off'
    ? [
        { value: 'org',   label: 'Organização Ofensiva',   short: 'Org. Of.' },
        { value: 'trans', label: 'Transição Ofensiva',     short: 'Trans. Of.' },
        { value: 'bp',    label: 'Bola Parada Ofensiva',   short: 'BP Of.' },
      ]
    : [
        { value: 'org',   label: 'Organização Defensiva',  short: 'Org. Def.' },
        { value: 'trans', label: 'Transição Defensiva',    short: 'Trans. Def.' },
        { value: 'bp',    label: 'Bola Parada Defensiva',  short: 'BP Def.' },
      ];

  // Substituição (player_id = quem ENTRA, secondary_player_id = quem SAI):
  // sai → quem está em campo no minuto; entra → reservas relacionados ainda não usados.
  const subMinute = calculateTotalMinute();
  const toOption = (p) => ({ id: p.athlete_id, name: p.name || p.athlete?.name || '—', jersey_number: p.jersey_number || p.athlete?.jersey_number });
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const subOutOptions = isSub
    ? emCampo({ players: selectedPlayers, events, duration: matchDuration, minute: subMinute, ignore: editingEvent }).map(toOption).sort(byName)
    : [];
  const subInOptions = isSub
    ? reservasDisponiveis({ players: selectedPlayers, events, ignore: editingEvent }).map(toOption).sort(byName)
    : [];
  const inOptions  = isSub ? subInOptions : playersList.filter(p => p.id !== secondaryPlayerId);
  const outOptions = isSub ? subOutOptions : playersList.filter(p => p.id !== playerId);

  const handleAdd = async () => {
    // Validações simples por tipo
    // Cartão do adversário não tem atleta nosso (o seletor nem aparece): só exige atleta no nosso time
    if (isCard && team === 'own' && !playerId) { notify.error('Selecione o atleta que recebeu o cartão.'); return; }
    if (isSub) {
      const v = validarSubstituicao({
        players: selectedPlayers, events, duration: matchDuration, ignore: editingEvent,
        sub: { minute: calculateTotalMinute(), player_id: playerId, secondary_player_id: secondaryPlayerId },
      });
      if (!v.ok) { notify.error(v.error); return; }
    }
    if (isGoal && eventType === 'goal_scored' && !playerId) {
      const ok = await notify.confirm('Salvar gol sem atribuir ao atleta?', {
        confirmText: 'Salvar', cancelText: 'Cancelar',
      });
      if (!ok) return;
    }
    onAdd({
      event_type: eventType,
      team: forcedTeam,
      goal_type: isGoal ? serializeGoalType(moment, bpSubtype, eventType) : null,
      minute: calculateTotalMinute(),
      player_id: playerId || null,
      secondary_player_id: isGoal || isSub ? (secondaryPlayerId || null) : null,
    });
  };

  const formatMinuteDisplay = () => {
    if (half === 1) return stoppageTime > 0 ? `${half1Max}+${stoppageTime}'` : `${minuteInHalf}'`;
    return stoppageTime > 0 ? `${matchDuration}+${stoppageTime}'` : `${half1Max + minuteInHalf}'`;
  };

  const overlayStyle = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '1rem',
  };
  const modalStyle = {
    backgroundColor: colors.background, borderRadius: '0.75rem',
    width: '100%', maxWidth: '500px', maxHeight: '90vh',
    overflow: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    border: `1px solid ${colors.border}`,
  };
  const headerStyle = {
    padding: '1rem 1.5rem', borderBottom: `1px solid ${colors.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const contentStyle = { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' };
  const footerStyle = {
    padding: '1rem 1.5rem', borderTop: `1px solid ${colors.border}`,
    display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
  };
  const labelStyle = { display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 500, color: colors.text };

  const eventTypeBtn = (type, isSelected) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.3rem',
    padding: '0.6rem 0.4rem',
    borderRadius: '0.45rem',
    border: `2px solid ${isSelected ? type.color : colors.border}`,
    backgroundColor: isSelected ? `${type.color}20` : colors.surface,
    cursor: 'pointer', transition: 'all 0.15s ease',
    flex: 1, minWidth: 0,
  });

  const goalTypeBtnStyle = (isSelected) => ({
    padding: '0.45rem 0.65rem', borderRadius: '0.375rem',
    border: `2px solid ${isSelected ? colors.primary : colors.border}`,
    backgroundColor: isSelected ? `${colors.primary}15` : colors.surface,
    color: isSelected ? colors.primary : colors.text,
    fontWeight: 500, fontSize: '0.78rem',
    cursor: 'pointer', transition: 'all 0.15s ease',
    flex: '1 1 auto', textAlign: 'center', minWidth: 70,
  });

  const teamBtnStyle = (isSelected) => ({
    flex: 1, padding: '0.65rem', borderRadius: '0.5rem',
    border: `2px solid ${isSelected ? colors.primary : colors.border}`,
    backgroundColor: isSelected ? `${colors.primary}15` : colors.surface,
    color: isSelected ? colors.primary : colors.text,
    fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
  });

  const selectStyle = {
    width: '100%', padding: '0.55rem 0.7rem',
    borderRadius: '0.4rem',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface, color: colors.text,
    fontSize: '0.875rem', outline: 'none',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Plus size={20} style={{ color: colors.primary }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: colors.text }}>
              {editingEvent ? 'Editar Evento' : 'Adicionar Evento'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: colors.textSecondary }}>
            <X size={20} />
          </button>
        </div>

        <div style={contentStyle}>
          {/* Tipo de Evento */}
          <div>
            <label style={labelStyle}>Tipo de Evento</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
              {eventTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = eventType === type.value;
                return (
                  <div key={type.value} style={eventTypeBtn(type, isSelected)} onClick={() => { setEventType(type.value); setPlayerId(''); setSecondaryPlayerId(''); }}>
                    <Icon size={18} color={isSelected ? type.color : colors.textSecondary} />
                    <span style={{ fontSize: '0.66rem', fontWeight: 500, color: isSelected ? type.color : colors.text, textAlign: 'center', lineHeight: 1.1 }}>
                      {type.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Momento do jogo (depende se gol feito ou tomado) */}
          {showGoalType && (
            <div>
              <label style={labelStyle}>
                <Target size={15} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'middle' }} />
                {eventType === 'goal_conceded' ? 'Em qual momento sofremos?' : 'Em qual momento marcamos?'}
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {momentOptions.map((m) => (
                  <button
                    key={m.value}
                    style={goalTypeBtnStyle(moment === m.value)}
                    onClick={() => setMoment(m.value)}
                    title={m.label}
                  >
                    {m.short}
                  </button>
                ))}
              </div>
              {/* Subtipo de Bola Parada */}
              {moment === 'bp' && (
                <div style={{ marginTop: '0.65rem' }}>
                  <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>
                    Tipo de bola parada
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {BP_SUBTYPES.map((s) => (
                      <button
                        key={s.value}
                        style={goalTypeBtnStyle(bpSubtype === s.value)}
                        onClick={() => setBpSubtype(s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Time (cartões) */}
          {showTeamOption && (
            <div>
              <label style={labelStyle}>De qual time?</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={teamBtnStyle(team === 'own')} onClick={() => setTeam('own')}>Nosso Time</button>
                <button style={teamBtnStyle(team === 'opponent')} onClick={() => setTeam('opponent')}>Adversário</button>
              </div>
            </div>
          )}

          {/* Substituição: quem sai (em campo no minuto) e quem entra (reserva não usado) */}
          {isSub && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}><span style={{ color: '#ef4444', fontWeight: 700 }}>↓</span> Quem saiu</label>
                <select style={selectStyle} value={secondaryPlayerId} onChange={(e) => setSecondaryPlayerId(e.target.value)} aria-label="Quem saiu">
                  <option value="">{subOutOptions.length ? 'Quem saiu…' : `Ninguém em campo aos ${formatMinuteDisplay()}`}</option>
                  {subOutOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.jersey_number ? ` · camisa ${p.jersey_number}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}><span style={{ color: '#22c55e', fontWeight: 700 }}>↑</span> Quem entrou</label>
                {subInOptions.length > 0 ? (
                  <select style={selectStyle} value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Quem entrou">
                    <option value="">Quem entrou…</option>
                    {subInOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.jersey_number ? ` · camisa ${p.jersey_number}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <div role="status" style={{ padding: '0.5rem 0.6rem', borderRadius: '0.4rem', border: '1px dashed #f59e0b99', backgroundColor: '#f59e0b14', color: colors.text, fontSize: '0.74rem', lineHeight: 1.35 }}>
                    Nenhum reserva disponível: todos já entraram ou não há reservas relacionados. Use "Selecionar" no jogo para relacionar reservas.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Jogador — gol nosso, cartão nosso (não pra adversário) */}
          {((eventType === 'goal_scored') || (isCard && team === 'own')) && (
            <div>
              <label style={labelStyle}>{eventType === 'goal_scored' ? 'Autor do gol' : 'Atleta'}</label>
              <select style={selectStyle} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">{playersList.length ? 'Selecione um atleta…' : 'Nenhum jogador na escalação'}</option>
                {inOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.jersey_number ? ` · camisa ${p.jersey_number}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Assistência (gol) */}
          {eventType === 'goal_scored' && (
            <div>
              <label style={labelStyle}>Assistência (opcional)</label>
              <select style={selectStyle} value={secondaryPlayerId} onChange={(e) => setSecondaryPlayerId(e.target.value)}>
                <option value="">Sem assistência</option>
                {outOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.jersey_number ? ` · camisa ${p.jersey_number}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tempo do Jogo */}
          <div>
            <label style={labelStyle}>
              <Clock size={15} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'middle' }} />
              Tempo do Jogo
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <button style={teamBtnStyle(half === 1)} onClick={() => { setHalf(1); setStoppageTime(0); if (minuteInHalf > half1Max) setMinuteInHalf(half1Max); }}>1º Tempo</button>
              <button style={teamBtnStyle(half === 2)} onClick={() => { setHalf(2); setStoppageTime(0); if (minuteInHalf > half2Max) setMinuteInHalf(half2Max); }}>2º Tempo</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginBottom: '0.3rem' }}>
                  Minuto ({half === 1 ? `0-${half1Max}` : `${half1Max + 1}-${matchDuration}`})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range" min="1" max={half === 1 ? half1Max : half2Max} value={minuteInHalf}
                    onChange={(e) => { setMinuteInHalf(parseInt(e.target.value, 10) || 1); setStoppageTime(0); }}
                    style={{
                      flex: 1, height: 6, borderRadius: 3, appearance: 'none', cursor: 'pointer',
                      background: `linear-gradient(to right, ${colors.primary} 0%, ${colors.primary} ${(minuteInHalf / (half === 1 ? half1Max : half2Max)) * 100}%, ${colors.border} ${(minuteInHalf / (half === 1 ? half1Max : half2Max)) * 100}%, ${colors.border} 100%)`,
                    }}
                  />
                  <input
                    type="number" min="1" max={half === 1 ? half1Max : half2Max} value={minuteInHalf}
                    onChange={(e) => { const v = parseInt(e.target.value, 10) || 1; setMinuteInHalf(Math.min(Math.max(v, 1), half === 1 ? half1Max : half2Max)); setStoppageTime(0); }}
                    style={{ width: 45, padding: '0.3rem', borderRadius: '0.25rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: colors.text, outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginBottom: '0.3rem' }}>Acréscimo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.85rem', color: colors.text, fontWeight: 500 }}>+</span>
                  <input
                    type="number" min="0" max="15" value={stoppageTime}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10) || 0;
                      setStoppageTime(Math.min(Math.max(v, 0), 15));
                      if (v > 0) setMinuteInHalf(half === 1 ? half1Max : half2Max);
                    }}
                    style={{ width: 45, padding: '0.3rem', borderRadius: '0.25rem', border: `1px solid ${stoppageTime > 0 ? colors.primary : colors.border}`, backgroundColor: stoppageTime > 0 ? `${colors.primary}10` : colors.surface, textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: stoppageTime > 0 ? colors.primary : colors.text, outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{ padding: '0.85rem 1rem', backgroundColor: colors.surface, borderRadius: '0.45rem', border: `1px dashed ${colors.border}` }}>
            <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>Resumo:</div>
            <div style={{ fontSize: '0.875rem', color: colors.text, lineHeight: 1.4 }}>
              {(() => {
                const min = formatMinuteDisplay();
                const playerName = playersList.find(p => p.id === playerId)?.name;
                const secondName = playersList.find(p => p.id === secondaryPlayerId)?.name;
                const momentLabel = momentOptions.find(m => m.value === moment)?.label || '';
                const bpLabel = BP_SUBTYPES.find(s => s.value === bpSubtype)?.label || '';
                const momentText = isGoal ? ` em ${momentLabel}${moment === 'bp' ? ` · ${bpLabel}` : ''}` : '';
                if (eventType === 'goal_scored')   return `Gol ${playerName ? `de ${playerName}` : ''}${secondName ? ` (assist. ${secondName})` : ''}${momentText} aos ${min}`;
                if (eventType === 'goal_conceded') return `Gol sofrido${momentText} aos ${min}`;
                if (eventType === 'yellow_card')   return `Amarelo ${team === 'own' ? `${playerName ? `pra ${playerName}` : '(nosso time)'}` : '(adversário)'} aos ${min}`;
                if (eventType === 'red_card')      return `Vermelho ${team === 'own' ? `${playerName ? `pra ${playerName}` : '(nosso time)'}` : '(adversário)'} aos ${min}`;
                if (eventType === 'substitution')  return `Sai ${secondName || '—'}, entra ${playerName || '—'} aos ${min}`;
                return '';
              })()}
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAdd}>{editingEvent ? 'Salvar' : 'Adicionar'}</Button>
        </div>
      </div>
    </div>
  );
}
