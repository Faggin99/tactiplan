package com.faggin.tactiplan.app.dados.quadro

import com.faggin.tactiplan.app.dados.elenco.dobrar
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

// QUADRO TÁTICO (T5): a jogada no MESMO formato do web (tactical_plays.keyframes), lida e gravada
// sem perder nada: peça/desenho/quadro guardam o objeto JSON inteiro e o app só mexe nas chaves
// que o web mexe. Paridade: quadro.json e TactiPlanKit/QuadroJogada.swift.

// ---------------------------------------------------------------- semântica do JavaScript

/** Número JSON como o JSON.stringify escreve (inteiro sem ".0"). */
fun num(v: Double): JsonPrimitive = if (v == Math.rint(v) && kotlin.math.abs(v) < 9.007199254740992E15) JsonPrimitive(v.toLong()) else JsonPrimitive(v)
fun num(v: Int): JsonPrimitive = JsonPrimitive(v)
fun txt(v: String): JsonPrimitive = JsonPrimitive(v)

private val RE_NUMERO = Regex("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$")

/** `Number(v)` do JS: número, texto numérico (vazio = 0), booleano 1/0, null = 0, ausente = NaN. */
fun numeroDoJs(v: JsonElement?): Double = when (v) {
    null -> Double.NaN
    is JsonNull -> 0.0
    is JsonPrimitive -> when {
        v.isString -> {
            val t = v.content.trim()
            when {
                t.isEmpty() -> 0.0
                t.lowercase().startsWith("0x") -> t.drop(2).toLongOrNull(16)?.toDouble() ?: Double.NaN
                t == "Infinity" || t == "+Infinity" -> Double.POSITIVE_INFINITY
                t == "-Infinity" -> Double.NEGATIVE_INFINITY
                RE_NUMERO.matches(t) -> t.toDoubleOrNull() ?: Double.NaN
                else -> Double.NaN
            }
        }
        v.booleanOrNull != null -> if (v.booleanOrNull == true) 1.0 else 0.0
        else -> v.doubleOrNull ?: Double.NaN
    }
    is JsonArray -> if (v.isEmpty()) 0.0 else if (v.size == 1) numeroDoJs(v[0]) else Double.NaN
    is JsonObject -> Double.NaN
}

/** `!!v` do JS. */
fun verdadeiroJs(v: JsonElement?): Boolean = when (v) {
    null, is JsonNull -> false
    is JsonPrimitive -> when {
        v.isString -> v.content.isNotEmpty()
        v.booleanOrNull != null -> v.booleanOrNull == true
        else -> (v.doubleOrNull ?: 0.0).let { it != 0.0 && !it.isNaN() }
    }
    else -> true
}

/** `a || padrao` para números. */
fun ouNumero(v: JsonElement?, padrao: Double): Double = if (verdadeiroJs(v)) numeroDoJs(v) else padrao

/** `a || padrao` para textos. */
fun ouTexto(v: JsonElement?, padrao: String): String =
    if (verdadeiroJs(v) && v is JsonPrimitive && v.isString) v.content else padrao

