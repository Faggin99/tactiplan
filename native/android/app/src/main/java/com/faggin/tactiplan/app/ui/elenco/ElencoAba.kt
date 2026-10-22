package com.faggin.tactiplan.app.ui.elenco

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.CATEGORIA_SEM
import com.faggin.tactiplan.app.dados.elenco.CATEGORIA_TODAS
import com.faggin.tactiplan.app.dados.elenco.CategoriaCadastro
import com.faggin.tactiplan.app.dados.elenco.FOTO_MAX_BYTES
import com.faggin.tactiplan.app.dados.elenco.FormAtleta
import com.faggin.tactiplan.app.dados.elenco.GRUPOS_ELENCO
import com.faggin.tactiplan.app.dados.elenco.Lesao
import com.faggin.tactiplan.app.dados.elenco.MSG_FOTO_GRANDE
import com.faggin.tactiplan.app.dados.elenco.MSG_FOTO_TIPO
import com.faggin.tactiplan.app.dados.elenco.MSG_SEM_PERMISSAO_LESOES
import com.faggin.tactiplan.app.dados.elenco.PES
import com.faggin.tactiplan.app.dados.elenco.SEVERIDADES
import com.faggin.tactiplan.app.dados.elenco.STATUS_ATLETA
import com.faggin.tactiplan.app.dados.elenco.ServicoElenco
import com.faggin.tactiplan.app.dados.elenco.TEXTO_REMOVER_LESAO
import com.faggin.tactiplan.app.dados.elenco.agruparElenco
import com.faggin.tactiplan.app.dados.elenco.corpoPlantel
import com.faggin.tactiplan.app.dados.elenco.detalheDoAtleta
import com.faggin.tactiplan.app.dados.elenco.detalheLesao
import com.faggin.tactiplan.app.dados.elenco.erroAtleta
import com.faggin.tactiplan.app.dados.elenco.mensagemErroElenco
import com.faggin.tactiplan.app.dados.elenco.nomePdfPlantel
import com.faggin.tactiplan.app.dados.elenco.posicoesDaModalidade
import com.faggin.tactiplan.app.dados.elenco.resumoDoElenco
import com.faggin.tactiplan.app.dados.elenco.resumoLesao
import com.faggin.tactiplan.app.dados.elenco.severidade
import com.faggin.tactiplan.app.dados.elenco.tituloLesao
import com.faggin.tactiplan.app.dados.semRede
import com.faggin.tactiplan.app.dados.treino.ArquivoUpload
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.urlDoServidor
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.AvatarIniciais
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.Pastilha
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.comum.imagemRemota
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.PASTA_CAMERA
import com.faggin.tactiplan.app.ui.semana.autoridadeArquivos
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import com.faggin.tactiplan.app.ui.semana.reduzirFoto
import com.faggin.tactiplan.app.ui.t3.AbasInternas
import com.faggin.tactiplan.app.ui.t3.CampoData
import com.faggin.tactiplan.app.ui.t3.CampoLongo
import com.faggin.tactiplan.app.ui.t3.CampoNumero
import com.faggin.tactiplan.app.ui.t3.Carregavel
import com.faggin.tactiplan.app.ui.t3.Confirmar
import com.faggin.tactiplan.app.ui.t3.LinhaChips
import com.faggin.tactiplan.app.ui.t3.Seletor
import com.faggin.tactiplan.app.ui.t3.corHex
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

const val TAG_NOVO_ATLETA = "elenco:novo"
const val TAG_PDF_PLANTEL = "elenco:pdf"

private sealed interface TelaElenco {
    data object Lista : TelaElenco
    data class Ficha(val id: String?) : TelaElenco
}

