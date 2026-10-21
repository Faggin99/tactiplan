package com.faggin.tactiplan.app.ui.semana

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.Cor
import com.faggin.tactiplan.app.dados.urlDoServidor
import com.faggin.tactiplan.app.dados.treino.Anexo
import com.faggin.tactiplan.app.dados.treino.CadastrosTreino
import com.faggin.tactiplan.app.dados.treino.Dia
import com.faggin.tactiplan.app.dados.treino.EnvioAnexo
import com.faggin.tactiplan.app.dados.treino.EspecieAnexo
import com.faggin.tactiplan.app.dados.treino.Etapa
import com.faggin.tactiplan.app.dados.treino.FormAtividade
import com.faggin.tactiplan.app.dados.treino.GRUPOS_ATIVIDADE
import com.faggin.tactiplan.app.dados.treino.MAX_ANEXOS_POR_ATIVIDADE
import com.faggin.tactiplan.app.dados.treino.MSG_DATA_PASSADA
import com.faggin.tactiplan.app.dados.treino.MSG_SEM_PERMISSAO_APAGAR
import com.faggin.tactiplan.app.dados.treino.MSG_SEM_PERMISSAO_BIBLIOTECA
import com.faggin.tactiplan.app.dados.treino.MudarKm
import com.faggin.tactiplan.app.dados.treino.PILARES
import com.faggin.tactiplan.app.dados.treino.PedidoSalvar
import com.faggin.tactiplan.app.dados.treino.ResultadoKm
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.treino.TipoDia
import com.faggin.tactiplan.app.dados.treino.dataPassada
import com.faggin.tactiplan.app.dados.treino.formatarKm
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.lerKm
import com.faggin.tactiplan.app.dados.treino.limparMinutos
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import com.faggin.tactiplan.app.dados.treino.motivoParaNaoAnexar
import com.faggin.tactiplan.app.dados.treino.validarSalvar
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.BotaoTexto
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import kotlinx.coroutines.launch

// Editar a atividade de UM bloco: folha que sobe de baixo, com as regras do UnifiedTrainingModal
// do web (FormAtividade) e a sequência de salvar do web (ServicoTreino). Paridade: TactiPlan/Dia (iOS).

