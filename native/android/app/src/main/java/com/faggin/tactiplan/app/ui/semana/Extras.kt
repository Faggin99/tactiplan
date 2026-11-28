package com.faggin.tactiplan.app.ui.semana

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.coresDoClube
import com.faggin.tactiplan.app.dados.logoDoClube
import com.faggin.tactiplan.app.dados.treino.Anexo
import com.faggin.tactiplan.app.dados.treino.ArquivoSemana
import com.faggin.tactiplan.app.dados.treino.Dia
import com.faggin.tactiplan.app.dados.treino.EspecieAnexo
import com.faggin.tactiplan.app.dados.treino.MAX_ANEXOS_SESSAO
import com.faggin.tactiplan.app.dados.treino.MAX_ARQUIVOS_SEMANA
import com.faggin.tactiplan.app.dados.treino.MAX_NOME_SESSAO
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.treino.SessaoSalva
import com.faggin.tactiplan.app.dados.treino.TEXTO_ANEXOS_SESSAO
import com.faggin.tactiplan.app.dados.treino.TEXTO_ARQUIVOS_SEMANA
import com.faggin.tactiplan.app.dados.treino.TipoDia
import com.faggin.tactiplan.app.dados.treino.adversarioPrimeiro
import com.faggin.tactiplan.app.dados.treino.atividadesQueSeraoSubstituidas
import com.faggin.tactiplan.app.dados.treino.detalheArquivoSemana
import com.faggin.tactiplan.app.dados.treino.diasDaSemana
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.horarioDoJogo
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import com.faggin.tactiplan.app.dados.treino.origemDaSessao
import com.faggin.tactiplan.app.dados.treino.periodosDeTreino
import com.faggin.tactiplan.app.dados.treino.pilaresDaSessaoSalva
import com.faggin.tactiplan.app.dados.treino.resumoDaSessaoSalva
import com.faggin.tactiplan.app.dados.treino.rotuloDiaCurto
import com.faggin.tactiplan.app.dados.treino.rotuloDoPeriodo
import com.faggin.tactiplan.app.dados.treino.rotuloPilar
import com.faggin.tactiplan.app.dados.treino.tamanhoLegivel
import com.faggin.tactiplan.app.dados.treino.ehLink
import com.faggin.tactiplan.app.dados.treino.MSG_LINK_INVALIDO
import com.faggin.tactiplan.app.dados.treino.linkValido
import com.faggin.tactiplan.app.dados.treino.hostDoLink
import com.faggin.tactiplan.app.dados.treino.textoSubstituir
import com.faggin.tactiplan.app.dados.urlDoServidor
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.LogoClube
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.t3.CampoData
import kotlinx.coroutines.launch

// Paridade com o web de 21–27/11/2026 (spec: native/PARIDADE-27-11.md): escudos do jogo, anexos da SESSÃO,
// ARQUIVOS DA SEMANA e SESSÕES SALVAS. Paridade: TactiPlan/Treino (iOS).

// ---------------------------------------------------------------- escudos

/** Os dois escudos do jogo, MANDANTE primeiro × visitante (web: LogosDoJogo); horário ao lado quando houver. */
@Composable
fun EscudosDoJogo(amb: AmbienteClube, dia: Dia, tamanho: Dp = 28.dp, comHorario: Boolean = true) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val cores = coresDoClube(ctx.clube?.personalizacao, c.escuro)
    val adv = dia.adversario?.trim().orEmpty().ifEmpty { "Adversário" }
    val nosso: @Composable () -> Unit = {
        LogoClube(logoDoClube(ctx.clube?.personalizacao, c.escuro), ctx.nome, cores.acao.cor, cores.sobreAcao.cor, tamanho)
    }
    val deles: @Composable () -> Unit = {
        LogoClube(urlDoServidor(dia.escudoAdversario, amb.apiBase), adv, c.tinta3, c.superficie, tamanho)
    }
    val horario = horarioDoJogo(dia)
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.semantics(mergeDescendants = true) {
            contentDescription = (if (adversarioPrimeiro(dia)) "$adv contra ${ctx.nome}" else "${ctx.nome} contra $adv") +
                (horario?.let { ", às $it" } ?: "")
        },
    ) {
        if (adversarioPrimeiro(dia)) deles() else nosso()
        Text("×", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Bold, color = c.tinta2)
        if (adversarioPrimeiro(dia)) nosso() else deles()
        if (comHorario && horario != null) Text(horario, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
    }
}

