package com.faggin.tactiplan.app.dados.jogo

import kotlin.math.min
import kotlin.math.sqrt

// Formação tática do jogo, vagas (slots) no campo e posição EM CAMPO derivada da vaga.
// Porte fiel de frontend/src/lib/formation.js + lib/posicaoEmCampo.js. A POSIÇÃO CADASTRADA DO
// ATLETA NÃO DECIDE ONDE ELE APARECE: quem decide é a vaga escolhida pelo usuário.
// Vaga 0 = goleiro; depois cada linha, da defesa para o ataque, da esquerda para a direita da tela.
// Coordenadas em %: y = 0 é a meta adversária (topo), y = 100 é a nossa (base).
// Paridade: native/paridade/jogo.json (gerado do web) + TactiPlanKit/Formacao.swift.

const val MODALIDADE_PADRAO = "football_11"

data class CfgFormacao(val padrao: String, val opcoes: List<String>)

/** shared/formacoes.json (o teste confere que é o mesmo arquivo do web). */
val FORMACOES: Map<String, CfgFormacao> = mapOf(
    "football_11" to CfgFormacao("4-4-2", listOf("4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2", "4-1-4-1", "4-5-1")),
    "football_7" to CfgFormacao("2-3-1", listOf("2-3-1", "3-2-1", "3-1-2", "2-2-2")),
    "futsal" to CfgFormacao("2-2", listOf("2-2", "3-1", "1-2-1", "4-0")),
)

private fun cfgFormacao(m: String?) = FORMACOES[m ?: ""] ?: FORMACOES.getValue(MODALIDADE_PADRAO)

fun formacoesDa(modalidade: String?): List<String> = cfgFormacao(modalidade).opcoes
fun formacaoPadrao(modalidade: String?): String = cfgFormacao(modalidade).padrao

/** A salva, se for válida para a modalidade; senão a padrão. */
fun resolverFormacao(modalidade: String?, formacao: String?): String =
    if (formacao != null && formacao in formacoesDa(modalidade)) formacao else formacaoPadrao(modalidade)

/** `parseInt` do JS: dígitos iniciais; nada → 0. */
internal fun parseIntJS(s: String): Int {
    var t = s.trim()
    var sinal = 1
    if (t.startsWith("-")) { sinal = -1; t = t.drop(1) } else if (t.startsWith("+")) t = t.drop(1)
    val d = t.takeWhile { it in '0'..'9' }
    return (d.toIntOrNull() ?: 0) * sinal
}

internal fun linhasDaFormacao(formacao: String?): List<Int> =
    (formacao ?: "").split("-").map { parseIntJS(it) }.filter { it > 0 }

private fun rotulosDasLinhas(qtd: Int): List<String> = when {
    qtd <= 1 -> listOf("LIN")
    qtd == 2 -> listOf("DEF", "ATA")
    else -> listOf("DEF") + List(qtd - 2) { "MEI" } + listOf("ATA")
}

val ORDEM_PAPEIS = listOf("GOL", "DEF", "MEI", "ATA", "LIN")

/** Uma vaga. `espaco` = largura (%) disponível para a vaga na linha (limita o nome). */
data class Vaga(val indice: Int, val papel: String, val linha: Int, val x: Double, val y: Double, val espaco: Double)

/** Vagas da formação (buildSlots do web). */
fun vagasDa(formacao: String): List<Vaga> {
    val ls = linhasDaFormacao(formacao)
    val papeis = rotulosDasLinhas(ls.size)
    val vagas = mutableListOf(Vaga(0, "GOL", 0, 50.0, 90.0, 40.0))
    val yDef = 72.0
    val yAta = 18.0
    var idx = 1
    ls.forEachIndexed { li, n ->
        val y = if (ls.size == 1) 50.0 else yDef - (li * (yDef - yAta)) / (ls.size - 1)
        val espaco = 84.0 / maxOf(n, 1)
        for (i in 0 until n) {
            vagas.add(Vaga(idx++, papeis[li], li + 1, if (n == 1) 50.0 else 8 + espaco * (i + 0.5), y, min(espaco, 40.0)))
        }
    }
    return vagas
}

