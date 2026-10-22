package com.faggin.tactiplan.app.dados.quadro

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

// QUADRO TÁTICO (T5): ferramentas de desenho, catálogos, regras do painel de seleção, toque nas
// peças, curva do desenho livre (Konva) e ritmo do play/vídeo — tudo do web.
// Paridade: quadro.json e TactiPlanKit/QuadroDesenho.swift.

// ---------------------------------------------------------------- catálogos

data class FerramentaSeta(val id: String, val modo: String, val tracejado: List<Double>, val rotulo: String, val descricao: String, val cor: String)

val FERRAMENTAS_SETA = listOf(
    FerramentaSeta("arrow_run", "arrow_straight", emptyList(), "Corrida", "Seta contínua", "#ffffff"),
    FerramentaSeta("arrow_pass", "arrow_straight", listOf(8.0, 5.0), "Passe", "Seta tracejada", "#fbbf24"),
    FerramentaSeta("arrow_dribble", "arrow_straight", listOf(3.0, 3.0), "Drible", "Seta pontilhada", "#22c55e"),
    FerramentaSeta("arrow_curved", "arrow_curved", emptyList(), "Curva", "Seta curva", "#ffffff"),
)

val FERRAMENTAS_DESENHO = listOf("free_draw" to "Desenho livre", "zone_rect" to "Zona retangular", "zone_circle" to "Zona circular", "text" to "Texto")

data class TipoObjeto(val tipo: String, val rotulo: String, val icone: String)

val TIPOS_OBJETO = listOf(
    TipoObjeto("cone", "Cone baixo", "▲"), TipoObjeto("cone_tall", "Cone alto", "⧋"), TipoObjeto("disc", "Disco", "●"),
    TipoObjeto("barrier", "Barreira", "▬"), TipoObjeto("pole", "Estaca", "│"), TipoObjeto("flag", "Bandeira", "⚑"),
    TipoObjeto("ladder", "Escada", "☰"), TipoObjeto("mannequin", "Manequim", "♟"), TipoObjeto("hoop", "Arco", "○"),
    TipoObjeto("mini_goal", "Mini gol", "⊓"),
)

val OBJETOS_QUE_GIRAM = setOf("barrier", "pole", "flag", "ladder", "mannequin", "mini_goal")

val VISTAS_CAMPO = listOf(
    VistaCampo.INTEIRO to "Campo inteiro", VistaCampo.METADE_ESQUERDA to "Metade esquerda", VistaCampo.METADE_DIREITA to "Metade direita",
    VistaCampo.TERCO_ESQUERDO to "Terço esquerdo", VistaCampo.TERCO_DIREITO to "Terço direito",
)

val TIPOS_CAMPO = listOf(TipoCampo.FUTEBOL_11 to "Futebol 11", TipoCampo.FUTEBOL_7 to "Futebol 7", TipoCampo.FUTSAL to "Futsal")

fun rotuloTipoCampo(t: String) = TIPOS_CAMPO.firstOrNull { it.first == t }?.second ?: t
fun rotuloVista(v: String) = VISTAS_CAMPO.firstOrNull { it.first == v }?.second ?: v

