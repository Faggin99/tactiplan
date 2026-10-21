package com.faggin.tactiplan.app.ui.comum

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.faggin.tactiplan.app.dados.iniciais
import com.faggin.tactiplan.app.dados.textoSemConexao
import com.faggin.tactiplan.app.design.TactiPlan

// Peças do layout (padrão Gestsport, identidade TactiPlan). Só cores do tema — nenhum hex solto:
// o modo escuro e a cor do clube trocam a paleta num lugar só. Paridade: TactiPlan/Componentes (iOS).

val FORMA_CARTAO = RoundedCornerShape(20.dp)
val FORMA_CAMPO = RoundedCornerShape(14.dp)
const val ALTURA_BOTAO = 52

/** Cartão: superfície, raio 20, sombra suave; toque opcional. */
@Composable
fun Cartao(
    modifier: Modifier = Modifier,
    aoTocar: (() -> Unit)? = null,
    preenchimento: PaddingValues = PaddingValues(16.dp),
    conteudo: @Composable ColumnScope.() -> Unit,
) {
    val c = TactiPlan.cores
    Column(
        modifier
            .fillMaxWidth()
            .shadow(if (c.escuro) 0.dp else 6.dp, FORMA_CARTAO, ambientColor = c.sombra, spotColor = c.sombra)
            .clip(FORMA_CARTAO)
            .background(c.superficie)
            .then(if (c.escuro) Modifier.border(1.dp, c.borda, FORMA_CARTAO) else Modifier)
            .then(if (aoTocar != null) Modifier.clickable(role = Role.Button, onClick = aoTocar) else Modifier)
            .padding(preenchimento),
        content = conteudo,
    )
}

/** Cartão-herói: fundo navy da identidade (igual em todo clube), rótulo, valor grande e frase. */
@Composable
fun CartaoHeroi(
    rotulo: String,
    valor: String,
    modifier: Modifier = Modifier,
    frase: String? = null,
    selo: String? = null,
    rodape: (@Composable () -> Unit)? = null,
) {
    val c = TactiPlan.cores
    Column(
        modifier
            .fillMaxWidth()
            .clip(FORMA_CARTAO)
            .background(c.heroi)
            .border(1.dp, c.heroiBorda, FORMA_CARTAO)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(rotulo, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.sobreHeroi2,
                modifier = Modifier.weight(1f))
            if (selo != null) {
                Text(selo, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = c.heroi,
                    modifier = Modifier.clip(CircleShape).background(c.lime).padding(horizontal = 10.dp, vertical = 4.dp))
            }
        }
        Text(valor, style = TactiPlan.tipos.titulo32, color = c.sobreHeroi, modifier = Modifier.padding(top = 6.dp),
            maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (!frase.isNullOrEmpty()) {
            Text(frase, style = TactiPlan.tipos.corpo13, color = c.sobreHeroi2, modifier = Modifier.padding(top = 2.dp))
        }
        if (rodape != null) {
            HorizontalDivider(Modifier.padding(top = 14.dp, bottom = 8.dp), color = c.heroiDivisoria)
            rodape()
        }
    }
}

enum class VarianteBotao { PRIMARIO, SECUNDARIO, NEUTRO, PERIGO }

/** Botão de 52 dp. Primário: cor de ação do clube com o texto que passa AA (branco ou navy). */
@Composable
fun Botao(
    texto: String,
    aoTocar: () -> Unit,
    modifier: Modifier = Modifier,
    variante: VarianteBotao = VarianteBotao.PRIMARIO,
    habilitado: Boolean = true,
    icone: ImageVector? = null,
) {
    val c = TactiPlan.cores
    val m = modifier.fillMaxWidth().heightIn(min = ALTURA_BOTAO.dp)
    val conteudo: @Composable () -> Unit = {
        if (icone != null) {
            Icon(icone, null, Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
        }
        Text(texto, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold)
    }
    if (variante == VarianteBotao.PRIMARIO) {
        Button(
            onClick = aoTocar, enabled = habilitado, modifier = m, shape = FORMA_CAMPO,
            colors = ButtonDefaults.buttonColors(
                containerColor = c.acao, contentColor = c.sobreAcao,
                disabledContainerColor = c.acao.copy(alpha = 0.5f), disabledContentColor = c.sobreAcao.copy(alpha = 0.8f),
            ),
        ) { conteudo() }
    } else {
        val cor = when (variante) {
            VarianteBotao.SECUNDARIO -> c.acaoTinta
            VarianteBotao.PERIGO -> c.erro
            else -> c.tinta
        }
        OutlinedButton(
            onClick = aoTocar, enabled = habilitado, modifier = m, shape = FORMA_CAMPO,
            border = androidx.compose.foundation.BorderStroke(1.5.dp, if (variante == VarianteBotao.NEUTRO) c.borda else cor),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = c.superficie, contentColor = cor),
        ) { conteudo() }
    }
}

