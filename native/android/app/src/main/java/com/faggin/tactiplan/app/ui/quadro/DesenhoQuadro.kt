package com.faggin.tactiplan.app.ui.quadro

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import com.faggin.tactiplan.app.dados.quadro.CorRGBA
import com.faggin.tactiplan.app.dados.quadro.DimensoesCanvas
import com.faggin.tactiplan.app.dados.quadro.Desenho
import com.faggin.tactiplan.app.dados.quadro.PassoCaminho
import com.faggin.tactiplan.app.dados.quadro.Peca
import com.faggin.tactiplan.app.dados.quadro.RAIO_BOLA
import com.faggin.tactiplan.app.dados.quadro.RAIO_JOGADOR
import com.faggin.tactiplan.app.dados.quadro.TipoCampo
import com.faggin.tactiplan.app.dados.quadro.caminhoLivre
import com.faggin.tactiplan.app.dados.quadro.corCss
import com.faggin.tactiplan.app.dados.quadro.curvaDaSeta
import com.faggin.tactiplan.app.dados.quadro.geometriaCampo
import com.faggin.tactiplan.app.dados.quadro.meiaLuaGraus
import com.faggin.tactiplan.app.dados.quadro.nomeNoToken
import com.faggin.tactiplan.app.dados.quadro.paraPixel
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// Desenho NATIVO do quadro tático (android.graphics.Canvas): o mesmo código pinta a tela (Canvas
// do Compose, via nativeCanvas) e cada imagem do vídeo MP4 (MediaCodec). Cópia visual do web:
// FieldBackground, PlayerToken, BallToken, MarkerToken, DrawingLayer e TrajectoryLayer.
// Coordenadas lógicas (dp na tela; o vídeo escala). Paridade visual: DesenhoQuadro.swift (iPhone).

/** Tudo o que uma imagem do quadro mostra. */
data class CenaQuadro(
    val dims: DimensoesCanvas,
    val tipo: String,
    val vista: String,
    val pecas: List<Peca>,
    val desenhos: List<Desenho>,
    val previa: Desenho? = null,
    /** Peças do próximo quadro (trajetórias). null = sem setas (tocando/vídeo). */
    val proximas: List<Peca>? = null,
    val corA: String,
    val corB: String,
    val pecaSelecionada: String? = null,
    val desenhoSelecionado: String? = null,
    /** Peça sendo arrastada (posição do dedo, %). */
    val arrasto: Triple<String, Double, Double>? = null,
    /** Desenho sendo arrastado (deslocamento em %). */
    val arrastoDesenho: Triple<String, Double, Double>? = null,
)

fun argb(css: String?, padrao: Int = 0xFFFFFFFF.toInt()): Int = corCss(css)?.argb() ?: padrao
private fun rgba(r: Int, g: Int, b: Int, a: Double): Int = CorRGBA(r / 255.0, g / 255.0, b / 255.0, a).argb()
private fun hex(s: String) = argb(s)
private val AMBAR = hex("#fbbf24")
private const val BRANCO = 0xFFFFFFFF.toInt()

private val ARIAL = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
private val ARIAL_NEGRITO = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)

private fun preencher(cor: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = cor }
private fun contorno(cor: Int, largura: Float, tracejado: List<Double> = emptyList(), redondo: Boolean = false) =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; color = cor; strokeWidth = largura
        if (redondo) { strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
        if (tracejado.isNotEmpty()) pathEffect = DashPathEffect(tracejado.map { it.toFloat() }.toFloatArray(), 0f)
    }

private fun textoCentro(cv: Canvas, s: String, tamanho: Float, negrito: Boolean, cor: Int, cx: Float, cy: Float) {
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cor; textSize = tamanho; typeface = if (negrito) ARIAL_NEGRITO else ARIAL; textAlign = Paint.Align.CENTER }
    val m = p.fontMetrics
    cv.drawText(s, cx, cy - (m.ascent + m.descent) / 2, p)
}

private fun arco(cv: Canvas, x: Float, y: Float, r: Float, angulo: Float, rotacao: Float, p: Paint) =
    cv.drawArc(RectF(x - r, y - r, x + r, y + r), rotacao, angulo, false, p)