/** Aba Elenco: Atletas (plantel por grupo) | Staff (comissão técnica). */
@Composable
fun ElencoAba(amb: AmbienteClube, t3: ServicosT3) {
    var aba by rememberSaveable { mutableIntStateOf(0) }
    var tela by remember { mutableStateOf<TelaElenco>(TelaElenco.Lista) }
    val ctx = amb.contexto
    val clubeId = ctx.clube?.id
    val atletas = remember { mutableStateListOf<Atleta>() }
    var lesoesAtivas by remember { mutableStateOf<List<Lesao>>(emptyList()) }
    var categorias by remember { mutableStateOf<List<CategoriaCadastro>>(emptyList()) }
    var carregando by remember { mutableStateOf(true) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var exportando by remember { mutableStateOf(false) }
    val escopo = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(clubeId, versao) {
        if (clubeId == null) { carregando = false; return@LaunchedEffect }
        if (atletas.isEmpty()) carregando = true
        try {
            val l = t3.elenco.atletas(clubeId)
            atletas.clear(); atletas.addAll(l)
            erro = null
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) { if (!(semRede(e) && atletas.isNotEmpty())) erro = mensagemErroElenco(e) }
        }
        carregando = false
        lesoesAtivas = try { t3.elenco.lesoesAtivas() } catch (_: Exception) { emptyList() }
        categorias = try { t3.elenco.categorias(clubeId) } catch (_: Exception) { emptyList() }
    }

    when (val t = tela) {
        is TelaElenco.Ficha -> {
            BackHandler { tela = TelaElenco.Lista }
            FichaAtletaTela(amb, t3, clubeId ?: "", atletas.firstOrNull { it.id == t.id }, categorias,
                voltar = { tela = TelaElenco.Lista },
                mudou = { msg -> aviso = msg; versao++ },
                removido = { msg -> aviso = msg; tela = TelaElenco.Lista; versao++ })
            return
        }
        TelaElenco.Lista -> {}
    }

    val podeEditar = ctx.podeEditar("athletes:edit")
    val podePdf = aba == 0 && ctx.pode("athletes:view") && ctx.conta.somenteLeitura != true && clubeId != null
    TelaRaiz("Elenco", acoes = {
        if (podePdf) IconButton(onClick = {
            if (exportando) return@IconButton
            exportando = true
            escopo.launch {
                val r = gerarECompartilhar(context, amb.treino!!.api, "plantel", corpoPlantel(clubeId!!), nomePdfPlantel(ctx.nome, hojeBrasilia()), amb.tratarErro)
                if (r is InicioExportar.Erro) aviso = r.mensagem
                exportando = false
            }
        }, enabled = !exportando && amb.treino != null, modifier = Modifier.testTag(TAG_PDF_PLANTEL)) {
            if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = TactiPlan.cores.acaoTinta)
            else Icon(Icones.documento, contentDescription = "PDF do plantel")
        }
        if (aba == 0 && podeEditar && clubeId != null) IconButton(onClick = { tela = TelaElenco.Ficha(null) }, modifier = Modifier.testTag(TAG_NOVO_ATLETA)) {
            Icon(Icones.adicionar, contentDescription = "Novo atleta")
        }
    }) {
        FaixasDoTopo(amb)
        AbasInternas(listOf("Atletas", "Staff"), aba, { aba = it }, "elenco:aba")
        aviso?.let { FaixaTom(it, Tom.INFO) }
        if (aba == 1) {
            StaffConteudo(amb, t3, categorias)
            return@TelaRaiz
        }
        if (clubeId == null) {
            EstadoVazio(Icones.grupo, "Nenhum clube nesta conta", "Quando um clube for cadastrado, o plantel aparece aqui.")
            return@TelaRaiz
        }
        if (!ctx.pode("athletes:view")) {
            EstadoVazio(Icones.cadeado, "Sem acesso ao plantel", "Você não tem permissão para ver atletas neste clube. Peça ao responsável pelo clube para liberar em Staff.")
            return@TelaRaiz
        }
        Carregavel(carregando, erro, { versao++ }) {
            ListaAtletas(amb, t3, atletas, lesoesAtivas, categorias, podeEditar,
                abrir = { tela = TelaElenco.Ficha(it.id) },
                aviso = { aviso = it }, mudou = { versao++ })
        }
    }
}

