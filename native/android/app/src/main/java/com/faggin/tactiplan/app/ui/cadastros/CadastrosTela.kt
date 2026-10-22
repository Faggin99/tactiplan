package com.faggin.tactiplan.app.ui.cadastros

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.cadastros.AVISO_MODALIDADE
import com.faggin.tactiplan.app.dados.cadastros.AtividadeCad
import com.faggin.tactiplan.app.dados.cadastros.CampeonatoCad
import com.faggin.tactiplan.app.dados.cadastros.ClubeCad
import com.faggin.tactiplan.app.dados.cadastros.ConteudoCad
import com.faggin.tactiplan.app.dados.cadastros.FAIXAS_ETARIAS
import com.faggin.tactiplan.app.dados.cadastros.FORMATOS_CAMPEONATO
import com.faggin.tactiplan.app.dados.cadastros.FormCampeonato
import com.faggin.tactiplan.app.dados.cadastros.LimiteClubes
import com.faggin.tactiplan.app.dados.cadastros.MODALIDADES
import com.faggin.tactiplan.app.dados.cadastros.MSG_LIMITE_CATEGORIAS
import com.faggin.tactiplan.app.dados.cadastros.MSG_LIMITE_CLUBES
import com.faggin.tactiplan.app.dados.cadastros.MSG_NOME_CATEGORIA
import com.faggin.tactiplan.app.dados.cadastros.MSG_NOME_CLUBE
import com.faggin.tactiplan.app.dados.cadastros.MSG_NOME_CONTEUDO
import com.faggin.tactiplan.app.dados.cadastros.PILARES_CADASTRO
import com.faggin.tactiplan.app.dados.cadastros.SubmomentoCad
import com.faggin.tactiplan.app.dados.cadastros.conteudosDoPilarCad
import com.faggin.tactiplan.app.dados.cadastros.corpoAtividade
import com.faggin.tactiplan.app.dados.cadastros.corpoCampeonato
import com.faggin.tactiplan.app.dados.cadastros.corpoCategoria
import com.faggin.tactiplan.app.dados.cadastros.corpoClube
import com.faggin.tactiplan.app.dados.cadastros.corpoConteudo
import com.faggin.tactiplan.app.dados.cadastros.corpoSubmomento
import com.faggin.tactiplan.app.dados.cadastros.detalheCampeonato
import com.faggin.tactiplan.app.dados.cadastros.erroAtividade
import com.faggin.tactiplan.app.dados.cadastros.erroCampeonato
import com.faggin.tactiplan.app.dados.cadastros.filtrarAtividades
import com.faggin.tactiplan.app.dados.cadastros.mensagemErroCadastro
import com.faggin.tactiplan.app.dados.cadastros.podeCriarClube
import com.faggin.tactiplan.app.dados.cadastros.rodapeAtividades
import com.faggin.tactiplan.app.dados.cadastros.submomentosDe
import com.faggin.tactiplan.app.dados.cadastros.textoArquivarClube
import com.faggin.tactiplan.app.dados.cadastros.textoDesarquivarClube
import com.faggin.tactiplan.app.dados.cadastros.textoLimiteClubes
import com.faggin.tactiplan.app.dados.cadastros.textoRemoverCampeonato
import com.faggin.tactiplan.app.dados.cadastros.textoRemoverCategoria
import com.faggin.tactiplan.app.dados.cadastros.textoRemoverClube
import com.faggin.tactiplan.app.dados.cadastros.textoRemoverConteudo
import com.faggin.tactiplan.app.dados.cadastros.textoRemoverSubmomento
import com.faggin.tactiplan.app.dados.cadastros.textoUsoAtividade
import com.faggin.tactiplan.app.dados.elenco.CategoriaCadastro
import com.faggin.tactiplan.app.dados.rotuloModalidade
import com.faggin.tactiplan.app.dados.treino.dataBR
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
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
import com.faggin.tactiplan.app.ui.t3.AbasInternas
import com.faggin.tactiplan.app.ui.t3.CampoData
import com.faggin.tactiplan.app.ui.t3.CampoLongo
import com.faggin.tactiplan.app.ui.t3.CampoNumero
import com.faggin.tactiplan.app.ui.t3.Carregavel
import com.faggin.tactiplan.app.ui.t3.Confirmar
import com.faggin.tactiplan.app.ui.t3.LinhaChips
import com.faggin.tactiplan.app.ui.t3.Seletor
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import com.faggin.tactiplan.app.ui.t3.corHex
import kotlinx.coroutines.launch

