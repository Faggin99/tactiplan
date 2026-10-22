package com.faggin.tactiplan.app.ui.jogos

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.jogo.ApiJogo
import com.faggin.tactiplan.app.dados.jogo.Campeonato
import com.faggin.tactiplan.app.dados.jogo.JogoDaLista
import com.faggin.tactiplan.app.dados.jogo.MSG_CRIAR_SEM_REDE
import com.faggin.tactiplan.app.dados.jogo.PeriodoJogos
import com.faggin.tactiplan.app.dados.jogo.ResultadoEnvio
import com.faggin.tactiplan.app.dados.jogo.ServicoJogo
import com.faggin.tactiplan.app.dados.jogo.SincronizadorJogos
import com.faggin.tactiplan.app.dados.jogo.corpoRelatorioJogos
import com.faggin.tactiplan.app.dados.jogo.detalheDaLinhaJogo
import com.faggin.tactiplan.app.dados.jogo.emQuantosDias
import com.faggin.tactiplan.app.dados.jogo.mensagemErroJogo
import com.faggin.tactiplan.app.dados.jogo.nomePdfJogos
import com.faggin.tactiplan.app.dados.jogo.organizarJogos
import com.faggin.tactiplan.app.dados.jogo.placarDaLinha
import com.faggin.tactiplan.app.dados.jogo.resultadoDo
import com.faggin.tactiplan.app.dados.jogo.rotuloLocal
import com.faggin.tactiplan.app.dados.semRede
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.treino.TipoDia
import com.faggin.tactiplan.app.dados.treino.diaVazio
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.rotuloDiaCurto
import com.faggin.tactiplan.app.dados.treino.rotuloDiaMinusculo
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.CartaoHeroi
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

// Aba JOGOS (T2): próximo jogo em destaque, resultados com V/E/D, filtro por período e campeonato,
// criar jogo (um dia do tipo jogo) e o Jogo. Paridade: TactiPlan/Jogos (iOS).

const val TAG_JOGO = "jogos:jogo:"
const val TAG_NOVO_JOGO = "jogos:novo"

