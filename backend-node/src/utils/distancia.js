// Distância média percorrida por jogador no dia (km) — training_sessions.avg_distance_km.
// Aceita número ou string com vírgula/ponto ("5,2", "5.25"). null/"" limpa o campo.
// Regras: >= 0, < 100 (NUMERIC(5,2) com CHECK <= 99.99), no máximo 2 casas decimais.

function parseDistanciaKm(valor) {
  if (valor === null || valor === undefined) return { ok: true, value: null };
  if (typeof valor === 'string') {
    const s = valor.trim().replace(',', '.');
    if (s === '') return { ok: true, value: null };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) {
      return { ok: false, error: 'Distância inválida: use um número com até 2 casas decimais (ex.: 5,2)' };
    }
    valor = Number(s);
  } else if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return { ok: false, error: 'Distância inválida' };
    if (valor < 0) return { ok: false, error: 'A distância não pode ser negativa' };
    if (Math.abs(Math.round(valor * 100) - valor * 100) > 1e-6) {
      return { ok: false, error: 'Distância inválida: no máximo 2 casas decimais' };
    }
  } else {
    return { ok: false, error: 'Distância inválida' };
  }
  if (valor >= 100) return { ok: false, error: 'A distância média deve ser menor que 100 km' };
  return { ok: true, value: Math.round(valor * 100) / 100 };
}

module.exports = { parseDistanciaKm };
