package com.faggin.tactiplan.app.dados.elenco

import java.text.Collator
import java.util.Locale

// CAMPOGRAMA (web: aba Campograma do Plantel; servidor: backend-node/src/reports/campograma.js): o elenco no campo
// EM PÉ (ataque para cima), cada atleta empilhado no lugar da posição; zagueiros divididos pelo lado preferido.
// Paridade: native/paridade/campograma.json (gerar-campograma.js) · TactiPlanKit/Campograma.swift.

private data class Lugar(val x: Double, val y: Double)

private val LUGAR_F11 = linkedMapOf(
    "GOL" to Lugar(4.0, 50.0),
    "ZAG-E" to Lugar(22.0, 30.0), "ZAG-A" to Lugar(22.0, 50.0), "ZAG-D" to Lugar(22.0, 70.0),
    "LE" to Lugar(31.0, 8.0), "LD" to Lugar(31.0, 92.0),
    "VOL" to Lugar(44.0, 50.0), "VOL2" to Lugar(55.0, 36.0), "MEI" to Lugar(66.0, 58.0),
    "EE" to Lugar(78.0, 10.0), "ED" to Lugar(78.0, 90.0),
    "CA" to Lugar(91.0, 50.0),
)
private val LUGAR_FUTSAL = linkedMapOf(
    "GOL" to Lugar(6.0, 50.0), "FIX" to Lugar(30.0, 50.0), "ALA-E" to Lugar(56.0, 15.0), "ALA-D" to Lugar(56.0, 85.0), "PIV" to Lugar(86.0, 50.0),
)
private val SINONIMO = mapOf("GR" to "GOL", "DC" to "ZAG", "Z" to "ZAG", "DD" to "LD", "DE" to "LE", "MC" to "VOL", "MD" to "MEI",
    "ME" to "MEI", "MOF" to "MEI", "M" to "MEI", "PL" to "CA", "SA" to "CA", "A" to "CA")
private val NOMES = mapOf(
    "GOL" to "Goleiros", "ZAG-E" to "Zagueiros · esquerda", "ZAG-A" to "Zagueiros", "ZAG-D" to "Zagueiros · direita",
    "LE" to "Lateral esquerdo", "LD" to "Lateral direito", "VOL" to "1º volante", "VOL2" to "2º volante", "MEI" to "Meia",
    "EE" to "Extremo esquerdo", "ED" to "Extremo direito", "CA" to "Centroavante",
    "FIX" to "Fixo", "ALA-E" to "Ala esquerdo", "ALA-D" to "Ala direito", "PIV" to "Pivô",
)

/** Âncora do grupo no eixo: perto da linha encosta na borda (não corta). */
enum class Ancora(val css: String) { INICIO("0%"), MEIO("-50%"), FIM("-100%") }

data class AtletaNoCampo(val id: String, val nome: String, val numero: Int?, val dm: Boolean, val transicao: Boolean)

/** `left`/`top` em % do campo em pé; `ax`/`ay` dizem de que ponto do grupo é a coordenada. */
data class ZonaCampo(val chave: String, val nome: String, val left: Double, val top: Double, val ax: Ancora, val ay: Ancora, val atletas: List<AtletaNoCampo>)

data class Campograma(val zonas: List<ZonaCampo>, val semLugar: List<Atleta>)

/** "Carlos Alberto Souza" → "Carlos S." */
fun nomeCurto(n: String?): String {
    val p = n.orEmpty().trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }
    return if (p.size > 1) "${p[0]} ${p.last().first()}." else p.firstOrNull() ?: ""
}

private fun noDm(a: Atleta) = a.status == "injured" || a.grupo == "DM"
private fun emTransicao(a: Atleta) = !noDm(a) && a.grupo == "Transição"

private fun chaveDe(a: Atleta, futsal: Boolean): String? {
    val raw = a.posicao.orEmpty().trim().uppercase()
    val code = SINONIMO[raw] ?: raw
    if (futsal) return code.takeIf { LUGAR_FUTSAL.containsKey(it) }
    if (code == "ZAG") return when (a.lado) { "direita" -> "ZAG-D"; "esquerda" -> "ZAG-E"; else -> "ZAG-A" }
    return code.takeIf { LUGAR_F11.containsKey(it) }
}

private fun eixo(v: Double): Pair<Double, Ancora> = when {
    v < 12 -> 1.5 to Ancora.INICIO
    v > 88 -> 98.5 to Ancora.FIM
    else -> v to Ancora.MEIO
}

fun montarCampograma(atletas: List<Atleta>, modalidade: String?): Campograma {
    val futsal = modalidade == "futsal"
    val lugares = if (futsal) LUGAR_FUTSAL else LUGAR_F11
    val grupos = linkedMapOf<String, MutableList<Atleta>>()
    val semLugar = mutableListOf<Atleta>()
    for (a in atletas) {
        val k = chaveDe(a, futsal)
        if (k == null) semLugar += a else grupos.getOrPut(k) { mutableListOf() } += a
    }
    val col = Collator.getInstance(Locale.forLanguageTag("pt-BR"))
    val zonas = lugares.mapNotNull { (k, p) ->
        val lista = grupos[k]?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val ord = lista.sortedWith(compareBy<Atleta>({ if (noDm(it)) 1 else 0 }, { it.camisa ?: 999 }).thenComparator { x, y -> col.compare(x.nome, y.nome) })
        val (left, ax) = eixo(p.y)
        val (top, ay) = eixo(100 - p.x)
        ZonaCampo(k, NOMES[k] ?: k, left, top, ax, ay, ord.map { AtletaNoCampo(it.id, nomeCurto(it.nome), it.camisa, noDm(it), emTransicao(it)) })
    }
    return Campograma(zonas, semLugar)
}
