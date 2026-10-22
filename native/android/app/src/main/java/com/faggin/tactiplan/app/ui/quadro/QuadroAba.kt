package com.faggin.tactiplan.app.ui.quadro

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.elenco.compararNome
import com.faggin.tactiplan.app.dados.quadro.ApiQuadro
import com.faggin.tactiplan.app.dados.quadro.Jogada
import com.faggin.tactiplan.app.dados.quadro.QuadroJogada
import com.faggin.tactiplan.app.dados.quadro.Reproducao
import com.faggin.tactiplan.app.dados.quadro.TipoCampo
import com.faggin.tactiplan.app.dados.quadro.corpoDaJogada
import com.faggin.tactiplan.app.dados.quadro.dimensoesCanvas
import com.faggin.tactiplan.app.dados.quadro.filtrarJogadas
import com.faggin.tactiplan.app.dados.quadro.mensagemErroQuadro
import com.faggin.tactiplan.app.dados.quadro.nomeArquivoVideo
import com.faggin.tactiplan.app.dados.quadro.nomeDaCopia
import com.faggin.tactiplan.app.dados.quadro.nomeValidoJogada
import com.faggin.tactiplan.app.dados.quadro.permissoesQuadro
import com.faggin.tactiplan.app.dados.quadro.proporcaoCampo
import com.faggin.tactiplan.app.dados.quadro.resumoJogada
import com.faggin.tactiplan.app.dados.quadro.rotuloMedidas
import com.faggin.tactiplan.app.dados.quadro.rotuloTipoCampo
import com.faggin.tactiplan.app.dados.quadro.rotuloVista
import com.faggin.tactiplan.app.dados.quadro.texto
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.Divisoria
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.ListaAgrupada
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import java.time.LocalDate
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// Aba Quadro (T5, tela 14 do desenho): as jogadas da CONTA com busca e "criada em <clube>".
// Tocar = assistir em pé; Editar (ou "+") abre o editor deitado por cima das abas.
// Criar/duplicar/renomear/excluir só com tactical:edit e conta com assinatura. Rotas do web (/api/plays).
// Paridade: QuadroTela.swift (iPhone).

private sealed class EstadoLista {
    data object Carregando : EstadoLista()
    data object Pronto : EstadoLista()
    data class Erro(val msg: String) : EstadoLista()
}

/** Modalidade do clube → campo do quadro novo (sport.defaultFieldType do web). */
fun tipoDoClube(modalidade: String?): String = when (modalidade) {
    "futsal" -> TipoCampo.FUTSAL
    "football_7" -> TipoCampo.FUTEBOL_7
    else -> TipoCampo.FUTEBOL_11
}

