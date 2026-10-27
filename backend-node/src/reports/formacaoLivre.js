// Formação "livre" da Análise do adversário: o treinador digita o sistema do RIVAL ("4-3-3",
// "2-3-5", "4-2-3-1", "3-1-4-2"…), que não precisa estar na lista de formações do clube.
// Vagas: 0 = goleiro; depois cada linha, da defesa ao ataque, da esquerda para a direita.
// Paridade: frontend/src/lib/formacaoLivre.js (mesma conta; teste em tests/analise-adversario.test.js).

function linhasDa(formacao) {
  const ns = String(formacao || '').split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n > 0 && n <= 6);
  return ns.length >= 2 && ns.length <= 5 && ns.reduce((a, b) => a + b, 0) <= 10 ? ns : null;
}

function papelDaLinha(i, total) {
  if (i === 0) return 'DEF';
  if (i === total - 1) return 'ATA';
  return 'MEI';
}

/** [{ vaga, papel, x, y }] em % do campo (ataque para cima). Formação inválida → só o goleiro. */
function vagasLivres(formacao) {
  const linhas = linhasDa(formacao) || [];
  const out = [{ vaga: 0, papel: 'GOL', x: 50, y: 91 }];
  const n = linhas.length;
  let vaga = 1;
  linhas.forEach((qtd, i) => {
    // defesa em 74%, ataque em 18%, linhas do meio espaçadas igualmente
    const y = n === 1 ? 50 : 74 - (i * (74 - 18)) / (n - 1);
    for (let k = 0; k < qtd; k++) {
      const x = qtd === 1 ? 50 : 12 + (k * 76) / (qtd - 1);
      out.push({ vaga: vaga++, papel: papelDaLinha(i, n), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
  });
  return out;
}

module.exports = { vagasLivres, linhasDa };
