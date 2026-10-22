package com.faggin.tactiplan.app.ui.quadro

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.dobrar
import com.faggin.tactiplan.app.dados.quadro.AlvoFormacao
import com.faggin.tactiplan.app.dados.quadro.CORES_DESENHO
import com.faggin.tactiplan.app.dados.quadro.Desenho
import com.faggin.tactiplan.app.dados.quadro.FERRAMENTAS_DESENHO
import com.faggin.tactiplan.app.dados.quadro.FERRAMENTAS_SETA
import com.faggin.tactiplan.app.dados.quadro.OBJETOS_QUE_GIRAM
import com.faggin.tactiplan.app.dados.quadro.Peca
import com.faggin.tactiplan.app.dados.quadro.PosicaoFormacao
import com.faggin.tactiplan.app.dados.quadro.TIPOS_CAMPO
import com.faggin.tactiplan.app.dados.quadro.TIPOS_OBJETO
import com.faggin.tactiplan.app.dados.quadro.VELOCIDADES_QUADRO
import com.faggin.tactiplan.app.dados.quadro.VISTAS_CAMPO
import com.faggin.tactiplan.app.dados.quadro.camisaConfirmada
import com.faggin.tactiplan.app.dados.quadro.corCss
import com.faggin.tactiplan.app.dados.quadro.corMarcada
import com.faggin.tactiplan.app.dados.quadro.desenhoTemEspessura
import com.faggin.tactiplan.app.dados.quadro.espelharFormacao
import com.faggin.tactiplan.app.dados.quadro.formacoesDoCampo
import com.faggin.tactiplan.app.dados.quadro.girar
import com.faggin.tactiplan.app.dados.quadro.nomeArquivoVideo
import com.faggin.tactiplan.app.dados.quadro.nomeConfirmado
import com.faggin.tactiplan.app.dados.quadro.nomeValidoJogada
import com.faggin.tactiplan.app.dados.quadro.num
import com.faggin.tactiplan.app.dados.quadro.numeroJs
import com.faggin.tactiplan.app.dados.quadro.patchCorDesenho
import com.faggin.tactiplan.app.dados.quadro.rotuloMedidas
import com.faggin.tactiplan.app.dados.quadro.rotuloModo
import com.faggin.tactiplan.app.dados.quadro.subtituloEditor
import com.faggin.tactiplan.app.dados.quadro.txt
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

// Editor do quadro tático (T5), DEITADO (gira sozinho ao abrir: requestedOrientation da Activity).
// Tela cheia por cima das abas. Desenho aprovado (tela 13): barra de cima, ferramentas numa coluna
// à esquerda, campo proporcional, propriedades à direita e a barra de play/quadros embaixo.
// Paridade: EditorQuadroTela.swift (iPhone).

val FUNDO_QUADRO = Color(0xFF0B1220)
val LIMA_QUADRO = Color(0xFFC8FF00)
val NAVY_QUADRO = Color(0xFF0F172A)
private val AMBAR_Q = Color(0xFFFBBF24)

fun corCompose(css: String?, padrao: Color = Color.White): Color = corCss(css)?.let { Color(it.r.toFloat(), it.g.toFloat(), it.b.toFloat(), it.a.toFloat()) } ?: padrao

fun corHex(c: Color): String {
    fun h(v: Float) = "%02x".format((v.coerceIn(0f, 1f) * 255 + 0.5f).toInt())
    return "#${h(c.red)}${h(c.green)}${h(c.blue)}"
}

fun Context.acharActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

/** Ícones de traço do quadro (lucide 24×24). */
object IconesQuadro {
    private fun t(nome: String, d: String) = ImageVector.Builder(nome, 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2.1f,
        strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
    ).build()

