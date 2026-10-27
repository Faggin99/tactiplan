// Análise do adversário (opponent_analyses.data, migration 062). Modelo pedido pelo dono:
// Analise_Flamengo_Libertadores_2026.pptx. O treinador preenche o que quiser; o PDF mostra só
// o que foi preenchido (seção vazia some). `normalizar` é a ÚNICA porta de entrada: corta
// textos, descarta itens vazios e valores fora da lista — o resto do sistema confia no formato.
//
// Listas de tópicos ("itens") são arrays de strings (no formulário: uma linha por item).

const LIM = { curto: 80, medio: 200, longo: 600, itens: 12, jogadores: 16, individuais: 8, variacoes: 6, ultimos: 10 };

const BLOCOS = ['alto', 'medio', 'baixo'];
const FREQUENCIAS = ['predominante', 'frequente', 'pontual', 'raro'];
const AO_PERDER = ['pressionam', 'temporizam', 'recuam'];
const AO_RECUPERAR = ['verticais', 'laterais', 'tras'];
const RESULTADOS = ['V', 'E', 'D'];
const MANDOS = ['C', 'F', 'N'];
const FASES_ATAQUE = ['construcao', 'segunda_fase', 'criacao', 'finalizacao'];
const BP_OFENSIVA = ['escanteios', 'faltas', 'laterais', 'penaltis'];

function texto(v, max = LIM.medio) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function itens(v, max = LIM.itens, tam = LIM.medio) {
  const lista = Array.isArray(v) ? v : (typeof v === 'string' ? v.split('\n') : []);
  return lista.map((x) => texto(x, tam)).filter(Boolean).slice(0, max);
}
function numero(v, max = 999) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.round(n));
}
function opcao(v, lista) { return lista.includes(v) ? v : ''; }
function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function linhaTabela(v) {
  const o = objeto(v);
  return { j: numero(o.j), v: numero(o.v), e: numero(o.e), d: numero(o.d), gp: numero(o.gp), gc: numero(o.gc) };
}

/** Limpa e valida a análise vinda do formulário. Sempre devolve o formato completo. */
function normalizar(bruto) {
  const d = objeto(bruto);
  const capa = objeto(d.capa);
  const camp = objeto(d.campanha);
  const sis = objeto(d.sistema);
  const esc = objeto(d.escalacao);
  const def = objeto(d.defesa);
  const atq = objeto(d.ataque);
  const tr = objeto(d.transicoes);
  const bpo = objeto(d.bp_ofensiva);
  const bpd = objeto(d.bp_defensiva);
  const pts = objeto(d.pontos);
  const fim = objeto(d.final);
  const fontes = objeto(d.fontes);

  return {
    capa: {
      fase: texto(capa.fase, LIM.curto),
      ida: texto(capa.ida, LIM.curto),
      tecnico: texto(capa.tecnico, LIM.curto),
      observacao: texto(capa.observacao, LIM.medio),
    },
    campanha: {
      situacao: texto(camp.situacao, LIM.medio),
      vitorias: numero(camp.vitorias),
      empates: numero(camp.empates),
      derrotas: numero(camp.derrotas),
      gols_pro: numero(camp.gols_pro),
      gols_contra: numero(camp.gols_contra),
      ultimos: (Array.isArray(camp.ultimos) ? camp.ultimos : []).map((u) => {
        const o = objeto(u);
        return { resultado: opcao(o.resultado, RESULTADOS), adversario: texto(o.adversario, LIM.curto),
          mando: opcao(o.mando, MANDOS), placar: texto(o.placar, 12) };
      }).filter((u) => u.adversario || u.placar).slice(0, LIM.ultimos),
      casa: linhaTabela(camp.casa),
      fora: linhaTabela(camp.fora),
      posse: numero(camp.posse, 100),
      observacao: texto(camp.observacao, LIM.longo),
    },
    sistema: {
      formacao: texto(sis.formacao, 12),
      descricao: texto(sis.descricao, LIM.medio),
      com_bola: itens(sis.com_bola),
      sem_bola: itens(sis.sem_bola),
    },
    variacoes: (Array.isArray(d.variacoes) ? d.variacoes : []).map((v) => {
      const o = objeto(v);
      return { fase: texto(o.fase, LIM.curto), formacao: texto(o.formacao, 12), quando: texto(o.quando, LIM.medio),
        itens: itens(o.itens, 6) };
    }).filter((v) => v.formacao || v.fase || v.quando || v.itens.length).slice(0, LIM.variacoes),
    escalacao: {
      formacao: texto(esc.formacao, 12),
      jogadores: (Array.isArray(esc.jogadores) ? esc.jogadores : []).map((j) => {
        const o = objeto(j);
        return { vaga: numero(o.vaga, 15), numero: numero(o.numero, 99), nome: texto(o.nome, LIM.curto) };
      }).filter((j) => j.nome && j.vaga !== null).slice(0, LIM.jogadores),
      banco: itens(esc.banco, LIM.jogadores, LIM.curto),
      desfalques: itens(esc.desfalques),
      duvidas: itens(esc.duvidas),
      observacao: texto(esc.observacao, LIM.medio),
    },
    defesa: Object.fromEntries(BLOCOS.map((b) => {
      const o = objeto(def[b]);
      return [b, { frequencia: opcao(o.frequencia, FREQUENCIAS), itens: itens(o.itens, 6) }];
    })),
    ataque: Object.fromEntries(FASES_ATAQUE.map((f) => [f, itens(atq[f], 6)])),
    transicoes: {
      perder: { comportamento: opcao(objeto(tr.perder).comportamento, AO_PERDER), itens: itens(objeto(tr.perder).itens, 6) },
      recuperar: { comportamento: opcao(objeto(tr.recuperar).comportamento, AO_RECUPERAR), itens: itens(objeto(tr.recuperar).itens, 6) },
    },
    individuais: (Array.isArray(d.individuais) ? d.individuais : []).map((p) => {
      const o = objeto(p);
      return { nome: texto(o.nome, LIM.curto), numero: numero(o.numero, 99), posicao: texto(o.posicao, 40),
        destaque: texto(o.destaque, LIM.medio), fortes: itens(o.fortes, 5), fracos: itens(o.fracos, 5),
        neutralizar: itens(o.neutralizar, 5) };
    }).filter((p) => p.nome).slice(0, LIM.individuais),
    bp_ofensiva: {
      resumo: texto(bpo.resumo, LIM.longo),
      ...Object.fromEntries(BP_OFENSIVA.map((k) => [k, itens(bpo[k], 6)])),
    },
    bp_defensiva: {
      marcacao: texto(bpd.marcacao, LIM.curto),
      homens_area: numero(bpd.homens_area, 11),
      trave: texto(bpd.trave, LIM.curto),
      barreira: texto(bpd.barreira, LIM.curto),
      contra_ataque: texto(bpd.contra_ataque, LIM.medio),
      goleiro: itens(bpd.goleiro, 4),
      itens: itens(bpd.itens, 6),
    },
    pontos: { positivos: itens(pts.positivos, 8), explorar: itens(pts.explorar, 8) },
    final: { observacoes: itens(fim.observacoes, 8), mensagem: texto(fim.mensagem, LIM.longo) },
    fontes: Object.fromEntries(Object.entries(fontes).filter(([k]) => /^[a-z_]{2,20}$/.test(k))
      .map(([k, v]) => [k, texto(v, LIM.medio)]).filter(([, v]) => v).slice(0, 20)),
  };
}