// ---------------------------------------------------------------- linha de arquivo

@Composable
private fun LinhaArquivo(especie: EspecieAnexo, titulo: String, detalhe: String, abrir: () -> Unit, apagar: (() -> Unit)?, tag: String, link: Boolean = false) {
    val c = TactiPlan.cores
    val icone = if (link) Icones.link else when (especie) {
        EspecieAnexo.FOTO -> Icones.imagem
        EspecieAnexo.VIDEO -> Icones.video
        else -> Icones.documento
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.fundo).clickable(role = Role.Button, onClick = abrir)
            .heightIn(min = 52.dp).padding(horizontal = 10.dp, vertical = 6.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icone, null, Modifier.size(22.dp), tint = c.acaoTinta)
        Column(Modifier.weight(1f)) {
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detalhe.isNotEmpty()) Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 1)
        }
        if (apagar != null) IconButton(onClick = apagar) { Icon(Icones.lixeira, contentDescription = "Excluir $titulo", tint = c.erroTinta) }
    }
}

@Composable
private fun ConfirmarExclusao(titulo: String, texto: String, confirmar: () -> Unit, cancelar: () -> Unit) {
    val c = TactiPlan.cores
    AlertDialog(
        onDismissRequest = cancelar,
        title = { Text(titulo) },
        text = { Text(texto) },
        confirmButton = { TextButton(onClick = confirmar, modifier = Modifier.testTag("confirmar:excluir")) { Text("Excluir", color = c.erroTinta) } },
        dismissButton = { TextButton(onClick = cancelar) { Text("Cancelar") } },
    )
}

