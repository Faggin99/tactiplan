package com.faggin.tactiplan.app.ui.semana

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.ROTULO_NAO_RELACIONADOS
import com.faggin.tactiplan.app.dados.TEXTO_DIA_DESCANSO
import com.faggin.tactiplan.app.dados.TEXTO_JOGO_NO_APP
import com.faggin.tactiplan.app.dados.TEXTO_NAO_RELACIONADOS
import com.faggin.tactiplan.app.dados.TEXTO_SEM_ATIVIDADE_EDITA
import com.faggin.tactiplan.app.dados.TEXTO_SEM_ATIVIDADE_LE
import com.faggin.tactiplan.app.dados.TITULO_ERRO_SEMANA
import com.faggin.tactiplan.app.dados.TITULO_SEM_ATIVIDADE
import com.faggin.tactiplan.app.dados.Cor
import com.faggin.tactiplan.app.dados.semRede
import com.faggin.tactiplan.app.dados.treino.Bloco
import com.faggin.tactiplan.app.dados.treino.Dia
import com.faggin.tactiplan.app.dados.treino.Microciclo
import com.faggin.tactiplan.app.dados.treino.PILARES
import com.faggin.tactiplan.app.dados.treino.ResultadoKm
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.treino.TemaDoMes
import com.faggin.tactiplan.app.dados.treino.TipoDia
import com.faggin.tactiplan.app.dados.treino.corpoFichaDoDia
import com.faggin.tactiplan.app.dados.treino.corpoRelatorioSemana
import com.faggin.tactiplan.app.dados.treino.detalheDaLinha
import com.faggin.tactiplan.app.dados.treino.diasDaSemana
import com.faggin.tactiplan.app.dados.treino.formatarKm
import com.faggin.tactiplan.app.dados.treino.fraseDoHeroi
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.lerKm
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import com.faggin.tactiplan.app.dados.treino.nomePdfDaSemana
import com.faggin.tactiplan.app.dados.treino.nomePdfDoDia
import com.faggin.tactiplan.app.dados.treino.pilarDe
import com.faggin.tactiplan.app.dados.treino.resumoDoDia
import com.faggin.tactiplan.app.dados.treino.resumoDoDiaInteiro
import com.faggin.tactiplan.app.dados.treino.Periodo
import com.faggin.tactiplan.app.dados.treino.MSG_SEM_PERMISSAO_APAGAR
import com.faggin.tactiplan.app.dados.treino.divisaoMinutos
import com.faggin.tactiplan.app.dados.treino.EscolhaAvaliacao
import com.faggin.tactiplan.app.dados.treino.MAX_OUTRA_AVALIACAO
import com.faggin.tactiplan.app.dados.treino.TipoAvaliacao
import com.faggin.tactiplan.app.dados.treino.normalizarAvaliacao
import com.faggin.tactiplan.app.dados.treino.textoAvaliacao
import com.faggin.tactiplan.app.dados.treino.erroNovoPeriodo
import com.faggin.tactiplan.app.dados.treino.listaPeriodos
import com.faggin.tactiplan.app.dados.treino.periodosDisponiveis
import com.faggin.tactiplan.app.dados.treino.rotuloDoPeriodo
import com.faggin.tactiplan.app.dados.treino.seloPeriodos
import com.faggin.tactiplan.app.dados.treino.sugestaoNovoPeriodo
import com.faggin.tactiplan.app.dados.treino.periodosParaTrocar
import com.faggin.tactiplan.app.dados.treino.periodoEfetivo
import com.faggin.tactiplan.app.dados.treino.temPeriodos
import com.faggin.tactiplan.app.dados.treino.textoRemoverPeriodo
import com.faggin.tactiplan.app.ui.comum.Pastilha
import com.faggin.tactiplan.app.dados.treino.rotuloDiaCurto
import com.faggin.tactiplan.app.dados.treino.rotuloDiaMinusculo
import com.faggin.tactiplan.app.dados.treino.rotuloPeriodo
import com.faggin.tactiplan.app.dados.treino.rotuloPilar
import com.faggin.tactiplan.app.dados.treino.siglaEDia
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.CartaoHeroi
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import kotlinx.coroutines.launch

// Aba SEMANA (T1): lista dos 7 dias → Dia (blocos em cartões) → Editar atividade (folha), Ficha do
// dia (WebView) e Fotos do relatório. Tudo pelas rotas do web com o token do app. Paridade:
// TactiPlan/Semana (iOS).

/** Onde a pilha da aba está. */
sealed interface TelaSemana {
    data object Lista : TelaSemana
    data class DoDia(val data: String) : TelaSemana
    data class Ficha(val diaId: String, val data: String) : TelaSemana
    class Fotos(val pedido: PedidoFotos, val volta: TelaSemana) : TelaSemana
    /** T2: o jogo do dia (a mesma tela da aba Jogos). */
    data class Jogo(val sessaoId: String, val data: String) : TelaSemana
}

const val TAG_DIA = "semana:dia:"
const val TAG_EXPORTAR_SEMANA = "semana:exportar"
const val TAG_BLOCO = "dia:bloco:"

