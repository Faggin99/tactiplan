// Períodos do dia (Manhã · Tarde · Noite) — espelha backend-node/src/services/periodos.js.
// GET /api/microcycles: `sessions` = 1 por dia (o 1º período); o dia com 2+
// períodos traz todos em `periodos` (cada um com os 6 blocos).

export const PERIODOS = ['manha', 'tarde', 'noite'];
export const ROTULO_PERIODO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const MAX_PERIODOS = 3;

export const rotuloPeriodo = (p) => ROTULO_PERIODO[p] || null;

// Avaliação (session_type 'assessment', migration 059) — espelha backend periodos.js.
// Sem blocos; a única informação é o tipo (lista fixa, seleção múltipla) + "Outra"
// com texto curto. NÃO entra nas estatísticas (minutos, pilares, sessões).
export const TIPOS_AVALIACAO = ['fisica', 'tecnica', 'tatica', 'fisiologica', 'antropometrica', 'psicologica', 'outra'];
export const ROTULO_AVALIACAO = {
  fisica: 'Física', tecnica: 'Técnica', tatica: 'Tática', fisiologica: 'Fisiológica/Médica',
  antropometrica: 'Antropométrica', psicologica: 'Psicológica', outra: 'Outra',
};
export const MAX_OUTRA = 60;
export const ehAvaliacao = (s) => !!s && s.session_type === 'assessment';

// "Física, Técnica, Yo-Yo" — "Outra" vira o texto digitado.
export function rotulosAvaliacao(s) {
  const tipos = Array.isArray(s?.assessment_types) ? s.assessment_types : [];
  return tipos
    .map((t) => (t === 'outra' ? (String(s?.assessment_other || '').trim() || 'Outra') : ROTULO_AVALIACAO[t]))
    .filter(Boolean);
}
export const textoAvaliacao = (s) => rotulosAvaliacao(s).join(', ');

// Normaliza a escolha (mesma regra do servidor): { ok, tipos, outra, erro }.
export function normalizarAvaliacao({ tipos, outra } = {}) {
  const lista = Array.isArray(tipos) ? tipos.map((t) => String(t || '').trim()) : [];
  const desconhecido = lista.find((t) => t && !TIPOS_AVALIACAO.includes(t));
  if (desconhecido) return { ok: false, erro: `Tipo de avaliação inválido: ${desconhecido}` };
  const texto = String(outra || '').trim().replace(/\s+/g, ' ');
  if (texto.length > MAX_OUTRA) return { ok: false, erro: `"Outra" aceita até ${MAX_OUTRA} caracteres` };
  const set = new Set(lista.filter(Boolean));
  if (texto) set.add('outra');
  if (set.has('outra') && !texto) return { ok: false, erro: 'Diga qual é a outra avaliação' };
  return { ok: true, tipos: TIPOS_AVALIACAO.filter((t) => set.has(t)), outra: texto || null };
}

// 1ª linha da coluna / carrossel: "Manhã · Avaliação", "Tarde · Jogo", "Manhã · Tático".
export function rotuloLinhaPeriodo(s, pilares = []) {
  const per = rotuloPeriodo(periodoEfetivo(s));
  const tipo = s?.session_type || 'training';
  const resto = tipo === 'assessment' ? ['Avaliação'] : tipo === 'match' ? ['Jogo'] : pilares;
  return `${per || ''}${per && resto.length ? ' · ' : ''}${resto.join(' | ')}`;
}

// "90+60" — divisão de minutos por período: só quando 2+ períodos TÊM minutos
// (nunca "125+0"). null = não mostra.
export function divisaoMinutos(lista) {
  const com = (lista || []).map((p) => minutosDaSessao(p)).filter((m) => m > 0);
  return com.length >= 2 ? com.join('+') : null;
}

// Período que o dia MOSTRA (espelha backend periodoEfetivo): o nome gravado ou, no dia de
// período único sem nome (NULL, dados antigos), Manhã — o padrão. Descanso não tem período.
export function periodoEfetivo(s) {
  if (!s || s.session_type === 'rest') return null;
  return PERIODOS.includes(s.periodo) ? s.periodo : 'manha';
}

// Lista de períodos do dia (null = dia de período único, igual a antes).
export function periodosDoDia(day) {
  return Array.isArray(day?.periodos) && day.periodos.length > 1 ? day.periodos : null;
}

export function minutosDaSessao(s) {
  if (ehAvaliacao(s)) return 0; // avaliação não soma minutos
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

// "Manhã e Tarde" / "Manhã, Tarde e Noite".
export function listaPeriodos(lista) {
  const nomes = (lista || []).map((p) => rotuloPeriodo(p.periodo)).filter(Boolean);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// Rótulo da sessão do dia no Início (1 linha por dia, ver backend proximasPorDia):
//   1 período → "Treino" / "Jogo · vs X"
//   2+ do mesmo tipo → "Treino · Manhã e Tarde"
//   treino + jogo → "Manhã treino + Tarde jogo · vs X"
const TIPO = { training: 'treino', match: 'jogo', rest: 'descanso', assessment: 'avaliação' };
export function rotuloSessaoDoDia(s) {
  const vs = s?.opponent_name ? ` · vs ${s.opponent_name}` : '';
  const lista = Array.isArray(s?.periodos) && s.periodos.length > 1 ? s.periodos : null;
  if (!lista) {
    if (s?.session_type === 'match') return `Jogo${vs}`;
    if (s?.session_type === 'assessment') return 'Avaliação';
    return s?.session_type === 'rest' ? 'Descanso' : 'Treino';
  }
  const tipos = new Set(lista.map((p) => p.session_type || 'training'));
  if (tipos.size === 1) {
    const t = TIPO[[...tipos][0]] || 'treino';
    return `${t[0].toUpperCase()}${t.slice(1)} · ${listaPeriodos(lista)}${[...tipos][0] === 'match' ? vs : ''}`;
  }
  return `${lista.map((p) => `${rotuloPeriodo(p.periodo)} ${TIPO[p.session_type || 'training'] || 'treino'}`).join(' + ')}${vs}`;
}
