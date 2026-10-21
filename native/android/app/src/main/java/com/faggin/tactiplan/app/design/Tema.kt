package com.faggin.tactiplan.app.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import com.faggin.tactiplan.app.dados.Cor
import com.faggin.tactiplan.app.dados.Cores
import com.faggin.tactiplan.app.dados.Personalizacao
import com.faggin.tactiplan.app.dados.coresDoClube

// Tema do app: a paleta do Kit (dados/Cores.kt — identidade TactiPlan + cor do clube com trava de
// contraste) vira Color do Compose e desce pela árvore. Tela nenhuma usa hex solto. O escuro segue
// o aparelho. Sem cor dinâmica (Material You): vale a marca do clube.

/** Cor do Kit → Color do Compose (ARGB). */
val Cor.cor: Color get() = Color(argb.toInt())

/** A paleta em Color do Compose (mesmos nomes do Kit). */
@Immutable
data class CoresTela(
    val tinta: Color, val tinta2: Color, val tinta3: Color,
    val fundo: Color, val superficie: Color, val borda: Color, val lime: Color,
    val heroi: Color, val sobreHeroi: Color, val sobreHeroi2: Color, val heroiDivisoria: Color, val heroiBorda: Color,
    val acao: Color, val sobreAcao: Color, val acaoTinta: Color, val acaoSuave: Color,
    val okFundo: Color, val okTinta: Color, val avisoFundo: Color, val avisoTinta: Color,
    val erroFundo: Color, val erroTinta: Color, val infoFundo: Color, val infoTinta: Color,
    val neutroFundo: Color, val neutroTinta: Color, val erro: Color, val skeleton: Color,
    val sombra: Color, val escuro: Boolean,
)

fun Cores.paraTela(): CoresTela = CoresTela(
    tinta.cor, tinta2.cor, tinta3.cor, fundo.cor, superficie.cor, borda.cor, lime.cor,
    heroi.cor, sobreHeroi.cor, sobreHeroi2.cor, heroiDivisoria.cor, heroiBorda.cor,
    acao.cor, sobreAcao.cor, acaoTinta.cor, acaoSuave.cor,
    okFundo.cor, okTinta.cor, avisoFundo.cor, avisoTinta.cor,
    erroFundo.cor, erroTinta.cor, infoFundo.cor, infoTinta.cor,
    neutroFundo.cor, neutroTinta.cor, erro.cor, skeleton.cor, sombra2.cor, escuro,
)

val LocalCores = staticCompositionLocalOf { coresDoClube(null, false).paraTela() }
val LocalTipos = staticCompositionLocalOf { Tipos() }

/** Acesso nas telas: `TactiPlan.cores.acao`, `TactiPlan.tipos.corpo15`. */
object TactiPlan {
    val cores: CoresTela @Composable get() = LocalCores.current
    val tipos: Tipos @Composable get() = LocalTipos.current
}

/** Tema do app com a personalização do clube em uso (null = identidade TactiPlan). */
@Composable
fun TactiPlanTema(
    personalizacao: Personalizacao?,
    escuro: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val cores = remember(personalizacao, escuro) { coresDoClube(personalizacao, escuro).paraTela() }
    val tipos = remember { Tipos() }
    val base = if (escuro) darkColorScheme() else lightColorScheme()
    val esquema = base.copy(
        primary = cores.acao,
        onPrimary = cores.sobreAcao,
        secondaryContainer = cores.acaoSuave,
        onSecondaryContainer = cores.acaoTinta,
        background = cores.fundo,
        onBackground = cores.tinta,
        surface = cores.superficie,
        onSurface = cores.tinta,
        onSurfaceVariant = cores.tinta2,
        outline = cores.borda,
        outlineVariant = cores.borda,
        error = cores.erro,
        surfaceContainerLow = cores.superficie,
        surfaceContainer = cores.superficie,
        surfaceContainerHigh = cores.superficie,
        surfaceContainerHighest = if (escuro) cores.borda else base.surfaceContainerHighest,
    )
    val tipografia = Typography(
        displayLarge = tipos.titulo32, displayMedium = tipos.titulo32, displaySmall = tipos.titulo24,
        headlineLarge = tipos.titulo32, headlineMedium = tipos.titulo24, headlineSmall = tipos.titulo20,
        titleLarge = tipos.titulo20, titleMedium = tipos.cabecalho17,
        titleSmall = tipos.corpo15.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = tipos.corpo17, bodyMedium = tipos.corpo15, bodySmall = tipos.corpo13,
        labelLarge = tipos.corpo15.copy(fontWeight = FontWeight.SemiBold),
        labelMedium = tipos.corpo13.copy(fontWeight = FontWeight.Medium), labelSmall = tipos.legenda11,
    )
    CompositionLocalProvider(LocalCores provides cores, LocalTipos provides tipos) {
        MaterialTheme(colorScheme = esquema, typography = tipografia, content = content)
    }
}
