// Períodos de treino do dia (Manhã · Tarde · Noite) — migration 057.
//
// MODELO: cada período é uma linha de training_sessions (mesma data, clube e
// workspace) com `periodo` = 'manha' | 'tarde' | 'noite'. Dia com 1 período só
// (a maioria) continua com periodo = NULL, exatamente como antes.
// Índice único: (workspace_id, date, club_id, COALESCE(periodo, 'unico')).
// A ordem dos períodos sai do próprio nome (Manhã < Tarde < Noite), sem coluna
// de ordem para manter em dia.
//
// Tipo: cada período guarda o próprio session_type, com as regras do DIA:
//   - descanso é do dia inteiro (só com 1 período);
//   - no máximo 1 período de JOGO por dia (os outros são treino).
// Assim "Manhã treino + Tarde jogo" sai sem coluna nova.
//
// Compatibilidade (app T1/T2 e web antigo): GET /api/microcycles continua com
// `sessions` = 1 por dia (o 1º período); os períodos vêm em `periodos` no dia
// que tem 2 ou mais. Funções puras aqui; SQL nas rotas.

const PERIODOS = ['manha', 'tarde', 'noite'];
const ROTULO_PERIODO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const MAX_PERIODOS = PERIODOS.length;

// SQL da ordem (para ORDER BY): período único (NULL) primeiro, depois manhã/tarde/noite.
const ORDEM_SQL = `CASE periodo WHEN 'manha' THEN 1 WHEN 'tarde' THEN 2 WHEN 'noite' THEN 3 ELSE 0 END`;
const ordemSql = (alias = '') => ORDEM_SQL.replace('periodo', `${alias ? `${alias}.` : ''}periodo`);

function ordemPeriodo(p) {
  const i = PERIODOS.indexOf(p);
  return i < 0 ? 0 : i + 1;
}

function periodoValido(p) { return PERIODOS.includes(p); }

function rotuloPeriodo(p) { return ROTULO_PERIODO[p] || null; }

function dataStr(d) {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d || '').split('T')[0];
}

// Chave do dia: workspace + clube + data (o mesmo par do índice único).
function chaveDia(s) {
  return `${s.workspace_id || ''}|${s.club_id || ''}|${dataStr(s.date)}`;
}

function compararPeriodos(a, b) {
  return ordemPeriodo(a.periodo) - ordemPeriodo(b.periodo);
}

// Agrupa linhas de sessão por dia. Map chave → lista ordenada (1º período primeiro).
function agruparPorDia(sessions) {
  const dias = new Map();
  for (const s of sessions || []) {
    const k = chaveDia(s);
    if (!dias.has(k)) dias.set(k, []);
    dias.get(k).push(s);
  }
  for (const lista of dias.values()) lista.sort(compararPeriodos);
  return dias;
}

// session_id → id do 1º período do dia (o "dia" nas estatísticas por sessão).
function mapaDoDia(sessions) {
  const mapa = new Map();
  for (const lista of agruparPorDia(sessions).values()) {
    for (const s of lista) mapa.set(s.id, lista[0].id);
  }
  return mapa;
}

// Microciclo: `sessions` com 1 por dia (o 1º período) e, no dia com 2+, `periodos`
// (cópias rasas de cada período, com blocos). Ordem por data.
function montarDias(sessions) {
  const porData = new Map();
  for (const s of sessions || []) {
    const d = dataStr(s.date);
    if (!porData.has(d)) porData.set(d, []);
    porData.get(d).push(s);
  }
  const dias = [];
  for (const d of Array.from(porData.keys()).sort()) {
    const lista = porData.get(d).slice().sort(compararPeriodos);
    if (lista.length > 1) {
      const copias = lista.map((s) => ({ ...s }));
      dias.push({ ...lista[0], periodos: copias });
    } else {
      dias.push(lista[0]);
    }
  }
  return dias;
}

// Distância do dia = soma dos períodos de TREINO com registro (null sem nenhum).
function distanciaDoDia(lista) {
  let total = null;
  for (const s of lista || []) {
    if ((s.session_type || 'training') !== 'training') continue;
    if (s.avg_distance_km === null || s.avg_distance_km === undefined) continue;
    const km = Number(s.avg_distance_km);
    if (!Number.isFinite(km)) continue;
    total = (total || 0) + km;
  }
  return total === null ? null : Math.round(total * 100) / 100;
}