@Composable
private fun ListaAtletas(
    amb: AmbienteClube, t3: ServicosT3, atletas: List<Atleta>, lesoes: List<Lesao>, categorias: List<CategoriaCadastro>,
    podeEditar: Boolean, abrir: (Atleta) -> Unit, aviso: (String?) -> Unit, mudou: () -> Unit,
) {
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var busca by rememberSaveable { mutableStateOf("") }
    var categoria by rememberSaveable { mutableStateOf(CATEGORIA_TODAS) }
    var posicao by rememberSaveable { mutableStateOf<String?>(null) }
    var porPosicao by rememberSaveable { mutableStateOf(true) }
    val abertos = remember { mutableStateListOf("1") }
    val hoje = hojeBrasilia()
    val ativas = lesoes.filter { it.ativa }
    val resumos = ativas.mapNotNull { l -> l.atletaId?.let { it to resumoLesao(l) } }.toMap()
    val secoes = agruparElenco(atletas, busca, categoria, posicao, porPosicao, resumos)

    Campo(busca, { busca = it }, "Buscar atleta", Modifier.testTag("elenco:busca"))
    if (categorias.isNotEmpty()) {
        LinhaChips(listOf(CATEGORIA_TODAS to "Todas", CATEGORIA_SEM to "Sem categoria") + categorias.map { it.id to it.rotulo },
            categoria, { categoria = it }, "elenco:cat")
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Seletor("Posição", posicao, listOf<Pair<String?, String>>(null to "Todas") +
            posicoesDaModalidade(amb.contexto.clube?.modalidade).map { it.codigo to "${it.nome} (${it.codigo})" },
            { posicao = it }, Modifier.weight(1f), tag = "elenco:posicao")
        Seletor("Ordenar", if (porPosicao) "pos" else "nome", listOf<Pair<String?, String>>("pos" to "Posição", "nome" to "Nome"),
            { porPosicao = it == "pos" }, Modifier.weight(1f), tag = "elenco:ordem")
    }
    val nomeCat = categorias.firstOrNull { it.id == categoria }?.name
    Text(resumoDoElenco(secoes.flatMap { it.atletas }, nomeCat), style = TactiPlan.tipos.corpo13, color = c.tinta2,
        modifier = Modifier.testTag("elenco:resumo"))

    if (atletas.isEmpty()) {
        EstadoVazio(Icones.grupo, "Nenhum atleta cadastrado",
            if (podeEditar) "Toque em + para cadastrar o primeiro atleta do plantel." else "Quando a comissão cadastrar atletas, eles aparecem aqui.",
            if (podeEditar) "Novo atleta" to { abrir(Atleta("")) } else null)
        return
    }
    if (secoes.isEmpty()) {
        EstadoVazio(Icones.grupo, "Nenhum atleta encontrado", "Mude a busca ou os filtros.")
        return
    }
    secoes.forEach { s ->
        val chave = s.grupo.chave ?: "sem"
        val aberto = chave in abertos || busca.isNotBlank()
        Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) {
                    if (chave in abertos) abertos.remove(chave) else abertos.add(chave)
                }.semantics { contentDescription = "${s.grupo.rotulo}, ${s.atletas.size} atletas, ${if (aberto) "aberto" else "fechado"}" }
                    .testTag("elenco:grupo:$chave"),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(if (chave == "DM") c.erroFundo else c.acaoSuave),
                    contentAlignment = Alignment.Center) {
                    Text(s.grupo.sigla, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Bold,
                        color = if (chave == "DM") c.erroTinta else c.acaoTinta)
                }
                Column(Modifier.weight(1f)) {
                    Text(s.grupo.rotulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                        modifier = Modifier.semantics { heading() })
                    s.resumo?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
                Pastilha("${s.atletas.size}", Tom.NEUTRO)
                Icon(if (aberto) Icones.cima else Icones.baixo, null, tint = c.tinta2, modifier = Modifier.size(18.dp))
            }
            if (aberto) s.atletas.forEach { a ->
                HorizontalDivider(color = c.borda)
                LinhaAtleta(amb, a, detalheDoAtleta(a, hoje), podeEditar, abrir = { abrir(a) }, mover = { g ->
                    escopo.launch {
                        try {
                            t3.elenco.moverGrupo(listOf(a.id), g)
                            aviso("${a.nome} foi para ${GRUPOS_ELENCO.first { it.chave == g }.rotulo}.")
                            mudou()
                        } catch (e: Exception) { if (!amb.tratarErro(e)) aviso(mensagemErroElenco(e)) }
                    }
                })
            }
        }
    }
}

