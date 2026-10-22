package com.faggin.tactiplan.app.ui.jogos

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.coresDoClube
import com.faggin.tactiplan.app.dados.jogo.ApiJogo
import com.faggin.tactiplan.app.dados.jogo.EditorJogo
import com.faggin.tactiplan.app.dados.jogo.EventoJogo
import com.faggin.tactiplan.app.dados.jogo.JogadorJogo
import com.faggin.tactiplan.app.dados.jogo.MSG_CONFLITO
import com.faggin.tactiplan.app.dados.jogo.MSG_ENVIE_ANTES
import com.faggin.tactiplan.app.dados.jogo.MSG_GUARDADO
import com.faggin.tactiplan.app.dados.jogo.MSG_SALVE_ANTES
import com.faggin.tactiplan.app.dados.jogo.MSG_SELECIONE_ANTES
import com.faggin.tactiplan.app.dados.jogo.PacoteJogo
import com.faggin.tactiplan.app.dados.jogo.PendenciaJogo
import com.faggin.tactiplan.app.dados.jogo.ResultadoEnvio
import com.faggin.tactiplan.app.dados.jogo.ServicoJogo
import com.faggin.tactiplan.app.dados.jogo.SincronizadorJogos
import com.faggin.tactiplan.app.dados.jogo.corpoConvocacao
import com.faggin.tactiplan.app.dados.jogo.mensagemErroJogo
import com.faggin.tactiplan.app.dados.jogo.nomePdfConvocacao
import com.faggin.tactiplan.app.dados.jogo.resultadoDo
import com.faggin.tactiplan.app.dados.jogo.textoFila
import com.faggin.tactiplan.app.dados.logoDoClube
import com.faggin.tactiplan.app.dados.semRede
import com.faggin.tactiplan.app.dados.sessaoEncerrada
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.rotuloDiaCurto
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.BotaoTexto
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.LogoClube
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import kotlinx.coroutines.launch

// O JOGO (T2): placar, Escalação · Eventos · Convocação · Dados, "+ Evento", salvar (o mesmo POST do
// web) e o jogo SEM INTERNET (fila por jogo, envio quando a rede volta; conflito = vale o local).

private val ABAS = listOf("Escalação", "Eventos", "Convocação", "Dados")

private sealed interface Numero {
    data class Camisa(val p: JogadorJogo) : Numero
    data class Minutos(val p: JogadorJogo) : Numero
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JogoTela(amb: AmbienteClube, treino: ServicoTreino, api: ApiJogo, sessaoId: String, voltar: () -> Unit) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val snack = remember { SnackbarHostState() }
    val servico = remember(api) { ServicoJogo(api, ctx.clube?.id ?: "", ctx.clube?.modalidade) }
    val fila = remember(amb.usuarioId) { filaJogosDoAparelho(context, amb.usuarioId) }
    val sinc = remember(servico, fila) { SincronizadorJogos(servico, fila) }
    val editavel = ctx.podeEditar("games:edit")

    var pacote by remember { mutableStateOf<PacoteJogo?>(null) }
    var editor by remember { mutableStateOf<EditorJogo?>(null) }
    var salvo by remember { mutableStateOf<String?>(null) }
    var convocacaoServidor by remember { mutableStateOf<String?>(null) }
    var base by remember { mutableStateOf<String?>(null) }
    var alteracoes by remember { mutableIntStateOf(0) }
    var pendencia by remember { mutableStateOf<PendenciaJogo?>(fila.pendencia(sessaoId)) }
    var carregando by remember { mutableStateOf(true) }
    var erroCarregar by remember { mutableStateOf<String?>(null) }
    var doCache by remember { mutableStateOf(false) }
    var enviando by remember { mutableStateOf(false) }
    var salvando by remember { mutableStateOf(false) }
    var exportando by remember { mutableStateOf(false) }
    var dialogo by remember { mutableStateOf<String?>(null) }
    var sairSemSalvar by remember { mutableStateOf(false) }
    var descartar by remember { mutableStateOf(false) }
    var aba by rememberSaveable { mutableIntStateOf(0) }
    var vagaAberta by remember { mutableStateOf<Int?>(null) }
    var movendo by remember { mutableStateOf<String?>(null) }
    var evento by remember { mutableStateOf<EventoJogo?>(null) }
    var novoEvento by remember { mutableStateOf(false) }
    var relacionados by remember { mutableStateOf(false) }
    var numero by remember { mutableStateOf<Numero?>(null) }
    var apagarEvento by remember { mutableStateOf<EventoJogo?>(null) }