@Composable
fun JogosAba(amb: AmbienteClube, treino: ServicoTreino, api: ApiJogo) {
    var aberto by rememberSaveable { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    val id = aberto
    if (id != null) {
        JogoTela(amb, treino, api, id, voltar = { aberto = null; versao++ })
    } else {
        ListaJogosTela(amb, treino, api, versao, abrir = { aberto = it })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListaJogosTela(amb: AmbienteClube, treino: ServicoTreino, api: ApiJogo, versaoExterna: Int, abrir: (String) -> Unit) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val clubeId = ctx.clube?.id
    val hoje = hojeBrasilia()
    var periodo by rememberSaveable { mutableStateOf(PeriodoJogos.TRES_MESES) }
    var campeonatoId by rememberSaveable { mutableStateOf<String?>(null) }
    var jogos by remember { mutableStateOf<List<JogoDaLista>?>(null) }
    var campeonatos by remember { mutableStateOf<List<Campeonato>>(emptyList()) }
    var carregando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var semRedeAgora by remember { mutableStateOf(false) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var exportando by remember { mutableStateOf(false) }
    var novo by remember { mutableStateOf(false) }
    val fila = remember(amb.usuarioId) { filaJogosDoAparelho(context, amb.usuarioId) }
    var pendentes by remember { mutableIntStateOf(fila.todas().size) }

    LaunchedEffect(clubeId, periodo, versao, versaoExterna) {
        if (clubeId == null) return@LaunchedEffect
        carregando = true
        // Jogos guardados sem sinal: tenta enviar ao abrir a aba.
        if (fila.todas().isNotEmpty()) {
            val r = SincronizadorJogos(ServicoJogo(api, clubeId, ctx.clube?.modalidade), fila).enviarTodas()
            r.values.firstOrNull { it is ResultadoEnvio.SessaoEncerrada }?.let { amb.tratarErro((it as ResultadoEnvio.SessaoEncerrada).erro) }
            if (r.values.any { it is ResultadoEnvio.Enviado && it.conflito }) aviso = com.faggin.tactiplan.app.dados.jogo.MSG_CONFLITO
            pendentes = fila.todas().size
        }
        val (ini, fim) = periodo.intervalo(hoje)
        try {
            jogos = api.listarJogos(clubeId, ini, fim)
            erro = null
            semRedeAgora = false
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) {
                semRedeAgora = semRede(e)
                if (!(semRedeAgora && jogos != null)) erro = mensagemErroJogo(e)
            }
        }
        campeonatos = runCatching { api.campeonatos(clubeId) }.getOrDefault(campeonatos)
        carregando = false
    }

    val lista = remember(jogos, campeonatoId, hoje) { jogos?.let { organizarJogos(it, hoje, campeonatoId) } }
    val nomeCamp: (String?) -> String? = { id -> campeonatos.firstOrNull { it.id == id }?.nome }
    val podeCriar = ctx.podeEditar("games:edit") && ctx.podeEditar("training:edit")
    val podeExportar = ctx.pode("stats:view") && ctx.conta.somenteLeitura != true

    fun exportar() {
        if (clubeId == null || exportando) return
        exportando = true
        aviso = null
        val (ini, _) = periodo.intervalo(hoje)
        escopo.launch {
            val r = gerarECompartilhar(context, treino.api, "jogos", corpoRelatorioJogos(clubeId, ini, hoje, periodo.rotulo),
                nomePdfJogos(ctx.nome, periodo.rotulo), amb.tratarErro)
            if (r is InicioExportar.Erro) aviso = r.mensagem
            exportando = false
        }
    }

    PullToRefreshBox(isRefreshing = carregando && jogos != null, onRefresh = { versao++ }, modifier = Modifier.fillMaxSize()) {
        TelaRaiz("Jogos", acoes = {
            if (podeExportar && clubeId != null) {
                IconButton(onClick = ::exportar, enabled = !exportando, modifier = Modifier.testTag("jogos:exportar")) {
                    if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                    else Icon(Icones.compartilhar, contentDescription = "Exportar jogos do período em PDF")
                }
            }
            if (podeCriar && clubeId != null) {
                IconButton(onClick = { novo = true }, modifier = Modifier.testTag(TAG_NOVO_JOGO)) {
                    Icon(Icones.adicionar, contentDescription = "Novo jogo")
                }
            }
        }) {
            FaixasDoTopo(amb)
            if (semRedeAgora) FaixaTom("Sem conexão — mostrando os jogos que já estavam carregados.", Tom.AVISO, Icones.nuvemSemRede)
            if (pendentes > 0) FaixaTom(if (pendentes == 1) "1 jogo com alterações para enviar" else "$pendentes jogos com alterações para enviar",
                Tom.AVISO, Icones.nuvemSemRede)
            aviso?.let { FaixaTom(it, Tom.AVISO) }
            Filtros(periodo, { periodo = it }, campeonatos, campeonatoId, { campeonatoId = it })
            when {
                clubeId == null -> EstadoVazio(Icones.trofeu, "Nenhum clube nesta conta", "Quando um clube for cadastrado, os jogos aparecem aqui.")
                jogos == null && erro != null -> EstadoVazio(Icones.nuvem, "Não foi possível carregar os jogos", erro!!, "Tentar de novo" to { versao++ })
                jogos == null -> Esqueleto()
                lista != null -> {
                    lista.proximo?.let { p -> HeroiProximo(p, nomeCamp(p.campeonatoId), hoje) { abrir(p.sessaoId) } }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Vitórias", lista.vitorias, c.okTinta, Modifier.weight(1f))
                        Kpi("Empates", lista.empates, c.tinta, Modifier.weight(1f))
                        Kpi("Derrotas", lista.derrotas, c.erroTinta, Modifier.weight(1f))
                    }
                    if (lista.proximos.isNotEmpty()) {
                        RotuloSecao("Próximos")
                        Cartao(preenchimento = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                            lista.proximos.forEachIndexed { i, j ->
                                LinhaJogo(j, ctx.nome, nomeCamp(j.campeonatoId), futuro = true) { abrir(j.sessaoId) }
                                if (i < lista.proximos.lastIndex) HorizontalDivider(color = c.borda)
                            }
                        }
                    }
                    RotuloSecao("Resultados")
                    if (lista.passados.isEmpty()) {
                        EstadoVazio(Icones.trofeu, "Nenhum jogo no período",
                            if (podeCriar) "Toque em + para criar um jogo, ou marque um dia da semana como jogo." else "Os jogos do período aparecem aqui.")
                    } else {
                        Cartao(preenchimento = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                            lista.passados.forEachIndexed { i, j ->
                                LinhaJogo(j, ctx.nome, nomeCamp(j.campeonatoId), futuro = false) { abrir(j.sessaoId) }
                                if (i < lista.passados.lastIndex) HorizontalDivider(color = c.borda)
                            }
                        }
                    }
                }
            }
        }
    }

    if (novo && clubeId != null) {
        NovoJogoDialogo(
            fechar = { novo = false },
            criar = { data, adversario, pronto ->
                escopo.launch {
                    try {
                        val semana = SemanaISO.de(data)
                        val real = treino.diaReal(diaVazio(data), semana, clubeId)
                        val id = real.id ?: error("sem id")
                        if (real.tipo == TipoDia.JOGO) {
                            android.widget.Toast.makeText(context, "Já havia um jogo nesse dia", android.widget.Toast.LENGTH_SHORT).show()
                        } else {
                            treino.api.mudarTipo(id, TipoDia.JOGO, adversario)
                        }
                        pronto(null)
                        novo = false
                        abrir(id)
                    } catch (e: Exception) {
                        if (amb.tratarErro(e)) { pronto(null); return@launch }
                        pronto(if (semRede(e)) MSG_CRIAR_SEM_REDE else mensagemErroJogo(e))
                    }
                }
            },
        )
    }
}

@Composable
private fun Filtros(periodo: PeriodoJogos, mudar: (PeriodoJogos) -> Unit, campeonatos: List<Campeonato>, campId: String?, mudarCamp: (String?) -> Unit) {
    val c = TactiPlan.cores
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PeriodoJogos.entries.forEach { p ->
            FilterChip(selected = p == periodo, onClick = { mudar(p) }, label = { Text(p.rotulo) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = c.acaoSuave, selectedLabelColor = c.acaoTinta),
                modifier = Modifier.testTag("jogos:periodo:${p.name}"))
        }
    }
    if (campeonatos.isNotEmpty()) {
        var aberto by remember { mutableStateOf(false) }
        Box {
            OutlinedButton(onClick = { aberto = true }, modifier = Modifier.heightIn(min = 48.dp).testTag("jogos:campeonato")) {
                Text(campeonatos.firstOrNull { it.id == campId }?.rotulo ?: "Todos os campeonatos", color = c.tinta,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icones.baixo, null, Modifier.padding(start = 6.dp).size(16.dp), tint = c.tinta2)
            }
            DropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
                DropdownMenuItem(text = { Text("Todos os campeonatos") }, onClick = { mudarCamp(null); aberto = false })
                campeonatos.forEach { k -> DropdownMenuItem(text = { Text(k.rotulo) }, onClick = { mudarCamp(k.id); aberto = false }) }
            }
        }
    }
}

