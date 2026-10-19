// Formação tática do jogo + vaga (slot) de cada titular no campo.
// Fonte das formações por modalidade: shared/formacoes.json (a mesma que o front usa).
// Slot: 0 = goleiro; depois as linhas da formação, da defesa para o ataque.
const path = require('path');

const FORMACOES = require(path.join(__dirname, '../../../shared/formacoes.json'));
const MODALIDADE_PADRAO = 'football_11';

function configDaModalidade(modality) {
  return FORMACOES[modality] || FORMACOES[MODALIDADE_PADRAO];
}

function formacaoPadrao(modality) {
  return configDaModalidade(modality).padrao;
}

function formacaoValida(modality, formation) {
  return typeof formation === 'string' && configDaModalidade(modality).opcoes.includes(formation);
}

// Total de vagas = goleiro + soma das linhas ("4-4-2" → 11).
function totalVagas(formation) {
  return 1 + String(formation).split('-').reduce((s, n) => s + (parseInt(n, 10) || 0), 0);
}

/**
 * Valida o que chegou no POST /api/games/:id.
 * @param {object} p
 * @param {string} p.modality       modalidade do clube do jogo
 * @param {*}      p.formation      formation do body (undefined = não mexer)
 * @param {string} p.storedFormation formation atual no banco (pode ser null)
 * @param {Array}  p.players        jogadores do body
 * @returns {{ ok: true, formation: string|null, mudouFormacao: boolean, slots: Array<number|null> } | { ok: false, error: string }}
 */
function validarEscalacao({ modality, formation, storedFormation = null, players = [] }) {
  let formacaoFinal = storedFormation || null;
  const mudouFormacao = formation !== undefined;
  if (mudouFormacao) {
    if (formation === null || formation === '') formacaoFinal = null;
    else if (!formacaoValida(modality, formation)) {
      return { ok: false, error: `Formação inválida para a modalidade: ${formation}` };
    } else formacaoFinal = formation;
  }

  // Slots são validados contra a formação efetiva (sem formação = padrão da modalidade).
  const efetiva = formacaoValida(modality, formacaoFinal) ? formacaoFinal : formacaoPadrao(modality);
  const total = totalVagas(efetiva);
  const usados = new Set();
  const atletas = new Set();
  const slots = [];

  for (const p of Array.isArray(players) ? players : []) {
    if (!p || !p.athlete_id) return { ok: false, error: 'Jogador sem atleta' };
    if (atletas.has(p.athlete_id)) return { ok: false, error: 'O mesmo atleta aparece duas vezes no jogo' };
    atletas.add(p.athlete_id);

    const raw = p.slot;
    if (raw === undefined || raw === null || raw === '') { slots.push(null); continue; }
    const slot = typeof raw === 'number' ? raw : (/^\d+$/.test(String(raw)) ? parseInt(raw, 10) : NaN);
    if (!Number.isInteger(slot) || slot < 0 || slot >= total) {
      return { ok: false, error: `Vaga fora da formação ${efetiva} (0 a ${total - 1})` };
    }
    if ((p.status || 'starter') !== 'starter') return { ok: false, error: 'Só titular ocupa vaga no campo' };
    if (usados.has(slot)) return { ok: false, error: 'Duas pessoas na mesma vaga do campo' };
    usados.add(slot);
    slots.push(slot);
  }

  return { ok: true, formation: formacaoFinal, mudouFormacao, slots };
}

module.exports = { FORMACOES, formacaoPadrao, formacaoValida, totalVagas, validarEscalacao };