    val modalidade = ctx.clube?.modalidade
    fun mudar(novo: EditorJogo, aviso: String? = null) {
        editor = novo
        alteracoes++
        aviso?.let { escopo.launch { snack.showSnackbar(it) } }
    }

    suspend fun carregar(silencioso: Boolean = false) {
        if (!silencioso) carregando = true
        try {
            val p = servico.carregar(sessaoId)
            fila.guardarCache(p)
            pacote = p
            val doServidor = EditorJogo.carregar(p.dia, p.jogo, modalidade)
            base = doServidor.assinaturaServidor
            convocacaoServidor = doServidor.assinaturaConvocacao
            val pend = fila.pendencia(sessaoId)
            pendencia = pend
            val ed = pend?.editor ?: doServidor
            editor = ed
            salvo = ed.assinatura
            alteracoes = 0
            doCache = false
            erroCarregar = null
        } catch (e: Exception) {
            if (amb.tratarErro(e)) return
            val cache = fila.cache(sessaoId)
            if (semRede(e) && (cache != null || editor != null)) {
                if (editor == null && cache != null) {
                    pacote = cache
                    val doCacheEd = EditorJogo.carregar(cache.dia, cache.jogo, modalidade)
                    convocacaoServidor = doCacheEd.assinaturaConvocacao
                    base = doCacheEd.assinaturaServidor
                    val pend = fila.pendencia(sessaoId)
                    pendencia = pend
                    editor = pend?.editor ?: doCacheEd
                    salvo = editor?.assinatura
                }
                doCache = true
            } else if (editor == null) {
                erroCarregar = if (semRede(e)) "Sem conexão e este jogo ainda não foi aberto neste aparelho. Conecte-se e tente de novo." else mensagemErroJogo(e)
            }
        }
        carregando = false
    }

    suspend fun enviarFila() {
        if (enviando) return
        enviando = true
        when (val r = sinc.enviar(sessaoId)) {
            is ResultadoEnvio.Enviado -> {
                pendencia = null
                if (r.conflito) dialogo = MSG_CONFLITO else snack.showSnackbar("Alterações enviadas")
                carregar(silencioso = true)
            }
            ResultadoEnvio.SemRede -> pendencia = fila.pendencia(sessaoId)
            is ResultadoEnvio.Recusado -> pendencia = fila.pendencia(sessaoId)
            is ResultadoEnvio.SessaoEncerrada -> amb.tratarErro(r.erro)
            ResultadoEnvio.NadaAEnviar -> pendencia = null
        }
        enviando = false
    }

    LaunchedEffect(sessaoId) {
        carregar()
        if (fila.pendencia(sessaoId) != null && temRedeAgora(context)) enviarFila()
    }
    val temRede by rememberRede { if (fila.pendencia(sessaoId) != null) escopo.launch { enviarFila() } }

    val ed = editor
    val sujo = ed != null && salvo != null && ed.assinatura != salvo

    fun salvar(depois: (() -> Unit)? = null) {
        val atual = editor ?: return
        atual.conferirAntesDeSalvar()?.let { dialogo = it; return }
        salvando = true
        escopo.launch {
            try {
                if (fila.pendencia(sessaoId) != null) {
                    // Já há alterações na fila: junta e envia na ordem (o POST regrava tudo).
                    pendencia = fila.guardar(atual, base, alteracoes)
                    salvo = atual.assinatura
                    alteracoes = 0
                    enviarFila()
                } else {
                    api.salvar(sessaoId, atual.corpoSalvar())
                    salvo = atual.assinatura
                    convocacaoServidor = atual.assinaturaConvocacao
                    alteracoes = 0
                    snack.showSnackbar("Jogo salvo")
                    carregar(silencioso = true)
                }
                depois?.invoke()
            } catch (e: Exception) {
                when {
                    sessaoEncerrada(e) -> amb.tratarErro(e)
                    semRede(e) -> try {
                        pendencia = fila.guardar(atual, base, alteracoes)
                        salvo = atual.assinatura
                        alteracoes = 0
                        snack.showSnackbar(MSG_GUARDADO)
                        depois?.invoke()
                    } catch (_: Exception) {
                        dialogo = "Não foi possível guardar no aparelho. Libere espaço e tente de novo."
                    }
                    else -> dialogo = mensagemErroJogo(e)
                }
            }
            salvando = false
        }
    }

