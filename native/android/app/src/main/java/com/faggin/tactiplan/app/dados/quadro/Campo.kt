package com.faggin.tactiplan.app.dados.quadro

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

// QUADRO TÁTICO (T5): medidas oficiais, vistas, dimensões do canvas e limites de arrasto.
// Cópia fiel de frontend/src/modules/tactical-board/utils/fieldDimensions.js e do pitchGeometry
// do FieldBackground.jsx. Paridade: native/paridade/quadro.json (campo) e TactiPlanKit/QuadroCampo.swift.
// Coordenadas: x, y em % do RETÂNGULO DE LINHAS visível (pode passar de 0–100: fora das linhas).

object TipoCampo {
    const val FUTEBOL_11 = "football_11"
    const val FUTEBOL_7 = "football_7"
    const val FUTSAL = "futsal"
    val todos = listOf(FUTEBOL_11, FUTEBOL_7, FUTSAL)
}

object VistaCampo {
    const val INTEIRO = "full"
    const val METADE_ESQUERDA = "left_half"
    const val METADE_DIREITA = "right_half"
    const val TERCO_ESQUERDO = "third_left"
    const val TERCO_DIREITO = "third_right"
    val todas = listOf(INTEIRO, METADE_ESQUERDA, METADE_DIREITA, TERCO_ESQUERDO, TERCO_DIREITO)
}

data class Area(val profundidade: Double, val largura: Double)

/** Medidas reais (metros) de uma modalidade (PITCH_SPECS do web). */
data class MedidasCampo(
    val comprimento: Double,
    val largura: Double,
    val grandeArea: Area?,
    val pequenaArea: Area?,
    val marcaPenalti: Double,
    val raioMeiaLua: Double?,
    val circuloCentral: Double,
    val raioEscanteio: Double,
    /** largura = boca do gol, profundidade = fundo da rede. */
    val gol: Area,
    val raioAreaFutsal: Double? = null,
    val segundoPenalti: Double? = null,
)

val MEDIDAS_CAMPO: Map<String, MedidasCampo> = mapOf(
    TipoCampo.FUTEBOL_11 to MedidasCampo(
        105.0, 68.0, Area(16.5, 40.32), Area(5.5, 18.32), 11.0, 9.15, 9.15, 1.0, Area(2.0, 7.32),
    ),
    TipoCampo.FUTEBOL_7 to MedidasCampo(
        55.0, 35.0, Area(9.35, 19.6), Area(3.3, 8.4), 6.6, null, 4.2, 0.5, Area(1.4, 5.0),
    ),
    TipoCampo.FUTSAL to MedidasCampo(
        40.0, 20.0, null, null, 6.0, null, 3.0, 0.25, Area(1.0, 3.0), raioAreaFutsal = 6.0, segundoPenalti = 10.0,
    ),
)

/** getPitchSpec: tipo desconhecido = futebol 11. */
fun medidasCampo(tipo: String?): MedidasCampo = MEDIDAS_CAMPO[tipo] ?: MEDIDAS_CAMPO.getValue(TipoCampo.FUTEBOL_11)

/** Meia-lua: metade do ângulo (graus) do círculo do pênalti fora da grande área. */
fun meiaLuaGraus(tipo: String?): Double {
    val f = medidasCampo(tipo)
    val r = f.raioMeiaLua ?: return 0.0
    val ga = f.grandeArea ?: return 0.0
    if (r <= ga.profundidade - f.marcaPenalti) return 0.0
    return acos((ga.profundidade - f.marcaPenalti) / r) * 180 / Math.PI
}

data class JanelaVista(val x0: Double, val x1: Double, val cortaEsquerda: Boolean, val cortaDireita: Boolean)

fun janelaVista(tipo: String?, vista: String?): JanelaVista {
    val l = medidasCampo(tipo).comprimento
    return when (vista) {
        VistaCampo.METADE_ESQUERDA -> JanelaVista(0.0, l / 2, false, true)
        VistaCampo.METADE_DIREITA -> JanelaVista(l / 2, l, true, false)
        VistaCampo.TERCO_ESQUERDO -> JanelaVista(0.0, l / 3, false, true)
        VistaCampo.TERCO_DIREITO -> JanelaVista((2 * l) / 3, l, true, false)
        else -> JanelaVista(0.0, l, false, false)
    }
}