val CORES_DESENHO = listOf("#ffffff", "#fbbf24", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ec4899")
val VELOCIDADES_QUADRO = listOf(0.5, 1.0, 1.5, 2.0)

fun rotuloModo(m: String) = when (m) {
    "arrow_straight" -> "Seta reta"; "arrow_curved" -> "Seta curva"; "free_draw" -> "Desenho livre"
    "zone_rect" -> "Zona retangular"; "zone_circle" -> "Zona circular"; "text" -> "Texto"; else -> m
}

// ---------------------------------------------------------------- cores

/** hexToRgba do TacticalCanvas (cor que não é #rrggbb vira branco). */
fun hexParaRgba(hex: String?, alfa: Double): String {
    if (hex == null || !hex.startsWith("#") || hex.length < 7) return "rgba(255,255,255,${numeroJs(alfa)})"
    fun canal(i: Int) = parseIntJs(hex.substring(i, i + 2), 16)?.toString() ?: "NaN"
    return "rgba(${canal(1)},${canal(3)},${canal(5)},${numeroJs(alfa)})"
}

/** Cor CSS → RGBA 0…1 (o que o desenho nativo pinta). */
data class CorRGBA(val r: Double, val g: Double, val b: Double, val a: Double = 1.0) {
    fun comAlfa(f: Double) = copy(a = a * f)
    /** ARGB do android.graphics. */
    fun argb(): Int = ((a.coerceIn(0.0, 1.0) * 255 + 0.5).toInt() shl 24) or ((r * 255 + 0.5).toInt() shl 16) or
        ((g * 255 + 0.5).toInt() shl 8) or (b * 255 + 0.5).toInt()
}

private val CORES_NOMEADAS = mapOf(
    "white" to CorRGBA(1.0, 1.0, 1.0), "black" to CorRGBA(0.0, 0.0, 0.0), "red" to CorRGBA(1.0, 0.0, 0.0),
    "yellow" to CorRGBA(1.0, 1.0, 0.0), "blue" to CorRGBA(0.0, 0.0, 1.0), "green" to CorRGBA(0.0, 128.0 / 255, 0.0),
    "orange" to CorRGBA(1.0, 165.0 / 255, 0.0), "transparent" to CorRGBA(0.0, 0.0, 0.0, 0.0),
)

fun corCss(s: String?): CorRGBA? {
    val raw = s?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
    CORES_NOMEADAS[raw]?.let { return it }
    if (raw.startsWith("#")) {
        val h = raw.drop(1)
        fun v(a: Int, n: Int): Double? = h.substring(a, a + n).toIntOrNull(16)?.let { it.toDouble() / (if (n == 1) 15 else 255) }
        return when (h.length) {
            3, 4 -> { val r = v(0, 1) ?: return null; val g = v(1, 1) ?: return null; val b = v(2, 1) ?: return null; CorRGBA(r, g, b, if (h.length == 4) v(3, 1) ?: 1.0 else 1.0) }
            6, 8 -> { val r = v(0, 2) ?: return null; val g = v(2, 2) ?: return null; val b = v(4, 2) ?: return null; CorRGBA(r, g, b, if (h.length == 8) v(6, 2) ?: 1.0 else 1.0) }
            else -> null
        }
    }
    if (raw.startsWith("rgb")) {
        val a = raw.indexOf('('); val b = raw.lastIndexOf(')')
        if (a < 0 || b < a) return null
        val p = raw.substring(a + 1, b).split(",").map { it.trim() }
        if (p.size < 3) return null
        val r = p[0].toDoubleOrNull() ?: return null; val g = p[1].toDoubleOrNull() ?: return null; val bl = p[2].toDoubleOrNull() ?: return null
        val alfa = if (p.size >= 4) p[3].toDoubleOrNull() ?: 1.0 else 1.0
        return CorRGBA(r / 255, g / 255, bl / 255, alfa.coerceIn(0.0, 1.0))
    }
    return null
}

// ---------------------------------------------------------------- desenhar com o dedo

/** O traço em andamento (buildDraft / finishDrawing do TacticalCanvas). */
data class RascunhoDesenho(
    val modo: String,
    val cor: String,
    val tracejado: List<Double>,
    val espessura: Double = 2.5,
    val inicioX: Double,
    val inicioY: Double,
    val fimX: Double = inicioX,
    val fimY: Double = inicioY,
    val pontos: List<Double> = if (modo == "free_draw") listOf(inicioX, inicioY) else emptyList(),
) {
    fun mover(x: Double, y: Double) = copy(fimX = x, fimY = y, pontos = if (modo == "free_draw") pontos + listOf(x, y) else pontos)

    fun previa(dims: DimensoesCanvas?): Desenho? = montar(fimX, fimY, dims, final = false)?.let(::Desenho)

    /** Soltar: fim preso à tela (margem 4 px); < 8 px não vale (exceto livre, que precisa de 2 pontos). */
    fun terminar(x: Double, y: Double, dims: DimensoesCanvas): Map<String, JsonElement>? {
        val (px, py) = prender(x, y, limitesArrasto(dims, 4.0))
        if (modo != "free_draw" && distanciaPx(inicioX, inicioY, px, py, dims) < 8) return null
        if (modo == "free_draw" && pontos.size < 4) return null
        return montar(px, py, dims, final = true)
    }

    private fun montar(x2: Double, y2: Double, dims: DimensoesCanvas?, final: Boolean): Map<String, JsonElement>? {
        val x1 = inicioX; val y1 = inicioY
        val tr = JsonArray(tracejado.map { num(it) })
        return when (modo) {
            "arrow_straight" -> mapOf("drawType" to txt("arrow_straight"), "x1" to num(x1), "y1" to num(y1), "x2" to num(x2), "y2" to num(y2),
                "color" to txt(cor), "strokeWidth" to num(espessura), "dash" to tr)
            "arrow_curved" -> { val (cx, cy) = controleCurva(x1, y1, x2, y2)
                mapOf("drawType" to txt("arrow_curved"), "x1" to num(x1), "y1" to num(y1), "x2" to num(x2), "y2" to num(y2),
                    "cx" to num(cx), "cy" to num(cy), "color" to txt(cor), "strokeWidth" to num(espessura), "dash" to tr) }
            "free_draw" -> buildMap<String, JsonElement> {
                put("drawType", txt("free_draw")); put("points", JsonArray(pontos.map { num(it) })); put("color", txt(cor))
                put("strokeWidth", num(espessura)); if (!final) put("dash", tr)
            }
            "zone_rect" -> mapOf("drawType" to txt("zone_rect"), "x" to num(min(x1, x2)), "y" to num(min(y1, y2)),
                "w" to num(abs(x2 - x1)), "h" to num(abs(y2 - y1)), "color" to txt(hexParaRgba(cor, 0.15)), "strokeColor" to txt(hexParaRgba(cor, 0.5)))
            "zone_circle" -> mapOf("drawType" to txt("zone_circle"), "cx" to num(x1), "cy" to num(y1),
                "radius" to num(if (dims == null) 0.0 else raioZonaPct(x1, y1, x2, y2, dims)),
                "color" to txt(hexParaRgba(cor, 0.15)), "strokeColor" to txt(hexParaRgba(cor, 0.5)))
            else -> null
        }
    }
}

fun controleCurva(x1: Double, y1: Double, x2: Double, y2: Double): Pair<Double, Double> =
    ((x1 + x2) / 2 - (y2 - y1) * 0.3) to ((y1 + y2) / 2 + (x2 - x1) * 0.3)

fun raioZonaPct(x1: Double, y1: Double, x2: Double, y2: Double, d: DimensoesCanvas) = paraPercentual(distanciaPx(x1, y1, x2, y2, d), d.altura)

fun distanciaPx(x1: Double, y1: Double, x2: Double, y2: Double, d: DimensoesCanvas): Double {
    val dx = paraPixel(x2 - x1, d.largura); val dy = paraPixel(y2 - y1, d.altura)
    return sqrt(dx * dx + dy * dy)
}

fun dadosTexto(valor: String, x: Double, y: Double, cor: String): Map<String, JsonElement>? {
    val v = valor.trim().ifEmpty { return null }
    return mapOf("drawType" to txt("text"), "x" to num(x), "y" to num(y), "text" to txt(fatiaJs(v, 60)), "color" to txt(cor), "fontSize" to num(14))
}

fun patchCorDesenho(d: Desenho, cor: String): Map<String, JsonElement> =
    if (d.tipo.startsWith("zone")) mapOf("color" to txt(hexParaRgba(cor, 0.15)), "strokeColor" to txt(hexParaRgba(cor, 0.5)))
    else mapOf("color" to txt(cor))

fun corMarcada(d: Desenho, cor: String): Boolean {
    if (d.t("color") == cor) return true
    val rgb = hexParaRgba(cor, 1.0).drop(5).split(",").take(3).joinToString(",")
    return d.t("strokeColor")?.contains(rgb) == true
}

fun desenhoTemEspessura(d: Desenho) = d.tipo in setOf("arrow_straight", "arrow_curved", "free_draw")

// ---------------------------------------------------------------- painel de seleção

fun camisaConfirmada(valor: String, atual: JsonElement?): Int? {
    val n = parseIntJs(valor) ?: return null
    if (n < 1 || n > 99) return null
    val a = atual as? JsonPrimitive
    if (a != null && !a.isString && a.content != "true" && a.content != "false" && a.content.toDoubleOrNull() == n.toDouble()) return null
    return n
}

fun nomeConfirmado(valor: String) = fatiaJs(valor.trim(), 12)

fun girar(rotacao: Double, delta: Double): Double = (((rotacao + delta) % 360) + 360) % 360

fun nomeNoToken(nome: String) = if (nome.length > 10) fatiaJs(nome, 9) + "…" else nome

// ---------------------------------------------------------------- tokens e toque

const val RAIO_JOGADOR = 16.0
const val RAIO_BOLA = 10.0

fun raioDeToque(p: Peca) = when (p.tipo) { "player" -> RAIO_JOGADOR + 8; "ball" -> RAIO_BOLA + 10; else -> 22.0 }

/** Peça sob o dedo (a de cima primeiro). px, py no sistema do retângulo de linhas. */
fun pecaNoPonto(pecas: List<Peca>, px: Double, py: Double, d: DimensoesCanvas): Peca? {
    var melhor: Pair<Peca, Double>? = null
    for (p in pecas.asReversed()) {
        val dx = paraPixel(p.x, d.largura) - px; val dy = paraPixel(p.y, d.altura) - py
        val dist = sqrt(dx * dx + dy * dy)
        if (dist <= raioDeToque(p) && (melhor == null || dist < melhor.second - 6)) melhor = p to dist
    }
    return melhor?.first
}

private fun distSegmento(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
    val vx = bx - ax; val vy = by - ay
    val l2 = vx * vx + vy * vy
    val t = (if (l2 == 0.0) 0.0 else ((px - ax) * vx + (py - ay) * vy) / l2).coerceIn(0.0, 1.0)
    val cx = ax + t * vx - px; val cy = ay + t * vy - py
    return sqrt(cx * cx + cy * cy)
}

fun pontosQuadratica(x0: Double, y0: Double, cx: Double, cy: Double, x1: Double, y1: Double, passos: Int = 16): List<Pair<Double, Double>> =
    (0..passos).map { i ->
        val t = i.toDouble() / passos; val u = 1 - t
        (u * u * x0 + 2 * u * t * cx + t * t * x1) to (u * u * y0 + 2 * u * t * cy + t * t * y1)
    }

fun curvaDaSeta(z: Desenho): Pair<Double, Double> {
    val x1 = z.n("x1"); val y1 = z.n("y1"); val x2 = z.n("x2"); val y2 = z.n("y2")
    return z.n("cx", (x1 + x2) / 2) to z.n("cy", (y1 + y2) / 2 - 15)
}

fun desenhoNoPonto(desenhos: List<Desenho>, px: Double, py: Double, d: DimensoesCanvas, folga: Double = 12.0): Desenho? {
    fun X(v: Double) = paraPixel(v, d.largura)
    fun Y(v: Double) = paraPixel(v, d.altura)
    for (z in desenhos.asReversed()) {
        when (z.tipo) {
            "arrow_straight" -> if (distSegmento(px, py, X(z.n("x1")), Y(z.n("y1")), X(z.n("x2")), Y(z.n("y2"))) <= folga) return z
            "arrow_curved" -> {
                val (cx, cy) = curvaDaSeta(z)
                val pts = pontosQuadratica(X(z.n("x1")), Y(z.n("y1")), X(cx), Y(cy), X(z.n("x2")), Y(z.n("y2")))
                for (i in 1 until pts.size) if (distSegmento(px, py, pts[i - 1].first, pts[i - 1].second, pts[i].first, pts[i].second) <= folga) return z
            }
            "free_draw" -> {
                val p = z.pontos
                var i = 2
                while (i + 1 < p.size) {
                    if (distSegmento(px, py, X(p[i - 2]), Y(p[i - 1]), X(p[i]), Y(p[i + 1])) <= folga) return z
                    i += 2
                }
            }
            "zone_rect" -> {
                val x = X(z.n("x")); val y = Y(z.n("y")); val w = X(z.n("w")); val h = Y(z.n("h"))
                if (px >= x - folga / 2 && px <= x + w + folga / 2 && py >= y - folga / 2 && py <= y + h + folga / 2) return z
            }
            "zone_circle" -> {
                val dx = px - X(z.n("cx")); val dy = py - Y(z.n("cy"))
                if (sqrt(dx * dx + dy * dy) <= Y(z.n("radius")) + folga / 2) return z
            }
            "text" -> {
                val x = X(z.n("x")); val y = Y(z.n("y")); val fs = z.n("fontSize", 14.0)
                val w = z.texto.length * fs * 0.6
                if (px >= x - 6 && px <= x + w + 6 && py >= y - 6 && py <= y + fs + 8) return z
            }
        }
    }
    return null
}

fun desenhoArrastavel(z: Desenho) = z.tipo == "zone_rect" || z.tipo == "text"

// ---------------------------------------------------------------- desenho livre (Konva)

fun pontosDeTensao(p: List<Double>, tensao: Double): List<Double> {
    val r = ArrayList<Double>()
    var n = 2
    while (n < p.size - 2) {
        val x0 = p[n - 2]; val y0 = p[n - 1]; val x1 = p[n]; val y1 = p[n + 1]; val x2 = p[n + 2]; val y2 = p[n + 3]
        val d01 = sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0))
        val d12 = sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))
        val fa = (tensao * d01) / (d01 + d12); val fb = (tensao * d12) / (d01 + d12)
        val p1x = x1 - fa * (x2 - x0); val p1y = y1 - fa * (y2 - y0); val p2x = x1 + fb * (x2 - x0); val p2y = y1 + fb * (y2 - y0)
        n += 2
        if (p1x.isNaN()) continue
        r.addAll(listOf(p1x, p1y, x1, y1, p2x, p2y))
    }
    return r
}