    val selecionar = t("selecionar", "M4.04 4.04 10.7 21l2.48-7.3L20.5 11.2z")
    val voltar = t("voltar", "M15 18l-6-6 6-6")
    val desfazer = t("desfazer", "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11")
    val refazer = t("refazer", "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13")
    val filme = t("filme", "M3 3h18v18H3zM7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4")
    val lixo = t("lixo", "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
    val pecas = t("pecas", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M19 8v6M22 11h-6")
    val formacoes = t("formacoes", "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z")
    val seta = t("seta", "M7 17 17 7M7 7h10v10")
    val caneta = t("caneta", "M12 20h9M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z")
    val cone = t("cone", "M12 3 4 20h16z")
    val borracha = t("borracha", "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9")
    val olho = t("olho", "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6")
    val bola = t("bola", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 7l4.5 3.3-1.7 5.2H9.2l-1.7-5.2z")
    val play = t("play", "M6 3l14 9-14 9z")
    val pausa = t("pausa", "M6 4h4v16H6zM14 4h4v16h-4z")
    val inicio = t("inicio", "M19 20 9 12l10-8zM5 19V5")
    val esquerda = t("esquerda", "M15 18l-6-6 6-6")
    val direita = t("direita", "M9 18l6-6-6-6")
    val mais = t("mais", "M5 12h14M12 5v14")
    val fechar = t("fechar", "M18 6 6 18M6 6l12 12")
}

@Composable
fun EditorQuadroDialogo(m: ModeloEditor, aoFechar: () -> Unit) {
    val ctx = LocalContext.current
    val atividade = remember(ctx) { ctx.acharActivity() }
    DisposableEffect(atividade) {
        val antes = atividade?.requestedOrientation
        atividade?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        onDispose { atividade?.requestedOrientation = antes ?: ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
    }
    var perguntarSair by remember { mutableStateOf(false) }
    val sair: () -> Unit = { if (m.ed.alterado) { perguntarSair = true } else { aoFechar() } }
    Dialog(onDismissRequest = sair, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false, decorFitsSystemWindows = false)) {
        EditorQuadroTela(m, aoVoltar = sair, aoFechar = aoFechar)
        if (perguntarSair) {
            val escopo = rememberCoroutineScope()
            AlertDialog(
                onDismissRequest = { perguntarSair = false },
                title = { Text("Há alterações não salvas") },
                text = { Text("Salvar antes de sair?") },
                confirmButton = {
                    TextButton(onClick = {
                        perguntarSair = false
                        escopo.launch { if (m.salvarRapido()) aoFechar() else m.aviso = "Toque no nome da jogada para salvar." }
                    }) { Text("Salvar e sair") }
                },
                dismissButton = {
                    Row {
                        TextButton(onClick = { perguntarSair = false }) { Text("Continuar editando") }
                        TextButton(onClick = { perguntarSair = false; aoFechar() }) { Text("Sair sem salvar", color = Color(0xFFEF4444)) }
                    }
                },
            )
        }
    }
}

@Composable
fun EditorQuadroTela(m: ModeloEditor, aoVoltar: () -> Unit, aoFechar: () -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val haptico = LocalHapticFeedback.current
    var folhaSalvar by remember { mutableStateOf(false) }
    var perguntarLimpar by remember { mutableStateOf(false) }
    var perguntarExcluirQuadro by remember { mutableStateOf(false) }
    var tamanho by remember { mutableStateOf(600f to 300f) }
    var video by remember { mutableStateOf<Job?>(null) }
    var progresso by remember { mutableStateOf(0f) }

    // Relógio do play (um passo por quadro da tela).
    LaunchedEffect(m.tocando) {
        if (!m.tocando) return@LaunchedEffect
        var antes = withFrameNanos { it }
        while (m.tocando) {
            val agora = withFrameNanos { it }
            m.passo((agora - antes) / 1e6)
            antes = agora
        }
    }
    LaunchedEffect(m.aviso) { if (m.aviso != null) { delay(3500); m.aviso = null } }
    BackHandler(onBack = aoVoltar)

    fun gerarVideo() {
        if (video != null) return
        if (m.ed.totalQuadros <= 1) { m.aviso = "Crie um 2º quadro para animar (botão +)."; return }
        m.parar()
        progresso = 0f
        video = escopo.launch {
            try {
                val f: File = gerarVideoQuadro(ctx, m.ed.quadros, m.ed.tipoCampo, m.ed.vista, m.ed.corA, m.ed.corB, tamanho.first, tamanho.second,
                    nomeArquivoVideo(m.nome, LocalDate.now().toString())) { progresso = it }
                compartilharVideo(ctx, f)?.let { m.aviso = it }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                m.aviso = e.message?.takeIf { it.startsWith("Crie") } ?: "Não foi possível gerar o vídeo neste aparelho."
            } finally {
                video = null
            }
        }
    }

    Box(Modifier.fillMaxSize().background(FUNDO_QUADRO).windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 8.dp, vertical = 6.dp)) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // ---------------------------------------------------------------- barra de cima
            Row(Modifier.fillMaxWidth().height(44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BotaoBarra(IconesQuadro.voltar, "Voltar", onClick = aoVoltar)
                Column(Modifier.weight(1f).clickable { folhaSalvar = true }.semantics { contentDescription = "Renomear ou salvar como nova jogada" }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(m.nome.ifEmpty { "Sem nome" }, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (m.ed.alterado) Box(Modifier.padding(start = 6.dp).size(7.dp).clip(CircleShape).background(AMBAR_Q).semantics { contentDescription = "Alterações não salvas" })
                    }
                    Text(subtituloEditor(m.ed.tipoCampo, m.ed.vista, m.ed.atual, m.ed.totalQuadros), color = Color.White.copy(alpha = 0.6f), fontSize = 11.5.sp, maxLines = 1)
                }
                if (video != null) {
                    LinearProgressIndicator(progress = { progresso }, modifier = Modifier.width(70.dp), color = LIMA_QUADRO)
                    TextButton(onClick = { video?.cancel() }) { Text("Cancelar", color = Color(0xFFFCA5A5), fontSize = 12.sp) }
                }
                BotaoBarra(IconesQuadro.desfazer, "Desfazer", habilitado = m.ed.podeDesfazer) { m.ed = m.ed.desfazer() }
                BotaoBarra(IconesQuadro.refazer, "Refazer", habilitado = m.ed.podeRefazer) { m.ed = m.ed.refazer() }
                BotaoBarra(IconesQuadro.filme, if (m.ed.totalQuadros > 1) "Exportar vídeo" else "Crie um 2º quadro para animar",
                    habilitado = m.ed.totalQuadros > 1 && video == null) { gerarVideo() }
                BotaoBarra(IconesQuadro.lixo, "Limpar tudo") { perguntarLimpar = true }
                Box(
                    Modifier.height(38.dp).clip(RoundedCornerShape(12.dp)).background(LIMA_QUADRO)
                        .clickable(enabled = !m.salvando) { escopo.launch { if (!m.salvarRapido()) folhaSalvar = true } }
                        .padding(horizontal = 16.dp).testTag("quadro:salvar"),
                    contentAlignment = Alignment.Center,
                ) { Text(if (m.salvando) "Salvando…" else "Salvar", color = NAVY_QUADRO, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold) }
            }
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ColunaFerramentas(m, escopo)
                CampoEditor(m, Modifier.weight(1f).fillMaxHeight(), aoTamanho = { tamanho = it }, aoSoltar = { haptico.performHapticFeedback(HapticFeedbackType.TextHandleMove) })
            }
            BarraQuadros(
                atual = m.ed.atual, total = m.ed.totalQuadros, tocando = m.tocando, velocidade = m.velocidade, aoVelocidade = { m.velocidade = it },
                aoVoltarInicio = { m.parar(); m.ed = m.ed.irParaQuadro(0) }, aoTocar = { m.tocarOuPausar() },
                aoIr = { m.parar(); m.ed = m.ed.irParaQuadro(it) },
                aoAdicionar = { m.parar(); m.ed = m.ed.adicionarQuadro() }, aoExcluir = { perguntarExcluirQuadro = true },
            )
        }
        m.aviso?.let {
            Text(it, color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 64.dp)
                .clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.85f)).padding(horizontal = 16.dp, vertical = 10.dp))
        }
    }

    if (folhaSalvar) SalvarJogadaDialogo(m.nome, m.descricao, m.jogadaId != null, aoFechar = { folhaSalvar = false }) { n, d, nova ->
        folhaSalvar = false
        escopo.launch { m.persistir(n, d, nova) }
    }
    if (perguntarLimpar) Confirmar("Limpar todo o quadro tático?", "Limpar", aoCancelar = { perguntarLimpar = false }) {
        perguntarLimpar = false; m.ed = m.ed.limpar(); m.soSelecionar()
    }
    if (perguntarExcluirQuadro) Confirmar("Excluir o quadro ${m.ed.atual + 1}?", "Excluir", aoCancelar = { perguntarExcluirQuadro = false }) {
        perguntarExcluirQuadro = false; m.parar(); m.ed = m.ed.excluirQuadro()
    }
}

