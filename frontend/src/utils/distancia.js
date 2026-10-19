// Distância ideal no dia (km). O backend guarda NUMERIC e o pg
// devolve string ("5.20"); aqui tudo vira número e é exibido em pt-BR (vírgula).

export function toKm(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// 5.2 → "5,2" · 5.25 → "5,25" · 5 → "5" (decimais = casas fixas, opcional)
export function formatKm(valor, decimais) {
  const n = toKm(valor);
  if (n === null) return '';
  const opts = decimais === undefined
    ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
    : { minimumFractionDigits: decimais, maximumFractionDigits: decimais };
  return n.toLocaleString('pt-BR', opts);
}

// Texto digitado ("5,2", "5.25", "") → { ok, value } (value null = limpar)
export function parseKmInput(texto) {
  const s = String(texto ?? '').trim().replace(',', '.');
  if (s === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Distância inválida: use um número com até 2 casas decimais (ex.: 5,2).' };
  const n = Number(s);
  if (n >= 100) return { ok: false, error: 'A distância ideal deve ser menor que 100 km.' };
  return { ok: true, value: n };
}
