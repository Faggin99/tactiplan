package com.faggin.tactiplan.app.ui.t3

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.treino.dataBR
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FORMA_CAMPO
import com.faggin.tactiplan.app.ui.comum.Icones
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// Peças comuns das telas da T3 (Elenco, Staff, Estatísticas, Cadastros), no visual do T1/T2.

/** Abas internas (TabRow com sublinhado na cor do clube). */
@Composable
fun AbasInternas(abas: List<String>, sel: Int, aoMudar: (Int) -> Unit, prefixoTag: String) {
    val c = TactiPlan.cores
    TabRow(
        selectedTabIndex = sel, containerColor = c.fundo, contentColor = c.acaoTinta,
        indicator = { pos -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(pos[sel]), color = c.acaoTinta) },
    ) {
        abas.forEachIndexed { i, t ->
            Tab(selected = i == sel, onClick = { aoMudar(i) }, modifier = Modifier.testTag("$prefixoTag:$i"),
                text = { Text(t, fontWeight = FontWeight.SemiBold, color = if (i == sel) c.acaoTinta else c.tinta2) })
        }
    }
}

/** Chips de escolha numa linha que rola. */
@Composable
fun LinhaChips(opcoes: List<Pair<String, String>>, sel: String?, aoEscolher: (String) -> Unit, prefixoTag: String) {
    val c = TactiPlan.cores
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        opcoes.forEach { (id, rotulo) ->
            FilterChip(
                selected = id == sel, onClick = { aoEscolher(id) }, label = { Text(rotulo) },
                modifier = Modifier.heightIn(min = 40.dp).testTag("$prefixoTag:$id"),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = c.acaoSuave, selectedLabelColor = c.acaoTinta, containerColor = c.superficie, labelColor = c.tinta,
                ),
            )
        }
    }
}

/** Seletor (menu) com rótulo: "Posição · VOL". */
@Composable
fun Seletor(rotulo: String, valor: String?, opcoes: List<Pair<String?, String>>, aoEscolher: (String?) -> Unit,
            modifier: Modifier = Modifier, habilitado: Boolean = true, tag: String = "") {
    val c = TactiPlan.cores
    var aberto by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth().clip(FORMA_CAMPO).border(1.dp, c.borda, FORMA_CAMPO).background(c.superficie)
                .clickable(enabled = habilitado, role = Role.DropdownList) { aberto = true }
                .padding(horizontal = 16.dp, vertical = 10.dp).testTag(tag)
                .semantics { contentDescription = "$rotulo: ${opcoes.firstOrNull { it.first == valor }?.second ?: "nenhum"}" },
        ) {
            Text(rotulo, style = TactiPlan.tipos.legenda11, color = c.tinta2)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(opcoes.firstOrNull { it.first == valor }?.second ?: "Selecione", style = TactiPlan.tipos.corpo15,
                    color = if (habilitado) c.tinta else c.tinta3, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icones.baixo, null, tint = c.tinta2, modifier = Modifier.size(18.dp))
            }
        }
        DropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
            opcoes.forEach { (id, r) ->
                DropdownMenuItem(text = { Text(r) }, onClick = { aberto = false; aoEscolher(id) }, modifier = Modifier.testTag("$tag:${id ?: "nenhum"}"))
            }
        }
    }
}