@Composable
fun QuadroAba(amb: AmbienteClube, api: ApiQuadro) {
    val escopo = rememberCoroutineScope()
    val perm = permissoesQuadro(amb.contexto)
    val clubeId = amb.contexto.clube?.id
    var jogadas by remember { mutableStateOf<List<Jogada>>(emptyList()) }
    var estado by remember { mutableStateOf<EstadoLista>(EstadoLista.Carregando) }
    var busca by rememberSaveable { mutableStateOf("") }
    var aviso by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var assistindo by remember { mutableStateOf<Jogada?>(null) }
    var editor by remember { mutableStateOf<ModeloEditor?>(null) }
    var renomeando by remember { mutableStateOf<Jogada?>(null) }
    var excluindo by remember { mutableStateOf<Jogada?>(null) }

    LaunchedEffect(versao) {
        try {
            jogadas = api.listar(); estado = EstadoLista.Pronto
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) { if (jogadas.isEmpty()) estado = EstadoLista.Erro(mensagemErroQuadro(e)) else aviso = mensagemErroQuadro(e) }
        }
    }
    suspend fun completa(j: Jogada): Jogada = try { api.abrir(j.id) } catch (_: Exception) { j }

    fun abrirEditor(j: Jogada?) {
        editor = ModeloEditor(
            j, tipoDoClube(amb.contexto.clube?.modalidade), api, clubeId,
            carregarAtletas = {
                val elenco = amb.t3?.elenco
                if (clubeId == null || elenco == null) emptyList()
                else try { elenco.atletas(clubeId).sortedWith { a, b -> compararNome(a.nome, b.nome) } } catch (_: Exception) { emptyList() }
            },
            aoSalvar = { versao++ }, tratarErro = amb.tratarErro,
        )
    }

    val ed = editor
    if (ed != null) EditorQuadroDialogo(ed) { editor = null; versao++ }

    val vendo = assistindo
    if (vendo != null) {
        BackHandler { assistindo = null }
        AssistirJogada(vendo, perm.editar, carregar = { completa(vendo) }, aoVoltar = { assistindo = null }, aoEditar = { abrirEditor(it) })
        return
    }

    TelaRaiz("Quadro", acoes = {
        if (perm.editar) IconButton(onClick = { abrirEditor(null) }, modifier = Modifier.testTag("quadro:nova")) {
            Icon(Icones.adicionar, contentDescription = "Nova jogada")
        }
    }) {
        FaixasDoTopo(amb)
        aviso?.let { FaixaTom(it, Tom.INFO) }
        Campo(busca, { busca = it }, "Buscar jogada")
        val visiveis = filtrarJogadas(jogadas, busca)
        when (val e = estado) {
            EstadoLista.Carregando -> if (jogadas.isEmpty()) Box(Modifier.fillMaxWidth().heightIn(min = 120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            is EstadoLista.Erro -> Cartao { EstadoVazio(Icones.alerta, "Não deu para abrir as jogadas", e.msg, "Tentar de novo" to { versao++ }) }
            EstadoLista.Pronto -> when {
                jogadas.isEmpty() -> Cartao {
                    if (perm.editar) EstadoVazio(Icones.rota, "Nenhuma jogada ainda", "Crie a primeira no editor: peças, setas, desenhos e quadros animados.", "Nova jogada" to { abrirEditor(null) })
                    else EstadoVazio(Icones.rota, "Nenhuma jogada ainda", "Quando a comissão criar jogadas no quadro tático, elas aparecem aqui.")
                }
                visiveis.isEmpty() -> Cartao { EstadoVazio(Icones.alerta, "Nada encontrado", "Nenhuma jogada com \"$busca\".") }
                else -> ListaAgrupada {
                    visiveis.forEachIndexed { i, j ->
                        if (i > 0) Divisoria()
                        LinhaJogada(j, perm.editar,
                            aoTocar = { assistindo = j },
                            aoEditar = { escopo.launch { abrirEditor(completa(j)) } },
                            aoDuplicar = {
                                escopo.launch {
                                    try {
                                        val c = api.criar(corpoDaJogada(completa(j), nomeDaCopia(j.nome), clubeId = clubeId))
                                        aviso = "Jogada duplicada: ${c.nome}"; versao++
                                    } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroQuadro(e) }
                                }
                            },
                            aoRenomear = { renomeando = j },
                            aoExcluir = { excluindo = j })
                    }
                }
            }
        }
        if (perm.editar && jogadas.isNotEmpty()) {
            Text("Toque em ⋮ › Editar para abrir o editor deitado", style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }
    }

    renomeando?.let { j ->
        var nome by remember(j.id) { mutableStateOf(j.nome) }
        AlertDialog(
            onDismissRequest = { renomeando = null }, title = { Text("Renomear jogada") },
            text = { OutlinedTextField(nome, { nome = it }, singleLine = true, label = { Text("Nome da jogada") }) },
            confirmButton = {
                TextButton(enabled = nomeValidoJogada(nome) != null, onClick = {
                    renomeando = null
                    escopo.launch {
                        try { api.atualizar(j.id, corpoDaJogada(completa(j), nomeValidoJogada(nome)!!, clubeId = clubeId)); aviso = "Jogada renomeada"; versao++ }
                        catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroQuadro(e) }
                    }
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { renomeando = null }) { Text("Cancelar") } },
        )
    }
    excluindo?.let { j ->
        Confirmar("Excluir a jogada \"${j.nome}\"?", "Excluir", aoCancelar = { excluindo = null }) {
            excluindo = null
            escopo.launch {
                try { api.excluir(j.id); jogadas = jogadas.filter { it.id != j.id }; aviso = "Jogada excluída" }
                catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroQuadro(e) }
            }
        }
    }
}

