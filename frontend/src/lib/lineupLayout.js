// Helpers da escalação do jogo (camisa e minutos jogados).
// A posição no campo agora vem da VAGA (slot) da formação: ver lib/formation.js.

// Lê a camisa do jogador respeitando override por jogo.
export function readJersey(p) {
  const match = (p.jersey_number !== '' && p.jersey_number != null) ? p.jersey_number : null;
  return match ?? p.athlete?.jersey_number ?? null;
}

// Minutos jogados: ver lib/minutagem.js (substituições + expulsão, com ajuste manual).
