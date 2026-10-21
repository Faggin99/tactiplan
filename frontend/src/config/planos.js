// Nomes de exibição dos planos — fonte única em shared/planos.json (também usada pelo backend).
// Para trocar o nome "Essencial": edite shared/planos.json, rode o build e reinicie o sports-api.
import planos from '../../../shared/planos.json';

export const NOME_ENTRADA = planos.entrada.nome;
export const NOME_CLUBE = planos.clube.nome;
export const MAX_CONVIDADOS_ENTRADA = planos.entrada.max_convidados;
export const MAX_CONVIDADOS_CLUBE = planos.clube.max_convidados;
export const SITE_PLANOS_URL = planos.site_planos_url;
export const PUBLICO = planos.publico;

const ENTRADA_IDS = planos.entrada.ids;
const CLUBE_IDS = planos.clube.ids;

// Plano à venda hoje? (desde 21/10/2026 só o Clube; o Essencial fica só para exibir
// o nome de assinaturas antigas).
export function isPlanoVendido(planId) {
  const id = String(planId || '');
  return (planos.entrada.vendido !== false && ENTRADA_IDS.includes(id))
    || (planos.clube.vendido !== false && CLUBE_IDS.includes(id));
}

export function isPlanoEntrada(planId) {
  return ENTRADA_IDS.includes(String(planId || ''));
}

// "Essencial Mensal", "Clube Anual"… (ids internos pro/clube não mudam).
export function nomePlano(planId, fallback = '') {
  const id = String(planId || '');
  const anual = id.endsWith('_annual');
  if (ENTRADA_IDS.includes(id)) return `${NOME_ENTRADA} ${anual ? 'Anual' : 'Mensal'}`;
  if (CLUBE_IDS.includes(id)) return `${NOME_CLUBE} ${anual ? 'Anual' : 'Mensal'}`;
  return fallback || id;
}