@Composable
fun Confirmar(titulo: String, acao: String, aoCancelar: () -> Unit, aoConfirmar: () -> Unit) {
    AlertDialog(
        onDismissRequest = aoCancelar, title = { Text(titulo) },
        confirmButton = { TextButton(onClick = aoConfirmar, modifier = Modifier.testTag("quadro:confirmar")) { Text(acao, color = Color(0xFFEF4444)) } },
        dismissButton = { TextButton(onClick = aoCancelar) { Text("Cancelar") } },
    )
}

@Composable
private fun BotaoBarra(icone: ImageVector, rotulo: String, habilitado: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.1f))
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
            .clickable(enabled = habilitado, onClick = onClick).semantics { contentDescription = rotulo },
        contentAlignment = Alignment.Center,
    ) { Icon(icone, null, tint = Color.White.copy(alpha = if (habilitado) 1f else 0.3f), modifier = Modifier.size(18.dp)) }
}

// ---------------------------------------------------------------- coluna de ferramentas

@Composable
private fun ColunaFerramentas(m: ModeloEditor, escopo: kotlinx.coroutines.CoroutineScope) {
    val f = m.ferramenta
    val traco = (f as? Ferramenta.Traco)?.id
    Column(
        Modifier.width(52.dp).fillMaxHeight().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.07f))
            .verticalScroll(rememberScrollState()).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ItemFerramenta(IconesQuadro.selecionar, "Selecionar e mover", f == Ferramenta.Selecionar && m.secao == null) { m.soSelecionar(); m.secao = null }
        BolinhaTime(corCompose(m.ed.corA), "Jogador do Time A") { m.addJogador("A") }
        BolinhaTime(corCompose(m.ed.corB), "Jogador do Time B") { m.addJogador("B") }
        ItemFerramenta(IconesQuadro.bola, "Bola", false) { m.addBola() }
        val carregar: (suspend () -> Unit) -> Unit = { b -> escopo.launch { b() } }
        ItemFerramenta(IconesQuadro.pecas, "Peças: goleiros, plantel e cores", m.secao == Secao.PECAS) { m.abrirSecao(Secao.PECAS, carregar) }
        ItemFerramenta(IconesQuadro.formacoes, "Formações", m.secao == Secao.FORMACOES) { m.abrirSecao(Secao.FORMACOES, carregar) }
        ItemFerramenta(IconesQuadro.seta, "Setas", m.secao == Secao.SETAS || traco in setOf("arrow_run", "arrow_pass", "arrow_dribble", "arrow_curved")) { m.abrirSecao(Secao.SETAS, carregar) }
        ItemFerramenta(IconesQuadro.caneta, "Desenho: livre, zonas e texto", m.secao == Secao.DESENHO || traco in setOf("free_draw", "zone_rect", "zone_circle", "text")) { m.abrirSecao(Secao.DESENHO, carregar) }
        ItemFerramenta(IconesQuadro.cone, "Objetos", m.secao == Secao.OBJETOS) { m.abrirSecao(Secao.OBJETOS, carregar) }
        ItemFerramenta(IconesQuadro.borracha, "Borracha: toque para apagar", f == Ferramenta.Borracha) {
            m.secao = null; m.ferramenta = if (f == Ferramenta.Borracha) Ferramenta.Selecionar else Ferramenta.Borracha; m.limparSelecao()
        }
        ItemFerramenta(IconesQuadro.olho, "Vista e tipo de campo", m.secao == Secao.VISTA) { m.abrirSecao(Secao.VISTA, carregar) }
    }
}