/** Câmera · Fotos · Arquivo (PDF, planilha, Word, PowerPoint). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BotoesEnviar(acoes: AcoesAnexo, habilitado: Boolean, prefixoTag: String) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Botao("Câmera", acoes.camera, Modifier.width(110.dp).testTag("$prefixoTag:camera"), VarianteBotao.SECUNDARIO, habilitado = habilitado, icone = Icones.camera)
        Botao("Fotos", acoes.galeria, Modifier.width(110.dp).testTag("$prefixoTag:galeria"), VarianteBotao.SECUNDARIO, habilitado = habilitado, icone = Icones.imagem)
        Botao("Arquivo", acoes.documento, Modifier.width(110.dp).testTag("$prefixoTag:arquivo"), VarianteBotao.SECUNDARIO, habilitado = habilitado, icone = Icones.documento)
    }
}

// ---------------------------------------------------------------- anexos da sessão

/** Anexos do PERÍODO fora das atividades (activity_id nulo). Envia na hora (não espera o Salvar). */
@Composable
fun SecaoAnexosDaSessao(amb: AmbienteClube, treino: ServicoTreino, semana: SemanaISO, clubeId: String, periodo: Dia, avisar: (String?) -> Unit, mudou: () -> Unit) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val podeEnviar = ctx.podeEditar("training:edit")
    val podeApagar = ctx.podeEditar("training:delete")
    var lista by remember(periodo.id) { mutableStateOf<List<Anexo>?>(if (periodo.id == null) emptyList() else null) }
    var versao by remember { mutableIntStateOf(0) }
    var enviando by remember { mutableStateOf<String?>(null) }
    var apagar by remember { mutableStateOf<Anexo?>(null) }
    var pedindoLink by remember { mutableStateOf(false) }
    val abrirLink = com.faggin.tactiplan.app.ui.comum.rememberAbrirLink()
    LaunchedEffect(periodo.id, versao) {
        val id = periodo.id ?: return@LaunchedEffect
        lista = try { treino.api.anexosDoDia(id).filter { it.atividadeId == null } } catch (e: Exception) {
            if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e)); lista ?: emptyList()
        }
    }
    val acoes = rememberAcoesAnexo(aoEscolher = { uri, tipo ->
        escopo.launch {
            when (val p = prepararAnexo(context, uri, tipo, documentos = true)) {
                is Preparado.Falhou -> avisar(p.mensagem)
                is Preparado.Ok -> {
                    enviando = p.envio.anexo.titulo
                    try {
                        treino.enviarAnexoDaSessao(periodo, semana, clubeId, p.envio.arquivo, p.envio.anexo.tituloFinal) {}
                        avisar(null)
                        if (periodo.id == null) mudou() else versao++
                    } catch (e: Exception) {
                        if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e))
                    }
                    enviando = null
                }
            }
        }
    }, aoAviso = { avisar(it) })
    val atual = lista
    val n = atual?.size ?: 0
    Cartao(Modifier.testTag("dia:anexos-sessao")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icones.clipe, null, Modifier.size(16.dp), tint = c.tinta)
            Text("Anexos da sessão", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                modifier = Modifier.padding(start = 6.dp).weight(1f))
            Text("$n/$MAX_ANEXOS_SESSAO", style = TactiPlan.tipos.corpo13, color = c.tinta2)
        }
        Text(TEXTO_ANEXOS_SESSAO, style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(vertical = 6.dp))
        when {
            atual == null -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
            else -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                atual.forEach { a ->
                    LinhaArquivo(a.especie, a.rotulo, if (a.ehLink) hostDoLink(a.url) else tamanhoLegivel(a.tamanho), tag = "anexo-sessao:${a.id}",
                        link = a.ehLink,
                        abrir = {
                            if (a.ehLink) a.url?.let { abrirLink.abrir(it) }
                            else {
                                val url = urlDoServidor(a.caminho, amb.apiBase)
                                if (url != null) escopo.launch { abrirAnexoNoSistema(context, url, a.nomeArquivo ?: a.rotulo, a.tipo)?.let(avisar) }
                            }
                        },
                        apagar = if (podeApagar) ({ apagar = a }) else null)
                }
            }
        }
        enviando?.let { Text("Enviando $it…", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(top = 6.dp)) }
        if (podeEnviar && periodo.tipo == TipoDia.TREINO) {
            Box(Modifier.padding(top = 8.dp)) { BotoesEnviar(acoes, habilitado = enviando == null && n < MAX_ANEXOS_SESSAO, prefixoTag = "anexo-sessao") }
            Botao("Link", { pedindoLink = true }, Modifier.padding(top = 8.dp).width(110.dp).testTag("anexo-sessao:link"), VarianteBotao.SECUNDARIO,
                habilitado = enviando == null && n < MAX_ANEXOS_SESSAO, icone = Icones.link)
        }
    }
    if (pedindoLink) {
        var url by remember { mutableStateOf("") }
        var titulo by remember { mutableStateOf("") }
        var erroLink by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { pedindoLink = false },
            title = { Text("Adicionar link") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(url, { url = it.take(2000); erroLink = null }, singleLine = true, label = { Text("Link (YouTube, Drive…)") },
                        isError = erroLink != null, supportingText = erroLink?.let { e -> { Text(e) } },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri),
                        modifier = Modifier.testTag("anexo-sessao:link:url"))
                    OutlinedTextField(titulo, { titulo = it.take(255) }, singleLine = true, label = { Text("Título (opcional)") })
                }
            },
            confirmButton = {
                TextButton(enabled = url.isNotBlank() && enviando == null, modifier = Modifier.testTag("anexo-sessao:link:salvar"), onClick = {
                    val ok = linkValido(url)
                    if (ok == null) { erroLink = MSG_LINK_INVALIDO; return@TextButton }
                    pedindoLink = false
                    enviando = titulo.ifBlank { hostDoLink(ok) }
                    escopo.launch {
                        try {
                            treino.adicionarLinkDaSessao(periodo, semana, clubeId, ok, titulo)
                            avisar(null)
                            if (periodo.id == null) mudou() else versao++
                        } catch (e: Exception) { if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e)) }
                        enviando = null
                    }
                }) { Text("Adicionar") }
            },
            dismissButton = { TextButton(onClick = { pedindoLink = false }) { Text("Cancelar") } },
        )
    }
    apagar?.let { a ->
        ConfirmarExclusao("Excluir anexo", "Excluir \"${a.rotulo}\"? Não dá para desfazer.", cancelar = { apagar = null }, confirmar = {
            apagar = null
            escopo.launch {
                try { treino.api.apagarAnexo(a.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) avisar(mensagemErroTreino(e)) }
            }
        })
    }
}