@Composable
private fun HeroiProximo(j: JogoDaLista, campeonato: String?, hoje: String, abrir: () -> Unit) {
    val c = TactiPlan.cores
    val partes = listOfNotNull(rotuloLocal(j.local), campeonato, j.rodada?.takeIf { it.isNotEmpty() }?.let { "Rodada $it" })
    CartaoHeroi(
        rotulo = "Próximo · ${rotuloDiaMinusculo(j.data)}",
        valor = "vs ${j.adversario?.takeIf { it.isNotBlank() } ?: "Adversário"}",
        frase = partes.joinToString(" · ").ifEmpty { null },
        selo = emQuantosDias(j.data, hoje),
        modifier = Modifier.clickable(role = Role.Button, onClick = abrir).testTag("jogos:proximo"),
        rodape = { Text("Escalação, eventos e convocação · toque para abrir", style = TactiPlan.tipos.corpo13, color = c.sobreHeroi2) },
    )
}

@Composable
private fun Kpi(rotulo: String, valor: Int, cor: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Cartao(modifier.semantics(mergeDescendants = true) {}, preenchimento = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
        Text(rotulo, style = TactiPlan.tipos.legenda11, color = TactiPlan.cores.tinta2)
        Text("$valor", style = TactiPlan.tipos.titulo24, color = cor)
    }
}