@Composable
private fun ItemFerramenta(icone: ImageVector, rotulo: String, ativo: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp, 36.dp).clip(RoundedCornerShape(10.dp)).background(if (ativo) Color(0xFF2563EB) else Color.Transparent)
            .clickable(onClick = onClick).semantics { contentDescription = rotulo },
        contentAlignment = Alignment.Center,
    ) { Icon(icone, null, tint = Color.White, modifier = Modifier.size(19.dp)) }
}

@Composable
private fun BolinhaTime(cor: Color, rotulo: String, onClick: () -> Unit) {
    Box(Modifier.size(40.dp, 36.dp).clickable(onClick = onClick).semantics { contentDescription = rotulo }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(cor).border(2.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) {
            Text("+", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black)
        }
    }
}

// ---------------------------------------------------------------- campo + painel

@Composable
private fun CampoEditor(m: ModeloEditor, modifier: Modifier, aoTamanho: (Pair<Float, Float>) -> Unit, aoSoltar: () -> Unit) {
    val densidade = LocalDensity.current.density
    BoxWithConstraints(modifier.clip(RoundedCornerShape(10.dp))) {
        val w = maxWidth.value; val h = maxHeight.value
        LaunchedEffect(w, h) { aoTamanho(w to h) }
        Canvas(
            Modifier.fillMaxSize().testTag("quadro:campo").semantics { contentDescription = "Campo ${rotuloMedidas(m.ed.tipoCampo)}" }
                .pointerInput(m) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        val lw = size.width / densidade; val lh = size.height / densidade
                        m.comecar(down.position.x / densidade, down.position.y / densidade, lw, lh)
                        while (true) {
                            val ev = awaitPointerEvent()
                            val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                            if (!ch.pressed) { if (m.soltar(ch.position.x / densidade, ch.position.y / densidade, lw, lh)) aoSoltar(); break }
                            if (ch.positionChanged()) { m.mover(ch.position.x / densidade, ch.position.y / densidade, lw, lh); ch.consume() }
                        }
                    }
                },
        ) {
            val cena = m.cena(size.width / densidade, size.height / densidade)
            drawIntoCanvas { desenharNaTela(it.nativeCanvas, cena, densidade) }
        }
        val f = m.ferramenta
        if (f is Ferramenta.Traco) {
            Row(
                Modifier.align(Alignment.TopCenter).padding(top = 6.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.7f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(rotuloModo(f.modo), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text("Sair", color = Color(0xFFFCA5A5), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { m.soSelecionar() })
            }
        }
        m.textoNovo?.let { t -> EditorTexto(m, t.third, Modifier.align(Alignment.TopCenter).padding(top = 34.dp)) }
        Box(Modifier.align(Alignment.TopEnd).padding(6.dp)) { PainelDireito(m) }
    }
}

@Composable
private fun EditorTexto(m: ModeloEditor, valor: String, modifier: Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xEB0A0E1A)).border(1.5.dp, corCompose(m.cor), RoundedCornerShape(8.dp)).padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = valor, onValueChange = { v -> m.textoNovo = m.textoNovo?.copy(third = v.take(60)) }, singleLine = true,
            placeholder = { Text("Texto…") }, modifier = Modifier.width(200.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { m.confirmarTexto() }),
            textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
        )
        TextButton(onClick = { m.confirmarTexto() }) { Text("OK", color = LIMA_QUADRO, fontWeight = FontWeight.Bold) }
        TextButton(onClick = { m.textoNovo = null }) { Text("✕", color = Color.White.copy(alpha = 0.6f)) }
    }
}