// ---------------------------------------------------------------- arquivos da semana

@Composable
fun ArquivosDaSemanaTela(amb: AmbienteClube, treino: ServicoTreino, semana: SemanaISO, clubeId: String, voltar: () -> Unit) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val podeEditar = ctx.podeEditar("training:edit")
    var lista by remember(semana) { mutableStateOf<List<ArquivoSemana>?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var enviando by remember { mutableStateOf<String?>(null) }
    var apagar by remember { mutableStateOf<ArquivoSemana?>(null) }
    LaunchedEffect(semana, versao) {
        lista = try { treino.api.arquivosDaSemana(semana.identificador, clubeId) } catch (e: Exception) {
            if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e); lista ?: emptyList()
        }
    }
    val acoes = rememberAcoesAnexo(aoEscolher = { uri, tipo ->
        escopo.launch {
            when (val p = prepararAnexo(context, uri, tipo, documentos = true)) {
                is Preparado.Falhou -> aviso = p.mensagem
                is Preparado.Ok -> {
                    enviando = p.envio.anexo.titulo
                    try {
                        // semana ainda não aberta: cria antes (o servidor responde 404 sem ela)
                        treino.api.garantirMicrociclo(semana.identificador, clubeId)
                        treino.api.enviarArquivoSemana(semana.identificador, clubeId, p.envio.arquivo, p.envio.anexo.tituloFinal) {}
                        aviso = null
                        versao++
                    } catch (e: Exception) {
                        if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e)
                    }
                    enviando = null
                }
            }
        }
    }, aoAviso = { aviso = it })
    TelaRaiz("Arquivos da semana ${semana.numero}", aoVoltar = voltar, pequena = true) {
        aviso?.let { FaixaTom(it, Tom.AVISO) }
        Text(TEXTO_ARQUIVOS_SEMANA, style = TactiPlan.tipos.corpo13, color = c.tinta2)
        val atual = lista
        when {
            atual == null -> CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = c.acaoTinta)
            atual.isEmpty() -> EstadoVazio(Icones.clipe, "Nenhum arquivo nesta semana", "Planejamento, planilhas e vídeos da comissão ficam aqui.")
            else -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                atual.forEach { a ->
                    LinhaArquivo(a.especie, a.rotulo, detalheArquivoSemana(a), tag = "arquivo-semana:${a.id}",
                        abrir = {
                            val url = urlDoServidor(a.url, amb.apiBase)
                            if (url != null) escopo.launch { abrirAnexoNoSistema(context, url, a.nomeArquivo ?: a.rotulo, a.tipo)?.let { aviso = it } }
                        },
                        apagar = if (podeEditar) ({ apagar = a }) else null)
                }
            }
        }
        enviando?.let { Text("Enviando $it…", style = TactiPlan.tipos.corpo13, color = c.tinta2) }
        if (podeEditar) {
            Text("PDF, planilha, Word, PowerPoint, foto ou vídeo · até 50 MB", style = TactiPlan.tipos.legenda11, color = c.tinta3)
            BotoesEnviar(acoes, habilitado = enviando == null && (atual?.size ?: 0) < MAX_ARQUIVOS_SEMANA, prefixoTag = "arquivo-semana")
        }
    }
    apagar?.let { a ->
        ConfirmarExclusao("Excluir arquivo", "Excluir \"${a.rotulo}\"? Não dá para desfazer.", cancelar = { apagar = null }, confirmar = {
            apagar = null
            escopo.launch {
                try { treino.api.apagarArquivoSemana(a.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e) }
            }
        })
    }
}

// ---------------------------------------------------------------- sessões salvas

