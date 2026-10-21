// Nome de PESSOA com a primeira letra de cada palavra maiúscula e o resto minúsculo.
// Usado ao salvar users.name e athletes.name (não em clube, campeonato, conteúdo, atividade).
//   "alcindo de oliveira neto" → "Alcindo de Oliveira Neto"
//   "Léo reis" → "Léo Reis" · "JOÃO DA SILVA" → "João da Silva"
// Partículas no MEIO do nome ficam minúsculas: de, da, do, das, dos, e, d', di, du, van, von.
// Respeita acentos, hífen ("ana-maria" → "Ana-Maria") e apóstrofo ("d'avila" → "d'Avila",
// "o'neil" → "O'Neil"). Numeral romano no fim fica maiúsculo ("II"); CamelCase proposital
// ("McDonald") fica como está. Espaços repetidos viram um só.
//
// ATENÇÃO: cópia IDÊNTICA em frontend/src/lib/formatarNome.js (teste de paridade em
// backend-node/tests/formatar-nome.test.js). Mudou aqui, mude lá.

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'van', 'von']);
const APOSTROFOS = /['’]/;
// Numeral romano no FIM do nome ("João Silva II") fica todo maiúsculo.
const ROMANO = /^(?:i{1,3}|iv|vi{0,3}|ix|x)$/;
const CAMEL = /^\p{Lu}\p{Ll}+\p{Lu}\p{Ll}/u;

function capitalizar(parte) {
  if (!parte) return parte;
  const chars = Array.from(parte);
  return chars[0].toLocaleUpperCase('pt-BR') + chars.slice(1).join('');
}

// Uma palavra (sem espaço). `meio` = não é a primeira nem a última palavra do nome.
function formatarPalavra(palavra, meio) {
  const p = palavra.toLocaleLowerCase('pt-BR');
  if (meio && PARTICULAS.has(p)) return p;
  // CamelCase proposital ("McDonald", "GomesBezerra"): já começa maiúscula e tem outra
  // maiúscula no meio de minúsculas → fica como a pessoa digitou.
  if (CAMEL.test(palavra)) return palavra;
  // Hífen: cada pedaço é tratado como palavra (partícula no meio também).
  if (p.includes('-')) {
    return p.split('-').map((pedaco, i, arr) => formatarPalavra(pedaco, i > 0 && i < arr.length - 1)).join('-');
  }
  const ap = p.match(APOSTROFOS);
  if (ap) {
    const i = p.indexOf(ap[0]);
    const antes = p.slice(0, i);
    const depois = p.slice(i + 1);
    // d'Avila: a partícula d' fica minúscula no meio do nome.
    const prefixo = (meio && antes === 'd') ? 'd' : capitalizar(antes);
    return prefixo + ap[0] + capitalizar(depois);
  }
  return capitalizar(p);
}

function formatarNome(nome) {
  if (nome === null || nome === undefined) return nome;
  const texto = String(nome).replace(/\s+/g, ' ').trim();
  if (!texto) return texto;
  const palavras = texto.split(' ');
  const ultima = palavras.length - 1;
  return palavras
    .map((w, i) => {
      if (i > 0 && i === ultima && ROMANO.test(w.toLocaleLowerCase('pt-BR'))) return w.toLocaleUpperCase('pt-BR');
      return formatarPalavra(w, i > 0 && i < ultima);
    })
    .join(' ');
}

module.exports = { formatarNome, PARTICULAS };