@Composable
private fun FotoAtleta(amb: AmbienteClube, a: Atleta, tamanho: androidx.compose.ui.unit.Dp) {
    val img = imagemRemota(urlDoServidor(a.fotoUrl, amb.apiBase))
    if (img != null) {
        Image(img, contentDescription = "Foto de ${a.nome}", contentScale = ContentScale.Crop,
            modifier = Modifier.size(tamanho).clip(CircleShape))
    } else if (a.camisa != null) {
        val c = TactiPlan.cores
        Box(Modifier.size(tamanho).clip(CircleShape).background(c.acaoSuave), contentAlignment = Alignment.Center) {
            Text("${a.camisa}", color = c.acaoTinta, fontWeight = FontWeight.Bold, style = TactiPlan.tipos.corpo15)
        }
    } else AvatarIniciais(a.nome, tamanho)
}

@Composable
private fun LinhaAtleta(amb: AmbienteClube, a: Atleta, detalhe: String, podeEditar: Boolean, abrir: () -> Unit, mover: (String?) -> Unit) {
    val c = TactiPlan.cores
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = abrir).padding(vertical = 6.dp)
            .testTag("elenco:atleta:${a.id}"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        FotoAtleta(amb, a, 40.dp)
        Column(Modifier.weight(1f)) {
            Text(listOfNotNull(a.camisa?.toString(), a.nome).joinToString(" "), style = TactiPlan.tipos.corpo15,
                fontWeight = FontWeight.SemiBold, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detalhe.isNotEmpty()) Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2)
        }
        if (podeEditar) Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.testTag("elenco:mover:${a.id}")) {
                Icon(Icones.trocar, contentDescription = "Mover ${a.nome} para outro grupo", tint = c.tinta2)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                Text("Mover para…", style = TactiPlan.tipos.legenda11, color = c.tinta2, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                GRUPOS_ELENCO.filter { it.chave != a.grupo }.forEach { g ->
                    DropdownMenuItem(text = { Text(g.rotulo) }, onClick = { menu = false; mover(g.chave) },
                        modifier = Modifier.testTag("elenco:mover:${a.id}:${g.chave ?: "sem"}"))
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Ficha do atleta

@Composable
private fun FichaAtletaTela(
    amb: AmbienteClube, t3: ServicosT3, clubeId: String, atleta: Atleta?, categorias: List<CategoriaCadastro>,
    voltar: () -> Unit, mudou: (String) -> Unit, removido: (String) -> Unit,
) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val servico = remember(t3, clubeId) { ServicoElenco(t3.elenco, clubeId) }
    var salvo by remember { mutableStateOf(atleta?.takeIf { it.id.isNotEmpty() }) }
    var form by remember { mutableStateOf(salvo?.let(FormAtleta::de) ?: FormAtleta()) }
    var fotoNova by remember { mutableStateOf<ByteArray?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var confirmarRemover by remember { mutableStateOf(false) }
    val podeEditar = ctx.podeEditar("athletes:edit")
    val novo = salvo == null

    fun escolheu(uri: Uri?) {
        if (uri == null) return
        escopo.launch {
            val tipo = context.contentResolver.getType(uri)
            if (tipo != null && !tipo.startsWith("image/")) { aviso = MSG_FOTO_TIPO; return@launch }
            val bytes = withContext(Dispatchers.IO) { try { reduzirFoto(context.contentResolver, uri) } catch (_: Throwable) { null } }
            when {
                bytes == null -> aviso = MSG_FOTO_TIPO
                bytes.size > FOTO_MAX_BYTES -> aviso = MSG_FOTO_GRANDE
                novo -> { fotoNova = bytes; aviso = "A foto sobe junto quando você salvar." }
                else -> {
                    ocupado = true
                    try {
                        salvo = t3.elenco.enviarFoto(salvo!!.id, ArquivoUpload.deBytes("foto.jpg", "image/jpeg", bytes))
                        aviso = "Foto atualizada."
                        mudou("Foto atualizada.")
                    } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = "Não foi possível enviar a foto: ${mensagemErroElenco(e)}" }
                    ocupado = false
                }
            }
        }
    }
    var arquivoCamera by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = arquivoCamera?.let(::File); arquivoCamera = null
        if (ok && f != null && f.length() > 0) escolheu(Uri.fromFile(f))
    }
    val galeria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { escolheu(it) }

    TelaRaiz(if (novo) "Novo atleta" else salvo!!.nome, aoVoltar = voltar, pequena = true) {
        FaixasDoTopo(amb)
        aviso?.let { FaixaTom(it, Tom.INFO) }
        // Foto
        Cartao {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                val fn = fotoNova
                if (fn != null) {
                    val bmp = remember(fn) { android.graphics.BitmapFactory.decodeByteArray(fn, 0, fn.size)?.asImageBitmap() }
                    if (bmp != null) Image(bmp, "Foto escolhida", contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp).clip(CircleShape))
                } else FotoAtleta(amb, salvo ?: Atleta("", form.nome, camisa = form.camisa), 72.dp)
                Column(Modifier.weight(1f)) {
                    Text("Foto do atleta", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                    Text("Aparece nos PDFs de plantel e convocação.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
            }
            if (podeEditar) Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Botao("Câmera", {
                    val pasta = File(context.cacheDir, PASTA_CAMERA).apply { mkdirs() }
                    pasta.listFiles()?.forEach { it.delete() }
                    val f = File(pasta, "atleta-${System.currentTimeMillis()}.jpg")
                    arquivoCamera = f.absolutePath
                    try { camera.launch(FileProvider.getUriForFile(context, autoridadeArquivos(context), f)) }
                    catch (_: Exception) { arquivoCamera = null; aviso = "A câmera não está disponível neste aparelho." }
                }, Modifier.weight(1f), VarianteBotao.SECUNDARIO, !ocupado, Icones.camera)
                Botao("Galeria", {
                    try { galeria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                    catch (_: Exception) { aviso = "Não encontramos a galeria neste aparelho." }
                }, Modifier.weight(1f), VarianteBotao.SECUNDARIO, !ocupado, Icones.imagem)
            }
            if (podeEditar && salvo?.fotoUrl != null) Botao("Remover foto", {
                escopo.launch {
                    ocupado = true
                    try { salvo = t3.elenco.removerFoto(salvo!!.id); mudou("Foto removida.") } catch (e: Exception) {
                        if (!amb.tratarErro(e)) aviso = "Falha ao remover foto: ${mensagemErroElenco(e)}"
                    }
                    ocupado = false
                }
            }, Modifier.padding(top = 8.dp), VarianteBotao.NEUTRO, !ocupado)
        }
        // Dados
        Campo(form.nome, { form = form.copy(nome = it) }, "Nome do atleta *", Modifier.testTag("atleta:nome"), habilitado = podeEditar)
        Seletor("Posição *", form.posicao, posicoesDaModalidade(ctx.clube?.modalidade).map { it.codigo to "${it.nome} (${it.codigo})" },
            { form = form.copy(posicao = it) }, habilitado = podeEditar, tag = "atleta:posicao")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CampoNumero(form.camisa, { form = form.copy(camisa = it) }, "Camisa", Modifier.weight(1f))
            CampoNumero(form.altura, { form = form.copy(altura = it) }, "Altura (cm)", Modifier.weight(1f))
        }
        Seletor("Status", form.status, STATUS_ATLETA.map { it.first to it.second }, { form = form.copy(status = it ?: "active") }, habilitado = podeEditar)
        Seletor("Grupo", form.grupo, GRUPOS_ELENCO.map { it.chave to it.rotulo }, { form = form.copy(grupo = it) }, habilitado = podeEditar, tag = "atleta:grupo")
        if (categorias.isNotEmpty()) Seletor("Categoria", form.categoriaId,
            listOf<Pair<String?, String>>(null to "Sem categoria (clube todo)") + categorias.map { it.id to it.rotulo },
            { form = form.copy(categoriaId = it) }, habilitado = podeEditar)
        CampoData("Data de nascimento", form.nascimento, { if (podeEditar) form = form.copy(nascimento = it) })
        Seletor("Pé preferencial", form.pe, listOf<Pair<String?, String>>(null to "—") + PES, { form = form.copy(pe = it) }, habilitado = podeEditar)
        Campo(form.ultimoClube, { form = form.copy(ultimoClube = it) }, "Último clube", habilitado = podeEditar)
        CampoLongo(form.observacao, { if (podeEditar) form = form.copy(observacao = it) }, "Observação")
        if (podeEditar) {
            val erroForm = erroAtleta(form.nome, form.posicao, form.camisa, form.altura)
            if (erroForm != null && (form.nome.isNotEmpty() || form.posicao != null)) FaixaTom(erroForm, Tom.AVISO)
            Botao(if (ocupado) "Salvando..." else "Salvar", {
                escopo.launch {
                    ocupado = true
                    try {
                        val r = servico.salvar(salvo, form, fotoNova?.let { ArquivoUpload.deBytes("foto.jpg", "image/jpeg", it) })
                        val eraNovo = salvo == null
                        salvo = r; fotoNova = null; form = FormAtleta.de(r)
                        aviso = if (eraNovo) "Atleta cadastrado." else "Alterações salvas."
                        mudou(aviso!!)
                    } catch (e: Exception) {
                        if (!amb.tratarErro(e)) aviso = if (e is ErroApi && e.codigo == "VALIDACAO") e.mensagem else mensagemErroElenco(e)
                    }
                    ocupado = false
                }
            }, Modifier.testTag("atleta:salvar"), habilitado = !ocupado && erroForm == null)
        }
        // Lesões
        val s = salvo
        if (s != null) LesoesDoAtleta(amb, t3, servico, s)
        if (s != null && podeEditar) Botao("Excluir atleta", { confirmarRemover = true }, Modifier.testTag("atleta:excluir"), VarianteBotao.PERIGO, !ocupado, Icones.lixeira)
    }
    if (confirmarRemover) Confirmar("Excluir atleta", "Tem certeza que deseja excluir este atleta?", "Excluir", aoCancelar = { confirmarRemover = false },
        aoConfirmar = {
            confirmarRemover = false
            escopo.launch {
                try { t3.elenco.remover(salvo!!.id); removido("Atleta excluído.") } catch (e: Exception) {
                    if (!amb.tratarErro(e)) aviso = mensagemErroElenco(e)
                }
            }
        })
}

@Composable
private fun LesoesDoAtleta(amb: AmbienteClube, t3: ServicosT3, servico: ServicoElenco, atleta: Atleta) {
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<Lesao>?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var registrando by remember { mutableStateOf(false) }
    var remover by remember { mutableStateOf<Lesao?>(null) }
    val pode = amb.contexto.podeEditar("injuries:manage")
    LaunchedEffect(atleta.id, versao) {
        lista = try { t3.elenco.lesoes(atleta.id) } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroElenco(e); lista ?: emptyList() }
    }
    RotuloSecao("Lesões")
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    val l = lista
    if (l == null) { Carregavel(true, null, {}) {}; return }
    val ativas = l.filter { it.ativa }
    val historico = l.filter { !it.ativa }
    Cartao {
        if (l.isEmpty()) Text("Nenhuma lesão registrada.", style = TactiPlan.tipos.corpo15, color = c.tinta2)
        if (ativas.isNotEmpty()) Text("Ativas", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
        ativas.forEach { LinhaLesao(it, pode, darAlta = {
            escopo.launch {
                try { t3.elenco.darAlta(it.id, hojeBrasilia()); aviso = null; versao++ } catch (e: Exception) {
                    if (!amb.tratarErro(e)) aviso = "Erro ao marcar como resolvida: ${mensagemErroElenco(e, MSG_SEM_PERMISSAO_LESOES)}"
                }
            }
        }, remover = { remover = it }) }
        if (historico.isNotEmpty()) Text("Histórico (${historico.size})", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold,
            color = c.tinta2, modifier = Modifier.padding(top = 8.dp))
        historico.forEach { LinhaLesao(it, pode, null, remover = { remover = it }) }
    }
    if (pode && !registrando) Botao("Registrar lesão", { registrando = true }, Modifier.testTag("lesao:registrar"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
    if (registrando) NovaLesao(cancelar = { registrando = false }) { tipo, local, sev, ini, ret, notas, pronto ->
        escopo.launch {
            try {
                servico.registrarLesao(atleta.id, tipo, local, sev, ini, ret, notas)
                registrando = false; aviso = null; versao++
            } catch (e: Exception) {
                if (!amb.tratarErro(e)) aviso = if (e is ErroApi && e.codigo == "VALIDACAO") e.mensagem
                else "Erro ao registrar lesão: ${mensagemErroElenco(e, MSG_SEM_PERMISSAO_LESOES)}"
            }
            pronto()
        }
    }
    remover?.let { alvo ->
        Confirmar("Remover lesão", TEXTO_REMOVER_LESAO, "Remover", aoCancelar = { remover = null }, aoConfirmar = {
            remover = null
            escopo.launch {
                try { t3.elenco.removerLesao(alvo.id); versao++ } catch (e: Exception) {
                    if (!amb.tratarErro(e)) aviso = "Erro ao remover: ${mensagemErroElenco(e, MSG_SEM_PERMISSAO_LESOES)}"
                }
            }
        })
    }
}

@Composable
private fun LinhaLesao(l: Lesao, pode: Boolean, darAlta: (() -> Unit)?, remover: (Lesao) -> Unit) {
    val c = TactiPlan.cores
    val sev = severidade(l.severity)
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("lesao:${l.id}"), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(corHex(sev.corHex)))
        Column(Modifier.weight(1f)) {
            Text(tituloLesao(l), style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
            Text("${sev.rotulo} · ${detalheLesao(l)}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            l.notes?.takeIf { it.isNotBlank() }?.let { Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta2) }
        }
        if (pode && darAlta != null) IconButton(onClick = darAlta, modifier = Modifier.testTag("lesao:alta:${l.id}")) {
            Icon(Icones.check, contentDescription = "Dar alta (marcar como resolvida)", tint = c.okTinta)
        }
        if (pode) IconButton(onClick = { remover(l) }) { Icon(Icones.lixeira, contentDescription = "Remover registro de lesão", tint = c.tinta2) }
    }
}

@Composable
private fun NovaLesao(cancelar: () -> Unit, registrar: (String, String, String, String, String?, String, () -> Unit) -> Unit) {
    var tipo by remember { mutableStateOf("") }
    var local by remember { mutableStateOf("") }
    var sev by remember { mutableStateOf("medium") }
    var inicio by remember { mutableStateOf<String?>(hojeBrasilia()) }
    var retorno by remember { mutableStateOf<String?>(null) }
    var notas by remember { mutableStateOf("") }
    var ocupado by remember { mutableStateOf(false) }
    Cartao {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Nova lesão", style = TactiPlan.tipos.corpo17, fontWeight = FontWeight.SemiBold, color = TactiPlan.cores.tinta)
            Campo(tipo, { tipo = it }, "Tipo * (ex.: Distensão muscular)", Modifier.testTag("lesao:tipo"))
            Campo(local, { local = it }, "Local (ex.: Coxa direita)")
            LinhaChips(SEVERIDADES.map { it.id to it.rotulo }, sev, { sev = it }, "lesao:sev")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CampoData("Início", inicio, { inicio = it }, limpar = false, modifier = Modifier.weight(1f))
                CampoData("Retorno previsto", retorno, { retorno = it }, modifier = Modifier.weight(1f))
            }
            CampoLongo(notas, { notas = it }, "Observações")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Botao("Cancelar", cancelar, Modifier.weight(1f), VarianteBotao.NEUTRO)
                Botao(if (ocupado) "Salvando..." else "Registrar", {
                    ocupado = true
                    registrar(tipo, local, sev, inicio ?: hojeBrasilia(), retorno, notas) { ocupado = false }
                }, Modifier.weight(1f).testTag("lesao:salvar"), habilitado = !ocupado && tipo.isNotBlank())
            }
        }
    }
}