@Composable
private fun LinhaJogo(j: JogoDaLista, clube: String, campeonato: String?, futuro: Boolean, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    val r = resultadoDo(j.golsFeitos, j.golsSofridos)
    val titulo = if (futuro) "vs ${j.adversario?.takeIf { it.isNotBlank() } ?: "Adversário"}" else placarDaLinha(j, clube)
    val detalhe = detalheDaLinhaJogo(j, campeonato)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 62.dp).clickable(role = Role.Button, onClick = aoTocar).padding(vertical = 8.dp)
            .testTag(TAG_JOGO + j.sessaoId)
            .semantics(mergeDescendants = true) {
                contentDescription = (if (futuro) "" else "${rotuloResultado(r)}. ") + "$titulo. $detalhe"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (futuro) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.acaoSuave), contentAlignment = Alignment.Center) {
                Icon(Icones.trofeu, null, tint = c.acaoTinta, modifier = Modifier.size(18.dp))
            }
        } else SeloResultado(r)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icones.direita, null, Modifier.size(18.dp), tint = c.tinta3)
    }
}

@Composable
private fun Esqueleto() {
    val c = TactiPlan.cores
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.semantics { contentDescription = "Carregando os jogos" }) {
        Box(Modifier.fillMaxWidth().height(130.dp).clip(RoundedCornerShape(20.dp)).background(c.skeleton))
        repeat(4) { Box(Modifier.fillMaxWidth().height(60.dp).clip(RoundedCornerShape(14.dp)).background(c.skeleton)) }
    }
}

/** Novo jogo: data (padrão hoje) + adversário. No servidor é um dia do tipo jogo (como no web). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NovoJogoDialogo(fechar: () -> Unit, criar: (data: String, adversario: String, pronto: (String?) -> Unit) -> Unit) {
    val c = TactiPlan.cores
    var data by rememberSaveable { mutableStateOf(hojeBrasilia()) }
    var adversario by rememberSaveable { mutableStateOf("") }
    var escolherData by remember { mutableStateOf(false) }
    var criando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!criando) fechar() },
        title = { Text("Novo jogo") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { escolherData = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("jogos:novo:data")) {
                    Icon(Icones.calendario, null, Modifier.size(18.dp), tint = c.acaoTinta)
                    Text("  ${rotuloDiaCurto(data)}", color = c.tinta)
                }
                Campo(adversario, { adversario = it.take(120) }, "Adversário", Modifier.testTag("jogos:novo:adversario"))
                erro?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.erroTinta) }
            }
        },
        confirmButton = {
            TextButton(enabled = !criando, modifier = Modifier.testTag("jogos:novo:criar"), onClick = {
                criando = true
                erro = null
                criar(data, adversario.trim()) { e -> criando = false; erro = e }
            }) { Text(if (criando) "Criando…" else "Criar jogo") }
        },
        dismissButton = { TextButton(onClick = fechar, enabled = !criando) { Text("Cancelar") } },
    )
    if (escolherData) {
        val inicial = runCatching { LocalDate.parse(data).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
        val estado = rememberDatePickerState(initialSelectedDateMillis = inicial)
        DatePickerDialog(
            onDismissRequest = { escolherData = false },
            confirmButton = {
                TextButton(onClick = {
                    estado.selectedDateMillis?.let { data = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                    escolherData = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { escolherData = false }) { Text("Cancelar") } },
        ) { DatePicker(estado) }
    }
}
