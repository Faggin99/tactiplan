// Períodos do dia (Manhã · Tarde · Noite) — espelha backend-node/src/services/periodos.js.
// GET /api/microcycles: `sessions` = 1 por dia (o 1º período); o dia com 2+
// períodos traz todos em `periodos` (cada um com os 6 blocos).

export const PERIODOS = ['manha', 'tarde', 'noite'];
export const ROTULO_PERIODO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const MAX_PERIODOS = 3;

export const rotuloPeriodo = (p) => ROTULO_PERIODO[p] || null;

// Lista de períodos do dia (null = dia de período único, igual a antes).
export function periodosDoDia(day) {
  return Array.isArray(day?.periodos) && day.periodos.length > 1 ? day.periodos : null;
}

export function minutosDaSessao(s) {
  return (s?.blocks || []).reduce((t, b) => t + (parseInt(b.activity?.duration_minutes, 10) || 0), 0);
}

// Distância do dia: soma dos períodos de TREINO com registro (null sem nenhum).
export function distanciaDoDia(lista) {
  let total = null;
  for (const s of lista || []) {
    if ((s.session_type || 'training') !== 'training') continue;
    if (s.avg_distance_km === null || s.avg_distance_km === undefined || s.avg_distance_km === '') continue;
    const km = Number(s.avg_distance_km);
    if (!Number.isFinite(km)) continue;
    total = (total || 0) + km;
  }
  return total === null ? null : Math.round(total * 100) / 100;
}

// Períodos que ainda cabem no dia.
export function periodosLivres(day) {
  const usados = new Set((periodosDoDia(day) || []).map((p) => p.periodo));
  return PERIODOS.filter((p) => !usados.has(p));
}