fun totalVagas(formacao: String): Int = 1 + linhasDaFormacao(formacao).sum()

fun papelDaVaga(formacao: String, vaga: Int?): String? {
    val v = vaga ?: return null
    val vs = vagasDa(formacao)
    return if (v >= 0 && v < vs.size) vs[v].papel else null
}

private fun pontas(i: Int, n: Int, esq: String, dir: String, centro: String) = when (i) {
    0 -> esq
    n - 1 -> dir
    else -> centro
}

/** Posição EM CAMPO da vaga; null = sem vaga, fora da formação ou formação de uma linha só (4-0). */
fun posicaoEmCampo(formacao: String?, vaga: Int?, modalidade: String?): String? {
    val s = vaga ?: return null
    if (s < 0) return null
    if (s == 0) return "GOL"
    val ls = linhasDaFormacao(formacao)
    var li = -1
    var i = s - 1
    for ((k, n) in ls.withIndex()) {
        if (i < n) { li = k; break }
        i -= n
    }
    if (li < 0) return null
    val n = ls[li]
    val ultima = ls.size - 1
    if (modalidade == "futsal") {
        if (ls.size == 1) return null
        if (li == 0) return if (n >= 3) pontas(i, n, "ALA-E", "ALA-D", "FIX") else "FIX"
        if (li == ultima) return "PIV"
        return if (n >= 2) pontas(i, n, "ALA-E", "ALA-D", "FIX") else "FIX"
    }
    if (ls.size == 1) return null
    if (li == 0) return if (n >= 4) pontas(i, n, "LE", "LD", "ZAG") else "ZAG"
    if (li == ultima) return if (n >= 3) pontas(i, n, "EE", "ED", "CA") else "CA"
    val linhasDeMeio = ls.size - 2
    return if (linhasDeMeio >= 2 && li == 1) "VOL" else "MEI"
}

/** Etiqueta da vaga na lista: a posição em campo; futsal 4-0 → o papel (LIN). */
fun etiquetaDaVaga(formacao: String, vaga: Int?, modalidade: String?): String? {
    val papel = papelDaVaga(formacao, vaga) ?: return null
    return posicaoEmCampo(formacao, vaga, modalidade) ?: papel
}

/** Papel sugerido pela posição CADASTRADA: só para o botão "Encaixar sugestão". */
val PAPEL_POR_POSICAO: Map<String, String> = mapOf(
    "GOL" to "GOL",
    "ZAG" to "DEF", "LD" to "DEF", "LE" to "DEF",
    "VOL" to "MEI", "MEI" to "MEI",
    "ED" to "ATA", "EE" to "ATA", "CA" to "ATA",
    "FIX" to "DEF", "ALA-D" to "MEI", "ALA-E" to "MEI", "PIV" to "ATA",
    "GR" to "GOL", "DD" to "DEF", "DC" to "DEF", "DE" to "DEF", "Z" to "DEF",
    "MD" to "MEI", "MC" to "MEI", "ME" to "MEI", "MOF" to "MEI", "M" to "MEI",
    "PL" to "ATA", "SA" to "ATA", "A" to "ATA",
)

private fun partesDoNome(nome: String?) = (nome ?: "").split(Regex("\\s+")).filter { it.isNotEmpty() }

/** Iniciais para quem não tem número ("Lucas Martins" → "LM", "Pelé" → "PE"). */
fun iniciaisDoAtleta(nome: String?): String {
    val p = partesDoNome(nome)
    if (p.isEmpty()) return "?"
    if (p.size == 1) return p[0].take(2).uppercase()
    return (p[0].take(1) + p.last().take(1)).uppercase()
}

/** Nome curto embaixo do círculo: o último nome. */
fun nomeCurto(nome: String?): String = partesDoNome(nome).lastOrNull() ?: (nome ?: "")

// ---------- desenho do campo (medidas oficiais, igual ao LineupField do web e ao PDF) ----------