@Composable
private fun PainelDireito(m: ModeloEditor) {
    val p = if (m.tocando) null else m.ed.peca(m.ed.pecaSelecionada)
    val z = if (m.tocando || p != null) null else m.ed.desenho(m.ed.desenhoSelecionado)
    val s = m.secao
    when {
        p != null -> Painel(if (p.tipo == "player") "Jogador" else if (p.tipo == "ball") "Bola" else "Objeto", { m.selecionarPeca(null) }) {
            PainelPeca(p, corCompose(m.ed.corA), corCompose(m.ed.corB), alterar = { m.ed = m.ed.alterarPeca(p.id, it) }, remover = { m.removerSelecionado() })
        }
        z != null -> Painel("Desenho", { m.selecionarDesenho(null) }) {
            PainelDesenho(z, alterar = { m.ed = m.ed.alterarDesenho(z.id, it) }, remover = { m.removerSelecionado() })
        }
        s != null -> Painel(s.titulo, { m.secao = null }) { ConteudoSecao(m, s) }
    }
}

@Composable
private fun Painel(titulo: String, fechar: () -> Unit, conteudo: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.width(236.dp).heightIn(max = 600.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xF00B1220))
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(14.dp)),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(titulo.uppercase(), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, modifier = Modifier.weight(1f))
            Box(Modifier.size(32.dp).clickable(onClick = fechar).semantics { contentDescription = "Fechar" }, contentAlignment = Alignment.Center) {
                Icon(IconesQuadro.fechar, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(14.dp))
            }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp), content = conteudo)
    }
}

@Composable
private fun Rotulo(t: String) = Text(t.uppercase(), color = Color.White.copy(alpha = 0.45f), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)

@Composable
private fun BotaoPainel(texto: String, modifier: Modifier = Modifier, cor: Color = Color.White, ativo: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(7.dp)).background(Color.White.copy(alpha = if (ativo) 0.14f else 0.05f))
            .border(1.dp, Color.White.copy(alpha = if (ativo) 0.4f else 0.08f), RoundedCornerShape(7.dp))
            .clickable(onClick = onClick).padding(horizontal = 8.dp),
        contentAlignment = Alignment.CenterStart,
    ) { Text(texto, color = cor, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

@Composable
private fun Paleta(atual: String, escolher: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        CORES_DESENHO.forEach { c ->
            Box(Modifier.size(22.dp).clip(CircleShape).background(corCompose(c)).border(if (atual == c) 2.dp else 0.5.dp, Color.White, CircleShape)
                .clickable { escolher(c) }.semantics { contentDescription = "Cor $c" })
        }
    }
}

@Composable
private fun ConteudoSecao(m: ModeloEditor, s: Secao) {
    val traco = (m.ferramenta as? Ferramenta.Traco)?.id
    when (s) {
        Secao.PECAS -> {
            Rotulo("Times")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BotaoPainel("+ Jogador A", Modifier.weight(1f), corCompose(m.ed.corA)) { m.addJogador("A") }
                BotaoPainel("+ Jogador B", Modifier.weight(1f), corCompose(m.ed.corB)) { m.addJogador("B") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BotaoPainel("GK Time A", Modifier.weight(1f), corCompose(m.ed.corA)) { m.addGoleiro("A") }
                BotaoPainel("GK Time B", Modifier.weight(1f), corCompose(m.ed.corB)) { m.addGoleiro("B") }
            }
            Rotulo("Bola e plantel")
            val escopo = rememberCoroutineScope()
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BotaoPainel("Bola", Modifier.weight(1f)) { m.addBola() }
                BotaoPainel("Plantel", Modifier.weight(1f)) { m.abrirSecao(Secao.PLANTEL) { b -> escopo.launch { b() } } }
            }
            Rotulo("Cores das equipes")
            CorTime("Time A", m.ed.corA) { m.ed = m.ed.definirCorA(it) }
            CorTime("Time B", m.ed.corB) { m.ed = m.ed.definirCorB(it) }
        }
        Secao.PLANTEL -> PainelPlantel(m.atletas, m.atletasCarregados, m.ed.atletasEmCampo, corCompose(m.ed.corA), corCompose(m.ed.corB)) { a, t -> m.addAtleta(a, t) }
        Secao.FORMACOES -> {
            Rotulo("Aplicar em")
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(AlvoFormacao.A to "Time A", AlvoFormacao.B to "Time B", AlvoFormacao.AMBOS to "Ambos").forEach { (a, r) ->
                    BotaoPainel(r, Modifier.weight(1f), ativo = m.alvo == a) { m.alvo = a }
                }
            }
            Rotulo("Formação")
            formacoesDoCampo(m.ed.tipoCampo).forEach { f ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.05f)).clickable { m.aplicarFormacao(f) }.padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    MiniFormacao(if (m.alvo == AlvoFormacao.B) espelharFormacao(f.posicoes) else f.posicoes, corCompose(if (m.alvo == AlvoFormacao.B) m.ed.corB else m.ed.corA))
                    Text(f.rotulo, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            Text("Reposiciona apenas o time escolhido. O outro time, a bola e os desenhos não mudam. Desfazer volta.",
                color = Color.White.copy(alpha = 0.45f), fontSize = 10.5.sp)
        }
        Secao.SETAS -> {
            Rotulo("Tipo de seta")
            FERRAMENTAS_SETA.forEach { t ->
                BotaoPainel("${t.rotulo} · ${t.descricao}", Modifier.fillMaxWidth(), corCompose(t.cor), traco == t.id) { m.ativar(t.id, t.modo, t.tracejado, t.cor) }
            }
            Rotulo("Cor")
            Paleta(m.cor) { m.cor = it }
        }
        Secao.DESENHO -> {
            Rotulo("Ferramenta")
            FERRAMENTAS_DESENHO.forEach { (id, r) -> BotaoPainel(r, Modifier.fillMaxWidth(), ativo = traco == id) { m.ativar(id, id) } }
            Rotulo("Cor")
            Paleta(m.cor) { m.cor = it }
        }
        Secao.OBJETOS -> TIPOS_OBJETO.chunked(2).forEach { par ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                par.forEach { o -> BotaoPainel("${o.icone} ${o.rotulo}", Modifier.weight(1f)) { m.addObjeto(o.tipo) } }
                if (par.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        Secao.VISTA -> {
            Rotulo("Tipo de campo")
            TIPOS_CAMPO.forEach { (t, r) -> BotaoPainel(r, Modifier.fillMaxWidth(), ativo = m.ed.tipoCampo == t) { m.definirTipo(t) } }
            Rotulo("Vista do campo")
            VISTAS_CAMPO.forEach { (v, r) -> BotaoPainel(r, Modifier.fillMaxWidth(), ativo = m.ed.vista == v) { m.ed = m.ed.definirVista(v) } }
        }
    }
}

/** Cor do time: as 8 da paleta do web + a atual (o web abre o seletor de cor do sistema). */
@Composable
private fun CorTime(rotulo: String, hex: String, definir: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("$rotulo · $hex", color = Color.White.copy(alpha = 0.65f), fontSize = 11.5.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (listOf("#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#111827", "#ffffff", "#ec4899", "#15803d", "#dc2626")).forEach { c ->
                Box(Modifier.size(18.dp).clip(CircleShape).background(corCompose(c)).border(if (hex.equals(c, true)) 2.dp else 0.5.dp, if (hex.equals(c, true)) LIMA_QUADRO else Color.White, CircleShape)
                    .clickable { definir(c) }.semantics { contentDescription = "$rotulo cor $c" })
            }
        }
    }
}