fun JsonElement?.texto(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** `parseInt(v, base)` do JS; null = NaN. */
fun parseIntJs(s: String, base: Int = 10): Int? {
    var t = s.trimStart()
    var sinal = 1
    if (t.startsWith("+") || t.startsWith("-")) { if (t[0] == '-') sinal = -1; t = t.drop(1) }
    if (base == 16 && t.lowercase().startsWith("0x")) t = t.drop(2)
    val digitos = t.takeWhile { Character.digit(it, base) >= 0 && it.code < 128 }
    if (digitos.isEmpty()) return null
    return sinal * (digitos.take(15).toLongOrNull(base)?.toInt() ?: return null)
}

/** `s.slice(0, n)` (unidades UTF-16 — igual ao String do Kotlin). */
fun fatiaJs(s: String, n: Int): String = if (s.length > n) s.substring(0, n) else s

// ---------------------------------------------------------------- peças, desenhos e quadros

/** Peça do campo: jogador (`player`), bola (`ball`) ou objeto (`marker`). */
data class Peca(val dados: Map<String, JsonElement>) {
    val id: String get() = dados["id"].texto().orEmpty()
    val tipo: String get() = dados["type"].texto().orEmpty()
    val time: String? get() = dados["team"].texto()
    val x: Double get() = numeroDoJs(dados["x"])
    val y: Double get() = numeroDoJs(dados["y"])
    val camisa: JsonElement? get() = dados["jerseyNumber"]
    /** `String(jerseyNumber)` do web (ausente = ""). */
    val camisaTexto: String get() = when (val c = dados["jerseyNumber"]) {
        null -> ""
        is JsonNull -> "null"
        is JsonPrimitive -> if (c.isString) c.content else c.doubleOrNull?.let { numeroJs(it) } ?: c.content
        else -> ""
    }
    val nome: String get() = dados["name"].texto().orEmpty()
    val goleiro: Boolean get() = verdadeiroJs(dados["isGoalkeeper"])
    val atletaId: String? get() = dados["athleteId"].texto()
    val marcador: String get() = dados["markerType"].texto() ?: "cone"
    val rotacao: Double get() = ouNumero(dados["rotation"], 0.0)

    fun comPosicao(x: Double, y: Double) = Peca(dados + mapOf("x" to num(x), "y" to num(y)))
    fun com(patch: Map<String, JsonElement>) = Peca(dados + patch)
}

/** Desenho: seta reta/curva, livre, zona retangular/circular ou texto (`drawType`). */
data class Desenho(val dados: Map<String, JsonElement>) {
    val id: String get() = dados["id"].texto().orEmpty()
    val tipo: String get() = dados["drawType"].texto().orEmpty()
    fun n(k: String): Double = numeroDoJs(dados[k])
    /** `element.k || padrao`. */
    fun n(k: String, ou: Double): Double = ouNumero(dados[k], ou)
    fun t(k: String): String? = dados[k].texto()
    val tracejado: List<Double> get() = (dados["dash"] as? JsonArray)?.map { numeroDoJs(it) }.orEmpty()
    val pontos: List<Double> get() = (dados["points"] as? JsonArray)?.map { numeroDoJs(it) }.orEmpty()
    val texto: String get() = dados["text"].texto().orEmpty()
    fun com(patch: Map<String, JsonElement>) = Desenho(dados + patch)
}

/** Um quadro (keyframe): `index`, `elements`, `drawings` e qualquer outra chave que vier. */
data class QuadroJogada(val extras: Map<String, JsonElement>, val elementos: List<Peca>, val desenhos: List<Desenho>) {
    constructor(indice: Int, elementos: List<Peca> = emptyList(), desenhos: List<Desenho> = emptyList()) :
        this(mapOf("index" to num(indice)), elementos, desenhos)

    val indice: Int get() = numeroDoJs(extras["index"]).toInt()

    fun json(): JsonObject = JsonObject(
        extras + mapOf(
            "elements" to JsonArray(elementos.map { JsonObject(it.dados) }),
            "drawings" to JsonArray(desenhos.map { JsonObject(it.dados) }),
        ),
    )

    companion object {
        fun de(j: JsonElement?): QuadroJogada {
            val o = (j as? JsonObject) ?: JsonObject(emptyMap())
            fun objetos(k: String) = (o[k] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
            return QuadroJogada(o - "elements" - "drawings", objetos("elements").map { Peca(it) }, objetos("drawings").map { Desenho(it) })
        }
    }
}

// ---------------------------------------------------------------- interpolação

fun lerp(a: Double, b: Double, t: Double): Double = a + (b - a) * t

/** interpolateElements: peças de A andando para as posições de B (sem par em B: fica parada). */
fun interpolarPecas(a: QuadroJogada?, b: QuadroJogada?, t: Double): List<Peca> {
    if (a == null) return emptyList()
    if (b == null) return a.elementos
    val porId = HashMap<String, Peca>()
    for (e in b.elementos) porId.putIfAbsent(e.id, e)
    return a.elementos.map { ea ->
        val eb = porId[ea.id] ?: return@map ea
        ea.comPosicao(lerp(ea.x, eb.x, t), lerp(ea.y, eb.y, t))
    }
}

// ---------------------------------------------------------------- formações

data class PosicaoFormacao(val x: Double, val y: Double, val camisa: Int, val nome: String, val goleiro: Boolean = false)
data class Formacao(val chave: String, val rotulo: String, val posicoes: List<PosicaoFormacao>)

private fun p(x: Int, y: Int, n: Int, nome: String, gk: Boolean = false) = PosicaoFormacao(x.toDouble(), y.toDouble(), n, nome, gk)

val FORMACOES_F11 = listOf(
    Formacao("4-4-2", "4-4-2", listOf(
        p(5, 50, 1, "GOL", true), p(20, 15, 2, "LD"), p(20, 38, 4, "ZAG"), p(20, 62, 3, "ZAG"), p(20, 85, 6, "LE"),
        p(45, 15, 7, "MEI"), p(45, 38, 8, "VOL"), p(45, 62, 5, "VOL"), p(45, 85, 11, "MEI"), p(70, 35, 9, "CA"), p(70, 65, 10, "CA"),
    )),
    Formacao("4-3-3", "4-3-3", listOf(
        p(5, 50, 1, "GOL", true), p(20, 15, 2, "LD"), p(20, 38, 4, "ZAG"), p(20, 62, 3, "ZAG"), p(20, 85, 6, "LE"),
        p(45, 25, 8, "VOL"), p(45, 50, 5, "MEI"), p(45, 75, 10, "MEI"), p(72, 15, 7, "ED"), p(75, 50, 9, "CA"), p(72, 85, 11, "EE"),
    )),
    Formacao("3-5-2", "3-5-2", listOf(
        p(5, 50, 1, "GOL", true), p(20, 25, 4, "ZAG"), p(20, 50, 3, "ZAG"), p(20, 75, 5, "ZAG"), p(40, 8, 2, "LD"),
        p(42, 35, 8, "VOL"), p(42, 50, 10, "MEI"), p(42, 65, 6, "VOL"), p(40, 92, 11, "LE"), p(70, 35, 9, "CA"), p(70, 65, 7, "CA"),
    )),
)

val FORMACOES_F7 = listOf(
    Formacao("1-3-2-1", "3-2-1 (clássica)", listOf(
        p(5, 50, 1, "GOL", true), p(25, 20, 2, "ZAG"), p(25, 50, 3, "ZAG"), p(25, 80, 4, "ZAG"),
        p(50, 30, 5, "MEI"), p(50, 70, 6, "MEI"), p(75, 50, 7, "CA"),
    )),
    Formacao("1-2-3-1", "2-3-1", listOf(
        p(5, 50, 1, "GOL", true), p(25, 30, 2, "ZAG"), p(25, 70, 3, "ZAG"), p(50, 20, 4, "LD"),
        p(50, 50, 5, "MEI"), p(50, 80, 6, "LE"), p(75, 50, 7, "CA"),
    )),
    Formacao("1-3-1-2", "3-1-2", listOf(
        p(5, 50, 1, "GOL", true), p(25, 20, 2, "ZAG"), p(25, 50, 3, "ZAG"), p(25, 80, 4, "ZAG"),
        p(50, 50, 5, "MEI"), p(75, 30, 6, "CA"), p(75, 70, 7, "CA"),
    )),
)

val FORMACOES_FUTSAL = listOf(
    Formacao("1-2-2", "1-2-2", listOf(p(5, 50, 1, "GOL", true), p(30, 30, 2, "FIX"), p(30, 70, 3, "FIX"), p(60, 30, 4, "ALA"), p(60, 70, 5, "ALA"))),
    Formacao("2-2", "2-2 (Quadrado)", listOf(p(5, 50, 1, "GOL", true), p(30, 25, 2, "FIX"), p(30, 75, 3, "FIX"), p(60, 25, 4, "PIV"), p(60, 75, 5, "ALA"))),
    Formacao("1-2-1", "1-2-1 (Losango)", listOf(p(5, 50, 1, "GOL", true), p(25, 50, 2, "FIX"), p(45, 25, 3, "ALA"), p(45, 75, 4, "ALA"), p(65, 50, 5, "PIV"))),
)

fun formacoesDoCampo(tipo: String?): List<Formacao> = when (tipo) {
    TipoCampo.FUTSAL -> FORMACOES_FUTSAL
    TipoCampo.FUTEBOL_7 -> FORMACOES_F7
    else -> FORMACOES_F11
}

/** mirrorFormation: rotação de 180° (x e y) para o Time B. */
fun espelharFormacao(p: List<PosicaoFormacao>) = p.map { it.copy(x = 100 - it.x, y = 100 - it.y) }

enum class AlvoFormacao(val id: String) { A("A"), B("B"), AMBOS("both") }

data class AplicacaoFormacao(val time: String, val posicoes: List<PosicaoFormacao>)

fun aplicacoesDaFormacao(f: Formacao, alvo: AlvoFormacao): List<AplicacaoFormacao> = buildList {
    if (alvo == AlvoFormacao.A || alvo == AlvoFormacao.AMBOS) add(AplicacaoFormacao("A", f.posicoes))
    if (alvo == AlvoFormacao.B || alvo == AlvoFormacao.AMBOS) add(AplicacaoFormacao("B", espelharFormacao(f.posicoes)))
}

data class ResultadoFormacao(val reposicionados: Int, val adicionados: Int, val mantidos: Int)

fun avisoFormacao(f: Formacao, alvo: AlvoFormacao, r: ResultadoFormacao): String {
    val alvoTexto = when (alvo) { AlvoFormacao.AMBOS -> "aos dois times"; AlvoFormacao.B -> "ao Time B"; else -> "ao Time A" }
    val k = r.mantidos
    val sufixo = if (k > 0) " · $k jogador${if (k > 1) "es" else ""} mantido${if (k > 1) "s" else ""} fora da formação" else ""
    return "${f.rotulo} aplicada $alvoTexto$sufixo"
}

// ---------------------------------------------------------------- jogada salva (/api/plays)

data class Jogada(val bruto: JsonObject) {
    val id: String get() = bruto["id"].texto().orEmpty()
    val nome: String get() = bruto["name"].texto().orEmpty()
    val descricao: String get() = bruto["description"].texto().orEmpty()
    val tipoCampo: String get() = ouTexto(bruto["field_type"], TipoCampo.FUTEBOL_11)
    val vista: String get() = ouTexto(bruto["field_view"], VistaCampo.INTEIRO)
    val clubeId: String? get() = bruto["club_id"].texto()
    val clubeNome: String? get() = bruto["club_name"].texto()
    val atualizadaEm: String? get() = bruto["updated_at"].texto() ?: bruto["created_at"].texto()
    val quadros: List<QuadroJogada> get() = (bruto["keyframes"] as? JsonArray)?.map { QuadroJogada.de(it) }.orEmpty()
    val totalQuadros: Int get() = (bruto["keyframes"] as? JsonArray)?.size ?: 0
}

fun jogadasDaResposta(j: JsonElement): List<Jogada> {
    val l = (j as? JsonArray) ?: ((j as? JsonObject)?.get("data") as? JsonArray) ?: return emptyList()
    return l.mapNotNull { (it as? JsonObject)?.let(::Jogada) }
}

/** Busca: nome ou descrição, sem acento e sem caixa. */
fun filtrarJogadas(lista: List<Jogada>, busca: String): List<Jogada> {
    val q = dobrar(busca.trim())
    if (q.isEmpty()) return lista
    return lista.filter { dobrar(it.nome).contains(q) || dobrar(it.descricao).contains(q) }
}

/** "3 quadros · 22/10/2026 · criada em Demo FC". */
fun resumoJogada(j: Jogada, fuso: ZoneId = ZoneId.systemDefault()): String {
    val partes = mutableListOf("${j.totalQuadros} ${if (j.totalQuadros == 1) "quadro" else "quadros"}")
    dataCurtaJogada(j.atualizadaEm, fuso)?.let { partes.add(it) }
    j.clubeNome?.takeIf { it.isNotEmpty() }?.let { partes.add("criada em $it") }
    return partes.joinToString(" · ")
}

private val DD_MM_AAAA = DateTimeFormatter.ofPattern("dd/MM/yyyy")

fun dataCurtaJogada(iso: String?, fuso: ZoneId = ZoneId.systemDefault()): String? {
    if (iso.isNullOrEmpty()) return null
    return try {
        Instant.parse(iso).atZone(fuso).toLocalDate().format(DD_MM_AAAA)
    } catch (_: Exception) {
        try { LocalDate.parse(iso.take(10)).format(DD_MM_AAAA) } catch (_: Exception) { null }
    }
}