sealed class PassoCaminho {
    data class Mover(val x: Double, val y: Double) : PassoCaminho()
    data class Linha(val x: Double, val y: Double) : PassoCaminho()
    data class Quadratica(val cx: Double, val cy: Double, val x: Double, val y: Double) : PassoCaminho()
    data class Cubica(val c1x: Double, val c1y: Double, val c2x: Double, val c2y: Double, val x: Double, val y: Double) : PassoCaminho()
}

fun caminhoLivre(p: List<Double>, tensao: Double = 0.3): List<PassoCaminho> {
    if (p.size < 2) return emptyList()
    val r = mutableListOf<PassoCaminho>(PassoCaminho.Mover(p[0], p[1]))
    val tp = pontosDeTensao(p, tensao)
    if (tensao != 0.0 && p.size > 4 && tp.size >= 4) {
        val len = tp.size
        r.add(PassoCaminho.Quadratica(tp[0], tp[1], tp[2], tp[3]))
        var n = 4
        while (n < len - 2) { r.add(PassoCaminho.Cubica(tp[n], tp[n + 1], tp[n + 2], tp[n + 3], tp[n + 4], tp[n + 5])); n += 6 }
        r.add(PassoCaminho.Quadratica(tp[len - 2], tp[len - 1], p[p.size - 2], p[p.size - 1]))
    } else {
        var n = 2
        while (n + 1 < p.size) { r.add(PassoCaminho.Linha(p[n], p[n + 1])); n += 2 }
    }
    return r
}