/** Salvar o período como sessão (pede o nome). */
@Composable
fun DialogoSalvarSessao(nomeInicial: String, salvando: Boolean, salvar: (String) -> Unit, cancelar: () -> Unit) {
    var nome by remember { mutableStateOf(nomeInicial) }
    AlertDialog(
        onDismissRequest = cancelar,
        title = { Text("Salvar sessão") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Guarda as atividades (e as mídias) deste treino para usar em outro dia.", style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
                OutlinedTextField(nome, { nome = it.take(MAX_NOME_SESSAO) }, label = { Text("Nome da sessão") }, singleLine = true,
                    modifier = Modifier.testTag("sessao:nome"))
            }
        },
        confirmButton = {
            TextButton(onClick = { salvar(nome.trim()) }, enabled = nome.isNotBlank() && !salvando, modifier = Modifier.testTag("sessao:salvar")) {
                Text(if (salvando) "Salvando…" else "Salvar")
            }
        },
        dismissButton = { TextButton(onClick = cancelar) { Text("Cancelar") } },
    )
}

/** Escolher uma sessão salva para usar no período aberto. */
@Composable
fun DialogoEscolherSessao(amb: AmbienteClube, treino: ServicoTreino, escolher: (SessaoSalva) -> Unit, cancelar: () -> Unit) {
    val c = TactiPlan.cores
    var lista by remember { mutableStateOf<List<SessaoSalva>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        lista = try { treino.api.sessoesSalvas() } catch (e: Exception) {
            if (!amb.tratarErro(e)) erro = mensagemErroTreino(e); emptyList()
        }
    }
    AlertDialog(
        onDismissRequest = cancelar,
        title = { Text("Usar sessão salva") },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                erro?.let { Text(it, color = c.erroTinta, style = TactiPlan.tipos.corpo13) }
                val l = lista
                when {
                    l == null -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
                    l.isEmpty() -> Text("Nenhuma sessão salva ainda. Salve um treino pelo menu do dia.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    else -> l.forEach { s ->
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button) { escolher(s) }
                            .padding(vertical = 8.dp, horizontal = 4.dp).testTag("sessao:escolher:${s.id}")) {
                            Text(s.nome, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                            Text(listOfNotNull(origemDaSessao(s), resumoDaSessaoSalva(s)).joinToString(" · "), style = TactiPlan.tipos.corpo13, color = c.tinta2)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = cancelar) { Text("Cancelar") } },
    )
}

/** Confirma substituir as atividades que o treino já tem (409 TEM_ATIVIDADES). */
@Composable
fun DialogoSubstituir(n: Int, confirmar: () -> Unit, cancelar: () -> Unit) {
    AlertDialog(
        onDismissRequest = cancelar,
        title = { Text("Substituir atividades?") },
        text = { Text(textoSubstituir(n)) },
        confirmButton = { TextButton(onClick = confirmar, modifier = Modifier.testTag("sessao:substituir")) { Text("Substituir") } },
        dismissButton = { TextButton(onClick = cancelar) { Text("Cancelar") } },
    )
}

/** Mais › Sessões salvas: lista → detalhe (blocos, mídias, renomear, excluir, usar em um dia). */
@Composable
fun SessoesSalvasTela(amb: AmbienteClube, treino: ServicoTreino, voltar: () -> Unit) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<SessaoSalva>?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var aberta by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(versao) {
        lista = try { treino.api.sessoesSalvas() } catch (e: Exception) {
            if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e); lista ?: emptyList()
        }
    }
    val sel = lista?.firstOrNull { it.id == aberta }
    if (sel != null) {
        androidx.activity.compose.BackHandler { aberta = null }
        DetalheSessaoSalva(amb, treino, sel, voltar = { aberta = null }, mudou = { versao++ }, apagada = { aberta = null; versao++ })
        return
    }
    androidx.activity.compose.BackHandler(onBack = voltar)
    TelaRaiz("Sessões salvas", aoVoltar = voltar, pequena = true) {
        aviso?.let { FaixaTom(it, Tom.AVISO) }
        val l = lista
        when {
            l == null -> CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = c.acaoTinta)
            l.isEmpty() -> EstadoVazio(Icones.prancheta, "Nenhuma sessão salva",
                if (ctx.podeEditar("training:edit")) "Abra um dia de treino na Semana e use \"Salvar sessão\" no menu." else "Quando a comissão salvar treinos, eles aparecem aqui.")
            else -> Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                l.forEachIndexed { i, s ->
                    Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { aberta = s.id }.padding(vertical = 10.dp).testTag("sessao:${s.id}")) {
                        Text(s.nome, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        origemDaSessao(s)?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta2) }
                        Text(resumoDaSessaoSalva(s), style = TactiPlan.tipos.corpo13, color = c.tinta2)
                        val partes = pilaresDaSessaoSalva(s)
                        if (partes.isNotEmpty()) BarraDePilares(partes)
                    }
                    if (i < l.lastIndex) androidx.compose.material3.HorizontalDivider(color = c.borda)
                }
            }
        }
    }
}