const val TAG_FOLHA = "editar:folha"
const val TAG_SALVAR = "editar:salvar"

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EditarAtividadeFolha(
    amb: AmbienteClube,
    treino: ServicoTreino,
    semana: SemanaISO,
    clubeId: String,
    dia: Dia,
    ordem: Int,
    fechar: () -> Unit,
    salvo: (String?) -> Unit,
) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val bloco = dia.blocos.firstOrNull { it.ordem == ordem }
    val atividade = bloco?.atividade
    val ehTreino = dia.tipo == TipoDia.TREINO
    val podeApagar = ctx.podeEditar("training:delete")
    val podeBiblioteca = ctx.podeEditar("library:edit")

    var cadastros by remember { mutableStateOf<CadastrosTreino?>(null) }
    var erroCarga by remember { mutableStateOf<String?>(null) }
    var form by remember { mutableStateOf(FormAtividade()) }
    var distancia by remember { mutableStateOf(formatarKm(dia.distanciaKm)) }
    val existentes = remember { mutableStateListOf<Anexo>() }
    val novos = remember { mutableStateListOf<EnvioAnexo>() }
    var busca by remember { mutableStateOf("") }
    var aviso by remember { mutableStateOf<String?>(null) }
    var salvando by remember { mutableStateOf(false) }
    var etapa by remember { mutableStateOf<Etapa?>(null) }
    var confirmarPassado by remember { mutableStateOf(false) }
    var confirmarExcluir by remember { mutableStateOf(false) }
    var removerAnexo by remember { mutableStateOf<Anexo?>(null) }
    var novaAtividade by remember { mutableStateOf(false) }
    var tentativa by remember { mutableStateOf(0) }

    LaunchedEffect(tentativa) {
        erroCarga = null
        try {
            val cad = treino.api.cadastros(ctx.clube?.modalidade)
            cadastros = cad
            form = FormAtividade.de(atividade, cad)
            if (dia.id != null && atividade != null) {
                existentes.clear()
                existentes.addAll(treino.api.anexosDoDia(dia.id).filter { it.atividadeId == atividade.id })
            }
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) erroCarga = mensagemErroTreino(e)
        }
    }

    val estadoFolha = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { it != SheetValue.Hidden || !salvando },
    )
    val acoes = rememberAcoesAnexo(
        aoEscolher = { uri, tipo ->
            escopo.launch {
                when (val p = prepararAnexo(context, uri, tipo)) {
                    is Preparado.Ok -> if (existentes.size + novos.size < MAX_ANEXOS_POR_ATIVIDADE) novos += p.envio
                    is Preparado.Falhou -> aviso = p.mensagem
                }
            }
        },
        aoAviso = { aviso = it },
    )

    fun executarSalvar(f: FormAtividade, excluir: Boolean) {
        val km = if (ehTreino && !excluir) (lerKm(distancia) as? ResultadoKm.Ok)?.km else null
        val mudouKm = ehTreino && !excluir && km != dia.distanciaKm
        salvando = true
        aviso = null
        escopo.launch {
            try {
                val r = treino.salvar(
                    PedidoSalvar(semana, clubeId, dia, ordem, f, if (mudouKm) MudarKm(km) else null, if (excluir) emptyList() else novos.toList()),
                ) { etapa = it }
                salvando = false
                salvo(r.mensagemFalhas)
            } catch (e: Exception) {
                salvando = false
                etapa = null
                if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e)
            }
        }
    }

    fun pedirSalvar() {
        val problema = validarSalvar(form, existentes.size, novos.size, if (ehTreino) distancia else null)
        if (problema != null) { aviso = problema; return }
        if (dataPassada(dia.data, hojeBrasilia())) { confirmarPassado = true; return }
        executarSalvar(form, false)
    }

    val fecharSeguro by rememberUpdatedState { if (!salvando) fechar() }
    ModalBottomSheet(
        onDismissRequest = { fecharSeguro() },
        sheetState = estadoFolha,
        containerColor = c.superficie,
        modifier = Modifier.testTag(TAG_FOLHA),
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.95f).imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { fecharSeguro() }, enabled = !salvando, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text("Cancelar", color = c.tinta2)
                }
                Text(
                    if (dia.tipo == TipoDia.JOGO) "Não relacionados" else (bloco?.nome ?: "Atividade"),
                    style = TactiPlan.tipos.cabecalho17, color = c.tinta, modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                TextButton(onClick = { pedirSalvar() }, enabled = !salvando && cadastros != null,
                    modifier = Modifier.heightIn(min = 48.dp).testTag(TAG_SALVAR)) {
                    if (salvando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                    else Text("Salvar", color = c.acaoTinta, fontWeight = FontWeight.SemiBold)
                }
            }
            HorizontalDivider(color = c.borda)
            (etapa as? Etapa.Enviando)?.let { e ->
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text("Enviando anexo ${e.indice + 1} de ${e.total}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    LinearProgressIndicator(progress = { e.progresso.toFloat() }, color = c.acao, trackColor = c.borda,
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).semantics { contentDescription = "Enviando anexo ${e.indice + 1} de ${e.total}" })
                }
            }
            val cad = cadastros
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp).navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                aviso?.let { FaixaTom(it, Tom.AVISO) }
                when {
                    erroCarga != null -> {
                        FaixaTom(erroCarga!!, Tom.ERRO)
                        Botao("Tentar de novo", { tentativa++ }, variante = VarianteBotao.SECUNDARIO)
                    }
                    cad == null -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = c.acaoTinta, modifier = Modifier.semantics { contentDescription = "Carregando" })
                    }
                    else -> {
                        RotuloSecao("Pilar")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PILARES.forEach { p ->
                                val cor = Cor.de(p.corHex).cor
                                FilterChip(
                                    selected = form.pilar == p.id, onClick = { form = form.tocarPilar(p.id, cad) },
                                    label = { Text(p.rotulo) },
                                    leadingIcon = { Box(Modifier.size(8.dp).clip(CircleShape).background(cor)) },
                                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = cor.copy(alpha = 0.15f), selectedLabelColor = c.tinta),
                                    modifier = Modifier.heightIn(min = 48.dp).testTag("editar:pilar:${p.id}"),
                                )
                            }
                        }
                        if (form.pilar != null) {
                            RotuloSecao(form.rotuloConteudo)
                            val lista = form.conteudosDoPilar(cad)
                            if (lista.isEmpty()) Text("Nenhum conteúdo cadastrado neste pilar.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                lista.forEach { ct ->
                                    Escolha(ct.nome, form.conteudoId == ct.id, "editar:conteudo:${ct.id}") {
                                        form = form.escolherConteudo(if (form.conteudoId == ct.id) null else ct.id, cad)
                                    }
                                }
                            }
                        }
                        if (form.mostraEtapas && form.conteudoId != null) {
                            RotuloSecao("Submomentos · opcional")
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                form.etapasDisponiveis(cad).forEach { e ->
                                    Escolha(e.nome, e.id in form.etapas, "editar:etapa:${e.id}") { form = form.alternarEtapa(e.id) }
                                }
                            }
                        }
                        if (form.conteudoId != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RotuloSecao("Atividade", Modifier.weight(1f))
                                if (podeBiblioteca) BotaoTexto("+ Nova", { novaAtividade = true })
                            }
                            val titulos = form.titulosDisponiveis(cad)
                            if (titulos.size > 6) {
                                OutlinedTextField(busca, { busca = it }, singleLine = true, label = { Text("Buscar atividade") },
                                    modifier = Modifier.fillMaxWidth())
                            }
                            val filtrados = titulos.filter { busca.isBlank() || it.titulo.contains(busca.trim(), ignoreCase = true) }
                            if (titulos.isEmpty()) Text("Nenhuma atividade deste conteúdo na biblioteca.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                            filtrados.forEach { t ->
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp))
                                        .clickable(role = Role.RadioButton) { form = form.copy(tituloId = if (form.tituloId == t.id) null else t.id) }
                                        .testTag("editar:titulo:${t.id}"),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    RadioButton(selected = form.tituloId == t.id, onClick = null,
                                        colors = RadioButtonDefaults.colors(selectedColor = c.acao))
                                    Text(t.titulo, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.padding(start = 8.dp))
                                }
                            }
                        }
                        RotuloSecao("Tempo")
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            IconButton(onClick = { form = form.somarMinutos(-5) }) { Icon(Icones.menos, contentDescription = "Menos 5 minutos", tint = c.acaoTinta) }
                            OutlinedTextField(
                                form.minutos, { form = form.copy(minutos = limparMinutos(it)) }, singleLine = true,
                                label = { Text("min") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.width(110.dp).testTag("editar:minutos"),
                            )
                            IconButton(onClick = { form = form.somarMinutos(5) }) { Icon(Icones.adicionar, contentDescription = "Mais 5 minutos", tint = c.acaoTinta) }
                        }
                        RotuloSecao("Grupos")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            GRUPOS_ATIVIDADE.forEach { (g, rot) -> Escolha(rot, g in form.grupos, "editar:grupo:$g") { form = form.alternarGrupo(g) } }
                            BotaoTexto(if (form.todosOsGrupos) "Limpar" else "Todos", { form = form.alternarTodosOsGrupos() })
                        }
                        RotuloSecao("Descrição · opcional")
                        OutlinedTextField(form.descricao, { form = form.copy(descricao = it) }, minLines = 3,
                            placeholder = { Text("Detalhes sobre a atividade...") }, modifier = Modifier.fillMaxWidth().testTag("editar:descricao"))
                        if (ehTreino) {
                            RotuloSecao("Distância ideal do dia (km)")
                            OutlinedTextField(distancia, { v -> distancia = v.filter { it.isDigit() || it == ',' || it == '.' }.take(6) },
                                singleLine = true, label = { Text("Ex.: 5,2") }, isError = lerKm(distancia) is ResultadoKm.Erro,
                                supportingText = { Text("Opcional · por jogador, no dia") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                        }
                        SecaoAnexos(
                            amb, form, existentes, novos, acoes,
                            renomear = { a, titulo ->
                                escopo.launch {
                                    try {
                                        val novo = treino.api.renomearAnexo(a.id, titulo)
                                        val i = existentes.indexOfFirst { it.id == a.id }
                                        if (i >= 0) existentes[i] = existentes[i].copy(titulo = novo.titulo ?: titulo)
                                    } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e) }
                                }
                            },
                            pedirRemover = { if (podeApagar) removerAnexo = it else aviso = MSG_SEM_PERMISSAO_APAGAR },
                            avisar = { aviso = it },
                        )
                        if (atividade != null && podeApagar) {
                            Spacer(Modifier.size(4.dp))
                            Botao("Excluir atividade", { confirmarExcluir = true }, variante = VarianteBotao.PERIGO, habilitado = !salvando)
                        }
                    }
                }
            }
        }
    }

    if (confirmarPassado) {
        AlertDialog(
            onDismissRequest = { confirmarPassado = false },
            title = { Text("Treino de data passada") },
            text = { Text(MSG_DATA_PASSADA) },
            confirmButton = { TextButton(onClick = { confirmarPassado = false; executarSalvar(form, false) }, modifier = Modifier.testTag("editar:confirmar-passado")) { Text("Continuar") } },
            dismissButton = { TextButton(onClick = { confirmarPassado = false }) { Text("Cancelar") } },
        )
    }
    if (confirmarExcluir) {
        AlertDialog(
            onDismissRequest = { confirmarExcluir = false },
            title = { Text("Excluir a atividade?") },
            text = { Text("A atividade deste bloco e os anexos dela serão apagados. Esta ação não pode ser desfeita.") },
            confirmButton = { TextButton(onClick = { confirmarExcluir = false; executarSalvar(FormAtividade(), true) }) { Text("Excluir", color = c.erroTinta) } },
            dismissButton = { TextButton(onClick = { confirmarExcluir = false }) { Text("Cancelar") } },
        )
    }
    removerAnexo?.let { a ->
        AlertDialog(
            onDismissRequest = { removerAnexo = null },
            title = { Text("Excluir o anexo?") },
            text = { Text("\"${a.rotulo}\" será apagado. Esta ação não pode ser desfeita.") },
            confirmButton = {
                TextButton(onClick = {
                    removerAnexo = null
                    escopo.launch {
                        try { treino.api.apagarAnexo(a.id); existentes.removeAll { it.id == a.id } } catch (e: Exception) {
                            if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e, MSG_SEM_PERMISSAO_APAGAR)
                        }
                    }
                }) { Text("Excluir", color = c.erroTinta) }
            },
            dismissButton = { TextButton(onClick = { removerAnexo = null }) { Text("Cancelar") } },
        )
    }
    if (novaAtividade) {
        val cad = cadastros
        var titulo by remember { mutableStateOf("") }
        var desc by remember { mutableStateOf("") }
        var criando by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!criando) novaAtividade = false },
            title = { Text("Nova atividade na biblioteca") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(titulo, { titulo = it.take(200) }, singleLine = true, label = { Text("Nome da atividade") })
                    OutlinedTextField(desc, { desc = it }, minLines = 2, label = { Text("Descrição (opcional)") })
                }
            },
            confirmButton = {
                TextButton(enabled = titulo.isNotBlank() && !criando && cad != null && form.conteudoId != null, onClick = {
                    criando = true
                    escopo.launch {
                        try {
                            val t = treino.api.criarTitulo(titulo.trim(), form.conteudoId!!, desc.trim().ifEmpty { null })
                            cadastros = cad!!.comTitulo(t)
                            form = form.copy(tituloId = t.id)
                            novaAtividade = false
                        } catch (e: Exception) {
                            if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e, MSG_SEM_PERMISSAO_BIBLIOTECA)
                            novaAtividade = false
                        }
                        criando = false
                    }
                }) { Text("Criar") }
            },
            dismissButton = { TextButton(onClick = { novaAtividade = false }, enabled = !criando) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Escolha(texto: String, ativo: Boolean, tag: String, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    FilterChip(
        selected = ativo, onClick = aoTocar, label = { Text(texto) },
        modifier = Modifier.heightIn(min = 48.dp).testTag(tag),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = c.acaoSuave, selectedLabelColor = c.acaoTinta),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SecaoAnexos(
    amb: AmbienteClube,
    form: FormAtividade,
    existentes: MutableList<Anexo>,
    novos: MutableList<EnvioAnexo>,
    acoes: AcoesAnexo,
    renomear: (Anexo, String) -> Unit,
    pedirRemover: (Anexo) -> Unit,
    avisar: (String?) -> Unit,
) {
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val motivo = motivoParaNaoAnexar(form, existentes.size, novos.size)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icones.clipe, null, Modifier.size(16.dp), tint = c.tinta)
        Text("Anexos desta atividade", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
            modifier = Modifier.padding(start = 6.dp).weight(1f))
        Text("${existentes.size + novos.size}/$MAX_ANEXOS_POR_ATIVIDADE", style = TactiPlan.tipos.corpo13, color = c.tinta2)
    }
    existentes.toList().forEach { a ->
        var titulo by remember(a.id) { mutableStateOf(a.titulo ?: a.rotulo) }
        LinhaAnexo(
            especie = a.especie, titulo = titulo, aoMudarTitulo = { titulo = it.take(255) },
            aoSairDoCampo = {
                val t = titulo.trim()
                if (t.isEmpty()) titulo = a.titulo ?: a.rotulo
                else if (t != (a.titulo ?: "")) renomear(a, t)
            },
            ver = {
                val url = urlDoServidor(a.caminho, amb.apiBase)
                if (url != null) escopo.launch { abrirAnexoNoSistema(context, url, a.nomeArquivo ?: a.rotulo, a.tipo)?.let(avisar) }
            },
            remover = { pedirRemover(a) },
        )
    }
    novos.toList().forEachIndexed { i, n ->
        LinhaAnexo(
            especie = n.anexo.especie, titulo = n.anexo.titulo, novo = true,
            aoMudarTitulo = { t -> val j = novos.indexOfFirst { it.anexo.id == n.anexo.id }; if (j >= 0) novos[j] = EnvioAnexo(n.anexo.copy(titulo = t.take(255)), n.arquivo) },
            aoSairDoCampo = {}, ver = null, remover = { novos.removeAll { it.anexo.id == n.anexo.id } },
        )
        if (i < 0) Unit
    }
    if (motivo != null) Text(motivo, style = TactiPlan.tipos.corpo13, color = c.tinta2)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val ok = motivo == null
        val tentar: (() -> Unit) -> () -> Unit = { f -> { if (ok) f() else avisar(motivo) } }
        Botao("Câmera", tentar(acoes.camera), Modifier.width(110.dp).testTag("anexo:camera"), VarianteBotao.SECUNDARIO, habilitado = ok, icone = Icones.camera)
        Botao("Fotos", tentar(acoes.galeria), Modifier.width(110.dp).testTag("anexo:galeria"), VarianteBotao.SECUNDARIO, habilitado = ok, icone = Icones.imagem)
        Botao("PDF", tentar(acoes.pdf), Modifier.width(110.dp).testTag("anexo:pdf"), VarianteBotao.SECUNDARIO, habilitado = ok, icone = Icones.documento)
    }
}