// ---------------------------------------------------------------- cena

fun desenharCena(cv: Canvas, c: CenaQuadro) {
    val d = c.dims
    if (d.largura <= 0 || d.altura <= 0) return
    desenharCampo(cv, c.tipo, c.vista, d)
    cv.save()
    cv.translate(d.campoX.toFloat(), d.campoY.toFloat())
    for (z in c.desenhos) {
        val a = c.arrastoDesenho
        val zz = if (a != null && a.first == z.id) deslocarDesenho(z, a.second, a.third) else z
        desenharDesenho(cv, zz, d, c.desenhoSelecionado == z.id)
    }
    c.previa?.let { cv.saveLayerAlpha(null, 153); desenharDesenho(cv, it, d, false); cv.restore() }
    c.proximas?.let { desenharTrajetorias(cv, c.pecas, it, d, c.corA, c.corB) }
    for (p in c.pecas) {
        var x = paraPixel(p.x, d.largura); var y = paraPixel(p.y, d.altura)
        c.arrasto?.takeIf { it.first == p.id }?.let { x = paraPixel(it.second, d.largura); y = paraPixel(it.third, d.altura) }
        val sel = c.pecaSelecionada == p.id
        cv.save()
        cv.translate(x.toFloat(), y.toFloat())
        when (p.tipo) {
            "player" -> {
                val cor = when (p.time) { "A" -> argb(c.corA); "B" -> argb(c.corB); else -> 0 }
                desenharJogador(cv, p, cor, sel)
            }
            "ball" -> desenharBola(cv, sel)
            "marker" -> { cv.rotate(p.rotacao.toFloat()); desenharObjeto(cv, p.marcador, sel) }
        }
        cv.restore()
    }
    cv.restore()
}

fun deslocarDesenho(z: Desenho, dx: Double, dy: Double): Desenho =
    z.com(mapOf("x" to com.faggin.tactiplan.app.dados.quadro.num(z.n("x") + dx), "y" to com.faggin.tactiplan.app.dados.quadro.num(z.n("y") + dy)))

// ---------------------------------------------------------------- campo