@Composable
private fun BarraDePilares(partes: List<Pair<String, Int>>) {
    val total = partes.sumOf { it.second }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().padding(top = 6.dp).height(5.dp).clip(RoundedCornerShape(3.dp))) {
        partes.forEach { (p, m) -> Box(Modifier.weight(m.toFloat() / total).height(5.dp).background(corDoPilar(p))) }
    }
}

@Composable
private fun DetalheSessaoSalva(amb: AmbienteClube, treino: ServicoTreino, s: SessaoSalva, voltar: () -> Unit, mudou: () -> Unit, apagada: () -> Unit) {
    val c = TactiPlan.cores
    val ctx = amb.contexto
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val podeEditar = ctx.podeEditar("training:edit")
    var aviso by remember { mutableStateOf<String?>(null) }
    var ok by remember { mutableStateOf<String?>(null) }
    var renomeando by remember { mutableStateOf(false) }
    var excluindo by remember { mutableStateOf(false) }
    var usando by remember { mutableStateOf(false) }
    TelaRaiz(s.nome, aoVoltar = voltar, pequena = true) {
        aviso?.let { FaixaTom(it, Tom.AVISO) }
        ok?.let { FaixaTom(it, Tom.OK) }
        origemDaSessao(s)?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta2) }
        Text(resumoDaSessaoSalva(s), style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Medium, color = c.tinta2)
        if (podeEditar) {
            Botao("Usar em um dia", { usando = true }, Modifier.testTag("sessao:usar"), icone = Icones.calendario)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Botao("Renomear", { renomeando = true }, Modifier.weight(1f), VarianteBotao.SECUNDARIO, icone = Icones.lapis)
                Botao("Excluir", { excluindo = true }, Modifier.weight(1f).testTag("sessao:excluir"), VarianteBotao.PERIGO, icone = Icones.lixeira)
            }
        }
        RotuloSecao("Blocos")
        s.blocosEmOrdem.forEach { b ->
            Cartao {
                Text(b.nome.uppercase(), style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = c.tinta3)
                if (!b.preenchido) Text("—", style = TactiPlan.tipos.corpo13, color = c.tinta3)
                else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        b.pilar?.let { Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(corDoPilar(it))) }
                        Text(b.rotulo ?: "Atividade", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                            modifier = Modifier.padding(start = 6.dp).weight(1f))
                        if ((b.minutos ?: 0) > 0) Text("${b.minutos} min", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    }
                    val sub = listOfNotNull(b.conteudo?.takeIf { it != b.rotulo }, b.pilar?.let { rotuloPilar(it) }).joinToString(" · ")
                    if (sub.isNotEmpty()) Text(sub, style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    b.descricao?.takeIf { it.isNotBlank() }?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta, modifier = Modifier.padding(top = 4.dp)) }
                    b.midias.forEach { m ->
                        val esp = when (m.tipo) { "image" -> EspecieAnexo.FOTO; "video" -> EspecieAnexo.VIDEO; else -> EspecieAnexo.OUTRO }
                        Box(Modifier.padding(top = 6.dp)) {
                            LinhaArquivo(esp, m.nome ?: "Mídia", "", tag = "sessao:midia", apagar = null, abrir = {
                                val url = urlDoServidor(m.url, amb.apiBase)
                                if (url != null) escopo.launch { abrirAnexoNoSistema(context, url, m.nome ?: "midia", null)?.let { aviso = it } }
                            })
                        }
                    }
                }
            }
        }
    }
    if (renomeando) {
        var nome by remember { mutableStateOf(s.nome) }
        AlertDialog(
            onDismissRequest = { renomeando = false },
            title = { Text("Renomear sessão") },
            text = { OutlinedTextField(nome, { nome = it.take(MAX_NOME_SESSAO) }, singleLine = true, label = { Text("Nome") }) },
            confirmButton = {
                TextButton(enabled = nome.isNotBlank(), onClick = {
                    renomeando = false
                    escopo.launch {
                        try { treino.api.renomearSessaoSalva(s.id, nome); mudou() } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e) }
                    }
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { renomeando = false }) { Text("Cancelar") } },
        )
    }
    if (excluindo) {
        ConfirmarExclusao("Excluir sessão salva", "Excluir \"${s.nome}\"? Os treinos onde ela já foi usada não mudam.", cancelar = { excluindo = false }, confirmar = {
            excluindo = false
            escopo.launch {
                try { treino.api.apagarSessaoSalva(s.id); apagada() } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroTreino(e) }
            }
        })
    }
    if (usando) {
        UsarEmUmDia(amb, treino, s, fechar = { msg -> usando = false; if (msg != null) { ok = msg; aviso = null } })
    }
}

