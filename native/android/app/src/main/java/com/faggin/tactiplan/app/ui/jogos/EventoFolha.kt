package com.faggin.tactiplan.app.ui.jogos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.faggin.tactiplan.app.dados.jogo.EVENTO_AMARELO
import com.faggin.tactiplan.app.dados.jogo.EVENTO_GOL
import com.faggin.tactiplan.app.dados.jogo.EVENTO_GOL_SOFRIDO
import com.faggin.tactiplan.app.dados.jogo.EVENTO_SUBSTITUICAO
import com.faggin.tactiplan.app.dados.jogo.EVENTO_VERMELHO
import com.faggin.tactiplan.app.dados.jogo.EditorJogo
import com.faggin.tactiplan.app.dados.jogo.EventoJogo
import com.faggin.tactiplan.app.dados.jogo.FormEvento
import com.faggin.tactiplan.app.dados.jogo.OpcaoAtleta
import com.faggin.tactiplan.app.dados.jogo.ProblemaSubstituicao
import com.faggin.tactiplan.app.dados.jogo.ResultadoForm
import com.faggin.tactiplan.app.dados.jogo.rotuloDoEvento
import com.faggin.tactiplan.app.dados.jogo.rotuloTipoGol
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao

// Eventos do jogo: a linha do tempo (aba Eventos) e a folha "Novo evento" (EventModal do web).

private val LARANJA = Color(0xFFF59E0B)

