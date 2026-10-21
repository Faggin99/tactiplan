package com.faggin.tactiplan.app.design

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Immutable
import com.faggin.tactiplan.app.R

// Tipografia (copiada do Gestsport; paridade: TactiPlanKit/Tipografia.swift): Poppins EMBUTIDA
// (res/font, OFL — licença em assets/licencas), a mesma do web do TactiPlan.
// Escala 32/24/20/17/15/13/11 · entrelinha 1.2 em título e 1.5 em corpo.

/** Poppins embutida: só os pesos que o app (e o web) usam. Peso acima de 700 cai na Bold. */
val Poppins = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

/** Feature OpenType dos algarismos de largura fixa (pedida; a Poppins ignora). */
const val TABULAR = "tnum"

/** Mesmo estilo com algarismos tabulares (datas, horas, contagens). */
fun TextStyle.tabular(): TextStyle = copy(fontFeatureSettings = TABULAR)

/** Entrelinha do título (1.2) e do corpo (1.5). */
const val ENTRELINHA_TITULO = 1.2f
const val ENTRELINHA_CORPO = 1.5f

/** Estilo de título/valor: Poppins. */
fun estiloTitulo(tamanho: Int, peso: FontWeight = FontWeight.Bold) = TextStyle(
    fontFamily = Poppins, fontWeight = peso,
    fontSize = tamanho.sp, lineHeight = ENTRELINHA_TITULO.em,
    letterSpacing = if (tamanho >= 24) (-0.01).em else 0.em, // "tracking-tight" dos títulos grandes
)

/** Estilo de corpo: Poppins. */
fun estiloCorpo(tamanho: Int, peso: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = Poppins, fontWeight = peso,
    fontSize = tamanho.sp, lineHeight = ENTRELINHA_CORPO.em,
)

/**
 * Os tokens de tipo que as telas usam (`TactiPlan.tipos.titulo32`…). Mesmo nome
 * e mesmos valores no iOS (`Tipo.titulo32`…).
 */
@Immutable
data class Tipos(
    /** Título grande da tela (cabeçalho expandido, Entrar). */
    val titulo32: TextStyle = estiloTitulo(32, FontWeight.Bold),
    val titulo24: TextStyle = estiloTitulo(24, FontWeight.Bold),
    val titulo20: TextStyle = estiloTitulo(20, FontWeight.Bold),
    /** Título do cabeçalho encolhido (17, centralizado). */
    val cabecalho17: TextStyle = estiloTitulo(17, FontWeight.Bold),
    val corpo17: TextStyle = estiloCorpo(17),
    val corpo15: TextStyle = estiloCorpo(15),
    val corpo13: TextStyle = estiloCorpo(13),
    /** Rótulo pequeno / metadado. */
    val legenda11: TextStyle = estiloCorpo(11, FontWeight.Medium),
    /** Dinheiro e saldo em destaque: Poppins Bold, tabular. */
    val valor: TextStyle = estiloTitulo(28, FontWeight.Bold).tabular(),
)

/**
 * H5 (acessibilidade): quantas linhas um texto de LISTA pode ocupar. Com fontScale ≥ 1,5
 * (tamanhos grandes do Android; no iOS, os de acessibilidade do Dynamic Type) o texto quebra em
 * até 3 linhas em vez de ser cortado com "…"; no tamanho normal fica como o desenho (`base`).
 * Paridade: `linhasParaFonte` em TactiPlanKit/Tipografia.swift.
 */
fun linhasParaFonte(base: Int, grande: Boolean): Int = if (grande) maxOf(base, 3) else maxOf(1, base)

/** O mesmo, lendo a escala de fonte do aparelho. */
@androidx.compose.runtime.Composable
fun linhasAcessiveis(base: Int = 1): Int =
    linhasParaFonte(base, androidx.compose.ui.platform.LocalDensity.current.fontScale >= 1.5f)