/** Ação discreta (link de texto), alvo de 48 dp. */
@Composable
fun BotaoTexto(texto: String, aoTocar: () -> Unit, habilitado: Boolean = true, cor: Color? = null) {
    TextButton(onClick = aoTocar, enabled = habilitado, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(texto, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold,
            color = cor ?: TactiPlan.cores.acaoTinta)
    }
}

/** Campo de uma linha (52 dp), contorno borda → cor de ação com foco. */
@Composable
fun Campo(
    valor: String,
    aoMudar: (String) -> Unit,
    rotulo: String,
    modifier: Modifier = Modifier,
    secreto: Boolean = false,
    teclado: KeyboardType = KeyboardType.Text,
    acao: ImeAction = ImeAction.Next,
    aoConfirmar: (() -> Unit)? = null,
    habilitado: Boolean = true,
) {
    val c = TactiPlan.cores
    OutlinedTextField(
        value = valor, onValueChange = aoMudar, enabled = habilitado, singleLine = true,
        label = { Text(rotulo) },
        textStyle = TactiPlan.tipos.corpo17.copy(color = c.tinta),
        visualTransformation = if (secreto) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = teclado, imeAction = acao, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onDone = { aoConfirmar?.invoke() }, onGo = { aoConfirmar?.invoke() }),
        shape = FORMA_CAMPO,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = c.acaoTinta, unfocusedBorderColor = c.borda,
            focusedLabelColor = c.acaoTinta, unfocusedLabelColor = c.tinta2, cursorColor = c.acaoTinta,
            focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie,
            disabledContainerColor = c.superficie,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}

/** Estado vazio ilustrado (nunca "nenhum registro"): ícone em círculo, título, texto e ação opcional. */
@Composable
fun EstadoVazio(icone: ImageVector, titulo: String, texto: String, acao: Pair<String, () -> Unit>? = null) {
    val c = TactiPlan.cores
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(88.dp).clip(CircleShape).background(c.acaoSuave), contentAlignment = Alignment.Center) {
            Icon(icone, null, tint = c.acaoTinta, modifier = Modifier.size(36.dp))
        }
        Text(titulo, style = TactiPlan.tipos.titulo20, color = c.tinta, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 20.dp).semantics { heading() })
        Text(texto, style = TactiPlan.tipos.corpo15, color = c.tinta2, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp).widthIn(max = 320.dp))
        if (acao != null) {
            Spacer(Modifier.height(20.dp))
            Botao(acao.first, acao.second, variante = VarianteBotao.SECUNDARIO, modifier = Modifier.widthIn(max = 280.dp))
        }
    }
}

/** Rótulo de seção em caixa alta (tinta2). */
@Composable
fun RotuloSecao(texto: String, modifier: Modifier = Modifier) {
    Text(texto.uppercase(), style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.7.sp, color = TactiPlan.cores.tinta2, modifier = modifier.semantics { heading() })
}

/** Seção da lista agrupada (Mais): rótulo + UM cartão com as linhas. */
@Composable
fun ListaAgrupada(titulo: String? = null, linhas: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (titulo != null) RotuloSecao(titulo, Modifier.padding(horizontal = 4.dp))
        Cartao(preenchimento = PaddingValues(horizontal = 16.dp, vertical = 2.dp), conteudo = linhas)
    }
}

@Composable
fun Divisoria() = HorizontalDivider(color = TactiPlan.cores.borda)

@Composable
private fun IconeLinha(icone: ImageVector, perigo: Boolean = false) {
    val c = TactiPlan.cores
    Box(
        Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(if (perigo) c.erroFundo else c.acaoSuave),
        contentAlignment = Alignment.Center,
    ) { Icon(icone, null, tint = if (perigo) c.erroTinta else c.acaoTinta, modifier = Modifier.size(17.dp)) }
}

/** Linha da lista agrupada: ícone, título, detalhe, selo e "›" quando navega. */
@Composable
fun LinhaAgrupada(
    icone: ImageVector,
    titulo: String,
    detalhe: String? = null,
    selo: String? = null,
    perigo: Boolean = false,
    aoTocar: (() -> Unit)? = null,
    final: (@Composable () -> Unit)? = null,
) {
    val c = TactiPlan.cores
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .then(if (aoTocar != null) Modifier.clickable(role = Role.Button, onClick = aoTocar) else Modifier)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (final == null) IconeLinha(icone, perigo) else final()
        Column(Modifier.weight(1f)) {
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold,
                color = if (perigo) c.erroTinta else c.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!detalhe.isNullOrEmpty()) Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 2,
                overflow = TextOverflow.Ellipsis)
        }
        if (selo != null) Pastilha(selo)
        if (aoTocar != null) Icon(Icones.direita, null, tint = c.tinta3, modifier = Modifier.size(18.dp))
    }
}