/** Escolhe a data (e o período, no dia com 2+ treinos) e aplica a sessão salva; pede para substituir quando já há atividades. */
@Composable
private fun UsarEmUmDia(amb: AmbienteClube, treino: ServicoTreino, s: SessaoSalva, fechar: (String?) -> Unit) {
    val c = TactiPlan.cores
    val clubeId = amb.contexto.clube?.id
    val escopo = rememberCoroutineScope()
    var data by remember { mutableStateOf<String?>(hojeBrasilia()) }
    var opcoes by remember { mutableStateOf<List<Dia>?>(null) }
    var escolhido by remember { mutableIntStateOf(0) }
    var carregando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var substituir by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(data) {
        val d = data ?: return@LaunchedEffect
        if (clubeId == null) return@LaunchedEffect
        opcoes = null; erro = null; escolhido = 0
        val semana = SemanaISO.de(d)
        try {
            val m = treino.api.microciclo(semana.identificador, clubeId)
            val dia = diasDaSemana(m, semana).firstOrNull { it.data == d }
            val ps = dia?.let { periodosDeTreino(it) }.orEmpty()
            opcoes = ps
            if (ps.isEmpty()) erro = "Esse dia não é de treino. Mude o tipo do dia na Semana antes."
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) erro = mensagemErroTreino(e)
        }
    }
    fun aplicar(sub: Boolean) {
        val d = data ?: return
        val alvo = opcoes?.getOrNull(escolhido) ?: return
        if (clubeId == null) return
        carregando = true
        escopo.launch {
            try {
                treino.usarSessaoSalva(s.id, alvo, SemanaISO.de(d), clubeId, sub)
                fechar("Sessão usada em ${rotuloDiaCurto(d).lowercase()}${rotuloDoPeriodo(alvo.periodo)?.let { " · $it" } ?: ""}.")
            } catch (e: Exception) {
                val n = atividadesQueSeraoSubstituidas(e)
                if (n != null) substituir = n
                else if (!amb.tratarErro(e)) erro = mensagemErroTreino(e)
            }
            carregando = false
        }
    }
    if (substituir != null) {
        DialogoSubstituir(substituir!!, confirmar = { substituir = null; aplicar(true) }, cancelar = { substituir = null })
        return
    }
    AlertDialog(
        onDismissRequest = { fechar(null) },
        title = { Text("Usar em um dia") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CampoData("Dia do treino", data, { data = it }, limpar = false, tag = "sessao:data")
                val ps = opcoes
                if (ps != null && ps.size > 1) {
                    Text("Qual treino do dia?", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    ps.forEachIndexed { i, p ->
                        Row(Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { escolhido = i }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = escolhido == i, onClick = { escolhido = i })
                            Text(rotuloDoPeriodo(p.periodo) ?: "Treino", style = TactiPlan.tipos.corpo15, color = c.tinta)
                        }
                    }
                }
                erro?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.erroTinta) }
            }
        },
        confirmButton = {
            TextButton(onClick = { aplicar(false) }, enabled = !carregando && !opcoes.isNullOrEmpty(), modifier = Modifier.testTag("sessao:aplicar")) {
                Text(if (carregando) "Aplicando…" else "Usar")
            }
        },
        dismissButton = { TextButton(onClick = { fechar(null) }) { Text("Cancelar") } },
    )
}