// Linhas de distância 1 por dia (soma dos períodos), no formato que
// statsData.buildDistanceStats espera.
function distanciaPorDia(sessions) {
  const out = [];
  for (const lista of agruparPorDia(sessions).values()) {
    const km = distanciaDoDia(lista);
    if (km === null) continue;
    out.push({ id: lista[0].id, date: dataStr(lista[0].date), session_type: 'training', avg_distance_km: km });
  }
  return out;
}

// Adicionar período. `doDia` = linhas do dia (id, periodo, session_type).
// `atual` = nome do período que JÁ existe (só quando o dia ainda é único).
// Devolve { ok, erro, status, renomearAtual: 'manha'|null, novo }.
function validarNovoPeriodo(doDia, { atual = null, novo } = {}) {
  const lista = (doDia || []).slice().sort(compararPeriodos);
  if (!lista.length) return { ok: false, status: 404, erro: 'Dia não encontrado' };
  if (!periodoValido(novo)) return { ok: false, status: 400, erro: 'Período inválido: use manha, tarde ou noite' };
  if (lista.some((s) => s.session_type === 'rest')) {
    return { ok: false, status: 409, erro: 'Dia de descanso não tem períodos. Mude o tipo do dia antes.' };
  }
  if (lista.length >= MAX_PERIODOS) return { ok: false, status: 409, erro: `O dia já tem ${MAX_PERIODOS} períodos (o máximo).` };
  const unico = lista.length === 1 && !lista[0].periodo;
  if (unico) {
    if (!periodoValido(atual)) return { ok: false, status: 400, erro: 'Diga qual é o período do treino que já existe (manha, tarde ou noite)' };
    if (atual === novo) return { ok: false, status: 400, erro: 'O novo período precisa ser diferente do atual' };
    return { ok: true, renomearAtual: atual, novo };
  }
  if (lista.some((s) => s.periodo === novo)) {
    return { ok: false, status: 409, erro: `O dia já tem o período ${rotuloPeriodo(novo)}.` };
  }
  return { ok: true, renomearAtual: null, novo };
}

// Remover período. Devolve { ok, erro, status, voltaAUnico: id|null }.
function validarRemocao(doDia, sessionId) {
  const lista = (doDia || []).slice().sort(compararPeriodos);
  const alvo = lista.find((s) => s.id === sessionId);
  if (!alvo) return { ok: false, status: 404, erro: 'Período não encontrado' };
  if (lista.length < 2 || !alvo.periodo) return { ok: false, status: 409, erro: 'O dia tem um período só: não há o que remover.' };
  const resto = lista.filter((s) => s.id !== sessionId);
  return { ok: true, voltaAUnico: resto.length === 1 ? resto[0].id : null };
}

// Renomear (trocar o horário de) um período.
function validarRenomear(doDia, sessionId, periodo) {
  const lista = doDia || [];
  const alvo = lista.find((s) => s.id === sessionId);
  if (!alvo) return { ok: false, status: 404, erro: 'Período não encontrado' };
  if (!periodoValido(periodo)) return { ok: false, status: 400, erro: 'Período inválido: use manha, tarde ou noite' };
  if (!alvo.periodo) return { ok: false, status: 409, erro: 'O dia tem um período só: adicione um período antes.' };
  if (lista.some((s) => s.id !== sessionId && s.periodo === periodo)) {
    return { ok: false, status: 409, erro: `O dia já tem o período ${rotuloPeriodo(periodo)}.` };
  }
  return { ok: true };
}

// Trocar o tipo de um período, com as regras do dia.
function validarTipo(doDia, sessionId, tipo) {
  const lista = doDia || [];
  if (lista.length < 2) return { ok: true };
  if (tipo === 'rest') {
    return { ok: false, status: 409, erro: 'Descanso vale para o dia inteiro: remova os outros períodos antes.' };
  }
  if (tipo === 'match' && lista.some((s) => s.id !== sessionId && s.session_type === 'match')) {
    return { ok: false, status: 409, erro: 'O dia já tem um período de jogo.' };
  }
  return { ok: true };
}

// "90+60" — divisão de minutos por período (só quando há 2+).
function divisaoMinutos(periodos) {
  if (!periodos || periodos.length < 2) return null;
  return periodos.map((p) => Number(p.minutes) || 0).join('+');
}

module.exports = {
  PERIODOS,
  ROTULO_PERIODO,
  MAX_PERIODOS,
  ordemSql,
  ordemPeriodo,
  periodoValido,
  rotuloPeriodo,
  chaveDia,
  compararPeriodos,
  agruparPorDia,
  mapaDoDia,
  montarDias,
  distanciaDoDia,
  distanciaPorDia,
  validarNovoPeriodo,
  validarRemocao,
  validarRenomear,
  validarTipo,
  divisaoMinutos,
};