// ---------------------------------------------------------------- ritmo (play e vídeo)

const val QUADRO_MS = 1500.0
const val VIDEO_FPS = 30
const val VIDEO_QUADRO_MS = 1500.0

/** Linha do tempo do vídeo do web: cada transição 0…ceil(1,5 × 30) (46 imagens) + 1 s parado no fim. */
fun linhaDoVideo(totalQuadros: Int): List<Pair<Int, Double>> {
    if (totalQuadros <= 1) return emptyList()
    val passos = ceil(VIDEO_QUADRO_MS / 1000 * VIDEO_FPS).toInt()
    val r = ArrayList<Pair<Int, Double>>()
    for (f in 0 until totalQuadros - 1) for (s in 0..passos) r.add(f to s.toDouble() / passos)
    repeat(VIDEO_FPS) { r.add((totalQuadros - 2) to 1.0) }
    return r
}

/** Peças interpoladas (como o web) e os desenhos do quadro de origem (na espera final, os do último). */
fun imagemDoVideo(quadros: List<QuadroJogada>, passo: Pair<Int, Double>, final: Boolean): Pair<List<Peca>, List<Desenho>> {
    val a = quadros[passo.first]
    val b = quadros.getOrNull(passo.first + 1)
    return interpolarPecas(a, b, passo.second) to (if (final) (b ?: a).desenhos else a.desenhos)
}

