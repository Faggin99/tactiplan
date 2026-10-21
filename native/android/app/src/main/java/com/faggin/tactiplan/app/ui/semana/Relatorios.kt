package com.faggin.tactiplan.app.ui.semana

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.BitmapFactory
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.treino.ApiTreino
import com.faggin.tactiplan.app.dados.treino.EscolhaFotos
import com.faggin.tactiplan.app.dados.treino.LAYOUTS_FOTOS
import com.faggin.tactiplan.app.dados.treino.ListaFotosRelatorio
import com.faggin.tactiplan.app.dados.treino.ModoExportarFotos
import com.faggin.tactiplan.app.dados.treino.PROPORCOES_FOTOS
import com.faggin.tactiplan.app.dados.treino.PreferenciasFotos
import com.faggin.tactiplan.app.dados.treino.TAMANHO_FOTO_MAX
import com.faggin.tactiplan.app.dados.treino.TAMANHO_FOTO_MIN
import com.faggin.tactiplan.app.dados.treino.bytesDaMiniatura
import com.faggin.tactiplan.app.dados.treino.chavePreferenciasFotos
import com.faggin.tactiplan.app.dados.treino.corpoComFotos
import com.faggin.tactiplan.app.dados.treino.htmlParaWebView
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.BotaoTexto
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement

// Relatórios em PDF do dia e da semana: o servidor gera (POST /api/reports/:tipo) e o celular só
// entrega pela folha de compartilhar. Com fotos, antes abre "Fotos do relatório" (o modal do web).

/** Pedido de PDF com fotos: abre a tela de escolha. */
class PedidoFotos(val tipo: String, val corpo: Map<String, JsonElement>, val nome: String, val escolha: EscolhaFotos)

sealed interface InicioExportar {
    data object Entregue : InicioExportar
    data class EscolherFotos(val pedido: PedidoFotos) : InicioExportar
    data class Erro(val mensagem: String) : InicioExportar
}

private const val ARQ_PREFS = "tactiplan_prefs"

fun lerPreferenciasFotos(context: Context, usuarioId: String?): PreferenciasFotos? = try {
    context.getSharedPreferences(ARQ_PREFS, Context.MODE_PRIVATE).getString(chavePreferenciasFotos(usuarioId), null)
        ?.let { JsonApp.decodeFromString(PreferenciasFotos.serializer(), it) }
} catch (_: Exception) { null }

fun gravarPreferenciasFotos(context: Context, usuarioId: String?, p: PreferenciasFotos) {
    try {
        context.getSharedPreferences(ARQ_PREFS, Context.MODE_PRIVATE).edit()
            .putString(chavePreferenciasFotos(usuarioId), JsonApp.encodeToString(PreferenciasFotos.serializer(), p)).apply()
    } catch (_: Exception) { /* sem preferências: segue o padrão */ }
}

/**
 * O "Exportar PDF" do web: pede as fotos; sem fotos (ou se a lista falhar) gera direto; com fotos
 * abre a escolha. 401 sobe (a casca trata); 402/403 vira frase neutra.
 */
suspend fun iniciarExportacao(
    context: Context, api: ApiTreino, tipo: String, corpo: Map<String, JsonElement>, nome: String, usuarioId: String?,
    tratarErro: (Throwable) -> Boolean,
): InicioExportar {
    val lista: ListaFotosRelatorio? = try {
        api.fotosDoRelatorio(tipo, corpo)
    } catch (e: Exception) {
        if (tratarErro(e)) return InicioExportar.Entregue
        if (e is ErroApi && (e.status == 402 || e.status == 403)) return InicioExportar.Erro(mensagemErroTreino(e))
        null
    }
    if (lista != null && lista.fotos.isNotEmpty()) {
        return InicioExportar.EscolherFotos(PedidoFotos(tipo, corpo, nome, EscolhaFotos.de(lista, lerPreferenciasFotos(context, usuarioId))))
    }
    return gerarECompartilhar(context, api, tipo, corpo, nome, tratarErro)
}

suspend fun gerarECompartilhar(
    context: Context, api: ApiTreino, tipo: String, corpo: Map<String, JsonElement>, nome: String,
    tratarErro: (Throwable) -> Boolean,
): InicioExportar = try {
    val pdf = api.pdfDoRelatorio(tipo, corpo)
    compartilharPdf(context, pdf, nome)?.let { InicioExportar.Erro(it) } ?: InicioExportar.Entregue
} catch (e: Exception) {
    if (tratarErro(e)) InicioExportar.Entregue else InicioExportar.Erro(mensagemErroTreino(e))
}

