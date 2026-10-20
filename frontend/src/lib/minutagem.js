// Minutagem do jogo a partir das substituições (e da expulsão).
// MESMA lógica de backend-node/src/utils/minutagem.js (o teste backend-node/tests/minutagem.test.js
// roda os dois com os mesmos casos). Se mudar aqui, mude lá.
//
// Convenção gravada em match_events (substitution):
//   player_id           = quem ENTRA
//   secondary_player_id = quem SAI
// Só eventos do nosso time (team = 'own' ou vazio) contam.
//
// Regras:
//   titular sem substituição → duração
//   titular substituído aos X' → X
//   reserva que entra aos X' → duração − X
//   reserva que entrou aos X' e saiu aos Y' → Y − X
//   expulso aos X' (vermelho do nosso time) → sai aos X'
//   reserva que não entrou → 0
//   minutes_manual = true → vale o minutes_played informado (não recalcula)
//   substituição incompleta (sem quem entra OU sem quem sai) → ignorada

function isOwn(e) {
  return !e.team || e.team === 'own';
}

function toMinute(v, duration) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(duration, Math.round(n)));
}

// Eventos que mexem na minutagem, em ordem de minuto (estável).
function timeline(events) {
  return (events || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isOwn(e) && (e.event_type === 'substitution' || e.event_type === 'red_card'))
    .sort((a, b) => (Number(a.e.minute) || 0) - (Number(b.e.minute) || 0) || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * Estado de cada atleta no jogo.
 * @returns {Object<string, {minutes, auto, manual, started, entered, enteredAt, leftAt, sentOffAt, played}>}
 */
export function computeMinutagem({ players = [], events = [], duration = 0 }) {
  const dur = Math.max(0, Number(duration) || 0);
  const tl = timeline(events);
  const out = {};
  for (const p of players || []) {
    const id = p.athlete_id;
    if (!id) continue;
    const started = p.status === 'starter';
    let entry = started ? 0 : null;
    let exit = null;
    let enteredAt = null;
    let sentOffAt = null;
    for (const e of tl) {
      const m = toMinute(e.minute, dur);
      if (m == null) continue;
      if (e.event_type === 'substitution') {
        if (!e.player_id || !e.secondary_player_id) continue; // incompleta (legado): não conta
        if (e.player_id === id && entry === null && !started) { entry = m; enteredAt = m; }
        else if (e.secondary_player_id === id && entry !== null && exit === null && m >= entry) exit = m;
      } else if (e.event_type === 'red_card' && e.player_id === id && entry !== null && exit === null && m >= entry) {
        exit = m;
        sentOffAt = m;
      }
    }
    const auto = entry === null ? 0 : Math.max(0, (exit ?? dur) - entry);
    const manual = !!p.minutes_manual;
    const manualVal = Math.max(0, Math.round(Number(p.minutes_played) || 0));
    const minutes = manual ? manualVal : auto;
    out[id] = {
      minutes,
      auto,
      manual,
      started,
      entered: !started && enteredAt !== null,
      enteredAt,
      leftAt: exit,
      sentOffAt,
      played: minutes > 0 || started || enteredAt !== null,
    };
  }
  return out;
}

// Quem está em campo no minuto (antes de qualquer evento NESSE minuto contar
// para quem entra; quem saiu nesse minuto já não está).
export function emCampo({ players = [], events = [], duration = 0, minute, ignore = null }) {
  const evs = (events || []).filter((e) => e !== ignore && (ignore == null || e.id == null || e.id !== ignore.id));
  const st = computeMinutagem({ players: (players || []).map((p) => ({ ...p, minutes_manual: false })), events: evs, duration: Math.max(Number(duration) || 0, Number(minute) || 0) });
  return (players || []).filter((p) => {
    const s = st[p.athlete_id];
    if (!s) return false;
    const entrou = s.started || (s.enteredAt !== null && s.enteredAt <= minute);
    const saiu = s.leftAt !== null && s.leftAt <= minute;
    return entrou && !saiu;
  });
}

// Reservas relacionados que ainda não entraram.
export function reservasDisponiveis({ players = [], events = [], ignore = null }) {
  const usados = new Set((events || [])
    .filter((e) => e !== ignore && (ignore == null || e.id == null || e.id !== ignore.id))
    .filter((e) => isOwn(e) && e.event_type === 'substitution' && e.player_id)
    .map((e) => e.player_id));
  return (players || []).filter((p) => p.status === 'substitute' && !usados.has(p.athlete_id));
}

/**
 * Valida uma substituição nova (ou editada: passe o evento original em ignore).
 * sub = { minute, player_id: quem entra, secondary_player_id: quem sai }
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validarSubstituicao({ players = [], events = [], duration = 0, sub, ignore = null }) {
  const nome = (id) => {
    const p = (players || []).find((x) => x.athlete_id === id);
    return p?.name || p?.athlete?.name || 'O atleta';
  };
  const entra = sub?.player_id || null;
  const sai = sub?.secondary_player_id || null;
  const minute = Number(sub?.minute);
  if (!sai) return { ok: false, error: 'Escolha quem sai.' };
  if (!entra) return { ok: false, error: 'Escolha quem entra.' };
  if (entra === sai) return { ok: false, error: 'Quem sai e quem entra precisam ser atletas diferentes.' };
  if (!Number.isFinite(minute) || minute < 1) return { ok: false, error: 'Informe o minuto da substituição.' };

  const outros = (events || []).filter((e) => e !== ignore && (ignore == null || e.id == null || e.id !== ignore.id));
  const pIn = (players || []).find((p) => p.athlete_id === entra);
  const pOut = (players || []).find((p) => p.athlete_id === sai);
  if (!pOut) return { ok: false, error: `${nome(sai)} não está relacionado para o jogo.` };
  if (!pIn) return { ok: false, error: `${nome(entra)} não está relacionado para o jogo.` };
  if (pIn.status !== 'substitute') return { ok: false, error: `${nome(entra)} é titular: quem entra precisa ser reserva.` };

  const ownSubs = outros.filter((e) => isOwn(e) && e.event_type === 'substitution');
  if (ownSubs.some((e) => e.player_id === entra)) return { ok: false, error: `${nome(entra)} já entrou no jogo.` };
  if (ownSubs.some((e) => e.secondary_player_id === sai)) return { ok: false, error: `${nome(sai)} já saiu do jogo.` };

  const st = computeMinutagem({ players: players.map((p) => ({ ...p, minutes_manual: false })), events: outros, duration: Math.max(Number(duration) || 0, minute) })[sai];
  if (st?.sentOffAt != null && st.sentOffAt <= minute) return { ok: false, error: `${nome(sai)} foi expulso aos ${st.sentOffAt}'.` };
  const emCampoAgora = st && (st.started || (st.enteredAt !== null && st.enteredAt <= minute)) && !(st.leftAt !== null && st.leftAt <= minute);
  if (!emCampoAgora) {
    if (st?.enteredAt != null && st.enteredAt > minute) return { ok: false, error: `${nome(sai)} só entra aos ${st.enteredAt}'.` };
    return { ok: false, error: `${nome(sai)} não está em campo aos ${minute}'.` };
  }
  return { ok: true };
}