enum class Cadastro(val titulo: String) {
    CAMPEONATOS("Campeonatos"), CATEGORIAS("Categorias"), CLUBES("Clubes"),
    CONTEUDOS("Conteúdos e submomentos"), ATIVIDADES("Atividades (biblioteca)"),
}

/** Uma tela de cadastro, com a lista e a folha de editar. */
@Composable
fun CadastroTela(amb: AmbienteClube, t3: ServicosT3, qual: Cadastro, voltar: () -> Unit) {
    BackHandler(onBack = voltar)
    TelaRaiz(qual.titulo, aoVoltar = voltar, pequena = true) {
        FaixasDoTopo(amb)
        when (qual) {
            Cadastro.CAMPEONATOS -> Campeonatos(amb, t3)
            Cadastro.CATEGORIAS -> Categorias(amb, t3)
            Cadastro.CLUBES -> Clubes(amb, t3)
            Cadastro.CONTEUDOS -> Conteudos(amb, t3)
            Cadastro.ATIVIDADES -> Atividades(amb, t3)
        }
    }
}

/** Folha de formulário (sobe de baixo, com Salvar). `salvar` devolve o erro (null = ok). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Folha(titulo: String, fechar: () -> Unit, salvar: suspend () -> String?, rotuloSalvar: String = "Salvar",
                  habilitado: Boolean = true, conteudo: @Composable ColumnScope.() -> Unit) {
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var erro by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = fechar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.fundo) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 32.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(titulo, style = TactiPlan.tipos.titulo20, color = c.tinta)
            erro?.let { FaixaTom(it, Tom.AVISO) }
            conteudo()
            Botao(if (ocupado) "Salvando…" else rotuloSalvar, {
                escopo.launch { ocupado = true; erro = salvar(); ocupado = false }
            }, Modifier.testTag("cad:salvar"), habilitado = habilitado && !ocupado)
        }
    }
}

@Composable
private fun LinhaCad(titulo: String, detalhe: String?, selo: String? = null, apagado: Boolean = false, tag: String = "",
                     aoTocar: (() -> Unit)? = null, final: (@Composable () -> Unit)? = null) {
    val c = TactiPlan.cores
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).then(if (aoTocar != null) Modifier.clickable(role = Role.Button, onClick = aoTocar) else Modifier)
        .padding(vertical = 6.dp).testTag(tag), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = if (apagado) c.tinta3 else c.tinta,
                textDecoration = if (apagado) TextDecoration.LineThrough else null, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!detalhe.isNullOrEmpty()) Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        if (selo != null) Pastilha(selo, Tom.NEUTRO)
        final?.invoke()
        if (aoTocar != null) Icon(Icones.direita, null, tint = c.tinta3, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun ListaCartao(itens: Int, vazio: String, conteudo: @Composable ColumnScope.() -> Unit) {
    if (itens == 0) { EstadoVazio(Icones.documento, "Nada por aqui ainda", vazio); return }
    Cartao(preenchimento = PaddingValues(horizontal = 12.dp, vertical = 4.dp), conteudo = conteudo)
}

// ---------------------------------------------------------------- Campeonatos

@Composable
private fun ColumnScope.Campeonatos(amb: AmbienteClube, t3: ServicosT3) {
    val ctx = amb.contexto
    val clubeId = ctx.clube?.id
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<CampeonatoCad>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var verArquivados by rememberSaveable { mutableStateOf(false) }
    var editando by remember { mutableStateOf<CampeonatoCad?>(null) }
    var novo by remember { mutableStateOf(false) }
    var remover by remember { mutableStateOf<CampeonatoCad?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    val pode = ctx.podeEditar("training:edit")
    if (clubeId == null) { EstadoVazio(Icones.trofeu, "Nenhum clube", "Cadastre um clube primeiro pra criar campeonatos."); return }
    LaunchedEffect(versao) { try { lista = t3.cadastros.campeonatos(clubeId); erro = null } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroCadastro(e) } }
    Text("Clube: ${ctx.nome}. Vincule cada jogo a um campeonato pra organizar histórico e estatísticas por competição.",
        style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { verArquivados = !verArquivados }) { Text(if (verArquivados) "Ocultar arquivados" else "Ver arquivados") }
        if (pode) Botao("Novo campeonato", { novo = true }, Modifier.weight(1f).testTag("cad:novo"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
    }
    Carregavel(lista == null && erro == null, erro.takeIf { lista == null }, { versao++ }) {
        val l = lista.orEmpty().filter { verArquivados || it.arquivado != true }
        ListaCartao(l.size, "Nenhum campeonato cadastrado. Crie \"Brasileirão Série D 2026\", \"Campeonato Estadual Sub-15\", etc.") {
            l.forEachIndexed { i, k ->
                if (i > 0) HorizontalDivider(color = TactiPlan.cores.borda)
                LinhaCad(listOfNotNull(k.name, k.season?.takeIf { it.isNotBlank() }).joinToString(" · "), detalheCampeonato(k),
                    if (k.arquivado == true) "Arquivado" else null, tag = "cad:campeonato:${k.id}", aoTocar = if (pode) ({ editando = k }) else null)
            }
        }
    }
    if (novo || editando != null) {
        val k = editando
        var f by remember(k) { mutableStateOf(k?.let(FormCampeonato::de) ?: FormCampeonato.novo(hojeBrasilia().take(4))) }
        Folha(if (k == null) "Novo campeonato" else "Editar campeonato", fechar = { novo = false; editando = null }, salvar = {
            erroCampeonato(f) ?: try {
                t3.cadastros.salvarCampeonato(k?.id, corpoCampeonato(f, k?.clubeId ?: clubeId)); novo = false; editando = null; versao++; null
            } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e) }
        }) {
            Campo(f.nome, { f = f.copy(nome = it) }, "Nome * (ex.: Brasileirão Série D 2026)", Modifier.testTag("cad:nome"))
            Campo(f.temporada, { f = f.copy(temporada = it) }, "Temporada / Edição (2026 ou 2025/26)")
            Campo(f.formato, { f = f.copy(formato = it) }, "Formato")
            LinhaChips(FORMATOS_CAMPEONATO.map { it to it }, f.formato, { f = f.copy(formato = it) }, "cad:formato")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CampoData("Início", f.inicio, { f = f.copy(inicio = it) }, modifier = Modifier.weight(1f))
                CampoData("Fim", f.fim, { f = f.copy(fim = it) }, modifier = Modifier.weight(1f))
            }
            if (k != null) {
                LinhaInterruptorSimples("Arquivado", f.arquivado) { f = f.copy(arquivado = it) }
                Botao("Remover campeonato", { remover = k; editando = null }, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
            }
        }
    }
    remover?.let { k ->
        Confirmar("Remover campeonato", textoRemoverCampeonato(k.name), "Remover", aoCancelar = { remover = null }, aoConfirmar = {
            remover = null
            escopo.launch { try { t3.cadastros.removerCampeonato(k.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
        })
    }
}

@Composable
private fun LinhaInterruptorSimples(rotulo: String, ligado: Boolean, tag: String = "", aoMudar: (Boolean) -> Unit) {
    val c = TactiPlan.cores
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(rotulo, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f))
        Switch(ligado, aoMudar, Modifier.testTag(tag), colors = SwitchDefaults.colors(checkedTrackColor = c.acao, checkedThumbColor = c.sobreAcao))
    }
}

// ---------------------------------------------------------------- Categorias

@Composable
private fun ColumnScope.Categorias(amb: AmbienteClube, t3: ServicosT3) {
    val ctx = amb.contexto
    val clubeId = ctx.clube?.id
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<CategoriaCadastro>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var editando by remember { mutableStateOf<CategoriaCadastro?>(null) }
    var novo by remember { mutableStateOf(false) }
    var remover by remember { mutableStateOf<CategoriaCadastro?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    val pode = ctx.podeEditar("categories:manage")
    if (clubeId == null) { EstadoVazio(Icones.camadas, "Nenhum clube", "Cadastre um clube primeiro."); return }
    LaunchedEffect(versao) { try { lista = t3.cadastros.categorias(clubeId); erro = null } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroCadastro(e) } }
    Text("Clube: ${ctx.nome}. Use categorias pra separar atletas e microciclos (Sub-15, Profissional, etc.). Atletas sem categoria continuam visíveis pra todo o clube.",
        style = TactiPlan.tipos.corpo13, color = TactiPlan.cores.tinta2)
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    if (pode) Botao("Nova categoria", { novo = true }, Modifier.testTag("cad:novo"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
    Carregavel(lista == null && erro == null, erro.takeIf { lista == null }, { versao++ }) {
        val l = lista.orEmpty().filter { it.clubeId == null || it.clubeId == clubeId }
        ListaCartao(l.size, "Nenhuma categoria cadastrada.") {
            l.forEachIndexed { i, k ->
                if (i > 0) HorizontalDivider(color = TactiPlan.cores.borda)
                LinhaCad(k.rotulo, listOfNotNull("${k.atletas ?: 0} atleta(s)", k.notes?.takeIf { it.isNotBlank() }).joinToString(" · "),
                    tag = "cad:categoria:${k.id}", aoTocar = if (pode) ({ editando = k }) else null)
            }
        }
    }
    if (novo || editando != null) {
        val k = editando
        var nome by remember(k) { mutableStateOf(k?.name.orEmpty()) }
        var faixa by remember(k) { mutableStateOf(k?.faixa.orEmpty()) }
        var ordem by remember(k) { mutableStateOf(k?.ordem) }
        var notas by remember(k) { mutableStateOf(k?.notes.orEmpty()) }
        Folha(if (k == null) "Nova categoria" else "Editar categoria", fechar = { novo = false; editando = null }, salvar = {
            if (nome.isBlank()) MSG_NOME_CATEGORIA else try {
                t3.cadastros.salvarCategoria(k?.id, corpoCategoria(clubeId, nome, faixa, ordem, notas)); novo = false; editando = null; versao++; null
            } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e, MSG_LIMITE_CATEGORIAS) }
        }) {
            Campo(nome, { nome = it }, "Nome * (ex.: Sub-15 Tarde)", Modifier.testTag("cad:nome"))
            Campo(faixa, { faixa = it }, "Categoria etária")
            LinhaChips(FAIXAS_ETARIAS.map { it to it }, faixa, { faixa = it }, "cad:faixa")
            CampoNumero(ordem, { ordem = it }, "Ordem (opcional)")
            CampoLongo(notas, { notas = it }, "Observações")
            if (k != null) Botao("Remover categoria", { remover = k; editando = null }, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
        }
    }
    remover?.let { k ->
        Confirmar("Remover categoria", textoRemoverCategoria(k), "Remover", aoCancelar = { remover = null }, aoConfirmar = {
            remover = null
            escopo.launch { try { t3.cadastros.removerCategoria(k.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
        })
    }
}

// ---------------------------------------------------------------- Clubes

@Composable
private fun ColumnScope.Clubes(amb: AmbienteClube, t3: ServicosT3) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<ClubeCad>?>(null) }
    var limite by remember { mutableStateOf<LimiteClubes?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var editando by remember { mutableStateOf<ClubeCad?>(null) }
    var novo by remember { mutableStateOf(false) }
    var confirmar by remember { mutableStateOf<Pair<String, ClubeCad>?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    val contaLeitura = ctx.conta.somenteLeitura == true
    val gerencia = !contaLeitura && ctx.pode("club_settings:manage")
    val cria = !contaLeitura && ctx.editaAlgo || gerencia
    LaunchedEffect(versao) {
        try {
            lista = t3.cadastros.clubes().filter { it.workspaceId == null || it.workspaceId == ctx.escolha.workspaceId }
            limite = try { t3.cadastros.limiteClubes() } catch (_: Exception) { null }
            erro = null
        } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroCadastro(e) }
    }
    Text("Os clubes da sua conta. Conteúdos, submomentos e títulos de atividades são da conta e valem para todos os clubes.",
        style = TactiPlan.tipos.corpo13, color = c.tinta2)
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    Carregavel(lista == null && erro == null, erro.takeIf { lista == null }, { versao++ }) {
        val l = lista.orEmpty()
        val ativos = l.filter { !it.arquivado }
        val arquivados = l.filter { it.arquivado }
        FaixaTom(textoLimiteClubes(limite, ativos.size), Tom.INFO, Icones.info)
        if (cria) Botao("Novo clube", {
            if (podeCriarClube(limite, ativos.size)) novo = true else aviso = MSG_LIMITE_CLUBES
        }, Modifier.testTag("cad:novo"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
        RotuloSecao("Ativos")
        if (ativos.isEmpty()) Text(if (arquivados.isNotEmpty()) "Nenhum clube ativo. Crie um clube novo ou desarquive um abaixo." else "Nenhum clube cadastrado.",
            style = TactiPlan.tipos.corpo15, color = c.tinta2)
        else ListaCartao(ativos.size, "") {
            ativos.forEachIndexed { i, k ->
                if (i > 0) HorizontalDivider(color = c.borda)
                LinhaCad(k.name, listOfNotNull(rotuloModalidade(k.modality).takeIf { it.isNotEmpty() }, k.description?.takeIf { it.isNotBlank() }).joinToString(" · "),
                    if (k.id == ctx.clube?.id) "Aberto" else null, tag = "cad:clube:${k.id}", aoTocar = if (gerencia) ({ editando = k }) else null)
            }
        }
        if (arquivados.isNotEmpty()) {
            RotuloSecao("Arquivados (${arquivados.size})")
            Text("Só leitura: dá para consultar o histórico e gerar relatórios. Não contam no limite.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            ListaCartao(arquivados.size, "") {
                arquivados.forEachIndexed { i, k ->
                    if (i > 0) HorizontalDivider(color = c.borda)
                    LinhaCad(k.name, "${rotuloModalidade(k.modality)} · arquivado em ${k.arquivadoEm?.take(10)?.let(::dataBR) ?: "—"}", tag = "cad:clube:${k.id}") {
                        if (gerencia) TextButton(onClick = {
                            if (podeCriarClube(limite, ativos.size)) confirmar = "desarquivar" to k
                            else aviso = "Para desarquivar \"${k.name}\", arquive o clube ativo antes."
                        }) { Text("Desarquivar") }
                        if (gerencia) IconButton(onClick = { confirmar = "remover" to k }) { Icon(Icones.lixeira, contentDescription = "Remover ${k.name}", tint = c.tinta2) }
                    }
                }
            }
        }
    }
    if (novo || editando != null) {
        val k = editando
        var nome by remember(k) { mutableStateOf(k?.name.orEmpty()) }
        var mod by remember(k) { mutableStateOf(k?.modality ?: "football_11") }
        var desc by remember(k) { mutableStateOf(k?.description.orEmpty()) }
        Folha(if (k == null) "Novo clube" else "Editar clube", fechar = { novo = false; editando = null }, salvar = {
            if (nome.isBlank()) MSG_NOME_CLUBE else try {
                t3.cadastros.salvarClube(k?.id, corpoClube(nome, mod, desc)); novo = false; editando = null; versao++; amb.atualizarMe(); null
            } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e) }
        }) {
            Campo(nome, { nome = it }, "Nome do clube * (ex.: Uberlândia E.C.)", Modifier.testTag("cad:nome"))
            Seletor("Modalidade", mod, MODALIDADES.map { it.first to it.second }, { mod = it ?: mod })
            if (k != null && k.modality != null && mod != k.modality) FaixaTom(AVISO_MODALIDADE, Tom.AVISO)
            Campo(desc, { desc = it }, "Descrição (opcional)")
            Text("As cores e a logo do clube são definidas no TactiPlan pelo computador.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            if (k != null) {
                Botao("Arquivar clube", { confirmar = "arquivar" to k; editando = null }, variante = VarianteBotao.NEUTRO)
                Botao("Remover clube", { confirmar = "remover" to k; editando = null }, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
            }
        }
    }
    confirmar?.let { (acao, k) ->
        val (titulo, texto, botao) = when (acao) {
            "arquivar" -> Triple("Arquivar clube", textoArquivarClube(k.name), "Arquivar")
            "desarquivar" -> Triple("Desarquivar clube", textoDesarquivarClube(k.name), "Desarquivar")
            else -> Triple("Remover clube", textoRemoverClube(k.name, !k.arquivado), "Remover")
        }
        Confirmar(titulo, texto, botao, perigo = acao == "remover", aoCancelar = { confirmar = null }, aoConfirmar = {
            confirmar = null
            escopo.launch {
                try {
                    when (acao) {
                        "arquivar" -> { t3.cadastros.arquivarClube(k.id, true); aviso = "\"${k.name}\" foi arquivado." }
                        "desarquivar" -> { t3.cadastros.arquivarClube(k.id, false); aviso = "\"${k.name}\" voltou a ser um clube ativo." }
                        else -> t3.cadastros.removerClube(k.id)
                    }
                    versao++
                    amb.atualizarMe()
                } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) }
            }
        })
    }
}

// ---------------------------------------------------------------- Conteúdos e submomentos

@Composable
private fun ColumnScope.Conteudos(amb: AmbienteClube, t3: ServicosT3) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var conteudos by remember { mutableStateOf<List<ConteudoCad>?>(null) }
    var subs by remember { mutableStateOf<List<SubmomentoCad>>(emptyList()) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aba by rememberSaveable { mutableIntStateOf(0) }
    var busca by rememberSaveable { mutableStateOf("") }
    var editando by remember { mutableStateOf<ConteudoCad?>(null) }
    var novo by remember { mutableStateOf(false) }
    var subEditando by remember { mutableStateOf<Pair<ConteudoCad, SubmomentoCad?>?>(null) }
    var removerC by remember { mutableStateOf<ConteudoCad?>(null) }
    var removerS by remember { mutableStateOf<SubmomentoCad?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    val pode = !(ctx.conta.somenteLeitura ?: true) && ctx.pode("library:edit")
    LaunchedEffect(versao) {
        try {
            conteudos = t3.cadastros.conteudos()
            subs = t3.cadastros.submomentos(ctx.clube?.modalidade)
            erro = null
        } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroCadastro(e) }
    }
    fun alternar(bloco: suspend () -> Unit) = escopo.launch {
        try { bloco(); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = "Erro ao alternar: ${mensagemErroCadastro(e)}" }
    }
    Text("Pilares são fixos. Conteúdos padrão podem ser ativados/desativados mas não editados. Os seus conteúdos personalizados podem ser editados e removidos. Submomentos (só em Tático) são editáveis.",
        style = TactiPlan.tipos.corpo13, color = c.tinta2)
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    AbasInternas(PILARES_CADASTRO.map { it.rotulo }, aba, { aba = it }, "cad:pilar")
    val pilar = PILARES_CADASTRO[aba]
    Text(pilar.descricao, style = TactiPlan.tipos.corpo13, color = c.tinta2)
    Campo(busca, { busca = it }, if (pilar.id == "tatico") "Buscar conteúdo ou submomento…" else "Buscar conteúdo…", Modifier.testTag("cad:busca"))
    if (pode) Botao("Novo conteúdo", { novo = true }, Modifier.testTag("cad:novo"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
    Carregavel(conteudos == null && erro == null, erro.takeIf { conteudos == null }, { versao++ }) {
        val l = conteudosDoPilarCad(conteudos.orEmpty(), pilar.id, busca, subs)
        if (l.isEmpty()) EstadoVazio(Icones.camadas, "Nada encontrado", if (busca.isBlank()) "Nenhum conteúdo neste pilar." else "Nada encontrado pra \"$busca\".")
        else Cartao(preenchimento = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
            l.forEachIndexed { i, k ->
                if (i > 0) HorizontalDivider(color = c.borda)
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("cad:conteudo:${k.id}"), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(corHex(pilar.corHex)))
                    Column(Modifier.weight(1f).then(if (pode && k.proprio) Modifier.clickable(role = Role.Button) { editando = k } else Modifier)) {
                        Text(k.name + (k.abbreviation?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), style = TactiPlan.tipos.corpo15,
                            fontWeight = FontWeight.SemiBold, color = if (k.ativo) c.tinta else c.tinta3,
                            textDecoration = if (k.ativo) null else TextDecoration.LineThrough)
                        if (!k.proprio) Text("Padrão", style = TactiPlan.tipos.legenda11, color = c.tinta2)
                    }
                    if (pode && pilar.id == "tatico" && k.ativo) TextButton(onClick = { subEditando = k to null }) { Text("+ Submomento") }
                    Switch(k.ativo, { on -> if (pode) alternar { t3.cadastros.ativarConteudo(k.id, on) } }, enabled = pode,
                        modifier = Modifier.testTag("cad:conteudo:ativo:${k.id}"),
                        colors = SwitchDefaults.colors(checkedTrackColor = c.acao, checkedThumbColor = c.sobreAcao))
                }
                if (pilar.id == "tatico") {
                    val ss = submomentosDe(subs, k.id)
                    if (ss.isEmpty()) Text("sem submomentos", style = TactiPlan.tipos.corpo13, color = c.tinta3, modifier = Modifier.padding(start = 18.dp, bottom = 6.dp))
                    ss.forEach { s ->
                        Row(Modifier.fillMaxWidth().padding(start = 18.dp).heightIn(min = 44.dp).testTag("cad:sub:${s.id}"), verticalAlignment = Alignment.CenterVertically) {
                            Text(s.name, style = TactiPlan.tipos.corpo13, color = if (s.ativo) c.tinta else c.tinta3,
                                textDecoration = if (s.ativo) null else TextDecoration.LineThrough, modifier = Modifier.weight(1f)
                                    .then(if (pode) Modifier.clickable(role = Role.Button) { subEditando = k to s } else Modifier))
                            if (pode) TextButton(onClick = { alternar { t3.cadastros.ativarSubmomento(s.id, !s.ativo) } }) { Text(if (s.ativo) "Desativar" else "Reativar") }
                            if (pode && s.proprio) IconButton(onClick = { removerS = s }) { Icon(Icones.lixeira, contentDescription = "Remover ${s.name}", tint = c.tinta2) }
                        }
                    }
                }
            }
        }
    }
    if (novo || editando != null) {
        val k = editando
        var nome by remember(k) { mutableStateOf(k?.name.orEmpty()) }
        var abrev by remember(k) { mutableStateOf(k?.abbreviation.orEmpty()) }
        var desc by remember(k) { mutableStateOf(k?.description.orEmpty()) }
        var p by remember(k) { mutableStateOf(k?.dimension ?: pilar.id) }
        Folha(if (k == null) "Novo conteúdo" else "Editar conteúdo", fechar = { novo = false; editando = null },
            salvar = {
                if (nome.isBlank()) MSG_NOME_CONTEUDO else try {
                    t3.cadastros.salvarConteudo(k?.id, corpoConteudo(nome, abrev, desc, p)); novo = false; editando = null; versao++; null
                } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e) }
            }, rotuloSalvar = if (k == null) "Criar" else "Salvar") {
            Seletor("Pilar *", p, PILARES_CADASTRO.map { it.id to it.rotulo }, { p = it ?: p }, habilitado = k == null)
            Campo(nome, { nome = it }, "Nome * (ex.: Saída de Bola)", Modifier.testTag("cad:nome"))
            Campo(abrev, { abrev = it.take(20) }, "Abreviação (opcional)")
            CampoLongo(desc, { desc = it }, "Descrição (opcional)")
            if (p != "tatico") Text("Conteúdos não-táticos não têm submomentos.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            if (k != null) Botao("Remover conteúdo", { removerC = k; editando = null }, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
        }
    }
    subEditando?.let { (k, s) ->
        var nome by remember(s) { mutableStateOf(s?.name.orEmpty()) }
        var desc by remember(s) { mutableStateOf(s?.description.orEmpty()) }
        var ordem by remember(s) { mutableStateOf(s?.ordem) }
        Folha(if (s == null) "Novo submomento · ${k.name}" else "Editar submomento", fechar = { subEditando = null }, salvar = {
            if (nome.isBlank()) MSG_NOME_CONTEUDO else try {
                t3.cadastros.salvarSubmomento(s?.id, corpoSubmomento(k.id, nome, desc, ordem)); subEditando = null; versao++; null
            } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e) }
        }) {
            Campo(nome, { nome = it }, "Nome * (ex.: 1ª Fase de Construção)", Modifier.testTag("cad:nome"))
            CampoLongo(desc, { desc = it }, "Descrição (opcional)")
            CampoNumero(ordem, { ordem = it }, "Ordem")
            if (s != null && !s.proprio) Text("Este submomento é padrão: salvar cria uma cópia sua.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
        }
    }
    removerC?.let { k ->
        Confirmar("Remover conteúdo", textoRemoverConteudo(k.name), "Remover", aoCancelar = { removerC = null }, aoConfirmar = {
            removerC = null
            escopo.launch { try { t3.cadastros.removerConteudo(k.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
        })
    }
    removerS?.let { s ->
        Confirmar("Remover submomento", textoRemoverSubmomento(s.name), "Remover", aoCancelar = { removerS = null }, aoConfirmar = {
            removerS = null
            escopo.launch { try { t3.cadastros.removerSubmomento(s.id); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
        })
    }
}

// ---------------------------------------------------------------- Atividades

@Composable
private fun ColumnScope.Atividades(amb: AmbienteClube, t3: ServicosT3) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var lista by remember { mutableStateOf<List<AtividadeCad>?>(null) }
    var conteudos by remember { mutableStateOf<List<ConteudoCad>>(emptyList()) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var busca by rememberSaveable { mutableStateOf("") }
    var filtroConteudo by rememberSaveable { mutableStateOf<String?>(null) }
    var mostrarArquivadas by rememberSaveable { mutableStateOf(false) }
    var editando by remember { mutableStateOf<AtividadeCad?>(null) }
    var novo by remember { mutableStateOf(false) }
    var confirmar by remember { mutableStateOf<Triple<AtividadeCad, Boolean, Int>?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    val pode = !(ctx.conta.somenteLeitura ?: true) && ctx.pode("library:edit")
    LaunchedEffect(versao) {
        try { lista = t3.cadastros.atividades(); conteudos = t3.cadastros.conteudos(); erro = null } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroCadastro(e) }
    }
    fun pedir(a: AtividadeCad, arquivar: Boolean) = escopo.launch {
        val usos = try { t3.cadastros.usoAtividade(a.id) } catch (_: Exception) { 0 }
        confirmar = Triple(a, arquivar, usos)
    }
    aviso?.let { FaixaTom(it, Tom.AVISO) }
    Campo(busca, { busca = it }, "Buscar atividades...", Modifier.testTag("cad:busca"))
    Seletor("Conteúdo", filtroConteudo, listOf<Pair<String?, String>>(null to "Todos os conteúdos") + conteudos.sortedBy { it.name }.map { it.id to it.name },
        { filtroConteudo = it })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { mostrarArquivadas = !mostrarArquivadas }) { Text(if (mostrarArquivadas) "Ocultar arquivadas" else "Mostrar arquivadas") }
        if (pode) Botao("Nova atividade", { novo = true }, Modifier.weight(1f).testTag("cad:novo"), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
    }
    Carregavel(lista == null && erro == null, erro.takeIf { lista == null }, { versao++ }) {
        val l = filtrarAtividades(lista.orEmpty(), busca, filtroConteudo, mostrarArquivadas)
        ListaCartao(l.size, "Nenhuma atividade encontrada.") {
            l.forEachIndexed { i, a ->
                if (i > 0) HorizontalDivider(color = c.borda)
                LinhaCad(a.title, listOfNotNull(a.conteudoNome, a.description?.takeIf { it.isNotBlank() }).joinToString(" · "),
                    if (a.arquivadaB) "arquivada" else null, tag = "cad:atividade:${a.id}") {
                    if (pode) {
                        if (a.arquivadaB) TextButton(onClick = {
                            escopo.launch { try { t3.cadastros.arquivarAtividade(a.id, false); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
                        }) { Text("Restaurar") }
                        else {
                            IconButton(onClick = { pedir(a, false) }) { Icon(Icones.lapis, contentDescription = "Editar ${a.title}", tint = c.tinta2) }
                            IconButton(onClick = { pedir(a, true) }) { Icon(Icones.lixeira, contentDescription = "Arquivar ${a.title}", tint = c.tinta2) }
                        }
                    }
                }
            }
        }
        val todas = lista.orEmpty()
        Text(rodapeAtividades(todas.count { !it.arquivadaB }, todas.count { it.arquivadaB }, mostrarArquivadas), style = TactiPlan.tipos.corpo13, color = c.tinta2)
    }
    confirmar?.let { (a, arquivar, usos) ->
        Confirmar(if (arquivar) "Arquivar atividade" else "Editar atividade",
            textoUsoAtividade(usos, arquivar) + "\n\n" + if (arquivar) "Deseja arquivar esta atividade?" else "Deseja prosseguir com a edição?",
            if (arquivar) "Confirmar arquivamento" else "Confirmar edição", perigo = arquivar, aoCancelar = { confirmar = null }, aoConfirmar = {
                confirmar = null
                if (arquivar) escopo.launch { try { t3.cadastros.arquivarAtividade(a.id, true); versao++ } catch (e: Exception) { if (!amb.tratarErro(e)) aviso = mensagemErroCadastro(e) } }
                else editando = a
            })
    }
    if (novo || editando != null) {
        val a = editando
        var nome by remember(a) { mutableStateOf(a?.title.orEmpty()) }
        var conteudoId by remember(a) { mutableStateOf(a?.conteudoId) }
        var pilar by remember(a) { mutableStateOf(conteudos.firstOrNull { it.id == a?.conteudoId }?.dimension) }
        var desc by remember(a) { mutableStateOf(a?.description.orEmpty()) }
        Folha(if (a == null) "Cadastrar nova atividade" else "Editar atividade", fechar = { novo = false; editando = null }, salvar = {
            erroAtividade(pilar, conteudoId, nome) ?: try {
                t3.cadastros.salvarAtividade(a?.id, corpoAtividade(nome, conteudoId!!, desc)); novo = false; editando = null; versao++; null
            } catch (e: Exception) { if (amb.tratarErro(e)) null else mensagemErroCadastro(e) }
        }, rotuloSalvar = if (a == null) "Salvar" else "Salvar alterações") {
            Text("Pilar *", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            LinhaChips(PILARES_CADASTRO.map { it.id to it.rotulo }, pilar, { pilar = it; if (conteudos.firstOrNull { k -> k.id == conteudoId }?.dimension != it) conteudoId = null }, "cad:ativ:pilar")
            Seletor("Conteúdo *", conteudoId, conteudos.filter { it.dimension == pilar && it.ativo }.sortedBy { it.name }.map { it.id to it.name },
                { conteudoId = it }, habilitado = pilar != null, tag = "cad:ativ:conteudo")
            Campo(nome, { nome = it }, "Nome da atividade * (ex.: Posse 4x4+2)", Modifier.testTag("cad:nome"))
            CampoLongo(desc, { desc = it }, "Descrição (opcional)")
        }
    }
}