/** Linha com interruptor (ex.: "Exigir biometria ao abrir"). */
@Composable
fun LinhaInterruptor(
    icone: ImageVector,
    titulo: String,
    ligado: Boolean,
    aoMudar: (Boolean) -> Unit,
    detalhe: String? = null,
    habilitado: Boolean = true,
) {
    val c = TactiPlan.cores
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconeLinha(icone)
        Column(Modifier.weight(1f)) {
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
            if (!detalhe.isNullOrEmpty()) Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2)
        }
        Switch(
            checked = ligado, onCheckedChange = aoMudar, enabled = habilitado,
            colors = SwitchDefaults.colors(checkedTrackColor = c.acao, checkedThumbColor = c.sobreAcao),
        )
    }
}

enum class Tom { INFO, AVISO, OK, ERRO, NEUTRO }

/** Pastilha de estado (selo pequeno). */
@Composable
fun Pastilha(texto: String, tom: Tom = Tom.INFO) {
    val (fundo, tinta) = coresDoTom(tom)
    Text(texto, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = tinta, maxLines = 1,
        modifier = Modifier.clip(CircleShape).background(fundo).padding(horizontal = 10.dp, vertical = 4.dp))
}

@Composable
fun coresDoTom(tom: Tom): Pair<Color, Color> {
    val c = TactiPlan.cores
    return when (tom) {
        Tom.INFO -> c.infoFundo to c.infoTinta
        Tom.AVISO -> c.avisoFundo to c.avisoTinta
        Tom.OK -> c.okFundo to c.okTinta
        Tom.ERRO -> c.erroFundo to c.erroTinta
        Tom.NEUTRO -> c.neutroFundo to c.neutroTinta
    }
}

/** Faixa de aviso por tom (nunca vermelha para "sem sinal"). */
@Composable
fun FaixaTom(texto: String, tom: Tom, icone: ImageVector? = null, modifier: Modifier = Modifier) {
    val (fundo, tinta) = coresDoTom(tom)
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(fundo).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (icone != null) Icon(icone, null, tint = tinta, modifier = Modifier.size(18.dp))
        Text(texto, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Medium, color = tinta)
    }
}

/** "Sem conexão — mostrando o que foi visto por último · atualizado há X". Âmbar, nunca vermelho. */
@Composable
fun FaixaSemConexao(em: Long?, modifier: Modifier = Modifier) =
    FaixaTom(textoSemConexao(em), Tom.AVISO, Icones.nuvemSemRede, modifier)

/** Modo só leitura: faixa discreta com cadeado e a frase neutra (sem link/botão/preço). */
@Composable
fun FaixaSomenteLeitura(texto: String, modifier: Modifier = Modifier) =
    FaixaTom(texto, Tom.NEUTRO, Icones.cadeado, modifier)

/** Avatar de iniciais. */
@Composable
fun AvatarIniciais(nome: String?, tamanho: Dp = 36.dp) {
    val c = TactiPlan.cores
    Box(Modifier.size(tamanho).clip(CircleShape).background(c.acaoSuave), contentAlignment = Alignment.Center) {
        Text(iniciais(nome), color = c.acaoTinta, fontWeight = FontWeight.SemiBold,
            style = TactiPlan.tipos.corpo15.copy(fontSize = (tamanho.value * 0.38f).sp))
    }
}

/** Logo do clube (imagem do servidor) ou o escudo com as iniciais na cor do clube. */
@Composable
fun LogoClube(url: String?, nome: String, cor: Color, sobreCor: Color, tamanho: Dp = 40.dp) {
    val img = imagemRemota(url)
    Surface(shape = RoundedCornerShape(12.dp), color = if (img != null) TactiPlan.cores.superficie else cor,
        modifier = Modifier.size(tamanho)) {
        Box(contentAlignment = Alignment.Center) {
            if (img != null) {
                androidx.compose.foundation.Image(img, contentDescription = "Logo do $nome",
                    modifier = Modifier.size(tamanho - 6.dp))
            } else {
                Text(iniciais(nome), color = sobreCor, fontWeight = FontWeight.Bold,
                    style = TactiPlan.tipos.corpo15.copy(fontSize = (tamanho.value * 0.36f).sp))
            }
        }
    }
}