@Composable
private fun LinhaJogada(j: Jogada, editar: Boolean, aoTocar: () -> Unit, aoEditar: () -> Unit, aoDuplicar: () -> Unit, aoRenomear: () -> Unit, aoExcluir: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val c = TactiPlan.cores
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(onClick = aoTocar).padding(vertical = 8.dp).testTag("quadro:jogada:${j.id}"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        MiniaturaJogada(j)
        Column(Modifier.weight(1f)) {
            Text(j.nome.ifEmpty { "Sem nome" }, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(resumoJogada(j), style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.semantics { contentDescription = "Ações da jogada ${j.nome}" }) {
                Icon(Icones.mais, null, tint = c.tinta2)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Assistir") }, onClick = { menu = false; aoTocar() })
                if (editar) {
                    DropdownMenuItem(text = { Text("Editar") }, onClick = { menu = false; aoEditar() })
                    DropdownMenuItem(text = { Text("Duplicar") }, onClick = { menu = false; aoDuplicar() })
                    DropdownMenuItem(text = { Text("Renomear") }, onClick = { menu = false; aoRenomear() })
                    DropdownMenuItem(text = { Text("Excluir", color = c.erroTinta) }, onClick = { menu = false; aoExcluir() })
                }
            }
        }
    }
}

/** Miniatura: o 1º quadro desenhado pequeno (mesmo desenho do campo, escalado). */
@Composable
fun MiniaturaJogada(j: Jogada) {
    val q = j.quadros.firstOrNull()
    val corA = j.bruto["team_a_color"].texto() ?: "#3b82f6"
    val corB = j.bruto["team_b_color"].texto() ?: "#ef4444"
    Canvas(Modifier.size(56.dp, 36.dp).clip(RoundedCornerShape(6.dp))) {
        val logW = 336f; val logH = 216f
        val cena = CenaQuadro(dimensoesCanvas(logW.toDouble(), logH.toDouble(), j.tipoCampo, j.vista), j.tipoCampo, j.vista,
            q?.elementos.orEmpty(), q?.desenhos.orEmpty(), corA = corA, corB = corB)
        drawIntoCanvas { desenharNaTela(it.nativeCanvas, cena, size.width / logW) }
    }
}

/** Assistir EM PÉ: campo proporcional, play 0,5×–2×, quadros, trajetórias quando parado, vídeo e "Editar". */
@Composable
fun AssistirJogada(jogada0: Jogada, podeEditar: Boolean, carregar: suspend () -> Jogada, aoVoltar: () -> Unit, aoEditar: (Jogada) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var jogada by remember(jogada0.id) { mutableStateOf(jogada0) }
    var atual by remember { mutableIntStateOf(0) }
    var reproducao by remember { mutableStateOf<Reproducao?>(null) }
    var velocidade by remember { mutableStateOf(1.0) }
    var video by remember { mutableStateOf<Job?>(null) }
    var progresso by remember { mutableStateOf(0f) }
    var aviso by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(jogada0.id) { jogada = carregar() }
    val qs: List<QuadroJogada> = jogada.quadros.ifEmpty { listOf(QuadroJogada(0)) }
    val i = atual.coerceIn(0, qs.size - 1)
    val corA = jogada.bruto["team_a_color"].texto() ?: "#3b82f6"
    val corB = jogada.bruto["team_b_color"].texto() ?: "#ef4444"

    LaunchedEffect(reproducao != null) {
        if (reproducao == null) return@LaunchedEffect
        var antes = withFrameNanos { it }
        while (true) {
            val agora = withFrameNanos { it }
            val r = reproducao ?: break
            val n = r.avancar((agora - antes) / 1e6, velocidade)
            antes = agora
            if (n.quadro != r.quadro) atual = n.quadro
            reproducao = if (n.terminou) null else n
            if (n.terminou) break
        }
    }

    TelaRaiz(jogada.nome.ifEmpty { "Jogada" }, aoVoltar = aoVoltar, pequena = true) {
        val densidade = LocalDensity.current.density
        val prop = proporcaoCampo(jogada.tipoCampo, jogada.vista).toFloat()
        BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(maxOf(0.8f, prop * 0.86f)).clip(RoundedCornerShape(14.dp))) {
            Canvas(Modifier.fillMaxSize().semantics { contentDescription = "Campo ${rotuloMedidas(jogada.tipoCampo)}, quadro ${i + 1} de ${qs.size}" }) {
                val w = size.width / densidade; val h = size.height / densidade
                val r = reproducao
                val cena = CenaQuadro(dimensoesCanvas(w.toDouble(), h.toDouble(), jogada.tipoCampo, jogada.vista), jogada.tipoCampo, jogada.vista,
                    r?.pecas(qs) ?: qs[i].elementos, qs[i].desenhos,
                    proximas = if (r != null) null else qs.getOrNull(i + 1)?.elementos, corA = corA, corB = corB)
                drawIntoCanvas { desenharNaTela(it.nativeCanvas, cena, densidade) }
            }
        }
        BarraQuadros(
            atual = i, total = qs.size, tocando = reproducao != null, velocidade = velocidade, aoVelocidade = { velocidade = it },
            aoVoltarInicio = { reproducao = null; atual = 0 },
            aoTocar = {
                if (reproducao != null) reproducao = null
                else Reproducao.iniciar(i, qs.size)?.let { atual = it.quadro; reproducao = it }
            },
            aoIr = { reproducao = null; atual = it },
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(jogada.nome.ifEmpty { "Sem nome" }, style = TactiPlan.tipos.titulo20, color = TactiPlan.cores.tinta)
            Text("${rotuloTipoCampo(jogada.tipoCampo)} · ${rotuloVista(jogada.vista).lowercase()} · ${resumoJogada(jogada)}",
                style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
            if (jogada.descricao.isNotEmpty()) Text(jogada.descricao, style = TactiPlan.tipos.corpo15, color = TactiPlan.cores.tinta, modifier = Modifier.padding(top = 4.dp))
        }
        aviso?.let { FaixaTom(it, Tom.INFO) }
        if (podeEditar) Botao("Editar (deitado)", { reproducao = null; aoEditar(jogada) }, Modifier.testTag("quadro:editar"))
        Botao(
            if (video != null) "Gerando vídeo… ${(progresso * 100).toInt()}%" else "Exportar vídeo MP4",
            {
                reproducao = null
                progresso = 0f
                video = escopo.launch {
                    try {
                        val f = gerarVideoQuadro(ctx, qs, jogada.tipoCampo, jogada.vista, corA, corB, 844f, 390f,
                            nomeArquivoVideo(jogada.nome, LocalDate.now().toString())) { progresso = it }
                        compartilharVideo(ctx, f)?.let { aviso = it }
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (_: Exception) { aviso = "Não foi possível gerar o vídeo neste aparelho." }
                    finally { video = null }
                }
            },
            variante = VarianteBotao.SECUNDARIO, habilitado = qs.size > 1 && video == null,
        )
        if (qs.size <= 1) Text("Esta jogada tem um quadro só: não há animação para tocar.", style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
    }
}