@Composable
fun SemanaAba(amb: AmbienteClube, treino: ServicoTreino) {
    val ctx = amb.contexto
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val clubeId = ctx.clube?.id
    var segunda by rememberSaveable { mutableStateOf(SemanaISO.de(hojeBrasilia()).segunda) }
    val semana = remember(segunda) { SemanaISO.de(segunda) }
    var tela by remember { mutableStateOf<TelaSemana>(TelaSemana.Lista) }
    var microciclo by remember { mutableStateOf<Microciclo?>(null) }
    var carregou by remember { mutableStateOf(false) }
    var carregando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var semRedeAgora by remember { mutableStateOf(false) }
    var tema by remember { mutableStateOf<TemaDoMes?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var exportando by remember { mutableStateOf(false) }

    LaunchedEffect(semana, clubeId, versao) {
        if (clubeId == null) return@LaunchedEffect
        carregando = true
        try {
            microciclo = treino.api.microciclo(semana.identificador, clubeId)
            carregou = true
            erro = null
            semRedeAgora = false
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) {
                semRedeAgora = semRede(e)
                // Sem rede com a semana já carregada: mantém o que estava na tela.
                if (!(semRedeAgora && carregou)) erro = mensagemErroTreino(e)
            }
        }
        carregando = false
        tema = try { treino.api.temaDoMes(semana.segunda.take(7), clubeId) } catch (_: Exception) { null }
    }
    val dias = remember(microciclo, semana) { diasDaSemana(microciclo?.takeIf { it.semana == null || it.semana == semana.identificador }, semana) }
    val recarregar: () -> Unit = { versao++ }

    fun exportar(tipo: String, corpo: Map<String, kotlinx.serialization.json.JsonElement>, nome: String) {
        if (exportando) return
        exportando = true
        aviso = null
        escopo.launch {
            when (val r = iniciarExportacao(context, treino.api, tipo, corpo, nome, amb.usuarioId, amb.tratarErro)) {
                is InicioExportar.Erro -> aviso = r.mensagem
                is InicioExportar.EscolherFotos -> tela = TelaSemana.Fotos(r.pedido, tela)
                InicioExportar.Entregue -> {}
            }
            exportando = false
        }
    }

    when (val t = tela) {
        TelaSemana.Lista -> SemanaTela(
            amb = amb, semana = semana, dias = dias, tema = tema, carregando = carregando && !carregou,
            atualizando = carregando && carregou, erro = erro.takeIf { !carregou }, semRede = semRedeAgora && carregou,
            aviso = aviso, exportando = exportando,
            mudarSemana = { segunda = semana.somando(it).segunda; carregou = false; microciclo = null },
            irParaHoje = { segunda = SemanaISO.de(hojeBrasilia()).segunda; carregou = false; microciclo = null },
            atualizar = recarregar, abrirDia = { tela = TelaSemana.DoDia(it.data) },
            exportarSemana = clubeId?.let { id -> { exportar("semana", corpoRelatorioSemana(semana, id), nomePdfDaSemana(semana, ctx.nome)) } },
        )
        is TelaSemana.DoDia -> {
            val dia = dias.firstOrNull { it.data == t.data }
            if (dia == null || clubeId == null) {
                LaunchedEffect(Unit) { tela = TelaSemana.Lista }
            } else {
                BackHandler { tela = TelaSemana.Lista; aviso = null }
                DiaTela(
                    amb = amb, treino = treino, semana = semana, clubeId = clubeId, diaInteiro = dia,
                    aviso = aviso, exportando = exportando, avisar = { aviso = it },
                    voltar = { tela = TelaSemana.Lista; aviso = null }, mudou = recarregar,
                    verFicha = { id -> tela = TelaSemana.Ficha(id, dia.data) },
                    exportarDia = { id -> exportar("sessao", corpoFichaDoDia(id), nomePdfDoDia(dia)) },
                    exportarPeriodo = { p -> p.id?.let { id -> exportar("sessao", corpoFichaDoDia(id, soPeriodo = true), nomePdfDoDia(dia, p.periodo)) } },
                    abrirJogo = amb.jogo?.let { { id: String -> tela = TelaSemana.Jogo(id, dia.data) } },
                )
            }
        }
        is TelaSemana.Ficha -> {
            val dia = dias.firstOrNull { it.data == t.data }
            FichaDoDiaTela(
                api = treino.api, diaId = t.diaId, titulo = "Ficha · ${rotuloDiaCurto(t.data)}",
                podeExportar = ctx.conta.somenteLeitura != true, exportando = exportando,
                exportar = { exportar("sessao", corpoFichaDoDia(t.diaId), dia?.let { nomePdfDoDia(it) } ?: "ficha.pdf") },
                tratarErro = amb.tratarErro, voltar = { tela = TelaSemana.DoDia(t.data) },
            )
        }
        is TelaSemana.Jogo -> {
            val apiJogo = amb.jogo
            if (apiJogo == null) LaunchedEffect(Unit) { tela = TelaSemana.DoDia(t.data) }
            else com.faggin.tactiplan.app.ui.jogos.JogoTela(amb, treino, apiJogo, t.sessaoId, voltar = { tela = TelaSemana.DoDia(t.data); recarregar() })
        }
        is TelaSemana.Fotos -> FotosRelatorioTela(
            pedido = t.pedido, api = treino.api, usuarioId = amb.usuarioId, tratarErro = amb.tratarErro,
            fechar = { tela = t.volta },
        )
    }
}

