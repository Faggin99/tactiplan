package com.faggin.tactiplan.app.dados

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// Identidade TactiPlan + cor do clube com TRAVA DE CONTRASTE (WCAG AA 4,5:1). Puro (JVM): a tela
// converte [Cor] em Color do Compose. Sem "cor dinâmica" do Android (Material You): vale a marca
// do clube. Paridade: TactiPlanKit/Cores.swift.

// ---------- contraste ----------

/** "#RRGGBB" (com ou sem #, qualquer caixa, com espaços) → [r, g, b]; qualquer outra coisa → null. */
internal fun parseHex(hex: String?): DoubleArray? {
    var s = (hex ?: "").trim()
    if (s.startsWith("#")) s = s.substring(1)
    if (s.length != 6 || !s.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
    val n = s.toInt(16)
    return doubleArrayOf(((n shr 16) and 255).toDouble(), ((n shr 8) and 255).toDouble(), (n and 255).toDouble())
}

private fun arredondar(v: Double): Int = kotlin.math.floor(v + 0.5).toInt()

internal fun toHex(rgb: DoubleArray): String =
    "#" + rgb.joinToString("") { v -> max(0, min(255, arredondar(v))).toString(16).uppercase().padStart(2, '0') }

/** "#rrggbb" válido normalizado em maiúsculas, ou null. */
fun normalizarHex(hex: String?): String? = parseHex(hex)?.let(::toHex)

private fun luminancia(rgb: DoubleArray): Double {
    val c = rgb.map { v ->
        val x = v / 255
        if (x <= 0.03928) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Razão de contraste WCAG entre duas cores hex (1 a 21); cor inválida dá 1. */
fun contraste(a: String?, b: String?): Double {
    val ra = parseHex(a) ?: return 1.0
    val rb = parseHex(b) ?: return 1.0
    val la = luminancia(ra)
    val lb = luminancia(rb)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

const val AA = 4.5
const val BRANCO = "#FFFFFF"

/** Texto legível SOBRE a cor `fundo`: branco se passar AA; senão o navy; senão o de mais contraste. */
fun textoSobre(fundo: String?): String {
    if (normalizarHex(fundo) == null) return BRANCO
    val branco = contraste(fundo, BRANCO)
    val navy = contraste(fundo, NAVY)
    if (branco >= AA) return BRANCO
    if (navy >= AA) return NAVY
    return if (branco >= navy) BRANCO else NAVY
}

/** A cor escurecida (passos de 8%) até passar AA contra `fundo` claro. */
fun tintaLegivelNoClaro(hex: String?, fundo: String = BRANCO): String {
    var rgb = parseHex(hex) ?: return ACAO_PADRAO
    repeat(24) {
        if (contraste(toHex(rgb), fundo) >= AA) return toHex(rgb)
        rgb = DoubleArray(3) { rgb[it] * 0.92 }
    }
    return NAVY
}

/** A cor clareada (mistura com branco, passos de 8%) até passar AA contra a superfície escura. */
fun tintaLegivelNoEscuro(hex: String?, fundo: String = SUPERFICIE_ESCURA): String {
    var rgb = parseHex(hex) ?: return ACAO_PADRAO_ESCURO
    repeat(24) {
        if (contraste(toHex(rgb), fundo) >= AA) return toHex(rgb)
        rgb = DoubleArray(3) { rgb[it] + (255 - rgb[it]) * 0.08 }
    }
    return BRANCO
}

// ---------- tokens ----------

/** Cor opaca ou com alfa (hex normalizado + alfa 0..1). */
data class Cor(val hex: String, val alfa: Double = 1.0) {
    fun comAlfa(a: Double): Cor = Cor(hex, a)

    /** ARGB 32 bits, pronto para `Color(argb)`. */
    val argb: Long
        get() {
            val n = hex.substring(1).toLong(16)
            val a = (alfa.coerceIn(0.0, 1.0) * 255 + 0.5).toLong()
            return (a shl 24) or n
        }

    companion object {
        /** "#RRGGBB" → Cor. Hex inválido cai na cor de ação padrão. */
        fun de(hex: String?, alfa: Double = 1.0): Cor = Cor(normalizarHex(hex) ?: ACAO_PADRAO, alfa)
    }
}

/** Navy da marca TactiPlan/Faggin. */
const val NAVY = "#0F172A"
/** Faísca lime da marca. */
const val LIME = "#C8FF00"
/** Azul de ação do TactiPlan (o "primary" do web) — trocado pela cor do clube. */
const val ACAO_PADRAO = "#2563EB"
const val ACAO_PADRAO_ESCURO = "#3B82F6"
const val SUPERFICIE_ESCURA = "#1E293B"

/** Os tokens das telas. */
data class Cores(
    val tinta: Cor, val tinta2: Cor, val tinta3: Cor,
    val fundo: Cor, val superficie: Cor, val borda: Cor,
    val lime: Cor,
    val heroi: Cor, val sobreHeroi: Cor, val sobreHeroi2: Cor, val heroiDivisoria: Cor, val heroiBorda: Cor,
    /** Cor de AÇÃO crua (a do clube, ou o azul do TactiPlan): preenchimento de botão, aba ativa. */
    val acao: Cor,
    /** Texto/ícone SOBRE `acao` (branco ou navy, o que passar AA). */
    val sobreAcao: Cor,
    /** A cor de ação legível como TEXTO/ícone sobre a superfície. */
    val acaoTinta: Cor,
    /** Fundo suave da cor de ação. */
    val acaoSuave: Cor,
    val okFundo: Cor, val okTinta: Cor,
    val avisoFundo: Cor, val avisoTinta: Cor,
    val erroFundo: Cor, val erroTinta: Cor,
    val infoFundo: Cor, val infoTinta: Cor,
    val neutroFundo: Cor, val neutroTinta: Cor,
    val erro: Cor,
    val skeleton: Cor,
    val sombra1: Cor, val sombra2: Cor,
    val escuro: Boolean,
)

object Tokens {
    const val raioCard = 20.0
    const val raioCampo = 14.0
    const val alvoToque = 48.0
    val escalaTipo = listOf(32.0, 24.0, 20.0, 17.0, 15.0, 13.0, 11.0)
    /** Cores fixas dos pilares (iguais ao web e ao PDF). */
    val pilares = mapOf("tatico" to "#3B82F6", "fisico" to "#F59E0B", "tecnico" to "#A855F7", "mental" to "#10B981")
}

internal fun coresClaras(acao: String): Cores = Cores(
    tinta = Cor.de(NAVY), tinta2 = Cor.de("#526077"), tinta3 = Cor.de("#94A3B8"),
    fundo = Cor.de("#F2F4F7"), superficie = Cor.de("#FFFFFF"), borda = Cor.de("#E3E7ED"),
    lime = Cor.de(LIME),
    heroi = Cor.de(NAVY), sobreHeroi = Cor.de("#FFFFFF"), sobreHeroi2 = Cor.de("#FFFFFF", 0.72),
    heroiDivisoria = Cor.de("#FFFFFF", 0.14), heroiBorda = Cor.de("#FFFFFF", 0.0),
    acao = Cor.de(acao), sobreAcao = Cor.de(textoSobre(acao)),
    acaoTinta = Cor.de(tintaLegivelNoClaro(acao)), acaoSuave = Cor.de(acao, 0.12),
    okFundo = Cor.de("#DCFCE7"), okTinta = Cor.de("#166534"),
    avisoFundo = Cor.de("#FEF3C7"), avisoTinta = Cor.de("#92400E"),
    erroFundo = Cor.de("#FEE2E2"), erroTinta = Cor.de("#991B1B"),
    infoFundo = Cor.de("#DBEAFE"), infoTinta = Cor.de("#1E40AF"),
    neutroFundo = Cor.de("#E9EDF2"), neutroTinta = Cor.de("#475569"),
    erro = Cor.de("#DC2626"), skeleton = Cor.de("#E9EDF2"),
    sombra1 = Cor.de(NAVY, 0.04), sombra2 = Cor.de(NAVY, 0.06),
    escuro = false,
)

internal fun coresEscuras(acao: String): Cores {
    val tinta = tintaLegivelNoEscuro(acao)
    return Cores(
        tinta = Cor.de("#F8FAFC"), tinta2 = Cor.de("#CBD5E1"), tinta3 = Cor.de("#8A99AE"),
        fundo = Cor.de("#0B1120"), superficie = Cor.de(SUPERFICIE_ESCURA), borda = Cor.de("#334155"),
        lime = Cor.de(LIME),
        heroi = Cor.de("#1C2A45"), sobreHeroi = Cor.de("#FFFFFF"), sobreHeroi2 = Cor.de("#FFFFFF", 0.72),
        heroiDivisoria = Cor.de("#FFFFFF", 0.14), heroiBorda = Cor.de("#FFFFFF", 0.10),
        // No escuro, uma cor de clube escura sumiria: o preenchimento usa a versão clareada.
        acao = Cor.de(tinta), sobreAcao = Cor.de(textoSobre(tinta)),
        acaoTinta = Cor.de(tinta), acaoSuave = Cor.de(tinta, 0.16),
        okFundo = Cor.de("#14361F"), okTinta = Cor.de("#86EFAC"),
        avisoFundo = Cor.de("#3A2A0B"), avisoTinta = Cor.de("#FCD34D"),
        erroFundo = Cor.de("#3B1518"), erroTinta = Cor.de("#FCA5A5"),
        infoFundo = Cor.de("#172554"), infoTinta = Cor.de("#93C5FD"),
        neutroFundo = Cor.de("#273449"), neutroTinta = Cor.de("#CBD5E1"),
        erro = Cor.de("#F87171"), skeleton = Cor.de("#273449"),
        sombra1 = Cor.de("#000000", 0.30), sombra2 = Cor.de("#000000", 0.40),
        escuro = true,
    )
}

/** A cor do clube para um modo (null = padrão). No escuro, sem cor própria do escuro, vale a do claro. */
fun corDoClube(p: Personalizacao?, escuro: Boolean): String? {
    val c = p?.corPrimaria
    return if (escuro) normalizarHex(c?.escuro) ?: normalizarHex(c?.claro) else normalizarHex(c?.claro)
}

/** A paleta das telas com a cor do clube (ou o azul do TactiPlan) e a trava de contraste. */
fun coresDoClube(p: Personalizacao?, escuro: Boolean): Cores {
    if (escuro) return coresEscuras(corDoClube(p, true) ?: ACAO_PADRAO_ESCURO)
    val acao = corDoClube(p, false) ?: ACAO_PADRAO
    val c = coresClaras(acao)
    // Cor quase igual ao fundo (ex.: branco): o botão sumiria — preenche com a versão legível.
    if (contraste(acao, c.superficie.hex) < 1.5) {
        return c.copy(acao = c.acaoTinta, sobreAcao = Cor.de(textoSobre(c.acaoTinta.hex)))
    }
    return c
}

/** Logo do clube para o modo (a escura só no escuro; sem ela, a normal). */
fun logoDoClube(p: Personalizacao?, escuro: Boolean): String? {
    if (escuro && !p?.logoEscuraUrl.isNullOrEmpty()) return p?.logoEscuraUrl
    return p?.logoUrl?.takeIf { it.isNotEmpty() }
}