private val TEXTURA_QUADRA: BitmapShader by lazy {
    val b = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
    val c = Canvas(b)
    c.drawCircle(2f, 2f, 0.6f, preencher(rgba(255, 255, 255, 0.05)))
    c.drawCircle(6f, 6f, 0.6f, preencher(rgba(0, 0, 0, 0.08)))
    BitmapShader(b, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
}

private fun desenharCampo(cv: Canvas, tipo: String, vista: String, d: DimensoesCanvas) {
    val g = geometriaCampo(tipo, vista, d)
    val f = g.medidas
    val w = d.larguraTela.toFloat(); val h = d.alturaTela.toFloat()
    fun X(m: Double) = g.x(m).toFloat()
    fun Y(m: Double) = g.y(m).toFloat()
    val s = g.s.toFloat()
    val l = f.comprimento; val wm = f.largura; val cy = wm / 2
    val futsal = tipo == TipoCampo.FUTSAL
    val linha = 1.7f

    if (futsal) {
        cv.drawRect(0f, 0f, w, h, preencher(hex("#1E5AA8")))
        cv.drawRect(0f, 0f, w, h, Paint().apply { shader = TEXTURA_QUADRA })
        val r0 = min(w, h) * 0.15f; val r1 = max(w, h) * 0.7f
        val grad = RadialGradient(w / 2, h / 2, r1, intArrayOf(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.15)),
            floatArrayOf(0f, r0 / r1, 1f), Shader.TileMode.CLAMP)
        cv.drawRect(0f, 0f, w, h, Paint().apply { shader = grad })
    } else {
        cv.drawRect(0f, 0f, w, h, preencher(hex("#2f7d3a")))
        val sw = max(8f, (l.toFloat() * s) / 14)
        val origem = X(0.0)
        val primeiro = floor(-origem / sw).toInt() - 1; val ultimo = ceil((w - origem) / sw).toInt() + 1
        val faixa = preencher(hex("#369342"))
        for (i in primeiro..ultimo) if (((i % 2) + 2) % 2 == 1) cv.drawRect(origem + sw * i, 0f, origem + sw * (i + 1), h, faixa)
        cv.drawRect(0f, 0f, w, h * 0.35f, preencher(rgba(255, 255, 255, 0.04)))
        cv.drawRect(0f, h * 0.7f, w, h, preencher(rgba(0, 0, 0, 0.08)))
    }

    cv.save()
    g.recorte?.let { (x, lg) -> cv.clipRect(x.toFloat(), 0f, (x + lg).toFloat(), h) }
    val ret = RectF(X(0.0), Y(0.0), X(l), Y(wm))
    cv.drawRect(ret, contorno(if (futsal) rgba(0, 0, 0, 0.25) else rgba(0, 0, 0, 0.35), 3f))
    cv.drawRect(ret, contorno(BRANCO, linha + 0.5f))
    val p = contorno(BRANCO, linha)
    cv.drawLine(X(l / 2), Y(0.0), X(l / 2), Y(wm), p)
    cv.drawCircle(X(l / 2), Y(cy), f.circuloCentral.toFloat() * s, p)
    val marca = if (futsal) max(2.2f, min(3.2f, s * 0.12f)) else max(2.2f, min(3.2f, s * 0.25f))
    val ponto = preencher(BRANCO)
    fun pontoEm(xm: Double) = cv.drawCircle(X(xm), Y(cy), marca, ponto)
    pontoEm(l / 2)
    val ga = f.grandeArea; val pa = f.pequenaArea
    if (futsal && f.raioAreaFutsal != null) {
        val ra = f.raioAreaFutsal.toFloat() * s
        arco(cv, X(0.0), Y(cy), ra, 180f, -90f, p)
        arco(cv, X(l), Y(cy), ra, 180f, 90f, p)
        pontoEm(f.marcaPenalti); pontoEm(l - f.marcaPenalti)
        f.segundoPenalti?.let { pontoEm(it); pontoEm(l - it) }
    } else if (ga != null && pa != null) {
        cv.drawRect(X(0.0), Y(cy - ga.largura / 2), X(ga.profundidade), Y(cy + ga.largura / 2), p)
        cv.drawRect(X(l - ga.profundidade), Y(cy - ga.largura / 2), X(l), Y(cy + ga.largura / 2), p)
        cv.drawRect(X(0.0), Y(cy - pa.largura / 2), X(pa.profundidade), Y(cy + pa.largura / 2), p)
        cv.drawRect(X(l - pa.profundidade), Y(cy - pa.largura / 2), X(l), Y(cy + pa.largura / 2), p)
        pontoEm(f.marcaPenalti); pontoEm(l - f.marcaPenalti)
        val meia = meiaLuaGraus(tipo).toFloat()
        val r = f.raioMeiaLua
        if (meia > 0 && r != null) {
            arco(cv, X(f.marcaPenalti), Y(cy), r.toFloat() * s, meia * 2, -meia, p)
            arco(cv, X(l - f.marcaPenalti), Y(cy), r.toFloat() * s, meia * 2, 180 - meia, p)
        }
    }
    val re = max(3f, f.raioEscanteio.toFloat() * s)
    arco(cv, X(0.0), Y(0.0), re, 90f, 0f, p)
    arco(cv, X(l), Y(0.0), re, 90f, 90f, p)
    arco(cv, X(l), Y(wm), re, 90f, 180f, p)
    arco(cv, X(0.0), Y(wm), re, 90f, 270f, p)
    val gw = f.gol.largura.toFloat() * s; val gd = f.gol.profundidade.toFloat() * s
    desenharGol(cv, X(-f.gol.profundidade), Y(cy - f.gol.largura / 2), gd, gw, true)
    desenharGol(cv, X(l), Y(cy - f.gol.largura / 2), gd, gw, false)
    cv.restore()
}