// ---------------------------------------------------------------- Semana

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SemanaTela(
    amb: AmbienteClube,
    semana: SemanaISO,
    dias: List<Dia>,
    tema: TemaDoMes?,
    carregando: Boolean,
    atualizando: Boolean,
    erro: String?,
    semRede: Boolean,
    aviso: String?,
    exportando: Boolean,
    mudarSemana: (Int) -> Unit,
    irParaHoje: () -> Unit,
    atualizar: () -> Unit,
    abrirDia: (Dia) -> Unit,
    exportarSemana: (() -> Unit)?,
) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val hoje = hojeBrasilia()
    val podeExportar = exportarSemana != null && ctx.pode("stats:view") && ctx.conta.somenteLeitura != true
    PullToRefreshBox(isRefreshing = atualizando, onRefresh = atualizar, modifier = Modifier.fillMaxSize()) {
        val abrirStats = com.faggin.tactiplan.app.ui.t3.LocalAbrirEstatisticas.current
        TelaRaiz("Semana", acoes = {
            if (abrirStats != null) IconButton(onClick = { abrirStats(true) }, modifier = Modifier.testTag("semana:estatisticas")) {
                Icon(Icones.grafico, contentDescription = "Estatísticas de treino")
            }
            if (podeExportar) {
                IconButton(onClick = { exportarSemana?.invoke() }, enabled = !exportando, modifier = Modifier.testTag(TAG_EXPORTAR_SEMANA)) {
                    if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                    else Icon(Icones.documento, contentDescription = "Exportar a semana em PDF")
                }
            }
        }) {
            FaixasDoTopo(amb)
            if (semRede) FaixaTom("Sem conexão — mostrando a semana que já estava carregada.", Tom.AVISO, Icones.nuvemSemRede)
            aviso?.let { FaixaTom(it, Tom.AVISO) }
            SeletorSemana(semana, foraDeHoje = !semana.contem(hoje), mudarSemana, irParaHoje)
            when {
                ctx.clube == null -> EstadoVazio(Icones.calendario, "Nenhum clube nesta conta", "Quando um clube for cadastrado, a semana de treinos aparece aqui.")
                carregando -> Esqueleto()
                erro != null -> EstadoVazio(Icones.nuvem, TITULO_ERRO_SEMANA, erro, "Tentar de novo" to atualizar)
                else -> {
                    dias.firstOrNull { it.data == hoje }?.let { d ->
                        val r = resumoDoDiaInteiro(d)
                        CartaoHeroi(
                            rotulo = "Hoje · ${rotuloDiaMinusculo(d.data)}",
                            valor = if (r.minutos > 0) "${r.minutos} min" else r.tipo.rotulo,
                            frase = fraseDoHeroi(r) + (seloPeriodos(d)?.let { sl -> "\n" + (divisaoMinutos(d)?.let { "$sl · $it" } ?: sl) } ?: ""), selo = r.tipo.rotulo,
                            modifier = Modifier.clickable(role = Role.Button) { abrirDia(d) }.testTag("semana:hoje"),
                            rodape = tema?.frase?.let { f -> { Text(f, style = TactiPlan.tipos.corpo13, color = c.sobreHeroi2) } },
                        )
                    }
                    if (dias.none { it.data == hoje }) tema?.frase?.let { FaixaTom(it, Tom.INFO) }
                    RotuloSecao("Dias")
                    Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                        dias.forEachIndexed { i, d ->
                            LinhaDia(d, hoje = d.data == hoje) { abrirDia(d) }
                            if (i < dias.lastIndex) androidx.compose.material3.HorizontalDivider(color = c.borda)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SeletorSemana(semana: SemanaISO, foraDeHoje: Boolean, mudar: (Int) -> Unit, hoje: () -> Unit) {
    val c = TactiPlan.cores
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(c.superficie).heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { mudar(-1) }, modifier = Modifier.testTag("semana:anterior")) {
                Icon(Icones.esquerda, contentDescription = "Semana anterior", tint = c.acaoTinta)
            }
            Text(rotuloPeriodo(semana), style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                modifier = Modifier.semantics { contentDescription = "Semana de ${rotuloPeriodo(semana)}" }.testTag("semana:periodo"))
            IconButton(onClick = { mudar(1) }, modifier = Modifier.testTag("semana:proxima")) {
                Icon(Icones.direita, contentDescription = "Próxima semana", tint = c.acaoTinta)
            }
        }
        if (foraDeHoje) TextButton(onClick = hoje, modifier = Modifier.heightIn(min = 48.dp).testTag("semana:hoje-botao")) {
            Text("Hoje", color = c.acaoTinta, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Esqueleto() {
    val c = TactiPlan.cores
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.semantics { contentDescription = "Carregando a semana" }) {
        Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(20.dp)).background(c.skeleton))
        repeat(4) { Box(Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(14.dp)).background(c.skeleton)) }
    }
}

@Composable
private fun LinhaDia(d: Dia, hoje: Boolean, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    val r = resumoDoDiaInteiro(d)
    val selo = seloPeriodos(d)
    val (sigla, num) = siglaEDia(d.data)
    val titulo = com.faggin.tactiplan.app.dados.treino.tituloDaLinhaDoDia(d)
    val detalhe = detalheDaLinha(r)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClick = aoTocar)
            .padding(vertical = 8.dp).testTag(TAG_DIA + d.data)
            .semantics(mergeDescendants = true) {
                contentDescription = "${rotuloDiaCurto(d.data)}${if (hoje) ", hoje" else ""}. $titulo. " +
                    (selo?.let { sl -> divisaoMinutos(d)?.let { "$sl: $it minutos. " } ?: "$sl. " } ?: "") + detalhe +
                    if (r.anexos > 0) ". ${r.anexos} anexos" else ""
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(sigla, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = if (hoje) c.acaoTinta else c.tinta2)
            Text(num, style = TactiPlan.tipos.cabecalho17, color = if (hoje) c.acaoTinta else c.tinta)
        }
        Column(Modifier.weight(1f).padding(start = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                when (r.tipo) {
                    TipoDia.JOGO -> Icon(Icones.trofeu, null, Modifier.size(16.dp).padding(end = 2.dp), tint = c.avisoTinta)
                    TipoDia.DESCANSO -> Icon(Icones.lua, null, Modifier.size(16.dp).padding(end = 2.dp), tint = c.tinta2)
                    TipoDia.AVALIACAO -> Icon(Icones.prancheta, null, Modifier.size(16.dp).padding(end = 2.dp), tint = c.acaoTinta)
                    else -> if (r.avaliacao != null) Icon(Icones.prancheta, null, Modifier.size(16.dp).padding(end = 2.dp), tint = c.acaoTinta)
                }
                Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (selo != null) Box(Modifier.padding(start = 6.dp).testTag("dia:selo-periodos")) { Pastilha(selo, Tom.NEUTRO) }
            }
            if (r.minutosPorPilar.isNotEmpty()) BarraPilares(r.minutosPorPilar)
            if (detalhe.isNotEmpty() || r.anexos > 0) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    if (r.anexos > 0) {
                        Icon(Icones.clipe, null, Modifier.padding(start = 6.dp).size(13.dp), tint = c.tinta2)
                        Text("${r.anexos}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    }
                }
            }
        }
        Icon(Icones.direita, null, Modifier.size(18.dp), tint = c.tinta3)
    }
}