private fun msDe(data: String?): Long? = try {
    data?.let { LocalDate.parse(it.take(10)).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
} catch (_: Exception) { null }

private fun dataDeMs(ms: Long): String = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString()

/** Campo de data (DatePicker do Material 3). `limpar` mostra "Limpar". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampoData(rotulo: String, valor: String?, aoMudar: (String?) -> Unit, limpar: Boolean = true, tag: String = "", modifier: Modifier = Modifier) {
    val c = TactiPlan.cores
    var aberto by remember { mutableStateOf(false) }
    Column(
        modifier.fillMaxWidth().clip(FORMA_CAMPO).border(1.dp, c.borda, FORMA_CAMPO).background(c.superficie)
            .clickable(role = Role.Button) { aberto = true }.padding(horizontal = 16.dp, vertical = 10.dp).testTag(tag)
            .semantics { contentDescription = "$rotulo: ${valor?.let(::dataBR) ?: "sem data"}" },
    ) {
        Text(rotulo, style = TactiPlan.tipos.legenda11, color = c.tinta2)
        Text(valor?.let(::dataBR) ?: "—", style = TactiPlan.tipos.corpo15, color = c.tinta)
    }
    if (aberto) {
        val estado = rememberDatePickerState(initialSelectedDateMillis = msDe(valor))
        DatePickerDialog(
            onDismissRequest = { aberto = false },
            confirmButton = { TextButton(onClick = { aberto = false; estado.selectedDateMillis?.let { aoMudar(dataDeMs(it)) } }) { Text("OK") } },
            dismissButton = {
                Row {
                    if (limpar && valor != null) TextButton(onClick = { aberto = false; aoMudar(null) }) { Text("Limpar") }
                    TextButton(onClick = { aberto = false }) { Text("Cancelar") }
                }
            },
        ) { DatePicker(state = estado) }
    }
}

/** Campo numérico curto. */
@Composable
fun CampoNumero(valor: Int?, aoMudar: (Int?) -> Unit, rotulo: String, modifier: Modifier = Modifier) {
    var txt by remember(valor) { mutableStateOf(valor?.toString() ?: "") }
    Campo(txt, { t -> val f = t.filter(Char::isDigit).take(4); txt = f; aoMudar(f.toIntOrNull()) }, rotulo, modifier, teclado = KeyboardType.Number)
}

/** Texto de várias linhas. */
@Composable
fun CampoLongo(valor: String, aoMudar: (String) -> Unit, rotulo: String, tag: String = "") {
    val c = TactiPlan.cores
    OutlinedTextField(
        value = valor, onValueChange = aoMudar, label = { Text(rotulo) }, minLines = 3, shape = FORMA_CAMPO,
        textStyle = TactiPlan.tipos.corpo15.copy(color = c.tinta),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.acaoTinta, unfocusedBorderColor = c.borda,
            focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie, focusedLabelColor = c.acaoTinta,
            unfocusedLabelColor = c.tinta2, cursorColor = c.acaoTinta),
        modifier = Modifier.fillMaxWidth().testTag(tag),
    )
}

/** Confirmação (nunca diálogo do sistema): título, texto, ação perigosa ou não. */
@Composable
fun Confirmar(titulo: String, texto: String, acao: String, perigo: Boolean = true, aoConfirmar: () -> Unit, aoCancelar: () -> Unit) {
    val c = TactiPlan.cores
    AlertDialog(
        onDismissRequest = aoCancelar,
        title = { Text(titulo) },
        text = { Text(texto) },
        confirmButton = {
            TextButton(onClick = aoConfirmar, modifier = Modifier.testTag("confirmar:ok")) {
                Text(acao, color = if (perigo) c.erro else c.acaoTinta, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onClick = aoCancelar) { Text("Cancelar", color = c.tinta) } },
        containerColor = c.superficie, titleContentColor = c.tinta, textContentColor = c.tinta2,
    )
}

/** Carregando · erro com "Tentar de novo" · conteúdo. */
@Composable
fun Carregavel(carregando: Boolean, erro: String?, tentar: () -> Unit, conteudo: @Composable () -> Unit) {
    when {
        carregando -> Box(Modifier.fillMaxWidth().padding(vertical = 48.dp).semantics { contentDescription = "Carregando" },
            contentAlignment = Alignment.Center) { CircularProgressIndicator(color = TactiPlan.cores.acaoTinta) }
        erro != null -> EstadoVazio(Icones.nuvem, "Não foi possível carregar", erro, "Tentar de novo" to tentar)
        else -> conteudo()
    }
}

/** Barra horizontal (proporção 0…1) na cor dada. */
@Composable
fun Barra(fracao: Float, cor: Color, modifier: Modifier = Modifier) {
    val c = TactiPlan.cores
    Box(modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(c.borda)) {
        Box(Modifier.fillMaxWidth(fracao.coerceIn(0f, 1f)).height(8.dp).clip(RoundedCornerShape(4.dp)).background(cor))
    }
}

/** Cor de "#rrggbb". */
fun corHex(hex: String): Color = try { Color(android.graphics.Color.parseColor(hex)) } catch (_: Exception) { Color.Gray }