    fun exportarConvocacao() {
        val atual = editor ?: return
        when {
            atual.jogadores.isEmpty() -> { escopo.launch { snack.showSnackbar(MSG_SELECIONE_ANTES) }; return }
            pendencia != null -> { dialogo = MSG_ENVIE_ANTES; return }
            atual.assinaturaConvocacao != convocacaoServidor -> { dialogo = MSG_SALVE_ANTES; return }
        }
        if (exportando) return
        exportando = true
        escopo.launch {
            val r = gerarECompartilhar(context, treino.api, "convocacao", corpoConvocacao(sessaoId),
                nomePdfConvocacao(atual.dados.adversario, pacote?.dia?.data ?: ""), amb.tratarErro)
            if (r is InicioExportar.Erro) dialogo = r.mensagem
            exportando = false
        }
    }

    val tentarVoltar: () -> Unit = { if (sujo && editavel) sairSemSalvar = true else voltar() }
    BackHandler(onBack = tentarVoltar)

    val titulo = ed?.dados?.adversario?.takeIf { it.isNotBlank() }?.let { "vs $it" } ?: "Jogo"
    Scaffold(
        containerColor = c.fundo,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snack) },
        topBar = {
            TopAppBar(
                title = { Text(titulo, style = TactiPlan.tipos.cabecalho17, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = tentarVoltar) { Icon(Icones.esquerda, "Voltar") } },
                actions = {
                    if (ed != null && ctx.conta.somenteLeitura != true) {
                        IconButton(onClick = ::exportarConvocacao, enabled = !exportando, modifier = Modifier.testTag("jogo:compartilhar")) {
                            if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                            else Icon(Icones.compartilhar, "Exportar convocação em PDF")
                        }
                    }
                    if (ed != null && editavel) {
                        TextButton(onClick = { salvar() }, enabled = sujo && !salvando, modifier = Modifier.testTag("jogo:salvar")) {
                            if (salvando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                            else Text("Salvar", fontWeight = FontWeight.Bold, color = if (sujo) c.acaoTinta else c.tinta3)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.fundo, titleContentColor = c.tinta,
                    navigationIconContentColor = c.acaoTinta, actionIconContentColor = c.acaoTinta),
            )
        },
        floatingActionButton = {
            if (ed != null && editavel) {
                ExtendedFloatingActionButton(
                    onClick = { evento = null; novoEvento = true },
                    containerColor = c.acao, contentColor = c.sobreAcao,
                    icon = { Icon(Icones.adicionar, null) }, text = { Text("Evento", fontWeight = FontWeight.Bold) },
                    modifier = Modifier.testTag("jogo:novo-evento"),
                )
            }
        },
    ) { dentro ->
        Column(
            Modifier.padding(dentro).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)
                .padding(top = 4.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FaixasDoTopo(amb)
            when {
                ed == null && carregando -> Box(Modifier.fillMaxWidth().height(240.dp).semantics { contentDescription = "Carregando o jogo" },
                    contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.acaoTinta) }
                ed == null -> EstadoVazio(Icones.nuvem, "Não foi possível abrir o jogo", erroCarregar ?: "",
                    "Tentar de novo" to { escopo.launch { carregar() } })
                else -> {
                    Placar(amb, ed, pacote?.dia?.data)
                    if (doCache && !temRede) FaixaTom("Sem conexão — o jogo grava aqui no aparelho e envia quando a internet voltar.", Tom.AVISO, Icones.nuvemSemRede)
                    pendencia?.let { p -> FaixaFila(p, enviando, !temRede, tentar = { escopo.launch { enviarFila() } }, descartar = { descartar = true }) }
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        ABAS.forEachIndexed { i, t ->
                            SegmentedButton(selected = aba == i, onClick = { aba = i }, shape = SegmentedButtonDefaults.itemShape(i, ABAS.size),
                                colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta),
                                icon = {}, modifier = Modifier.testTag("jogo:aba:$i")) {
                                Text(t, style = TactiPlan.tipos.legenda11, maxLines = 1)
                            }
                        }
                    }
                    when (aba) {
                        0 -> AbaEscalacao(ed, editavel, movendo,
                            trocarFormacao = { f -> val (n, a) = ed.trocarFormacao(f); movendo = null; mudar(n, a) },
                            tocarVaga = { v ->
                                val m = movendo
                                if (m != null) { movendo = null; mudar(ed.mover(m, v)) } else vagaAberta = v
                            },
                            mover = { movendo = it },
                            encaixar = { val (n, a) = ed.encaixarSugestao(); mudar(n, a) })
                        1 -> AbaEventos(ed, editavel, pacote?.atletas.orEmpty(), abrir = { evento = it; novoEvento = true }, apagar = { apagarEvento = it })
                        2 -> AbaConvocacao(ed, editavel, exportando,
                            selecionar = { relacionados = true }, exportar = ::exportarConvocacao,
                            tocarEtiqueta = { p -> if (p.vaga != null) vagaAberta = p.vaga else { movendo = p.atletaId; aba = 0 } },
                            editarCamisa = { numero = Numero.Camisa(it) }, editarMinutos = { numero = Numero.Minutos(it) },
                            voltarAuto = { mudar(ed.voltarAoAutomatico(it)) },
                            tirar = { id -> if (movendo == id) movendo = null; mudar(ed.tirarDoJogo(id)) })
                        else -> AbaDados(ed, editavel, pacote?.campeonatos.orEmpty()) { mudar(ed.copy(dados = it)) }
                    }
                }
            }
        }
    }

    // ---------- folhas e diálogos ----------
    val atual = editor
    vagaAberta?.let { v ->
        if (atual != null) SeletorVagaFolha(atual, v, pacote?.atletas.orEmpty(),
            fechar = { vagaAberta = null },
            escolher = { a -> vagaAberta = null; val (n, aviso) = atual.colocar(a, v); mudar(n, aviso) },
            moverOcupante = { atual.ocupante(v)?.let { movendo = it.atletaId }; vagaAberta = null; aba = 0 },
            tirarOcupante = { atual.ocupante(v)?.let { mudar(atual.tirarDoCampo(it.atletaId)) }; vagaAberta = null })
    }
    if (novoEvento && atual != null) {
        EventoFolha(atual, evento, fechar = { novoEvento = false; evento = null },
            salvar = { e ->
                novoEvento = false
                mudar(if (evento != null) atual.atualizarEvento(e) else atual.adicionarEvento(e))
                evento = null
            },
            excluir = { e -> novoEvento = false; evento = null; mudar(atual.removerEvento(e.id)) })
    }
    if (relacionados && atual != null) {
        RelacionadosFolha(atual, pacote?.atletas.orEmpty(), fechar = { relacionados = false },
            confirmar = { sel -> relacionados = false; movendo = null; mudar(atual.confirmarRelacionados(sel, pacote?.atletas.orEmpty())) })
    }
    numero?.let { n ->
        if (atual != null) DialogoNumero(
            titulo = when (n) { is Numero.Camisa -> "Camisa neste jogo"; is Numero.Minutos -> "Minutos jogados" },
            texto = when (n) {
                is Numero.Camisa -> "${n.p.nomeExibido ?: ""} · vazio = sem número (1 a 99)"
                is Numero.Minutos -> "${n.p.nomeExibido ?: ""} · ajuste manual (automático: ${atual.minutagem[n.p.atletaId]?.auto ?: 0} min)"
            },
            inicial = when (n) { is Numero.Camisa -> n.p.camisa; is Numero.Minutos -> atual.minutagem[n.p.atletaId]?.minutos },
            permiteVazio = n is Numero.Camisa,
            fechar = { numero = null },
            confirmar = { v ->
                numero = null
                when (n) {
                    is Numero.Camisa -> mudar(atual.mudarCamisa(n.p.atletaId, v))
                    is Numero.Minutos -> if (v != null) mudar(atual.ajustarMinutos(n.p.atletaId, v))
                }
            },
        )
    }
    apagarEvento?.let { e ->
        AlertDialog(
            onDismissRequest = { apagarEvento = null },
            title = { Text("Excluir evento?") },
            text = { Text("${e.minuto?.let { "$it' · " } ?: ""}${com.faggin.tactiplan.app.dados.jogo.rotuloDoEvento(e)}") },
            confirmButton = { TextButton(onClick = { apagarEvento = null; atual?.let { mudar(it.removerEvento(e.id)) } }) { Text("Excluir", color = c.erro) } },
            dismissButton = { TextButton(onClick = { apagarEvento = null }) { Text("Cancelar") } },
        )
    }
    dialogo?.let { m ->
        AlertDialog(onDismissRequest = { dialogo = null }, text = { Text(m) },
            confirmButton = { TextButton(onClick = { dialogo = null }) { Text("OK") } })
    }
    if (sairSemSalvar) {
        AlertDialog(
            onDismissRequest = { sairSemSalvar = false },
            title = { Text("Sair sem salvar?") },
            text = { Text("Há alterações neste jogo que ainda não foram salvas.") },
            confirmButton = { TextButton(onClick = { sairSemSalvar = false; salvar(depois = voltar) }) { Text("Salvar") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { sairSemSalvar = false; voltar() }) { Text("Descartar", color = c.erro) }
                    TextButton(onClick = { sairSemSalvar = false }) { Text("Continuar editando") }
                }
            },
        )
    }
    if (descartar) {
        AlertDialog(
            onDismissRequest = { descartar = false },
            title = { Text("Descartar alterações do aparelho?") },
            text = { Text("As alterações guardadas sem conexão serão apagadas e o jogo volta ao que está salvo no servidor.") },
            confirmButton = {
                TextButton(onClick = {
                    descartar = false
                    fila.remover(sessaoId)
                    pendencia = null
                    editor = null
                    escopo.launch { carregar() }
                }) { Text("Descartar", color = c.erro) }
            },
            dismissButton = { TextButton(onClick = { descartar = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Placar(amb: AmbienteClube, ed: EditorJogo, data: String?) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val cl = coresDoClube(ctx.clube?.personalizacao, c.escuro)
    val hoje = hojeBrasilia()
    val mostra = (data != null && data < hoje) || ed.golsFeitos + ed.golsSofridos > 0
    val r = resultadoDo(ed.golsFeitos, ed.golsSofridos)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.heroi).border(1.dp, c.heroiBorda, RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp).testTag("jogo:placar")
            .semantics(mergeDescendants = true) {
                contentDescription = "${ctx.nome} ${ed.golsFeitos} × ${ed.golsSofridos} ${ed.dados.adversario.ifBlank { "Adversário" }}" +
                    if (mostra) ". ${rotuloResultado(r)}" else ""
            },
    ) {
        data?.let { Text(rotuloDiaCurto(it), style = TactiPlan.tipos.legenda11, color = c.sobreHeroi2, modifier = Modifier.align(Alignment.CenterHorizontally)) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                LogoClube(logoDoClube(ctx.clube?.personalizacao, c.escuro), ctx.nome, cl.acao.cor, cl.sobreAcao.cor, 36.dp)
                Text(ctx.nome, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.sobreHeroi,
                    maxLines = 2, textAlign = TextAlign.Center)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${ed.golsFeitos} × ${ed.golsSofridos}", style = TactiPlan.tipos.titulo32, color = c.sobreHeroi)
                if (mostra) {
                    val (fundo, tinta) = coresDoResultado(r)
                    Text(rotuloResultado(r), style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold, color = tinta,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(fundo).padding(horizontal = 10.dp, vertical = 3.dp))
                }
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(c.sobreHeroi2.copy(alpha = 0.3f)), contentAlignment = Alignment.Center) {
                    Icon(Icones.escudo, null, tint = c.sobreHeroi, modifier = Modifier.size(20.dp))
                }
                Text(ed.dados.adversario.ifBlank { "Adversário" }, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold,
                    color = c.sobreHeroi, maxLines = 2, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun FaixaFila(p: PendenciaJogo, enviando: Boolean, semConexao: Boolean, tentar: () -> Unit, descartar: () -> Unit) {
    val c = TactiPlan.cores
    val (fundo, tinta) = if (p.erro != null) c.erroFundo to c.erroTinta else c.avisoFundo to c.avisoTinta
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(fundo).padding(horizontal = 12.dp, vertical = 8.dp)
        .testTag("jogo:fila")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icones.nuvemSemRede, null, tint = tinta, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (enviando) "Enviando…" else textoFila(p.alteracoes, semConexao), style = TactiPlan.tipos.corpo13,
                fontWeight = FontWeight.SemiBold, color = tinta, modifier = Modifier.weight(1f))
            if (enviando) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = tinta)
        }
        p.erro?.let { Text(it, style = TactiPlan.tipos.corpo13, color = tinta) }
        if (!enviando) Row {
            BotaoTexto("Tentar de novo", tentar)
            BotaoTexto("Descartar alterações do aparelho", descartar, cor = c.erroTinta)
        }
    }
}

@Composable
private fun AbaDados(ed: EditorJogo, editavel: Boolean, campeonatos: List<com.faggin.tactiplan.app.dados.jogo.Campeonato>,
                     mudar: (com.faggin.tactiplan.app.dados.jogo.DadosGerais) -> Unit) {
    val c = TactiPlan.cores
    val d = ed.dados
    Campo(d.adversario, { mudar(d.copy(adversario = it.take(120))) }, "Adversário", Modifier.testTag("jogo:dados:adversario"), habilitado = editavel)
    Text("Local", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        val ops = listOf("" to "—", "home" to "Casa", "away" to "Fora", "neutral" to "Neutro")
        ops.forEachIndexed { i, (v, r) ->
            SegmentedButton(selected = d.local == v, onClick = { if (editavel) mudar(d.copy(local = v)) }, enabled = editavel,
                shape = SegmentedButtonDefaults.itemShape(i, ops.size), icon = {},
                colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta)) { Text(r) }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Duração (min)", style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f))
        IconButton(onClick = { mudar(d.copy(duracao = (d.duracao - 5).coerceAtLeast(1))) }, enabled = editavel) { Icon(Icones.menos, "Menos 5 minutos", tint = c.acaoTinta) }
        Text("${d.duracao}", style = TactiPlan.tipos.cabecalho17, color = c.tinta, modifier = Modifier.testTag("jogo:dados:duracao"))
        IconButton(onClick = { mudar(d.copy(duracao = (d.duracao + 5).coerceAtMost(150))) }, enabled = editavel) { Icon(Icones.adicionar, "Mais 5 minutos", tint = c.acaoTinta) }
    }
    var aberto by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { aberto = true }, enabled = editavel, modifier = Modifier.fillMaxWidth().testTag("jogo:dados:campeonato")) {
            Text(campeonatos.firstOrNull { it.id == d.campeonatoId }?.rotulo ?: "— sem campeonato —", color = c.tinta,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icones.baixo, "Campeonato", tint = c.tinta2, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
            DropdownMenuItem(text = { Text("— sem campeonato —") }, onClick = { aberto = false; mudar(d.copy(campeonatoId = "")) })
            campeonatos.forEach { k -> DropdownMenuItem(text = { Text(k.rotulo) }, onClick = { aberto = false; mudar(d.copy(campeonatoId = k.id)) }) }
        }
    }
    Campo(d.rodada, { mudar(d.copy(rodada = it.take(20))) }, "Rodada", Modifier.testTag("jogo:dados:rodada"), habilitado = editavel)
    Campo(d.video, { mudar(d.copy(video = it.trim().take(500))) }, "Vídeo (YouTube / Drive)", Modifier.testTag("jogo:dados:video"),
        teclado = KeyboardType.Uri, habilitado = editavel)
}

@Composable
private fun DialogoNumero(titulo: String, texto: String, inicial: Int?, permiteVazio: Boolean, fechar: () -> Unit, confirmar: (Int?) -> Unit) {
    var v by remember { mutableStateOf(inicial?.toString() ?: "") }
    AlertDialog(
        onDismissRequest = fechar,
        title = { Text(titulo) },
        text = {
            Column {
                Text(texto, style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
                OutlinedTextField(v, { s -> v = s.filter { it.isDigit() }.take(3) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.testTag("jogo:numero"))
            }
        },
        confirmButton = {
            TextButton(onClick = { if (v.isEmpty() && !permiteVazio) fechar() else confirmar(v.toIntOrNull()) },
                modifier = Modifier.testTag("jogo:numero:ok")) { Text("OK") }
        },
        dismissButton = { TextButton(onClick = fechar) { Text("Cancelar") } },
    )
}