fun proporcaoCampo(tipo: String?, vista: String?): Double {
    val j = janelaVista(tipo, vista)
    return (j.x1 - j.x0) / medidasCampo(tipo).largura
}

/** Math.round do JS (meio sobe para +∞). */
fun arredondarJs(v: Double): Double = floor(v + 0.5)

/** Canvas inteiro (gramado) + onde fica o retângulo de linhas dentro dele (px). */
data class DimensoesCanvas(
    val larguraTela: Double,
    val alturaTela: Double,
    val campoX: Double,
    val campoY: Double,
    val largura: Double,
    val altura: Double,
)

/** calculateCanvasDimensions. */
fun dimensoesCanvas(larguraContainer: Double, alturaContainer: Double, tipo: String?, vista: String?, reservaBaixo: Double = 0.0): DimensoesCanvas {
    val w = max(1.0, arredondarJs(larguraContainer))
    val h = max(1.0, arredondarJs(alturaContainer))
    val prop = proporcaoCampo(tipo, vista)
    val padX = max(w * 0.06, 28.0)
    val padY = max(h * 0.06, 24.0)
    val dispW = max(40.0, w - padX * 2)
    val reserva = max(0.0, min(reservaBaixo, h * 0.25))
    val dispH = max(40.0, h - padY * 2 - reserva)
    val cw: Double
    val ch: Double
    if (dispW / dispH > prop) { ch = dispH; cw = ch * prop } else { cw = dispW; ch = cw / prop }
    val fx = (w - cw) / 2
    val fy = padY + (dispH - ch) / 2
    return DimensoesCanvas(w, h, arredondarJs(fx), arredondarJs(fy), arredondarJs(cw), arredondarJs(ch))
}

fun paraPixel(pct: Double, total: Double): Double = (pct / 100) * total
fun paraPercentual(px: Double, total: Double): Double = (px / total) * 100

data class LimitesArrasto(val minX: Double, val maxX: Double, val minY: Double, val maxY: Double)

/** getDragBounds: a peça pode sair da linha, mas não da tela. */
fun limitesArrasto(d: DimensoesCanvas, margem: Double = 20.0) = LimitesArrasto(
    minX = paraPercentual(-d.campoX + margem, d.largura),
    maxX = paraPercentual(d.larguraTela - d.campoX - margem, d.largura),
    minY = paraPercentual(-d.campoY + margem, d.altura),
    maxY = paraPercentual(d.alturaTela - d.campoY - margem, d.altura),
)

/** clampToBounds. */
fun prender(x: Double, y: Double, b: LimitesArrasto): Pair<Double, Double> =
    max(b.minX, min(b.maxX, x)) to max(b.minY, min(b.maxY, y))

/** pitchGeometry: px por metro, origem e recorte (x, largura) da vista parcial. */
data class GeometriaCampo(val medidas: MedidasCampo, val s: Double, val ox: Double, val oy: Double, val recorte: Pair<Double, Double>?) {
    fun x(m: Double) = ox + m * s
    fun y(m: Double) = oy + m * s
}

fun geometriaCampo(tipo: String?, vista: String?, d: DimensoesCanvas): GeometriaCampo {
    val f = medidasCampo(tipo)
    val j = janelaVista(tipo, vista)
    val s = d.largura / (j.x1 - j.x0)
    val ox = d.campoX - j.x0 * s
    val recorte = if (j.cortaEsquerda || j.cortaDireita) {
        val clipX = if (j.cortaEsquerda) d.campoX else 0.0
        val clipDir = if (j.cortaDireita) d.campoX + d.largura else d.larguraTela
        clipX to (clipDir - clipX)
    } else null
    return GeometriaCampo(f, s, ox, d.campoY, recorte)
}

/** Número como o JavaScript escreve (inteiro sem ".0"). */
fun numeroJs(n: Double): String = when {
    n.isNaN() -> "NaN"
    n == Math.rint(n) && abs(n) < 1e15 -> n.toLong().toString()
    else -> n.toString()
}

/** "105 × 68 m". */
fun rotuloMedidas(tipo: String?): String {
    val f = medidasCampo(tipo)
    return "${numeroJs(f.comprimento)} × ${numeroJs(f.largura)} m"
}