private fun desenharGol(cv: Canvas, x: Float, y: Float, w: Float, h: Float, esquerdo: Boolean) {
    cv.drawRect(x, y, x + w, y + h, preencher(rgba(220, 225, 235, 0.55)))
    val rede = contorno(rgba(255, 255, 255, 0.35), 0.5f)
    var i = 0f
    while (i <= abs(w)) { val lx = if (esquerdo) x + i else x + w - i; cv.drawLine(lx, y, lx, y + h, rede); i += 3.5f }
    i = 0f
    while (i <= h) { cv.drawLine(x, y + i, x + w, y + i, rede); i += 3.5f }
    cv.drawRect(x, y, x + w, y + h, contorno(BRANCO, 2.6f).apply { setShadowLayer(2f, if (esquerdo) -1f else 1f, 1f, rgba(0, 0, 0, 0.27)) })
    val lx = if (esquerdo) x + w else x
    cv.drawLine(lx, y, lx, y + h, contorno(BRANCO, 3.2f))
}

// ---------------------------------------------------------------- peças

private fun anel(cv: Canvas, r: Float) = cv.drawCircle(0f, 0f, r, contorno(AMBAR, 2f, listOf(4.0, 4.0)))

private fun desenharJogador(cv: Canvas, p: Peca, cor: Int, sel: Boolean) {
    val r = RAIO_JOGADOR.toFloat()
    if (sel) anel(cv, r + 5)
    if (p.goleiro) {
        val losango = Path().apply { moveTo(0f, -r); lineTo(r, 0f); lineTo(0f, r); lineTo(-r, 0f); close() }
        cv.drawPath(losango, preencher(cor).apply { setShadowLayer(2f, 1f, 1f, rgba(0, 0, 0, 0.4)) })
        cv.drawPath(losango, contorno(rgba(255, 255, 255, 0.9), 2f))
        val luva = contorno(rgba(255, 255, 255, 0.5), 1f, redondo = true)
        cv.drawLine(-5f, -3f, -3f, -5f, luva); cv.drawLine(5f, -3f, 3f, -5f, luva)
        textoCentro(cv, p.camisaTexto, 12f, true, BRANCO, 0f, 0f)
    } else {
        cv.drawCircle(0f, 0f, r, preencher(cor).apply { setShadowLayer(2.5f, 1f, 2f, rgba(0, 0, 0, 0.35)) })
        cv.drawCircle(0f, 0f, r, contorno(rgba(255, 255, 255, 0.85), 2f))
        cv.drawCircle(0f, 0f, r - 3, contorno(rgba(255, 255, 255, 0.15), 1f))
        textoCentro(cv, p.camisaTexto, 13f, true, BRANCO, 0f, 0f)
    }
    if (p.nome.isNotEmpty()) {
        val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = BRANCO; textSize = 9f; typeface = ARIAL; textAlign = Paint.Align.CENTER
            setShadowLayer(1.5f, 0f, 0f, rgba(0, 0, 0, 0.8))
        }
        cv.drawText(nomeNoToken(p.nome), 0f, r + 3 - t.fontMetrics.ascent, t)
    }
}

