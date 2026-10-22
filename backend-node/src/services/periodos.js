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

// Período que o dia MOSTRA: o nome gravado ou, no dia de período único sem nome
// (NULL, todos os dados antigos), Manhã — o padrão. Descanso não tem período.
// Decisão (22/10): NULL continua no banco (sem migração de dados) e vale como Manhã.
function periodoEfetivo(s) {
  if (!s || s.session_type === 'rest') return null;
  return periodoValido(s.periodo) ? s.periodo : 'manha';
}

function rotuloPeriodo(p) { return ROTULO_PERIODO[p] || null; }

// ---------------------------------------------------------------- AVALIAÇÃO
// Período de avaliação (session_type 'assessment', migration 059): sem blocos de
// atividade; a ÚNICA informação é o tipo (lista fixa, seleção múltipla) + "Outra"
// com texto curto (até 60). Pode ficar ao lado de treino ou jogo, ou sozinho.
// NÃO entra nas estatísticas (minutos, pilares, sessões): só aparece na Programação,
// na ficha do dia e na semana (decisão do dono, 22/10).
const TIPOS_AVALIACAO = ['fisica', 'tecnica', 'tatica', 'fisiologica', 'antropometrica', 'psicologica', 'outra'];
const ROTULO_AVALIACAO = {
  fisica: 'Física', tecnica: 'Técnica', tatica: 'Tática', fisiologica: 'Fisiológica/Médica',
  antropometrica: 'Antropométrica', psicologica: 'Psicológica', outra: 'Outra',
};
const MAX_OUTRA = 60;
const TIPOS_SESSAO = ['training', 'match', 'rest', 'assessment'];

function ehAvaliacao(s) { return !!s && s.session_type === 'assessment'; }

// Normaliza o que veio do cliente: só tipos conhecidos, sem repetir, na ordem da
// lista; "Outra" só com texto (texto aparado, até 60). Devolve { ok, tipos, outra, erro }.
function normalizarAvaliacao({ tipos, outra } = {}) {
  const lista = Array.isArray(tipos) ? tipos.map((t) => String(t || '').trim()) : [];
  const desconhecido = lista.find((t) => t && !TIPOS_AVALIACAO.includes(t));
  if (desconhecido) return { ok: false, erro: `Tipo de avaliação inválido: ${desconhecido}` };
  const texto = String(outra || '').trim().replace(/\s+/g, ' ');
  if (texto.length > MAX_OUTRA) return { ok: false, erro: `"Outra" aceita até ${MAX_OUTRA} caracteres` };
  const set = new Set(lista.filter(Boolean));
  if (texto) set.add('outra');
  if (set.has('outra') && !texto) return { ok: false, erro: 'Diga qual é a outra avaliação' };
  const ordenados = TIPOS_AVALIACAO.filter((t) => set.has(t));
  return { ok: true, tipos: ordenados, outra: texto || null };
}

// "Física, Técnica, Teste de Yo-Yo" — "Outra" vira o texto digitado.
function rotulosAvaliacao(s) {
  const tipos = Array.isArray(s?.assessment_types) ? s.assessment_types : [];
  return tipos
    .map((t) => (t === 'outra' ? (String(s?.assessment_other || '').trim() || 'Outra') : ROTULO_AVALIACAO[t]))
    .filter(Boolean);
}