@Composable
private fun MiniFormacao(posicoes: List<PosicaoFormacao>, cor: Color) {
    Canvas(Modifier.size(62.dp, 40.dp)) {
        drawRoundRect(Color.White.copy(alpha = 0.18f), style = androidx.compose.ui.graphics.drawscope.Stroke(1f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(6f))
        drawLine(Color.White.copy(alpha = 0.14f), androidx.compose.ui.geometry.Offset(size.width / 2, 0f), androidx.compose.ui.geometry.Offset(size.width / 2, size.height))
        posicoes.forEach { p ->
            drawCircle(cor.copy(alpha = if (p.goleiro) 0.75f else 1f), radius = 2.3.dp.toPx(),
                center = androidx.compose.ui.geometry.Offset((p.x / 100 * size.width).toFloat(), (p.y / 100 * size.height).toFloat()))
        }
    }
}

@Composable
private fun PainelPeca(p: Peca, corA: Color, corB: Color, alterar: (Map<String, kotlinx.serialization.json.JsonElement>) -> Unit, remover: () -> Unit) {
    if (p.tipo == "player") {
        var camisa by remember(p.id) { mutableStateOf(p.camisaTexto) }
        var nome by remember(p.id) { mutableStateOf(p.nome) }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(camisa, { camisa = it }, Modifier.width(64.dp), singleLine = true, label = { Text("Nº") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { camisaConfirmada(camisa, p.camisa)?.let { alterar(mapOf("jerseyNumber" to num(it))) } ?: run { camisa = p.camisaTexto } }),
                textStyle = androidx.compose.ui.text.TextStyle(color = Color.White))
            OutlinedTextField(nome, { nome = it }, Modifier.weight(1f), singleLine = true, label = { Text("Nome") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { val v = nomeConfirmado(nome); if (v != p.nome) alterar(mapOf("name" to txt(v))) }),
                textStyle = androidx.compose.ui.text.TextStyle(color = Color.White))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            BotaoPainel("Time A", Modifier.weight(1f), corA, p.time == "A") { if (p.time != "A") alterar(mapOf("team" to txt("A"))) }
            BotaoPainel("Time B", Modifier.weight(1f), corB, p.time == "B") { if (p.time != "B") alterar(mapOf("team" to txt("B"))) }
            BotaoPainel("GK", Modifier.weight(0.7f), AMBAR_Q, p.goleiro) { alterar(mapOf("isGoalkeeper" to JsonPrimitive(!p.goleiro))) }
        }
        BotaoPainel("Aplicar nº e nome", Modifier.fillMaxWidth()) {
            val patch = buildMap<String, kotlinx.serialization.json.JsonElement> {
                camisaConfirmada(camisa, p.camisa)?.let { put("jerseyNumber", num(it)) }
                nomeConfirmado(nome).let { if (it != p.nome) put("name", txt(it)) }
            }
            if (patch.isNotEmpty()) alterar(patch)
        }
    } else if (p.tipo == "marker" && p.marcador in OBJETOS_QUE_GIRAM) {
        val rot = girar(p.rotacao, 0.0)
        Rotulo("Girar · ${numeroJs(rot)}°")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            BotaoPainel("↺ 45°", Modifier.weight(1f)) { alterar(mapOf("rotation" to num(girar(p.rotacao, -45.0)))) }
            BotaoPainel("↻ 45°", Modifier.weight(1f)) { alterar(mapOf("rotation" to num(girar(p.rotacao, 45.0)))) }
        }
        Slider(value = rot.toFloat(), onValueChange = { alterar(mapOf("rotation" to num(((it / 15).toInt() * 15).toDouble()))) }, valueRange = 0f..345f, steps = 22)
    }
    BotaoPainel("Remover", Modifier.fillMaxWidth(), Color(0xFFFCA5A5), onClick = remover)
}