/** HTML do servidor num WebView travado: sem navegar para fora, sem arquivo local; JS só p/ paginar. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun VisualizadorHtml(html: String, modifier: Modifier = Modifier, descricao: String = "Prévia do relatório") {
    val c = TactiPlan.cores
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                }
                setBackgroundColor(android.graphics.Color.WHITE)
                contentDescription = descricao
            }
        },
        update = { w ->
            if (w.tag != html) {
                w.tag = html
                w.loadDataWithBaseURL(null, htmlParaWebView(html), "text/html", "utf-8", null)
            }
        },
        modifier = modifier.background(c.superficie),
    )
}

/** "Ficha do dia" na tela (formato 'visualizar', só training:view) + compartilhar o PDF. */
@Composable
fun FichaDoDiaTela(
    api: ApiTreino,
    diaId: String,
    titulo: String,
    podeExportar: Boolean,
    exportar: () -> Unit,
    exportando: Boolean,
    tratarErro: (Throwable) -> Boolean,
    voltar: () -> Unit,
) {
    BackHandler { voltar() }
    var html by remember { mutableStateOf<String?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var tentativa by remember { mutableStateOf(0) }
    LaunchedEffect(diaId, tentativa) {
        erro = null
        try {
            html = api.htmlDoRelatorio("sessao", mapOf("session_id" to kotlinx.serialization.json.JsonPrimitive(diaId),
                "formato" to kotlinx.serialization.json.JsonPrimitive("visualizar")))
        } catch (e: Exception) {
            if (!tratarErro(e)) erro = mensagemErroTreino(e)
        }
    }
    val c = TactiPlan.cores
    Column(Modifier.fillMaxSize().background(c.fundo)) {
        TelaRaizSemRolagem(titulo, voltar, acoes = {
            if (podeExportar) IconButton(onClick = exportar, enabled = !exportando, modifier = Modifier.testTag("ficha:compartilhar")) {
                if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                else Icon(Icones.compartilhar, contentDescription = "Compartilhar a ficha em PDF")
            }
        })
        when {
            erro != null -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FaixaTom(erro!!, Tom.ERRO)
                Botao("Tentar de novo", { tentativa++ }, variante = VarianteBotao.SECUNDARIO)
            }
            html == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = c.acaoTinta, modifier = Modifier.semantics { contentDescription = "Carregando a ficha" })
            }
            else -> VisualizadorHtml(html!!, Modifier.fillMaxSize(), "Ficha do dia")
        }
    }
}

/** Barra de topo simples (voltar + título + ações) para telas que não rolam como um todo. */
@Composable
fun TelaRaizSemRolagem(titulo: String, voltar: () -> Unit, acoes: @Composable () -> Unit = {}) {
    val c = TactiPlan.cores
    Row(
        Modifier.fillMaxWidth().background(c.fundo).heightIn(min = 56.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = voltar) { Icon(Icones.esquerda, contentDescription = "Voltar", tint = c.acaoTinta) }
        Text(titulo, style = TactiPlan.tipos.cabecalho17, color = c.tinta, maxLines = 1, modifier = Modifier.weight(1f))
        acoes()
    }
}