function textoAvaliacao(s) { return rotulosAvaliacao(s).join(', '); }


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
function validarNovoPeriodo(doDia, { atual = null, novo, tipo = 'training' } = {}) {
  const lista = (doDia || []).slice().sort(compararPeriodos);
  if (!lista.length) return { ok: false, status: 404, erro: 'Dia não encontrado' };
  // o período novo nasce de treino (padrão) ou de avaliação
  if (!['training', 'assessment'].includes(tipo || 'training')) return { ok: false, status: 400, erro: 'O novo período é de treino ou de avaliação' };
  if (!periodoValido(novo)) return { ok: false, status: 400, erro: 'Período inválido: use manha, tarde ou noite' };
  if (lista.some((s) => s.session_type === 'rest')) {
    return { ok: false, status: 409, erro: 'Dia de descanso não tem períodos. Mude o tipo do dia antes.' };
  }
  if (lista.length >= MAX_PERIODOS) return { ok: false, status: 409, erro: `O dia já tem ${MAX_PERIODOS} períodos (o máximo).` };
  // Dia de 1 período (com nome ou não): `atual` diz o horário do treino que já existe
  // (padrão: o nome que ele já tem, ou Manhã). Muda o nome se for diferente.
  if (lista.length === 1) {
    const ja = periodoEfetivo(lista[0]) || 'manha';
    const a = atual == null || atual === '' ? ja : atual;
    if (!periodoValido(a)) return { ok: false, status: 400, erro: 'Diga qual é o período do treino que já existe (manha, tarde ou noite)' };
    if (a === novo) return { ok: false, status: 400, erro: 'O novo período precisa ser diferente do atual' };
    return { ok: true, renomearAtual: lista[0].periodo === a ? null : a, novo };
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
  // Sobrando 1, ele continua com o nome que tem (não volta a NULL): o dia segue "Tarde".
  return { ok: true };
}

// Renomear (trocar o horário de) um período.
function validarRenomear(doDia, sessionId, periodo) {
  const lista = doDia || [];
  const alvo = lista.find((s) => s.id === sessionId);
  if (!alvo) return { ok: false, status: 404, erro: 'Período não encontrado' };
  if (!periodoValido(periodo)) return { ok: false, status: 400, erro: 'Período inválido: use manha, tarde ou noite' };
  if (alvo.session_type === 'rest') return { ok: false, status: 409, erro: 'Dia de descanso não tem períodos.' };
  if (lista.some((s) => s.id !== sessionId && s.periodo === periodo)) {
    return { ok: false, status: 409, erro: `O dia já tem o período ${rotuloPeriodo(periodo)}.` };
  }
  return { ok: true };
}

// Trocar o tipo de um período, com as regras do dia.
function validarTipo(doDia, sessionId, tipo) {
  const lista = doDia || [];
  if (tipo && !TIPOS_SESSAO.includes(tipo)) return { ok: false, status: 400, erro: 'Tipo inválido' };
  if (lista.length < 2) return { ok: true };
  if (tipo === 'rest') {
    return { ok: false, status: 409, erro: 'Descanso vale para o dia inteiro: remova os outros períodos antes.' };
  }
  if (tipo === 'match' && lista.some((s) => s.id !== sessionId && s.session_type === 'match')) {
    return { ok: false, status: 409, erro: 'O dia já tem um período de jogo.' };
  }
  return { ok: true };
}

// "90+60" — divisão de minutos por período: só quando 2+ períodos TÊM minutos
// (Manhã 125 + Tarde de jogo/avaliação sem minutos = só "125", nunca "125+0").
function divisaoMinutos(periodos) {
  if (!periodos || periodos.length < 2) return null;
  const com = periodos.map((p) => Number(p.minutes) || 0).filter((m) => m > 0);
  return com.length >= 2 ? com.join('+') : null;
}

// Início › "Próximas sessões": 1 linha por DIA (o dia de 2+ períodos aparecia
// duas vezes). Mantém a ordem de chegada (data), guarda o 1º período como base e,
// no dia com 2+, `periodos` = [{id, periodo, session_type, opponent_name}] na ordem do nome.
function proximasPorDia(rows, limite = 5) {
  const dias = [];
  const porChave = new Map();
  for (const r of rows || []) {
    const k = chaveDia(r);
    if (!porChave.has(k)) {
      if (dias.length >= limite) continue;
      const lista = [];
      porChave.set(k, lista);
      dias.push(lista);
    }
    porChave.get(k).push(r);
  }
  return dias.map((lista) => {
    lista.sort(compararPeriodos);
    const base = { ...lista[0] };
    if (lista.length > 1) {
      base.periodos = lista.map((s) => ({ id: s.id, periodo: s.periodo, session_type: s.session_type, opponent_name: s.opponent_name || null }));
      const jogo = lista.find((s) => s.session_type === 'match');
      if (jogo) { base.session_type = 'match'; base.opponent_name = jogo.opponent_name || null; }
    }
    return base;
  });
}

module.exports = {
  TIPOS_AVALIACAO,
  ROTULO_AVALIACAO,
  MAX_OUTRA,
  TIPOS_SESSAO,
  ehAvaliacao,
  normalizarAvaliacao,
  rotulosAvaliacao,
  textoAvaliacao,
  proximasPorDia,
  periodoEfetivo,
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