@Composable
private fun PainelDesenho(z: Desenho, alterar: (Map<String, kotlinx.serialization.json.JsonElement>) -> Unit, remover: () -> Unit) {
    Rotulo("Cor")
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        CORES_DESENHO.forEach { c ->
            Box(Modifier.size(20.dp).clip(CircleShape).background(corCompose(c)).border(if (corMarcada(z, c)) 2.dp else 0.5.dp, Color.White, CircleShape)
                .clickable { alterar(patchCorDesenho(z, c)) })
        }
    }
    if (desenhoTemEspessura(z)) {
        Rotulo("Espessura")
        Slider(value = z.n("strokeWidth", 2.5).toFloat(), onValueChange = { alterar(mapOf("strokeWidth" to num((Math.round(it * 2) / 2.0)))) }, valueRange = 1f..6f, steps = 9)
    }
    if (z.tipo == "text") {
        var t by remember(z.id) { mutableStateOf(z.texto) }
        Rotulo("Texto")
        OutlinedTextField(t, { t = it.take(60) }, Modifier.fillMaxWidth(), singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { t.trim().takeIf { it.isNotEmpty() }?.let { alterar(mapOf("text" to txt(it))) } }),
            textStyle = androidx.compose.ui.text.TextStyle(color = Color.White))
    }
    BotaoPainel("Remover", Modifier.fillMaxWidth(), Color(0xFFFCA5A5), onClick = remover)
}

