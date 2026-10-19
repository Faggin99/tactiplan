// Helpers da escalação do jogo (camisa e minutos jogados).
// A posição no campo agora vem da VAGA (slot) da formação: ver lib/formation.js.

// Lê a camisa do jogador respeitando override por jogo.
export function readJersey(p) {
  const match = (p.jersey_number !== '' && p.jersey_number != null) ? p.jersey_number : null;
  return match ?? p.athlete?.jersey_number ?? null;
}

// Calcula minutos jogados de um atleta a partir dos eventos de substituição
// (apenas team='own'). Modelo: titulares entram em 0, reservas entram quando
// são chamados (event.secondary_player_id == athlete_id), todo mundo sai
// quando sua linha é substituída (event.player_id == athlete_id) ou no final
// da partida. Lida com 1ª substituição/retorno; não modela re-entradas
// múltiplas (raro em futebol 7/11, e futsal não usa esse cálculo).
export function computeMinutesPlayed(player, events, matchDuration) {
  if (!matchDuration) return 0;
  const athleteId = player.athlete_id;
  const subs = (events || [])
    .filter((e) => e.event_type === 'substitution' && e.team === 'own')
    .sort((a, b) => a.minute - b.minute);

  let entry = player.status === 'starter' ? 0 : null;
  let exit = null;

  for (const e of subs) {
    // Player saindo
    if (e.player_id === athleteId && exit === null) exit = e.minute;
    // Player entrando
    if (e.secondary_player_id === athleteId && entry === null) entry = e.minute;
  }

  if (entry === null) return 0; // nunca entrou
  const end = exit ?? matchDuration;
  return Math.max(0, Math.min(matchDuration, end) - entry);
}