sealed class PecaCampo {
    data class Retangulo(val x: Double, val y: Double, val l: Double, val a: Double, val cheio: Boolean) : PecaCampo()
    data class Linha(val x1: Double, val y1: Double, val x2: Double, val y2: Double) : PecaCampo()
    data class Circulo(val cx: Double, val cy: Double, val r: Double, val cheio: Boolean) : PecaCampo()
    /** Arco do SVG (`M x1 y1 A r r 0 0 varredura x2 y2`); varredura 1 = horário (tela). */
    data class Arco(val x1: Double, val y1: Double, val x2: Double, val y2: Double, val r: Double, val varredura: Int) : PecaCampo()
}

data class DesenhoCampo(
    val largura: Double, val altura: Double, val pecas: List<PecaCampo>,
    val faixas: Int, val corFundo: String, val corFaixa: String, val espessura: Double,
)

val CAMPO_FUTEBOL: DesenhoCampo = run {
    val W = 68.0; val H = 105.0; val cx = 34.0
    val paW = 40.32; val paD = 16.5; val gaW = 18.32; val gaD = 5.5; val pen = 11.0; val r = 9.15
    val arco = sqrt(r * r - (paD - pen) * (paD - pen))
    DesenhoCampo(W, H, listOf(
        PecaCampo.Retangulo(0.4, 0.4, W - 0.8, H - 0.8, false),
        PecaCampo.Linha(0.4, H / 2, W - 0.4, H / 2),
        PecaCampo.Circulo(cx, H / 2, r, false),
        PecaCampo.Retangulo(cx - paW / 2, 0.4, paW, paD - 0.4, false),
        PecaCampo.Retangulo(cx - gaW / 2, 0.4, gaW, gaD - 0.4, false),
        PecaCampo.Retangulo(cx - paW / 2, H - paD, paW, paD - 0.4, false),
        PecaCampo.Retangulo(cx - gaW / 2, H - gaD, gaW, gaD - 0.4, false),
        PecaCampo.Arco(cx - arco, paD, cx + arco, paD, r, 0),
        PecaCampo.Arco(cx - arco, H - paD, cx + arco, H - paD, r, 1),
        PecaCampo.Arco(0.4, 1.4, 1.4, 0.4, 1.0, 0),
        PecaCampo.Arco(W - 1.4, 0.4, W - 0.4, 1.4, 1.0, 0),
        PecaCampo.Arco(0.4, H - 1.4, 1.4, H - 0.4, 1.0, 1),
        PecaCampo.Arco(W - 1.4, H - 0.4, W - 0.4, H - 1.4, 1.0, 1),
        PecaCampo.Circulo(cx, H / 2, 0.45, true),
        PecaCampo.Circulo(cx, pen, 0.4, true),
        PecaCampo.Circulo(cx, H - pen, 0.4, true),
        PecaCampo.Retangulo(cx - 3.66, 0.0, 7.32, 0.6, true),
        PecaCampo.Retangulo(cx - 3.66, H - 0.6, 7.32, 0.6, true),
    ), 10, "#2c6f33", "#34803f", 0.35)
}

val QUADRA_FUTSAL = DesenhoCampo(100.0, 150.0, listOf(
    PecaCampo.Retangulo(3.0, 3.0, 94.0, 144.0, false),
    PecaCampo.Linha(3.0, 75.0, 97.0, 75.0),
    PecaCampo.Circulo(50.0, 75.0, 9.0, false),
    PecaCampo.Circulo(50.0, 75.0, 0.9, true),
    PecaCampo.Arco(22.0, 147.0, 78.0, 147.0, 28.0, 1),
    PecaCampo.Arco(22.0, 3.0, 78.0, 3.0, 28.0, 0),
    PecaCampo.Circulo(50.0, 135.0, 0.9, true),
    PecaCampo.Circulo(50.0, 15.0, 0.9, true),
    PecaCampo.Circulo(50.0, 119.0, 0.9, true),
    PecaCampo.Circulo(50.0, 31.0, 0.9, true),
    PecaCampo.Retangulo(44.0, 1.0, 12.0, 2.0, true),
    PecaCampo.Retangulo(44.0, 147.0, 12.0, 2.0, true),
), 0, "#1d4ed8", "#1e40af", 0.6)

fun desenhoDoCampo(modalidade: String?): DesenhoCampo = if (modalidade == "futsal") QUADRA_FUTSAL else CAMPO_FUTEBOL