// ---------- o que tem conteúdo (o PDF pula o resto) ----------
const algum = (o) => Object.values(o).some((v) => (Array.isArray(v) ? v.length : (v !== null && v !== '' && v !== undefined)));
const tabelaTem = (t) => algum(t);

const TEM = {
  campanha: (c) => !!(c.situacao || c.observacao || c.ultimos.length || c.posse !== null
    || [c.vitorias, c.empates, c.derrotas, c.gols_pro, c.gols_contra].some((n) => n !== null)
    || tabelaTem(c.casa) || tabelaTem(c.fora)),
  sistema: (s) => !!(s.formacao || s.descricao || s.com_bola.length || s.sem_bola.length),
  variacoes: (v) => v.length > 0,
  escalacao: (e) => !!(e.jogadores.length || e.banco.length || e.desfalques.length || e.duvidas.length || e.observacao),
  defesa: (d) => BLOCOS.some((b) => d[b].frequencia || d[b].itens.length),
  ataque: (a) => FASES_ATAQUE.some((f) => a[f].length),
  transicoes: (t) => !!(t.perder.comportamento || t.perder.itens.length || t.recuperar.comportamento || t.recuperar.itens.length),
  individuais: (i) => i.length > 0,
  bp_ofensiva: (b) => !!(b.resumo || BP_OFENSIVA.some((k) => b[k].length)),
  bp_defensiva: (b) => !!(b.marcacao || b.homens_area !== null || b.trave || b.barreira || b.contra_ataque || b.goleiro.length || b.itens.length),
  pontos: (p) => !!(p.positivos.length || p.explorar.length),
  final: (f) => !!(f.observacoes.length || f.mensagem),
};

/** Seções preenchidas, na ordem do relatório. */
function secoesPreenchidas(a) {
  return Object.keys(TEM).filter((k) => TEM[k](a[k]));
}

module.exports = {
  normalizar, secoesPreenchidas, LIM,
  BLOCOS, FREQUENCIAS, AO_PERDER, AO_RECUPERAR, RESULTADOS, MANDOS, FASES_ATAQUE, BP_OFENSIVA,
};