/** RegularPolygon do Konva: 1º vértice para cima, girado `rotacaoGraus`. */
private fun poligono(cx: Float, cy: Float, lados: Int, raio: Float, rotacaoGraus: Float): Path {
    val rot = Math.toRadians(rotacaoGraus.toDouble())
    val path = Path()
    for (n in 0 until lados) {
        val a = n * 2 * Math.PI / lados
        val px = raio * sin(a); val py = -raio * cos(a)
        val x = cx + (px * cos(rot) - py * sin(rot)).toFloat(); val y = cy + (px * sin(rot) + py * cos(rot)).toFloat()
        if (n == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    return path
}

private fun desenharBola(cv: Canvas, sel: Boolean) {
    val r = RAIO_BOLA.toFloat()
    if (sel) anel(cv, r + 5)
    cv.drawCircle(1.5f, 2.5f, r, preencher(rgba(0, 0, 0, 0.28)))
    cv.save()
    cv.clipPath(Path().apply { addCircle(0f, 0f, r, Path.Direction.CW) })
    cv.drawCircle(0f, 0f, r, preencher(BRANCO))
    val pent = r * 0.36f; val fora = r * 0.86f
    val angulos = listOf(0.0, 72.0, 144.0, 216.0, 288.0).map { Math.toRadians(it - 90) }
    val costura = contorno(hex("#1f2937"), 0.9f)
    for (a in angulos) cv.drawLine((cos(a) * pent).toFloat(), (sin(a) * pent).toFloat(), (cos(a) * fora).toFloat(), (sin(a) * fora).toFloat(), costura)
    val preto = preencher(hex("#111827"))
    cv.drawPath(poligono(0f, 0f, 5, pent, 0f), preto)
    angulos.forEachIndexed { i, a -> cv.drawPath(poligono((cos(a) * r * 1.02).toFloat(), (sin(a) * r * 1.02).toFloat(), 5, r * 0.34f, (i * 72 + 36).toFloat()), preto) }
    cv.drawCircle(-r * 0.35f, -r * 0.4f, r * 0.32f, preencher(rgba(255, 255, 255, 0.55)))
    cv.restore()
    cv.drawCircle(0f, 0f, r, contorno(hex("#374151"), 1f))
}

private fun elipse(cx: Float, cy: Float, rx: Float, ry: Float) = RectF(cx - rx, cy - ry, cx + rx, cy + ry)
private fun retArred(cv: Canvas, x: Float, y: Float, w: Float, h: Float, raio: Float, cor: Int, borda: Pair<Int, Float>? = null) {
    val r = RectF(x, y, x + w, y + h)
    cv.drawRoundRect(r, raio, raio, preencher(cor))
    borda?.let { cv.drawRoundRect(r, raio, raio, contorno(it.first, it.second)) }
}
private fun traco(cv: Canvas, pts: FloatArray, cor: Int, largura: Float, redondo: Boolean = true) {
    val path = Path().apply { moveTo(pts[0], pts[1]); var i = 2; while (i + 1 < pts.size) { lineTo(pts[i], pts[i + 1]); i += 2 } }
    cv.drawPath(path, contorno(cor, largura, redondo = redondo))
}
private fun preencherEContornar(cv: Canvas, path: Path, fundo: Int, borda: Int, largura: Float) {
    cv.drawPath(path, preencher(fundo)); cv.drawPath(path, contorno(borda, largura))
}

private fun desenharObjeto(cv: Canvas, tipo: String, sel: Boolean) {
    if (sel) anel(cv, 18f)
    val laranja = hex("#f97316"); val laranjaEsc = hex("#e85d04")
    when (tipo) {
        "cone" -> {
            cv.drawOval(elipse(0f, 4f, 11f, 3f), preencher(rgba(0, 0, 0, 0.2)))
            preencherEContornar(cv, Path().apply { moveTo(0f, -8f); lineTo(-10f, 4f); quadTo(0f, 8f, 10f, 4f); close() }, laranja, laranjaEsc, 1f)
            traco(cv, floatArrayOf(0f, -7f, -4f, 1f), rgba(255, 255, 255, 0.4), 1.5f)
        }
        "cone_tall" -> {
            cv.drawOval(elipse(0f, 6f, 8f, 3f), preencher(rgba(0, 0, 0, 0.2)))
            preencherEContornar(cv, Path().apply { moveTo(0f, -14f); lineTo(-8f, 5f); quadTo(0f, 9f, 8f, 5f); close() }, laranja, laranjaEsc, 1f)
            traco(cv, floatArrayOf(-5f, -2f, 5f, -2f), BRANCO, 1.5f, redondo = false)
            traco(cv, floatArrayOf(0f, -13f, -2f, -4f), rgba(255, 255, 255, 0.35), 1f)
        }
        "barrier" -> {
            retArred(cv, -16f, 5f, 32f, 3f, 1f, rgba(0, 0, 0, 0.15))
            retArred(cv, -14f, -6f, 2.5f, 14f, 0.5f, hex("#7c3aed"))
            retArred(cv, 11.5f, -6f, 2.5f, 14f, 0.5f, hex("#7c3aed"))
            retArred(cv, -14f, -8f, 28f, 4f, 1f, hex("#a855f7"), hex("#7c3aed") to 0.5f)
            traco(cv, floatArrayOf(-12f, -7f, 10f, -7f), rgba(255, 255, 255, 0.3), 1f)
        }
        "pole" -> {
            cv.drawCircle(0f, 8f, 3f, preencher(rgba(0, 0, 0, 0.15)))
            retArred(cv, -1.5f, -16f, 3f, 24f, 1.5f, hex("#f59e0b"))
            cv.drawCircle(0f, -16f, 3f, preencher(hex("#f59e0b"))); cv.drawCircle(0f, -16f, 3f, contorno(hex("#d97706"), 0.5f))
            traco(cv, floatArrayOf(0f, -16f, -0.5f, -2f), rgba(255, 255, 255, 0.3), 1f)
        }
        "flag" -> {
            cv.drawCircle(0f, 12f, 2.5f, preencher(rgba(0, 0, 0, 0.15)))
            retArred(cv, -1f, -14f, 2f, 26f, 1f, hex("#666666"))
            preencherEContornar(cv, Path().apply { moveTo(1f, -14f); quadTo(8f, -11f, 14f, -12f); lineTo(14f, -4f); quadTo(8f, -5f, 1f, -4f); close() },
                hex("#ef4444"), hex("#dc2626"), 0.5f)
        }
        "ladder" -> {
            val w = 16f; val h = 28f; val passo = h / 6
            retArred(cv, -w / 2 - 1, -h / 2, w + 2, h, 1f, rgba(0, 0, 0, 0.1))
            retArred(cv, -w / 2, -h / 2, 2f, h, 0.5f, hex("#facc15"))
            retArred(cv, w / 2 - 2, -h / 2, 2f, h, 0.5f, hex("#facc15"))
            for (i in 0 until 5) retArred(cv, -w / 2 + 2, -h / 2 + passo * (i + 1) - 1, w - 4, 2f, 0.5f, hex("#fde047"))
        }
        "mannequin" -> {
            cv.drawOval(elipse(0f, 14f, 8f, 3f), preencher(rgba(0, 0, 0, 0.15)))
            cv.drawOval(elipse(0f, 12f, 7f, 3f), preencher(hex("#1e40af"))); cv.drawOval(elipse(0f, 12f, 7f, 3f), contorno(hex("#1e3a8a"), 0.5f))
            retArred(cv, -1.5f, -4f, 3f, 16f, 1f, hex("#333333"))
            traco(cv, floatArrayOf(-10f, 0f, 10f, 0f), hex("#333333"), 2.5f)
            cv.drawCircle(0f, -8f, 5f, preencher(hex("#1e40af"))); cv.drawCircle(0f, -8f, 5f, contorno(hex("#1e3a8a"), 0.5f))
            cv.drawCircle(0f, -8f, 2f, preencher(rgba(255, 255, 255, 0.2)))
        }
        "disc" -> {
            cv.drawOval(elipse(0f, 1f, 9f, 4f), preencher(hex("#22c55e"))); cv.drawOval(elipse(0f, 1f, 9f, 4f), contorno(hex("#16a34a"), 1f))
            cv.drawOval(elipse(0f, -1f, 9f, 4f), preencher(hex("#4ade80"))); cv.drawOval(elipse(0f, -1f, 9f, 4f), contorno(hex("#22c55e"), 0.5f))
        }
        "hoop" -> {
            cv.drawCircle(0f, 0f, 12f, preencher(rgba(249, 115, 22, 0.1))); cv.drawCircle(0f, 0f, 12f, contorno(laranja, 2.5f))
            cv.drawCircle(0f, 0f, 10f, contorno(rgba(249, 115, 22, 0.3), 0.5f))
        }
        "mini_goal" -> {
            cv.drawRect(-14f, -10f, 14f, 10f, preencher(rgba(255, 255, 255, 0.08)))
            val rede = contorno(rgba(255, 255, 255, 0.2), 0.5f)
            for (i in 0 until 5) { val x = -14f + i * 7; cv.drawLine(x, -10f, x, 10f, rede) }
            for (i in 0 until 4) { val y = -10f + i * 6.66f; cv.drawLine(-14f, y, 14f, y, rede) }
            traco(cv, floatArrayOf(-14f, 10f, -14f, -10f, 14f, -10f, 14f, 10f), BRANCO, 2.5f)
            traco(cv, floatArrayOf(-16f, 10f, 16f, 10f), rgba(255, 255, 255, 0.4), 1f, redondo = false)
        }
    }
}

// ---------------------------------------------------------------- desenhos

private fun ponta(cv: Canvas, x: Float, y: Float, angulo: Float, comprimento: Float, largura: Float, cor: Int) {
    cv.save(); cv.translate(x, y); cv.rotate(Math.toDegrees(angulo.toDouble()).toFloat())
    val path = Path().apply { moveTo(0f, 0f); lineTo(-comprimento, largura / 2); lineTo(-comprimento, -largura / 2); close() }
    cv.drawPath(path, preencher(cor)); cv.drawPath(path, contorno(cor, 1f))
    cv.restore()
}

private fun brilho(p: Paint, sel: Boolean) = p.apply { if (sel) setShadowLayer(4f, 0f, 0f, CorRGBA(251 / 255.0, 191 / 255.0, 36 / 255.0, 0.8).argb()) }

fun desenharDesenho(cv: Canvas, z: Desenho, d: DimensoesCanvas, sel: Boolean) {
    fun X(v: Double) = paraPixel(v, d.largura).toFloat()
    fun Y(v: Double) = paraPixel(v, d.altura).toFloat()
    val tr = z.tracejado
    when (z.tipo) {
        "arrow_straight" -> {
            val cor = argb(z.t("color"))
            val x1 = X(z.n("x1")); val y1 = Y(z.n("y1")); val x2 = X(z.n("x2")); val y2 = Y(z.n("y2"))
            if (sel) { val a = preencher(CorRGBA(251 / 255.0, 191 / 255.0, 36 / 255.0, 0.7).argb()); cv.drawCircle(x1, y1, 5f, a); cv.drawCircle(x2, y2, 5f, a) }
            cv.drawLine(x1, y1, x2, y2, brilho(contorno(cor, z.n("strokeWidth", 2.5).toFloat(), tr, redondo = true), sel))
            ponta(cv, x2, y2, atan2(y2 - y1, x2 - x1), 8f, 7f, cor)
        }
        "arrow_curved" -> {
            val cor = argb(z.t("color"))
            val (cxp, cyp) = curvaDaSeta(z)
            val x0 = X(z.n("x1")); val y0 = Y(z.n("y1")); val cx = X(cxp); val cy = Y(cyp); val x1 = X(z.n("x2")); val y1 = Y(z.n("y2"))
            if (sel) {
                val a = preencher(CorRGBA(251 / 255.0, 191 / 255.0, 36 / 255.0, 0.7).argb())
                cv.drawCircle(x0, y0, 5f, a); cv.drawCircle(x1, y1, 5f, a)
                cv.drawCircle(cx, cy, 4f, preencher(CorRGBA(251 / 255.0, 191 / 255.0, 36 / 255.0, 0.5).argb()))
            }
            val p = brilho(contorno(cor, z.n("strokeWidth", 2.5).toFloat(), tr, redondo = true), sel)
            val ang = atan2(y1 - cy, x1 - cx); val cab = 10f
            val path = Path().apply {
                moveTo(x0, y0); quadTo(cx, cy, x1, y1)
                moveTo(x1, y1); lineTo(x1 - cab * cos(ang - 0.4f), y1 - cab * sin(ang - 0.4f))
                moveTo(x1, y1); lineTo(x1 - cab * cos(ang + 0.4f), y1 - cab * sin(ang + 0.4f))
            }
            cv.drawPath(path, p)
        }
        "free_draw" -> {
            val pts = z.pontos
            if (pts.size < 4) return
            val px = pts.mapIndexed { i, v -> if (i % 2 == 0) paraPixel(v, d.largura) else paraPixel(v, d.altura) }
            val path = Path()
            for (passo in caminhoLivre(px)) when (passo) {
                is PassoCaminho.Mover -> path.moveTo(passo.x.toFloat(), passo.y.toFloat())
                is PassoCaminho.Linha -> path.lineTo(passo.x.toFloat(), passo.y.toFloat())
                is PassoCaminho.Quadratica -> path.quadTo(passo.cx.toFloat(), passo.cy.toFloat(), passo.x.toFloat(), passo.y.toFloat())
                is PassoCaminho.Cubica -> path.cubicTo(passo.c1x.toFloat(), passo.c1y.toFloat(), passo.c2x.toFloat(), passo.c2y.toFloat(), passo.x.toFloat(), passo.y.toFloat())
            }
            cv.drawPath(path, brilho(contorno(argb(z.t("color"), AMBAR), z.n("strokeWidth", 2.0).toFloat(), redondo = true), sel))
        }
        "zone_rect" -> {
            val r = RectF(X(z.n("x")), Y(z.n("y")), X(z.n("x")) + X(z.n("w")), Y(z.n("y")) + Y(z.n("h")))
            cv.drawRoundRect(r, 2f, 2f, brilho(preencher(argb(z.t("color"), rgba(59, 130, 246, 0.2))), sel))
            cv.drawRoundRect(r, 2f, 2f, contorno(argb(z.t("strokeColor"), rgba(59, 130, 246, 0.6)), 1.5f, tr))
        }
        "zone_circle" -> {
            val r = Y(z.n("radius"))
            cv.drawCircle(X(z.n("cx")), Y(z.n("cy")), r, brilho(preencher(argb(z.t("color"), rgba(59, 130, 246, 0.2))), sel))
            cv.drawCircle(X(z.n("cx")), Y(z.n("cy")), r, contorno(argb(z.t("strokeColor"), rgba(59, 130, 246, 0.6)), 1.5f, tr))
        }
        "text" -> {
            val x = X(z.n("x")); val y = Y(z.n("y"))
            if (sel) cv.drawRect(x - 3, y - 3, x - 3 + z.texto.length * 8 + 6, y + 17, contorno(AMBAR, 1f, listOf(3.0, 3.0)))
            val negrito = (z.t("fontStyle") ?: "bold").contains("bold")
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = argb(z.t("color")); textSize = z.n("fontSize", 14.0).toFloat(); typeface = if (negrito) ARIAL_NEGRITO else ARIAL
                setShadowLayer(1.5f, 0f, 0f, rgba(0, 0, 0, 0.7))
            }
            cv.drawText(z.texto, x, y - t.fontMetrics.ascent, t)
        }
    }
}

private fun desenharTrajetorias(cv: Canvas, atuais: List<Peca>, proximas: List<Peca>, d: DimensoesCanvas, corA: String, corB: String) {
    if (proximas.isEmpty()) return
    val porId = HashMap<String, Peca>().apply { proximas.forEach { putIfAbsent(it.id, it) } }
    for (a in atuais) {
        val b = porId[a.id] ?: continue
        val x1 = paraPixel(a.x, d.largura).toFloat(); val y1 = paraPixel(a.y, d.altura).toFloat()
        val x2 = paraPixel(b.x, d.largura).toFloat(); val y2 = paraPixel(b.y, d.altura).toFloat()
        if (abs(x2 - x1) < 1 && abs(y2 - y1) < 1) continue
        val padrao = rgba(255, 255, 255, 0.5)
        val cor0 = when {
            a.time == "A" -> argb("${corA}99", padrao)
            a.time == "B" -> argb("${corB}99", padrao)
            a.tipo == "ball" -> rgba(255, 255, 255, 0.7)
            else -> padrao
        }
        val cor = (cor0 and 0x00FFFFFF) or ((((cor0 ushr 24) and 0xFF) * 0.7).toInt() shl 24)
        cv.drawLine(x1, y1, x2, y2, contorno(cor, 2f, listOf(6.0, 4.0)))
        ponta(cv, x2, y2, atan2(y2 - y1, x2 - x1), 8f, 6f, cor)
    }
}

/** O desenho da cena no Canvas do Compose: `escala` = px por unidade lógica (densidade). */
fun desenharNaTela(cv: Canvas, cena: CenaQuadro, escala: Float) {
    cv.save()
    cv.scale(escala, escala)
    desenharCena(cv, cena)
    cv.restore()
}