@Composable
private fun BarraPilares(partes: List<Pair<String, Int>>) {
    val total = partes.sumOf { maxOf(it.second, 1) }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp).height(5.dp).clip(RoundedCornerShape(3.dp))) {
        partes.forEach { (p, m) ->
            Box(Modifier.weight(maxOf(m, 1).toFloat() / total).fillMaxSize().background(corDoPilar(p)))
        }
    }
}

@Composable
fun corDoPilar(id: String?) = pilarDe(id)?.let { Cor.de(it.corHex).cor } ?: TactiPlan.cores.tinta3

// ---------------------------------------------------------------- Dia

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DiaTela(
    amb: AmbienteClube,
    treino: ServicoTreino,
    semana: SemanaISO,
    clubeId: String,
    diaInteiro: Dia,
    aviso: String?,
    exportando: Boolean,
    avisar: (String?) -> Unit,
    voltar: () -> Unit,
    mudou: () -> Unit,
    verFicha: (String) -> Unit,
    exportarDia: (String) -> Unit,
    exportarPeriodo: (Dia) -> Unit = {},
    abrirJogo: ((String) -> Unit)? = null,
) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    val podeEditar = ctx.podeEditar("training:edit")
    // Dia com 2+ períodos: tipo, blocos, distância e edição são do período escolhido.
    val periodosDoDia = diaInteiro.listaPeriodos
    var periodoSel by remember(diaInteiro.data) { mutableIntStateOf(0) }
    var irParaPeriodo by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(periodosDoDia.map { it.periodo }) {
        irParaPeriodo?.let { alvo ->
            val i = periodosDoDia.indexOfFirst { it.periodo == alvo }
            if (i >= 0) { periodoSel = i; irParaPeriodo = null }
        }
    }
    val dia = periodosDoDia[periodoSel.coerceIn(0, periodosDoDia.lastIndex)]
    val r = resumoDoDia(dia)
    var menuAberto by remember { mutableStateOf(false) }
    var adicionando by remember { mutableStateOf(false) }
    var confirmarRemover by remember { mutableStateOf(false) }
    var trocandoHorario by remember { mutableStateOf(false) }
    var mudandoTipo by remember { mutableStateOf(false) }
    var pedirAdversario by remember { mutableStateOf(false) }
    var pedirKm by remember { mutableStateOf(false) }
    var editando by remember { mutableStateOf<Int?>(null) }
    // Período de avaliação: a folha dos tipos (trocar o tipo para Avaliação / editar os tipos)
    var escolhendoAvaliacao by remember { mutableStateOf(false) }

    fun trocarTipo(tipo: TipoDia, adversario: String?, avaliacao: EscolhaAvaliacao? = null) {
        mudandoTipo = true
        avisar(null)
        escopo.launch {
            try {
                treino.mudarTipo(dia, tipo, adversario, semana, clubeId, avaliacao)
                mudou()
            } catch (e: Exception) {
                if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e))
            }
            mudandoTipo = false
        }
    }

    val podeAdicionar = podeEditar && periodosDisponiveis(diaInteiro).isNotEmpty()
    val podeRemover = diaInteiro.temPeriodos && ctx.podeEditar("training:delete")
    val horariosLivres = if (podeEditar) periodosParaTrocar(diaInteiro, dia) else emptyList()
    val podeExportarPeriodo = diaInteiro.temPeriodos && ctx.conta.somenteLeitura != true && dia.id != null
    TelaRaiz(rotuloDiaCurto(dia.data), aoVoltar = voltar, pequena = true, acoes = {
        val idDia = diaInteiro.id
        if (idDia != null && ctx.pode("training:view")) {
            IconButton(onClick = { verFicha(idDia) }, modifier = Modifier.testTag("dia:ficha")) {
                Icon(Icones.documento, contentDescription = "Ver a ficha do dia")
            }
            if (ctx.conta.somenteLeitura != true) {
                IconButton(onClick = { exportarDia(idDia) }, enabled = !exportando, modifier = Modifier.testTag("dia:exportar")) {
                    if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                    else Icon(Icones.compartilhar, contentDescription = "Exportar a ficha do dia em PDF")
                }
            }
        }
        if (podeAdicionar || podeRemover || podeExportarPeriodo || horariosLivres.isNotEmpty()) {
            Box {
                IconButton(onClick = { menuAberto = true }, modifier = Modifier.testTag("dia:menu-periodos")) {
                    Icon(Icones.mais, contentDescription = "Períodos do dia")
                }
                DropdownMenu(expanded = menuAberto, onDismissRequest = { menuAberto = false }) {
                    if (podeAdicionar) DropdownMenuItem(text = { Text("Adicionar período") },
                        onClick = { menuAberto = false; adicionando = true }, modifier = Modifier.testTag("dia:periodo:adicionar"))
                    if (horariosLivres.isNotEmpty()) DropdownMenuItem(text = { Text("Trocar horário (${periodoEfetivo(dia)?.rotulo ?: ""})") },
                        onClick = { menuAberto = false; trocandoHorario = true }, modifier = Modifier.testTag("dia:periodo:trocar"))
                    if (podeRemover) DropdownMenuItem(text = { Text("Remover período ${rotuloDoPeriodo(dia.periodo) ?: ""}") },
                        onClick = { menuAberto = false; confirmarRemover = true }, modifier = Modifier.testTag("dia:periodo:remover"))
                    if (podeExportarPeriodo) DropdownMenuItem(text = { Text("Exportar só ${rotuloDoPeriodo(dia.periodo) ?: "o período"} (PDF)") },
                        onClick = { menuAberto = false; exportarPeriodo(dia) }, modifier = Modifier.testTag("dia:periodo:exportar"))
                }
            }
        }
    }) {
        FaixasDoTopo(amb)
        aviso?.let { FaixaTom(it, Tom.AVISO) }
        if (diaInteiro.temPeriodos) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                periodosDoDia.forEachIndexed { i, p ->
                    SegmentedButton(
                        selected = i == periodoSel.coerceIn(0, periodosDoDia.lastIndex),
                        onClick = { periodoSel = i },
                        shape = SegmentedButtonDefaults.itemShape(i, periodosDoDia.size),
                        colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta),
                        modifier = Modifier.testTag("dia:periodo:${p.periodo}"),
                    ) { Text(rotuloDoPeriodo(p.periodo) ?: "Período") }
                }
            }
            val total = resumoDoDiaInteiro(diaInteiro)
            // "90+60" só quando 2+ períodos têm minutos (nunca "125+0")
            Text("Dia: ${total.minutos} min" + (divisaoMinutos(diaInteiro)?.let { " · $it" } ?: "") + (total.distanciaKm?.let { " · ${formatarKm(it)} km" } ?: ""),
                style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Medium, color = c.tinta2, modifier = Modifier.testTag("dia:total"))
        } else if (dia.tipo == TipoDia.TREINO || dia.tipo == TipoDia.AVALIACAO) {
            // dia de 1 período: o horário também aparece (Manhã é o padrão); troca pelo menu
            periodoEfetivo(dia)?.let { p ->
                Text("Período: ${p.rotulo}", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Medium, color = c.tinta2,
                    modifier = Modifier.testTag("dia:periodo-unico").semantics { contentDescription = "Período: ${p.rotulo}" })
            }
        }
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            TipoDia.entries.forEachIndexed { i, t ->
                SegmentedButton(
                    selected = dia.tipo == t,
                    onClick = {
                        if (t == dia.tipo) return@SegmentedButton
                        when (t) {
                            TipoDia.JOGO -> pedirAdversario = true
                            TipoDia.AVALIACAO -> escolhendoAvaliacao = true
                            else -> trocarTipo(t, null)
                        }
                    },
                    enabled = podeEditar && !mudandoTipo,
                    shape = SegmentedButtonDefaults.itemShape(i, TipoDia.entries.size),
                    colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta),
                    modifier = Modifier.testTag("dia:tipo:${t.bruto}"),
                ) { Text(t.rotulo, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
        }
        if (dia.tipo == TipoDia.JOGO && !dia.adversario.isNullOrBlank()) {
            Text("Jogo vs ${dia.adversario}", style = TactiPlan.tipos.cabecalho17, color = c.tinta)
        }
        if (dia.tipo != TipoDia.DESCANSO && dia.tipo != TipoDia.AVALIACAO) {
            Cartao {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Info("Pilar", r.rotuloPilares.ifEmpty { "—" }, Modifier.weight(1f))
                    Info("Tempo", if (r.minutos > 0) "${r.minutos} min" else "—", Modifier.weight(1f))
                    if (dia.tipo == TipoDia.TREINO) {
                        Row(Modifier.weight(1.2f), verticalAlignment = Alignment.CenterVertically) {
                            Info("Distância ideal", dia.distanciaKm?.let { "${formatarKm(it)} km" } ?: "—", Modifier.weight(1f))
                            if (podeEditar) IconButton(onClick = { pedirKm = true }, modifier = Modifier.testTag("dia:km")) {
                                Icon(Icones.lapis, contentDescription = "Editar a distância ideal", tint = c.tinta2, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
        when (dia.tipo) {
            TipoDia.DESCANSO -> EstadoVazio(Icones.lua, "Descanso", TEXTO_DIA_DESCANSO)
            TipoDia.AVALIACAO -> {
                // no lugar dos blocos: ícone + AVALIAÇÃO + os tipos
                val txt = textoAvaliacao(dia)
                Cartao(Modifier.testTag("dia:avaliacao"), aoTocar = if (podeEditar) ({ escolhendoAvaliacao = true }) else null) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics(mergeDescendants = true) {
                        contentDescription = "Avaliação: ${txt.ifEmpty { "tipo não informado" }}"
                    }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icones.prancheta, null, Modifier.size(36.dp), tint = c.acaoTinta)
                        Text("AVALIAÇÃO", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                        Text(txt.ifEmpty { "Tipo de avaliação não informado" }, style = TactiPlan.tipos.corpo13, color = c.tinta2,
                            modifier = Modifier.testTag("dia:avaliacao:tipos"))
                        if (podeEditar) Text("Tocar para escolher os tipos", style = TactiPlan.tipos.legenda11, color = c.tinta3)
                    }
                }
            }
            TipoDia.JOGO -> {
                val idJogo = dia.id
                if (idJogo != null && abrirJogo != null && ctx.pode("games:view")) {
                    Botao("Abrir jogo", { abrirJogo(idJogo) }, Modifier.testTag("dia:abrir-jogo"), icone = Icones.trofeu)
                } else FaixaTom(TEXTO_JOGO_NO_APP, Tom.INFO, Icones.trofeu)
                dia.blocos.firstOrNull()?.let { b ->
                    RotuloSecao(ROTULO_NAO_RELACIONADOS)
                    Text(TEXTO_NAO_RELACIONADOS, style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    CartaoBloco(b, ROTULO_NAO_RELACIONADOS, podeEditar) { editando = b.ordem }
                }
            }
            TipoDia.TREINO -> {
                if (r.atividades == 0) {
                    Text(if (podeEditar) "$TITULO_SEM_ATIVIDADE. $TEXTO_SEM_ATIVIDADE_EDITA" else "$TITULO_SEM_ATIVIDADE. $TEXTO_SEM_ATIVIDADE_LE",
                        style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
                dia.blocos.forEach { b -> CartaoBloco(b, "${b.ordem} · ${b.nome.uppercase()}", podeEditar) { editando = b.ordem } }
            }
        }
    }

    if (pedirAdversario) {
        var nome by remember { mutableStateOf(dia.adversario.orEmpty()) }
        AlertDialog(
            onDismissRequest = { pedirAdversario = false },
            title = { Text("Dia de jogo") },
            text = {
                OutlinedTextField(nome, { nome = it.take(120) }, label = { Text("Adversário") }, singleLine = true,
                    modifier = Modifier.testTag("dia:adversario"))
            },
            confirmButton = { TextButton(onClick = { pedirAdversario = false; trocarTipo(TipoDia.JOGO, nome) }, modifier = Modifier.testTag("dia:confirmar-jogo")) { Text("Salvar") } },
            dismissButton = { TextButton(onClick = { pedirAdversario = false }) { Text("Cancelar") } },
        )
    }
    if (pedirKm) {
        var texto by remember { mutableStateOf(formatarKm(dia.distanciaKm)) }
        var erroKm by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { pedirKm = false },
            title = { Text("Distância ideal (km)") },
            text = {
                Column {
                    OutlinedTextField(texto, { v -> texto = v.filter { it.isDigit() || it == ',' || it == '.' }.take(6) },
                        label = { Text("Ex.: 5,2") }, singleLine = true, isError = erroKm != null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                    Text(erroKm ?: "Opcional · por jogador, no dia", style = TactiPlan.tipos.corpo13, color = if (erroKm != null) c.erroTinta else c.tinta2)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    when (val k = lerKm(texto)) {
                        is ResultadoKm.Erro -> erroKm = k.mensagem
                        is ResultadoKm.Ok -> {
                            pedirKm = false
                            escopo.launch {
                                try { treino.mudarDistancia(dia, k.km, semana, clubeId); mudou() } catch (e: Exception) {
                                    if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e))
                                }
                            }
                        }
                    }
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { pedirKm = false }) { Text("Cancelar") } },
        )
    }
    if (adicionando) {
        val sug = remember { sugestaoNovoPeriodo(diaInteiro) }
        val unico = !diaInteiro.temPeriodos
        var atual by remember { mutableStateOf(sug?.first ?: Periodo.MANHA) }
        var novo by remember { mutableStateOf(sug?.second ?: Periodo.TARDE) }
        var ehAvaliacao by remember { mutableStateOf(false) }
        var avTipos by remember { mutableStateOf(setOf<String>()) }
        var avOutra by remember { mutableStateOf("") }
        val livres = periodosDisponiveis(diaInteiro)
        val escolha = normalizarAvaliacao(avTipos.toList(), avOutra)
        val erroP = erroNovoPeriodo(diaInteiro, if (unico) atual else null, novo) ?: if (ehAvaliacao && !escolha.ok) escolha.erro else null
        AlertDialog(
            onDismissRequest = { adicionando = false },
            title = { Text("Adicionar período") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (unico) {
                        Text("O que já existe é de", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            Periodo.entries.forEachIndexed { i, p ->
                                SegmentedButton(selected = atual == p, onClick = { atual = p },
                                    shape = SegmentedButtonDefaults.itemShape(i, Periodo.entries.size),
                                    modifier = Modifier.testTag("periodo:atual:${p.bruto}")) { Text(p.rotulo) }
                            }
                        }
                    }
                    Text("Novo período", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        livres.forEachIndexed { i, p ->
                            SegmentedButton(selected = novo == p, onClick = { novo = p },
                                shape = SegmentedButtonDefaults.itemShape(i, livres.size),
                                modifier = Modifier.testTag("periodo:novo:${p.bruto}")) { Text(p.rotulo) }
                        }
                    }
                    Text("Tipo do novo período", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        listOf(false, true).forEachIndexed { i, av ->
                            SegmentedButton(selected = ehAvaliacao == av, onClick = { ehAvaliacao = av },
                                shape = SegmentedButtonDefaults.itemShape(i, 2),
                                modifier = Modifier.testTag("periodo:tipo:${if (av) "assessment" else "training"}")) { Text(if (av) "Avaliação" else "Treino") }
                        }
                    }
                    if (ehAvaliacao) CamposAvaliacao(avTipos, { avTipos = it }, avOutra, { avOutra = it })
                    Text(erroP ?: if (ehAvaliacao) "Avaliação não tem blocos: só o tipo. Máximo de 3 períodos por dia."
                        else "O novo período começa com os 6 blocos vazios. Máximo de 3 por dia.",
                        style = TactiPlan.tipos.corpo13, color = if (erroP != null) c.erroTinta else c.tinta2)
                }
            },
            confirmButton = {
                TextButton(enabled = erroP == null, modifier = Modifier.testTag("periodo:confirmar"), onClick = {
                    adicionando = false
                    val a = if (unico) atual else null
                    val n = novo
                    val av = if (ehAvaliacao) escolha else null
                    escopo.launch {
                        try {
                            treino.adicionarPeriodo(diaInteiro, n, a, semana, clubeId, av)
                            irParaPeriodo = n.bruto
                            avisar("Período ${n.rotulo} adicionado.")
                            mudou()
                        } catch (e: Exception) {
                            if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e))
                        }
                    }
                }) { Text("Adicionar") }
            },
            dismissButton = { TextButton(onClick = { adicionando = false }) { Text("Cancelar") } },
        )
    }
    if (escolhendoAvaliacao) {
        var avTipos by remember { mutableStateOf(dia.tiposAvaliacao.orEmpty().toSet()) }
        var avOutra by remember { mutableStateOf(dia.outraAvaliacao.orEmpty()) }
        val escolha = normalizarAvaliacao(avTipos.toList(), avOutra)
        AlertDialog(
            onDismissRequest = { escolhendoAvaliacao = false },
            title = { Text("Avaliação") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CamposAvaliacao(avTipos, { avTipos = it }, avOutra, { avOutra = it })
                    escolha.erro?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.erroTinta) }
                }
            },
            confirmButton = {
                TextButton(enabled = escolha.ok && !mudandoTipo, modifier = Modifier.testTag("avaliacao:salvar"), onClick = {
                    escolhendoAvaliacao = false
                    trocarTipo(TipoDia.AVALIACAO, null, escolha)
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { escolhendoAvaliacao = false }) { Text("Cancelar") } },
        )
    }
    if (trocandoHorario) {
        val alvo = dia
        val livres = periodosParaTrocar(diaInteiro, alvo)
        AlertDialog(
            onDismissRequest = { trocandoHorario = false },
            title = { Text("Trocar horário") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${periodoEfetivo(alvo)?.rotulo ?: "O período"} passa a ser:", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    livres.forEach { p ->
                        TextButton(onClick = {
                            trocandoHorario = false
                            escopo.launch {
                                try {
                                    treino.trocarPeriodo(alvo, diaInteiro, p)
                                    irParaPeriodo = p.bruto
                                    avisar("${periodoEfetivo(alvo)?.rotulo ?: ""} agora é ${p.rotulo}.")
                                    mudou()
                                } catch (e: Exception) {
                                    if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e))
                                }
                            }
                        }, modifier = Modifier.fillMaxWidth().testTag("periodo:trocar:${p.bruto}")) { Text(p.rotulo) }
                    }
                    Text("As atividades e anexos continuam iguais; só muda o horário.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { trocandoHorario = false }) { Text("Cancelar") } },
        )
    }
    if (confirmarRemover) {
        val alvo = dia
        AlertDialog(
            onDismissRequest = { confirmarRemover = false },
            title = { Text("Remover período") },
            text = { Text(textoRemoverPeriodo(alvo)) },
            confirmButton = {
                TextButton(modifier = Modifier.testTag("periodo:remover:confirmar"), onClick = {
                    confirmarRemover = false
                    escopo.launch {
                        try {
                            treino.removerPeriodo(alvo)
                            periodoSel = 0
                            avisar("Período ${rotuloDoPeriodo(alvo.periodo) ?: ""} removido.")
                            mudou()
                        } catch (e: Exception) {
                            if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e, MSG_SEM_PERMISSAO_APAGAR))
                        }
                    }
                }) { Text("Remover", color = c.erroTinta) }
            },
            dismissButton = { TextButton(onClick = { confirmarRemover = false }) { Text("Cancelar") } },
        )
    }
    editando?.let { ordem ->
        EditarAtividadeFolha(
            amb = amb, treino = treino, semana = semana, clubeId = clubeId, dia = dia, ordem = ordem,
            fechar = { editando = null },
            salvo = { msg -> editando = null; avisar(msg); mudou() },
        )
    }
}