@Composable
fun IconeEvento(tipo: String) {
    val (cor, simbolo) = when (tipo) {
        EVENTO_GOL -> corHex("#22c55e") to "⚽"
        EVENTO_GOL_SOFRIDO -> corHex("#ef4444") to "⚽"
        EVENTO_AMARELO -> corHex("#eab308") to "▮"
        EVENTO_VERMELHO -> corHex("#dc2626") to "▮"
        EVENTO_SUBSTITUICAO -> corHex("#3b82f6") to "⇄"
        else -> corHex("#f59e0b") to "!"
    }
    Box(Modifier.size(34.dp).clip(RoundedCornerShape(50)).background(cor.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        Text(simbolo, color = cor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun AbaEventos(ed: EditorJogo, editavel: Boolean, plantel: List<com.faggin.tactiplan.app.dados.jogo.AtletaResumo>,
               abrir: (EventoJogo) -> Unit, apagar: (EventoJogo) -> Unit) {
    val c = TactiPlan.cores
    if (ed.eventos.isEmpty()) {
        EstadoVazio(Icones.relogio, "Nenhum evento registrado",
            "Toque em \"+ Evento\" para registrar gols, cartões${if (ed.config.rastreiaMinutos) " e substituições" else ""}.")
        return
    }
    Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
        val lista = ed.eventosOrdenados
        lista.forEachIndexed { i, e ->
            val prob = ed.problemaDaSubstituicao(e)
            val detalhe = ed.detalheDoEvento(e, plantel)
            val tipoGol = rotuloTipoGol(e.tipoGol)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp)
                    .then(if (prob != null) Modifier.clip(RoundedCornerShape(10.dp)).background(LARANJA.copy(alpha = 0.08f))
                        .border(1.dp, LARANJA.copy(alpha = 0.6f), RoundedCornerShape(10.dp)) else Modifier)
                    .then(if (editavel) Modifier.clickable(role = Role.Button) { abrir(e) } else Modifier)
                    .padding(vertical = 8.dp, horizontal = 4.dp).testTag("jogo:evento:${e.id}")
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${e.minuto?.let { "$it minutos" } ?: "sem minuto"}. ${rotuloDoEvento(e)}. $tipoGol. ${detalhe ?: ""}"
                    },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                IconeEvento(e.tipo)
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(e.minuto?.let { "$it'" } ?: "—", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Bold, color = c.tinta2)
                        Text(rotuloDoEvento(e), style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                        if (tipoGol.isNotEmpty()) Text(tipoGol, style = TactiPlan.tipos.legenda11, color = c.tinta2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    detalhe?.let {
                        Text(it, style = TactiPlan.tipos.corpo13, color = if (prob != null) c.avisoTinta else c.tinta,
                            fontWeight = if (prob != null) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
                if (editavel) IconButton(onClick = { apagar(e) }, modifier = Modifier.size(40.dp).testTag("jogo:apagar:${e.id}")) {
                    Icon(Icones.lixeira, "Excluir evento", tint = c.tinta2, modifier = Modifier.size(18.dp))
                }
            }
            if (i < lista.lastIndex) HorizontalDivider(color = c.borda)
        }
    }
}

// ---------------------------------------------------------------- folha do evento

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EventoFolha(ed: EditorJogo, editando: EventoJogo?, fechar: () -> Unit, salvar: (EventoJogo) -> Unit, excluir: ((EventoJogo) -> Unit)?) {
    val c = TactiPlan.cores
    val haptico = LocalHapticFeedback.current
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var f by remember { mutableStateOf(FormEvento.novo(editando, ed.dados.duracao, ed.modalidade)) }
    var erro by remember { mutableStateOf<String?>(null) }
    var confirmarSemAutor by remember { mutableStateOf(false) }

    fun concluir(confirmou: Boolean) {
        when (val r = f.montar(ed, confirmouSemAutor = confirmou)) {
            is ResultadoForm.Erro -> erro = r.mensagem
            ResultadoForm.ConfirmarSemAutor -> confirmarSemAutor = true
            is ResultadoForm.Ok -> {
                haptico.performHapticFeedback(HapticFeedbackType.Confirm)
                salvar(r.evento)
            }
        }
    }

    ModalBottomSheet(onDismissRequest = fechar, sheetState = estado, containerColor = c.fundo) {
        Column(
            Modifier.padding(horizontal = 16.dp).navigationBarsPadding().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = fechar) { Text("Cancelar", color = c.acaoTinta) }
                Text(if (editando != null) "Editar evento" else "Novo evento", style = TactiPlan.tipos.cabecalho17, color = c.tinta,
                    modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Box(Modifier.size(64.dp, 1.dp))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                f.tipos.forEach { t ->
                    val sel = f.tipo == t.valor
                    val cor = corHex(t.corHex)
                    Text(t.rotulo, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = if (sel) cor else c.tinta,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (sel) cor.copy(alpha = 0.14f) else c.superficie)
                            .border(if (sel) 2.dp else 1.dp, if (sel) cor else c.borda, RoundedCornerShape(50))
                            .clickable(role = Role.RadioButton) { f = f.mudarTipo(t.valor); erro = null }
                            .semantics { selected = sel }
                            .heightIn(min = 40.dp).padding(horizontal = 14.dp, vertical = 10.dp).testTag("evento:tipo:${t.valor}"))
                }
            }
            if (f.ehGol) {
                Rotulo(if (f.tipo == EVENTO_GOL_SOFRIDO) "Em qual momento sofremos?" else "Em qual momento marcamos?")
                Opcoes(f.momentos.map { it.valor to it.curto }, f.momento) { f = f.copy(momento = it) }
                if (f.momento == "bp") {
                    Rotulo("Tipo de bola parada")
                    Opcoes(f.subtiposBP.map { it.valor to it.rotulo }, f.subtipoBP) { f = f.copy(subtipoBP = it) }
                }
            }
            if (f.mostraTime) {
                Rotulo("De qual time?")
                Segmentos(listOf("own" to "Nosso Time", "opponent" to "Adversário"), f.time) { f = f.copy(time = it) }
            }
            CartaoMinuto(f, { f = it })
            if (f.ehSubstituicao) {
                Rotulo("↓ Quem saiu (em campo aos ${f.minutoTexto})")
                val sai = f.opcoesSai(ed)
                if (sai.isEmpty()) FaixaTom(f.semNinguemEmCampo(), Tom.AVISO)
                else ListaEscolha(sai, f.jogador2Id, ed, "sai") { f = f.copy(jogador2Id = it); erro = null }
                Rotulo("↑ Quem entrou (banco)")
                val entra = f.opcoesEntra(ed)
                if (entra.isEmpty()) FaixaTom(FormEvento.SEM_RESERVA, Tom.AVISO)
                else ListaEscolha(entra, f.jogadorId, ed, "entra") { f = f.copy(jogadorId = it); erro = null }
            }
            if (f.mostraJogador) {
                Rotulo(if (f.tipo == EVENTO_GOL) "Autor do gol" else "Atleta")
                val ops = f.opcoesJogador(ed)
                if (ops.isEmpty()) Text("Nenhum jogador na escalação", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                else ListaEscolha(ops, f.jogadorId, ed, "jogador", permiteNenhum = f.tipo == EVENTO_GOL) { f = f.copy(jogadorId = it); erro = null }
            }
            if (f.mostraAssistencia) {
                Rotulo("Assistência (opcional)")
                ListaEscolha(f.opcoesAssistencia(ed), f.jogador2Id, ed, "assist", permiteNenhum = true, rotuloNenhum = "Sem assistência") {
                    f = f.copy(jogador2Id = it)
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.infoFundo).padding(12.dp)) {
                Text(f.resumo(ed), style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.infoTinta,
                    modifier = Modifier.testTag("evento:resumo"))
                f.previaMinutagem(ed)?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.infoTinta) }
            }
            erro?.let { FaixaTom(it, Tom.ERRO, Icones.alerta) }
            Botao(if (editando != null) "Salvar evento" else "Adicionar", { concluir(false) }, Modifier.testTag("evento:salvar"))
            if (editando != null && excluir != null) Botao("Excluir evento", { excluir(editando) }, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
            Box(Modifier.size(1.dp, 12.dp))
        }
    }
    if (confirmarSemAutor) {
        AlertDialog(
            onDismissRequest = { confirmarSemAutor = false },
            title = { Text("Salvar gol sem atribuir ao atleta?") },
            confirmButton = { TextButton(onClick = { confirmarSemAutor = false; concluir(true) }) { Text("Salvar") } },
            dismissButton = { TextButton(onClick = { confirmarSemAutor = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Rotulo(t: String) = Text(t, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = TactiPlan.cores.tinta2)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Opcoes(ops: List<Pair<String, String>>, atual: String, mudar: (String) -> Unit) {
    val c = TactiPlan.cores
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ops.forEach { (v, r) ->
            val sel = v == atual
            Text(r, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = if (sel) c.acaoTinta else c.tinta,
                modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(if (sel) c.acaoSuave else c.superficie)
                    .border(if (sel) 2.dp else 1.dp, if (sel) c.acaoTinta else c.borda, RoundedCornerShape(10.dp))
                    .clickable(role = Role.RadioButton) { mudar(v) }.semantics { selected = sel }
                    .heightIn(min = 40.dp).padding(horizontal = 12.dp, vertical = 10.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Segmentos(ops: List<Pair<String, String>>, atual: String, mudar: (String) -> Unit) {
    val c = TactiPlan.cores
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        ops.forEachIndexed { i, (v, r) ->
            SegmentedButton(selected = v == atual, onClick = { mudar(v) }, shape = SegmentedButtonDefaults.itemShape(i, ops.size),
                colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta)) { Text(r) }
        }
    }
}

@Composable
private fun CartaoMinuto(f: FormEvento, mudar: (FormEvento) -> Unit) {
    val c = TactiPlan.cores
    Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Minuto", style = TactiPlan.tipos.legenda11, color = c.tinta2)
                Text(f.minutoTexto, style = TactiPlan.tipos.titulo32, color = c.tinta, modifier = Modifier.testTag("evento:minuto"))
            }
            IconButton(onClick = { mudar(f.passo(-1)) }, modifier = Modifier.testTag("evento:menos")) {
                Icon(Icones.menos, "Um minuto a menos", tint = c.acaoTinta)
            }
            IconButton(onClick = { mudar(f.passo(1)) }, modifier = Modifier.testTag("evento:mais")) {
                Icon(Icones.adicionar, "Um minuto a mais", tint = c.acaoTinta)
            }
        }
        Segmentos(listOf("1" to "1º Tempo", "2" to "2º Tempo"), f.tempo.toString()) { mudar(f.mudarTempo(it.toInt())) }
        Text("Minuto (${f.faixaDoTempo})", style = TactiPlan.tipos.legenda11, color = c.tinta2, modifier = Modifier.padding(top = 8.dp))
        val max = maxOf(1, f.maxNoTempo)
        Slider(
            value = f.minutoNoTempo.toFloat().coerceIn(1f, max.toFloat()), onValueChange = { mudar(f.mudarMinuto(Math.round(it))) },
            valueRange = 1f..max.toFloat().coerceAtLeast(1.001f), steps = maxOf(0, max - 2),
            modifier = Modifier.semantics { contentDescription = "Minuto do tempo: ${f.minutoNoTempo}" },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Acréscimo", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.weight(1f))
            IconButton(onClick = { mudar(f.mudarAcrescimo(f.acrescimo - 1)) }, enabled = f.acrescimo > 0) {
                Icon(Icones.menos, "Menos acréscimo", tint = c.acaoTinta)
            }
            Text("+${f.acrescimo}", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold,
                color = if (f.acrescimo > 0) c.acaoTinta else c.tinta)
            IconButton(onClick = { mudar(f.mudarAcrescimo(f.acrescimo + 1)) }, enabled = f.acrescimo < 15) {
                Icon(Icones.adicionar, "Mais acréscimo", tint = c.acaoTinta)
            }
        }
    }
}

@Composable
private fun ListaEscolha(
    ops: List<OpcaoAtleta>, atual: String, ed: EditorJogo, tag: String,
    permiteNenhum: Boolean = false, rotuloNenhum: String = "Sem autor", mudar: (String) -> Unit,
) {
    val c = TactiPlan.cores
    Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 2.dp)) {
        if (permiteNenhum) {
            LinhaEscolha(rotuloNenhum, null, null, atual.isEmpty(), "evento:$tag:nenhum") { mudar("") }
            HorizontalDivider(color = c.borda)
        }
        ops.forEachIndexed { i, o ->
            val p = ed.jogador(o.id)
            val sub = listOfNotNull(
                p?.vaga?.let { com.faggin.tactiplan.app.dados.jogo.etiquetaDaVaga(ed.formacao, it, ed.modalidade) },
                if (p?.reserva == true) "banco" else null,
            ).joinToString(" · ")
            LinhaEscolha(o.nome, o.camisa, sub.ifEmpty { null }, o.id == atual, "evento:$tag:${o.id}") { mudar(o.id) }
            if (i < ops.lastIndex) HorizontalDivider(color = c.borda)
        }
    }
}

@Composable
private fun LinhaEscolha(nome: String, camisa: Int?, sub: String?, sel: Boolean, tag: String, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(10.dp))
            .background(if (sel) c.acaoSuave else Color.Transparent)
            .clickable(role = Role.RadioButton, onClick = aoTocar).semantics { selected = sel }
            .padding(horizontal = 8.dp, vertical = 6.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (camisa != null || sub != null) AvatarCamisa(camisa, nome, 30.dp)
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text(nome, style = TactiPlan.tipos.corpo15, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, style = TactiPlan.tipos.legenda11, color = c.tinta2) }
        }
        if (sel) Icon(Icones.check, "Selecionado", tint = c.acaoTinta, modifier = Modifier.size(20.dp))
    }
}