@Composable
private fun LinhaAnexo(
    especie: EspecieAnexo,
    titulo: String,
    aoMudarTitulo: (String) -> Unit,
    aoSairDoCampo: () -> Unit,
    ver: (() -> Unit)?,
    remover: () -> Unit,
    novo: Boolean = false,
) {
    val c = TactiPlan.cores
    var focado by remember { mutableStateOf(false) }
    val icone = when (especie) {
        EspecieAnexo.FOTO -> Icones.imagem
        EspecieAnexo.VIDEO -> Icones.video
        else -> Icones.documento
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.fundo).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icone, contentDescription = when (especie) { EspecieAnexo.FOTO -> "Foto"; EspecieAnexo.VIDEO -> "Vídeo"; else -> "Documento" },
            modifier = Modifier.size(22.dp), tint = c.acaoTinta)
        OutlinedTextField(
            titulo, aoMudarTitulo, singleLine = true,
            label = { Text(if (novo) "Título (novo)" else "Título") },
            modifier = Modifier.weight(1f).padding(horizontal = 8.dp).onFocusChanged { f ->
                if (focado && !f.isFocused) aoSairDoCampo()
                focado = f.isFocused
            },
        )
        if (ver != null) IconButton(onClick = ver) { Icon(Icones.olho, contentDescription = "Ver o anexo $titulo", tint = c.tinta2) }
        IconButton(onClick = remover) { Icon(Icones.lixeira, contentDescription = "Remover o anexo $titulo", tint = c.erroTinta) }
    }
}