@Composable
private fun Info(rotulo: String, valor: String, modifier: Modifier = Modifier) {
    val c = TactiPlan.cores
    Column(modifier.semantics(mergeDescendants = true) {}) {
        Text(rotulo, style = TactiPlan.tipos.legenda11, color = c.tinta2)
        Text(valor, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 2)
    }
}

/** Cartão do bloco: conteúdo em destaque, submomentos, tempo, grupos, descrição e a atividade por último. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CartaoBloco(b: Bloco, rotulo: String, podeEditar: Boolean, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    val a = b.atividade
    Cartao(
        modifier = Modifier.testTag(TAG_BLOCO + b.ordem),
        aoTocar = if (podeEditar) aoTocar else null,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(rotulo, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = c.tinta2,
                modifier = Modifier.weight(1f).semantics { heading() })
            if ((a?.minutos ?: 0) > 0) Text("${a?.minutos} min", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
        }
        if (a == null) {
            Text(if (podeEditar) "Sem atividade · toque para adicionar" else "Sem atividade",
                style = TactiPlan.tipos.corpo13, color = c.tinta3, modifier = Modifier.padding(top = 6.dp))
            return@Cartao
        }
        val conteudo = a.conteudos?.firstOrNull()
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(corDoPilar(conteudo?.dimensao)))
            Spacer(Modifier.width(8.dp))
            Text(conteudo?.nome ?: rotuloPilar(a.pilar).ifEmpty { "Atividade" }, style = TactiPlan.tipos.cabecalho17, color = c.tinta)
        }
        val etapas = a.etapas.orEmpty().mapNotNull { it.nome }
        if (etapas.isNotEmpty()) Text(etapas.joinToString(" · "), style = TactiPlan.tipos.corpo13, color = c.tinta2)
        if (!a.grupos.isNullOrEmpty()) {
            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                a.grupos.forEach { g ->
                    Text(g, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = c.acaoTinta,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(c.acaoSuave).padding(horizontal = 8.dp, vertical = 3.dp))
                }
            }
        }
        a.descricao?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta, modifier = Modifier.padding(top = 6.dp), maxLines = 4, overflow = TextOverflow.Ellipsis)
        }
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(a.tituloNome ?: "", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.weight(1f))
            if ((a.anexos ?: 0) > 0) {
                Icon(Icones.clipe, contentDescription = "${a.anexos} anexos", modifier = Modifier.size(14.dp), tint = c.tinta2)
                Text("${a.anexos}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
        }
    }
}


/** Os tipos da lista fixa (seleção múltipla, chips) + "Outra" com texto curto (até 60). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CamposAvaliacao(tipos: Set<String>, aoMudarTipos: (Set<String>) -> Unit, outra: String, aoMudarOutra: (String) -> Unit) {
    val c = TactiPlan.cores
    Text("Tipo de avaliação (um ou mais)", style = TactiPlan.tipos.corpo13, color = c.tinta2)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        TipoAvaliacao.entries.filter { it != TipoAvaliacao.OUTRA }.forEach { t ->
            val on = t.bruto in tipos
            FilterChip(selected = on, onClick = { aoMudarTipos(if (on) tipos - t.bruto else tipos + t.bruto) },
                label = { Text(t.rotulo) }, modifier = Modifier.testTag("avaliacao:tipo:${t.bruto}"))
        }
    }
    OutlinedTextField(outra, { aoMudarOutra(it.take(MAX_OUTRA_AVALIACAO)) }, label = { Text("Outra (opcional)") },
        singleLine = true, supportingText = { Text("${outra.length}/$MAX_OUTRA_AVALIACAO") },
        modifier = Modifier.fillMaxWidth().testTag("avaliacao:outra"))
}