/** Tela "Fotos do relatório" (Ajustes | Prévia), equivalente ao modal do web. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FotosRelatorioTela(
    pedido: PedidoFotos,
    api: ApiTreino,
    usuarioId: String?,
    tratarErro: (Throwable) -> Boolean,
    fechar: () -> Unit,
) {
    val context = LocalContext.current
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var e by remember { mutableStateOf(pedido.escolha) }
    var aba by remember { mutableStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var gerando by remember { mutableStateOf<ModoExportarFotos?>(null) }
    var previa by remember { mutableStateOf<String?>(null) }
    var previaErro by remember { mutableStateOf<String?>(null) }
    var carregandoPrevia by remember { mutableStateOf(false) }
    BackHandler(enabled = gerando == null) { fechar() }

    LaunchedEffect(e.preferencias) { gravarPreferenciasFotos(context, usuarioId, e.preferencias) }
    val chave = e.configuracao.toString()
    LaunchedEffect(chave, aba) {
        if (aba != 1) return@LaunchedEffect
        if (e.quantasSelecionadas == 0) { previa = null; previaErro = null; return@LaunchedEffect }
        carregandoPrevia = true
        delay(400)
        try {
            previa = api.htmlDoRelatorio(pedido.tipo, corpoComFotos(pedido.corpo, e, ModoExportarFotos.ESCOLHIDAS) +
                ("formato" to kotlinx.serialization.json.JsonPrimitive("html")))
            previaErro = null
        } catch (ex: Exception) {
            if (!tratarErro(ex)) previaErro = mensagemErroTreino(ex, "Não foi possível montar a prévia.")
        }
        carregandoPrevia = false
    }

    fun gerar(modo: ModoExportarFotos) {
        if (gerando != null) return
        gerando = modo
        aviso = null
        escopo.launch {
            when (val r = gerarECompartilhar(context, api, pedido.tipo, corpoComFotos(pedido.corpo, e, modo), pedido.nome, tratarErro)) {
                is InicioExportar.Erro -> aviso = r.mensagem
                else -> { gerando = null; fechar(); return@launch }
            }
            gerando = null
        }
    }

    Column(Modifier.fillMaxSize().background(c.fundo)) {
        TelaRaizSemRolagem("Fotos do relatório", { if (gerando == null) fechar() })
        TabRow(selectedTabIndex = aba, containerColor = c.fundo, contentColor = c.acaoTinta,
            indicator = { pos -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(pos[aba]), color = c.acaoTinta) }) {
            Tab(aba == 0, { aba = 0 }, text = { Text("Ajustes") }, modifier = Modifier.testTag("fotos:ajustes"))
            Tab(aba == 1, { aba = 1 }, text = { Text(if (e.quantasSelecionadas == 0) "Prévia" else "Prévia · ${e.rotuloPrevia}") },
                modifier = Modifier.testTag("fotos:previa"))
        }
        Box(Modifier.weight(1f)) {
            if (aba == 0) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    aviso?.let { FaixaTom(it, Tom.AVISO) }
                    RotuloSecao("Layout")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LAYOUTS_FOTOS.forEach { l ->
                            val ativo = e.layout == l.id
                            Column(
                                Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                                    .border(2.dp, if (ativo) c.acaoTinta else c.borda, RoundedCornerShape(12.dp))
                                    .background(if (ativo) c.acaoSuave else c.superficie)
                                    .clickable { e = e.copy(layout = l.id) }
                                    .heightIn(min = 64.dp).padding(6.dp)
                                    .semantics { contentDescription = "Layout ${l.rotulo}, ${l.dica}${if (ativo) ", escolhido" else ""}" },
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(l.rotulo, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta)
                                Text(l.dica, style = TactiPlan.tipos.legenda11, color = c.tinta2, maxLines = 2)
                            }
                        }
                    }
                    if (!e.semana) {
                        RotuloSecao("Onde ficam as fotos")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Chip("No final da ficha", e.posicao == "fim") { e = e.copy(posicao = "fim") }
                            Chip("Abaixo de cada bloco", e.posicao == "blocos") { e = e.copy(posicao = "blocos") }
                        }
                        if (e.posicao == "blocos") Text("Cada foto vai logo abaixo do treino a que pertence. Fotos do dia sem bloco ficam no final.",
                            style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    }
                    RotuloSecao("Proporção")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PROPORCOES_FOTOS.forEach { (id, rot) -> Chip(rot, e.proporcao == id) { e = e.copy(proporcao = id) } }
                    }
                    RotuloSecao("Tamanho das fotos · ${e.tamanho}%")
                    Slider(
                        value = e.tamanho.toFloat(), onValueChange = { e = e.mudarTamanho(it.toDouble()) },
                        valueRange = TAMANHO_FOTO_MIN.toFloat()..TAMANHO_FOTO_MAX.toFloat(), steps = 4,
                        colors = SliderDefaults.colors(thumbColor = c.acao, activeTrackColor = c.acao),
                        modifier = Modifier.semantics { contentDescription = "Tamanho das fotos" },
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip("Mostrar legendas", e.legendas) { e = e.copy(legendas = !e.legendas) }
                        if (e.semana) {
                            Chip("Agrupar por dia", e.agrupar) { e = e.copy(agrupar = true) }
                            Chip("Lista corrida", !e.agrupar) { e = e.copy(agrupar = false) }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RotuloSecao("Fotos · ${e.quantasSelecionadas} de ${e.fotos.size}", Modifier.weight(1f))
                        BotaoTexto("Todas", { val (n, a) = e.selecionarTodas(); e = n; aviso = a })
                        BotaoTexto("Nenhuma", { e = e.nenhuma() })
                    }
                    e.grupos.forEach { g ->
                        g.rotulo?.let { Text(it, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2) }
                        g.ids.forEach { id -> LinhaFoto(e, id, aoMudar = { e = it }, aviso = { aviso = it }) }
                    }
                }
            } else {
                when {
                    e.quantasSelecionadas == 0 -> Text("Sem fotos selecionadas: o PDF sai sem a seção de fotos.",
                        style = TactiPlan.tipos.corpo15, color = c.tinta2, modifier = Modifier.padding(16.dp))
                    previaErro != null -> FaixaTom(previaErro!!, Tom.ERRO, modifier = Modifier.padding(16.dp))
                    previa != null -> VisualizadorHtml(previa!!, Modifier.fillMaxSize())
                    else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.acaoTinta) }
                }
                if (carregandoPrevia && previa != null) {
                    CircularProgressIndicator(Modifier.align(Alignment.TopEnd).padding(12.dp).size(22.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                }
            }
        }
        Column(Modifier.background(c.superficie).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Botao(if (gerando == ModoExportarFotos.SEM_FOTOS) "Gerando…" else "Sem fotos", { gerar(ModoExportarFotos.SEM_FOTOS) },
                    Modifier.weight(1f), VarianteBotao.NEUTRO, habilitado = gerando == null)
                Botao(if (gerando == ModoExportarFotos.AUTOMATICO) "Gerando…" else "Automático", { gerar(ModoExportarFotos.AUTOMATICO) },
                    Modifier.weight(1f), VarianteBotao.NEUTRO, habilitado = gerando == null)
            }
            Botao(if (gerando == ModoExportarFotos.ESCOLHIDAS) "Gerando o PDF…" else "Gerar PDF", { gerar(ModoExportarFotos.ESCOLHIDAS) },
                Modifier.testTag("fotos:gerar"), habilitado = gerando == null, icone = Icones.compartilhar)
        }
    }
}

@Composable
private fun Chip(texto: String, ativo: Boolean, aoTocar: () -> Unit) {
    val c = TactiPlan.cores
    FilterChip(
        selected = ativo, onClick = aoTocar, label = { Text(texto) },
        modifier = Modifier.heightIn(min = 48.dp),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = c.acaoSuave, selectedLabelColor = c.acaoTinta),
    )
}

@Composable
private fun LinhaFoto(e: EscolhaFotos, id: String, aoMudar: (EscolhaFotos) -> Unit, aviso: (String?) -> Unit) {
    val c = TactiPlan.cores
    val f = e.fotos.firstOrNull { it.id == id } ?: return
    val miniatura = remember(f.thumb) {
        bytesDaMiniatura(f.thumb)?.let { b -> BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap() }
    }
    Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Checkbox(
                checked = e.marcada(id), onCheckedChange = { val (n, a) = e.alternar(id); aoMudar(n); aviso(a) },
                colors = CheckboxDefaults.colors(checkedColor = c.acao, checkmarkColor = c.sobreAcao),
                modifier = Modifier.semantics { contentDescription = "Incluir ${f.titulo ?: "foto"}" },
            )
            if (miniatura != null) {
                Image(miniatura, contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(width = 56.dp, height = 42.dp).clip(RoundedCornerShape(6.dp)))
            } else {
                Box(Modifier.size(width = 56.dp, height = 42.dp).clip(RoundedCornerShape(6.dp)).background(c.skeleton))
            }
            Column(Modifier.weight(1f)) {
                OutlinedTextField(
                    value = e.legenda(id), onValueChange = { aoMudar(e.editarLegenda(id, it)) }, singleLine = true,
                    label = { Text("Legenda") }, textStyle = TactiPlan.tipos.corpo13.copy(color = c.tinta),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(f.origem ?: "Anexo do dia", style = TactiPlan.tipos.legenda11, color = c.tinta2, maxLines = 1)
            }
            Column {
                IconButton(onClick = { aoMudar(e.mover(id, -1)) }, enabled = e.podeMover(id, -1)) {
                    Icon(Icones.cima, contentDescription = "Subir ${f.titulo ?: "foto"}")
                }
                IconButton(onClick = { aoMudar(e.mover(id, 1)) }, enabled = e.podeMover(id, 1)) {
                    Icon(Icones.baixo, contentDescription = "Descer ${f.titulo ?: "foto"}")
                }
            }
        }
        if (e.legendaEditada(id)) BotaoTexto("Voltar ao título do anexo", { aoMudar(e.restaurarLegenda(id)) })
    }
}

@Suppress("unused") private val ALTURA_MIN = 1.dp.let { Modifier.height(it) }