/** Play (usePlayback): começa no atual (no último, volta ao 1º) e termina ao chegar no último. */
data class Reproducao(val quadro: Int, val t: Double = 0.0, val terminou: Boolean = false, val total: Int) {
    companion object {
        fun iniciar(atual: Int, total: Int): Reproducao? = if (total <= 1) null else Reproducao(if (atual >= total - 1) 0 else atual, total = total)
    }

    fun avancar(ms: Double, velocidade: Double): Reproducao {
        if (terminou) return this
        var q = quadro; var tt = t + ms / (QUADRO_MS / max(0.1, velocidade)); var fim = false
        while (tt >= 1 && !fim) {
            q += 1
            if (q >= total - 1) { fim = true; tt = 0.0 } else tt -= 1
        }
        return copy(quadro = q, t = tt, terminou = fim)
    }

    fun pecas(quadros: List<QuadroJogada>): List<Peca> {
        val a = quadros.getOrNull(quadro) ?: return emptyList()
        return if (terminou) a.elementos else interpolarPecas(a, quadros.getOrNull(quadro + 1), t)
    }
}

fun subtituloEditor(tipo: String, vista: String, atual: Int, total: Int) =
    "${rotuloTipoCampo(tipo)} · ${rotuloVista(vista).lowercase()} · quadro ${atual + 1} de $total"

/** generateVideoFilename: "Saída_de_bola_2026-10-22.mp4". */
fun nomeArquivoVideo(nomeJogada: String, hojeISO: String): String {
    val sb = StringBuilder()
    for (ch in nomeJogada.ifEmpty { "jogada" }) {
        val v = ch.code
        val ok = v in 0x30..0x39 || v in 0x41..0x5A || v in 0x61..0x7A || v in 0xC0..0x24F
        sb.append(if (ok) ch else '_')
    }
    var s = sb.toString()
    while ("__" in s) s = s.replace("__", "_")
    return "${fatiaJs(s, 50)}_$hojeISO.mp4"
}