@Composable
private fun PainelPlantel(atletas: List<Atleta>, carregado: Boolean, emCampo: Set<String>, corA: Color, corB: Color, adicionar: (Atleta, String) -> Unit) {
    var time by remember { mutableStateOf("A") }
    var busca by remember { mutableStateOf("") }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        BotaoPainel("Time A", Modifier.weight(1f), corA, time == "A") { time = "A" }
        BotaoPainel("Time B", Modifier.weight(1f), corB, time == "B") { time = "B" }
    }
    OutlinedTextField(busca, { busca = it }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text("Buscar atleta") },
        textStyle = androidx.compose.ui.text.TextStyle(color = Color.White))
    if (!carregado) Text("Carregando…", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
    val q = dobrar(busca.trim())
    val lista = if (q.isEmpty()) atletas else atletas.filter { dobrar(it.nome).contains(q) || it.camisa?.toString() == q }
    if (carregado && lista.isEmpty()) Text("Nenhum atleta.", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
    lista.forEach { a ->
        val ja = a.id in emCampo
        Row(
            Modifier.fillMaxWidth().clickable(enabled = !ja) { adicionar(a, time) }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(Modifier.size(24.dp).clip(CircleShape).background(if (time == "A") corA else corB), contentAlignment = Alignment.Center) {
                Text(a.camisa?.toString() ?: "–", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Text(a.nome, color = Color.White.copy(alpha = if (ja) 0.45f else 1f), fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (ja) Text("em campo", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
        }
    }
}

/** Salvar jogada (SavePlayModal): nome obrigatório, descrição opcional; existente pode virar nova. */
@Composable
fun SalvarJogadaDialogo(nomeInicial: String, descricaoInicial: String, existente: Boolean, aoFechar: () -> Unit, salvar: (String, String, Boolean) -> Unit) {
    var nome by remember { mutableStateOf(nomeInicial) }
    var descricao by remember { mutableStateOf(descricaoInicial) }
    AlertDialog(
        onDismissRequest = aoFechar,
        title = { Text(if (existente) "Salvar alterações" else "Salvar jogada") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(nome, { nome = it }, Modifier.fillMaxWidth().testTag("quadro:nome"), singleLine = true, label = { Text("Nome da jogada") },
                    placeholder = { Text("Ex: Saída de bola por baixo") })
                OutlinedTextField(descricao, { descricao = it }, Modifier.fillMaxWidth(), label = { Text("Descrição (opcional)") }, minLines = 2, maxLines = 4)
                if (existente) TextButton(onClick = { salvar(nome, descricao, true) }, enabled = nomeValidoJogada(nome) != null) { Text("Salvar como nova jogada") }
            }
        },
        confirmButton = {
            TextButton(onClick = { salvar(nome, descricao, false) }, enabled = nomeValidoJogada(nome) != null,
                modifier = Modifier.testTag("quadro:confirmar-salvar")) { Text("Salvar") }
        },
        dismissButton = { TextButton(onClick = aoFechar) { Text("Cancelar") } },
    )
}

// ---------------------------------------------------------------- barra de play + quadros

@Composable
fun BarraQuadros(
    atual: Int, total: Int, tocando: Boolean, velocidade: Double, aoVelocidade: (Double) -> Unit,
    aoVoltarInicio: () -> Unit, aoTocar: () -> Unit, aoIr: (Int) -> Unit,
    aoAdicionar: (() -> Unit)? = null, aoExcluir: (() -> Unit)? = null,
) {
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xD10B1220)).border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
            .horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Redondo(IconesQuadro.inicio, "Voltar ao início", onClick = aoVoltarInicio)
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(LIMA_QUADRO.copy(alpha = if (total > 1) 1f else 0.5f))
                .clickable(enabled = total > 1, onClick = aoTocar).testTag("quadro:play")
                .semantics { contentDescription = if (tocando) "Pausar" else if (total > 1) "Reproduzir" else "Crie um 2º quadro para animar" },
            contentAlignment = Alignment.Center,
        ) { Icon(if (tocando) IconesQuadro.pausa else IconesQuadro.play, null, tint = NAVY_QUADRO, modifier = Modifier.size(20.dp)) }
        VELOCIDADES_QUADRO.forEach { v ->
            val sel = v == velocidade
            Box(
                Modifier.height(28.dp).clip(RoundedCornerShape(6.dp)).background(if (sel) LIMA_QUADRO.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.08f))
                    .border(1.dp, if (sel) LIMA_QUADRO else Color.White.copy(alpha = 0.2f), RoundedCornerShape(6.dp))
                    .clickable { aoVelocidade(v) }.padding(horizontal = 7.dp).semantics { contentDescription = "Velocidade ${numeroJs(v)}x" },
                contentAlignment = Alignment.Center,
            ) { Text("${numeroJs(v)}x", color = if (sel) LIMA_QUADRO else Color.White.copy(alpha = 0.7f), fontSize = 12.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium) }
        }
        Box(Modifier.width(1.dp).height(28.dp).background(Color.White.copy(alpha = 0.1f)))
        Redondo(IconesQuadro.esquerda, "Quadro anterior") { aoIr(maxOf(0, atual - 1)) }
        for (i in 0 until maxOf(1, total)) {
            Box(
                Modifier.size(34.dp, 30.dp).clip(RoundedCornerShape(7.dp)).background(Color(0xFF2B8547))
                    .border(if (i == atual) 2.5.dp else 1.dp, if (i == atual) LIMA_QUADRO else Color.White.copy(alpha = 0.25f), RoundedCornerShape(7.dp))
                    .clickable { aoIr(i) }.semantics { contentDescription = "Quadro ${i + 1}${if (i == atual) ", atual" else ""}" },
                contentAlignment = Alignment.Center,
            ) { Text("${i + 1}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
        }
        Redondo(IconesQuadro.direita, "Próximo quadro") { aoIr(minOf(total - 1, atual + 1)) }
        if (aoAdicionar != null) {
            Box(
                Modifier.size(34.dp, 30.dp).clip(RoundedCornerShape(7.dp)).border(1.5.dp, Color.White.copy(alpha = 0.4f), RoundedCornerShape(7.dp))
                    .clickable(onClick = aoAdicionar).testTag("quadro:novo-quadro").semantics { contentDescription = "Novo quadro (copia o atual)" },
                contentAlignment = Alignment.Center,
            ) { Icon(IconesQuadro.mais, null, tint = Color.White, modifier = Modifier.size(16.dp)) }
        }
        if (aoExcluir != null) Redondo(IconesQuadro.lixo, "Excluir o quadro atual", habilitado = total > 1, onClick = aoExcluir)
    }
}

@Composable
private fun Redondo(icone: ImageVector, rotulo: String, habilitado: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)).border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
            .clickable(enabled = habilitado, onClick = onClick).semantics { contentDescription = rotulo },
        contentAlignment = Alignment.Center,
    ) { Icon(icone, null, tint = Color.White.copy(alpha = if (habilitado) 1f else 0.3f), modifier = Modifier.size(15.dp)) }
}
