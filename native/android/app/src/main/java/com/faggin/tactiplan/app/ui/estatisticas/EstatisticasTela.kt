package com.faggin.tactiplan.app.ui.estatisticas

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.estatisticas.COLUNAS_MINUTAGEM
import com.faggin.tactiplan.app.dados.estatisticas.FILTROS_PERIODO
import com.faggin.tactiplan.app.dados.estatisticas.JogadorStats
import com.faggin.tactiplan.app.dados.estatisticas.ModoPilar
import com.faggin.tactiplan.app.dados.estatisticas.OrdemMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.PeriodoStats
import com.faggin.tactiplan.app.dados.estatisticas.RODAPE_MINUTAGEM
import com.faggin.tactiplan.app.dados.estatisticas.StatsJogos
import com.faggin.tactiplan.app.dados.estatisticas.StatsTreino
import com.faggin.tactiplan.app.dados.estatisticas.alternarOrdem
import com.faggin.tactiplan.app.dados.estatisticas.cardsJogos
import com.faggin.tactiplan.app.dados.estatisticas.conteudosDoPilar
import com.faggin.tactiplan.app.dados.estatisticas.corpoEstatisticas
import com.faggin.tactiplan.app.dados.estatisticas.decimalWeb
import com.faggin.tactiplan.app.dados.estatisticas.distribuicaoPilares
import com.faggin.tactiplan.app.dados.estatisticas.fimAoMudarInicio
import com.faggin.tactiplan.app.dados.estatisticas.formatarMinutos
import com.faggin.tactiplan.app.dados.estatisticas.km
import com.faggin.tactiplan.app.dados.estatisticas.maisUsadosPorPilar
import com.faggin.tactiplan.app.dados.estatisticas.nomePdfEstatisticas
import com.faggin.tactiplan.app.dados.estatisticas.opcoesCampeonato
import com.faggin.tactiplan.app.dados.estatisticas.opcoesJogo
import com.faggin.tactiplan.app.dados.estatisticas.JogoDoPeriodo
import com.faggin.tactiplan.app.dados.jogo.corpoRelatorioJogo
import com.faggin.tactiplan.app.dados.jogo.nomePdfRelatorioJogo
import com.faggin.tactiplan.app.dados.cadastros.CampeonatoCad
import com.faggin.tactiplan.app.ui.t3.Seletor
import com.faggin.tactiplan.app.dados.estatisticas.ordenarMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.periodoDaSemana
import com.faggin.tactiplan.app.dados.estatisticas.periodoDoFiltro
import com.faggin.tactiplan.app.dados.estatisticas.plural
import com.faggin.tactiplan.app.dados.estatisticas.submomentosTaticos
import com.faggin.tactiplan.app.dados.estatisticas.subtituloMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.temDadosTreino
import com.faggin.tactiplan.app.dados.estatisticas.valorPilarTexto
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.dataBR
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import com.faggin.tactiplan.app.dados.treino.pilarDe
import com.faggin.tactiplan.app.dados.treino.somarDias
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.FaixasDoTopo
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.semana.FotosRelatorioTela
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.PedidoFotos
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import com.faggin.tactiplan.app.ui.semana.iniciarExportacao
import com.faggin.tactiplan.app.ui.t3.AbasInternas
import com.faggin.tactiplan.app.ui.t3.Barra
import com.faggin.tactiplan.app.ui.t3.CampoData
import com.faggin.tactiplan.app.ui.t3.Carregavel
import com.faggin.tactiplan.app.ui.t3.LinhaChips
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import com.faggin.tactiplan.app.ui.t3.corHex
import kotlinx.coroutines.launch

const val TAG_EXPORTAR_STATS = "stats:exportar"

private fun dd(d: String) = dataBR(d).take(5)

/** Estatísticas (Treino | Jogos) com os filtros de período do web e o PDF pela folha de compartilhar. */
@Composable
fun EstatisticasTela(amb: AmbienteClube, t3: ServicosT3, comecarNoTreino: Boolean, voltar: () -> Unit) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val clubeId = ctx.clube?.id
    val hoje = hojeBrasilia()
    var aba by rememberSaveable { mutableIntStateOf(if (comecarNoTreino) 0 else 1) }
    var filtro by rememberSaveable { mutableStateOf("1-micro") }
    var base by rememberSaveable { mutableStateOf(hoje) }
    var inicio by rememberSaveable { mutableStateOf<String?>(null) }
    var fim by rememberSaveable { mutableStateOf<String?>(null) }
    var periodo by remember { mutableStateOf(periodoDaSemana("1-micro", hoje)) }
    var treino by remember { mutableStateOf<StatsTreino?>(null) }
    var jogos by remember { mutableStateOf<StatsJogos?>(null) }
    var carregando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var exportando by remember { mutableStateOf(false) }
    var verMinutagem by remember { mutableStateOf(false) }
    var fotos by remember { mutableStateOf<PedidoFotos?>(null) }
    // filtro de campeonato (só Jogos): null = todos, CAMPEONATO_SEM = amistosos
    var campeonato by rememberSaveable { mutableStateOf<String?>(null) }
    var campeonatos by remember { mutableStateOf<List<CampeonatoCad>>(emptyList()) }
    // filtro de jogo (depois do campeonato): null = todos; a lista vem dos jogos do período/campeonato
    var jogoSel by rememberSaveable { mutableStateOf<String?>(null) }
    var listaJogos by remember { mutableStateOf<List<JogoDoPeriodo>>(emptyList()) }

    LaunchedEffect(clubeId) {
        campeonatos = emptyList()
        jogoSel = null
        if (clubeId != null) campeonatos = runCatching { t3.cadastros.campeonatos(clubeId) }.getOrDefault(emptyList())
    }

    fun aplicarFiltro(f: String) {
        filtro = f
        when (f) {
            "1-micro", "4-micros" -> { periodo = periodoDaSemana(f, base) }
            "custom" -> { inicio = inicio ?: periodo.inicio; fim = fim ?: periodo.fim }
            else -> periodoDoFiltro(f, hoje)?.let { periodo = it; inicio = it.inicio; fim = it.fim }
        }
    }

    LaunchedEffect(clubeId, periodo, aba, versao, campeonato, jogoSel) {
        if (clubeId == null) return@LaunchedEffect
        carregando = true
        try {
            if (aba == 0) treino = t3.stats.treino(clubeId, periodo)
            else {
                val todos = t3.stats.jogos(clubeId, periodo, campeonato)
                listaJogos = todos.matchesHistory
                val sel = jogoSel?.takeIf { id -> todos.matchesHistory.any { it.id == id } }
                if (sel != jogoSel) jogoSel = sel
                jogos = if (sel != null) t3.stats.jogos(clubeId, periodo, campeonato, sel) else todos
            }
            erro = null
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) erro = if (e is com.faggin.tactiplan.app.dados.ErroApi && e.status == 403)
                "Você não tem permissão para ver estatísticas neste clube. Peça ao responsável pelo clube para liberar em Staff." else mensagemErroTreino(e)
        }
        carregando = false
    }

    fotos?.let { p ->
        BackHandler { fotos = null }
        FotosRelatorioTela(pedido = p, api = amb.treino!!.api, usuarioId = amb.usuarioId, tratarErro = amb.tratarErro, fechar = { fotos = null })
        return
    }
    if (verMinutagem) {
        BackHandler { verMinutagem = false }
        MinutagemCompletaTela(jogos ?: StatsJogos()) { verMinutagem = false }
        return
    }

    val podeExportar = clubeId != null && ctx.conta.somenteLeitura != true && amb.treino != null &&
        ((aba == 0 && treino?.let(::temDadosTreino) == true) || (aba == 1 && (jogos?.totalMatches ?: 0) > 0))
    TelaRaiz("Estatísticas", aoVoltar = voltar, acoes = {
        if (podeExportar) IconButton(onClick = {
            if (exportando) return@IconButton
            exportando = true; aviso = null
            escopo.launch {
                val corpo = corpoEstatisticas(clubeId!!, periodo, filtro, if (aba == 1) campeonato else null)
                val nome = nomePdfEstatisticas(aba == 0, ctx.nome, filtro)
                val umJogo = if (aba == 1) jogoSel?.let { id -> listaJogos.firstOrNull { it.id == id } } else null
                val r = if (aba == 0) iniciarExportacao(context, amb.treino!!.api, "treino", corpo, nome, amb.usuarioId, amb.tratarErro)
                // um jogo escolhido: o relatório daquele jogo (o mesmo da tela do jogo)
                else if (umJogo != null) gerarECompartilhar(context, amb.treino!!.api, "jogo", corpoRelatorioJogo(umJogo.id),
                    nomePdfRelatorioJogo(umJogo.opponent, umJogo.date?.take(10) ?: ""), amb.tratarErro)
                else gerarECompartilhar(context, amb.treino!!.api, "jogos", corpo, nome, amb.tratarErro)
                when (r) {
                    is InicioExportar.Erro -> aviso = r.mensagem
                    is InicioExportar.EscolherFotos -> fotos = r.pedido
                    InicioExportar.Entregue -> {}
                }
                exportando = false
            }
        }, enabled = !exportando, modifier = Modifier.testTag(TAG_EXPORTAR_STATS)) {
            if (exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
            else Icon(Icones.compartilhar, contentDescription = "Exportar PDF das estatísticas")
        }
    }) {
        FaixasDoTopo(amb)
        AbasInternas(listOf("Treino", "Jogos"), aba, { aba = it }, "stats:aba")
        LinhaChips(FILTROS_PERIODO.map { it.id to it.rotulo }, filtro, ::aplicarFiltro, "stats:filtro")
        when (filtro) {
            "1-micro", "4-micros" -> {
                val s = SemanaISO.de(base)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = { base = somarDias(s.segunda, -7); periodo = periodoDaSemana(filtro, base) }, modifier = Modifier.testTag("stats:anterior")) {
                        Icon(Icones.esquerda, contentDescription = "Semana anterior", tint = c.acaoTinta)
                    }
                    Text("${if (filtro == "4-micros") "Primeira semana" else "Semana"} ${s.numero}/${s.ano} (${dd(periodo.inicio)} - ${dd(periodo.fim)})",
                        style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta, modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center)
                    IconButton(onClick = { base = somarDias(s.segunda, 7); periodo = periodoDaSemana(filtro, base) }, modifier = Modifier.testTag("stats:proxima")) {
                        Icon(Icones.direita, contentDescription = "Próxima semana", tint = c.acaoTinta)
                    }
                    if (!s.contem(hoje)) TextButton(onClick = { base = hoje; periodo = periodoDaSemana(filtro, hoje) }) { Text("Hoje") }
                }
            }
            "semester", "1-year" -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CampoData("Data inicial", inicio, { v ->
                    if (v != null) { inicio = v; fim = fimAoMudarInicio(filtro, v); periodo = PeriodoStats(v, fim!!) }
                }, limpar = false, modifier = Modifier.weight(1f))
                Text("até ${fim?.let(::dataBR) ?: "—"}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampoData("Início", inicio, { inicio = it }, limpar = false, modifier = Modifier.weight(1f), tag = "stats:inicio")
                    CampoData("Fim", fim, { fim = it }, limpar = false, modifier = Modifier.weight(1f), tag = "stats:fim")
                }
                val ok = inicio != null && fim != null && inicio!! <= fim!!
                Botao("Buscar", { periodo = PeriodoStats(inicio!!, fim!!); versao++ }, Modifier.testTag("stats:buscar"), VarianteBotao.SECUNDARIO, ok)
            }
        }
        if (aba == 1 && clubeId != null) {
            Seletor("Campeonato", campeonato, opcoesCampeonato(campeonatos), { campeonato = it }, tag = "stats:campeonato")
            if (listaJogos.isNotEmpty()) Seletor("Jogo", jogoSel, opcoesJogo(listaJogos), { jogoSel = it }, tag = "stats:jogo")
        }
        aviso?.let { FaixaTom(it, Tom.AVISO) }
        if (clubeId == null) { EstadoVazio(Icones.grafico, "Nenhum clube nesta conta", "As estatísticas aparecem quando houver um clube."); return@TelaRaiz }
        Carregavel(carregando && (if (aba == 0) treino == null else jogos == null), erro, { versao++ }) {
            if (carregando) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
            if (aba == 0) treino?.let { ConteudoTreino(it) } else jogos?.let { ConteudoJogos(it) { verMinutagem = true } }
        }
    }
}

// ---------------------------------------------------------------- Treino

@Composable
private fun Kpi(rotulo: String, valor: String, sub: String?, cor: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    val c = TactiPlan.cores
    Cartao(modifier, preenchimento = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(cor))
            Text(rotulo, style = TactiPlan.tipos.corpo13, color = c.tinta2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(valor, style = TactiPlan.tipos.titulo20, color = c.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp))
        sub?.let { Text(it, style = TactiPlan.tipos.legenda11, color = c.tinta2) }
    }
}

@Composable
private fun ConteudoTreino(s: StatsTreino) {
    val c = TactiPlan.cores
    if (s.totals.activities == 0) {
        EstadoVazio(Icones.grafico, "Nenhum dado encontrado", "Não há treinos registrados no período selecionado.")
        Distancia(s)
        return
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Kpi("Atividades", "${s.totals.activities}", null, corHex("#3b82f6"), Modifier.weight(1f))
        Kpi("Tempo total", formatarMinutos(s.totals.minutes), null, corHex("#a855f7"), Modifier.weight(1f))
    }
    val mais = maisUsadosPorPilar(s)
    var idx by remember(mais.size) { mutableIntStateOf(0) }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Kpi("Sessões", "${s.totals.sessions}", null, corHex("#10b981"), Modifier.weight(1f))
        val m = mais.getOrNull(idx)
        Kpi(if (m != null) "Conteúdo mais usado · ${m.rotulo}" else "Conteúdo mais usado", m?.nome ?: "—", m?.detalhe,
            corHex(m?.corHex ?: "#f59e0b"),
            Modifier.weight(1f).clickable(enabled = mais.size > 1, role = Role.Button) { idx = (idx + 1) % mais.size }
                .semantics { contentDescription = "Conteúdo mais usado${m?.let { " em ${it.rotulo}: ${it.nome}, ${it.detalhe}" } ?: ""}. Toque para ver outro pilar." })
    }
    // Distribuição por pilar
    var modo by rememberSaveable { mutableStateOf(ModoPilar.SESSOES) }
    var pilarSel by rememberSaveable { mutableStateOf<String?>(null) }
    var conteudoSel by remember { mutableStateOf<String?>(null) }
    RotuloSecao("Distribuição por pilar")
    LinhaChips(ModoPilar.entries.map { it.name to it.rotulo }, modo.name, { modo = ModoPilar.valueOf(it); conteudoSel = null }, "stats:modo")
    Text("${modo.rotulo}: ${modo.descricao}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
    val fatias = distribuicaoPilares(s, modo)
    val ativo = pilarSel?.takeIf { p -> fatias.any { it.pilar == p } } ?: fatias.firstOrNull()?.pilar
    Cartao {
        if (fatias.isEmpty()) Text("Sem dados", style = TactiPlan.tipos.corpo15, color = c.tinta2)
        fatias.forEach { f ->
            Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { pilarSel = f.pilar; conteudoSel = null }.padding(vertical = 6.dp)
                .semantics { contentDescription = "${f.rotulo}: ${valorPilarTexto(f.valor, modo)}, ${f.pct}%" }.testTag("stats:pilar:${f.pilar}")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(f.rotulo, style = TactiPlan.tipos.corpo15, fontWeight = if (f.pilar == ativo) FontWeight.Bold else FontWeight.Medium,
                        color = c.tinta, modifier = Modifier.weight(1f))
                    Text("${valorPilarTexto(f.valor, modo)} · ${f.pct}%", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
                Barra(f.pct / 100f, corHex(f.corHex), Modifier.padding(top = 4.dp))
            }
        }
    }
    ativo?.let { p ->
        val pilar = pilarDe(p)
        val itens = conteudosDoPilar(s, modo, p)
        RotuloSecao(if (p == "tatico") "Momentos do jogo" else "Conteúdos · ${pilar?.rotulo ?: p}")
        Cartao {
            if (itens.isEmpty()) Text("Nenhum conteúdo registrado em ${pilar?.rotulo} no período.", style = TactiPlan.tipos.corpo15, color = c.tinta2)
            val max = itens.maxOfOrNull { it.valor } ?: 1
            itens.forEach { i ->
                Column(Modifier.fillMaxWidth().then(if (p == "tatico") Modifier.clickable(role = Role.Button) {
                    conteudoSel = if (conteudoSel == i.id) null else i.id
                } else Modifier).padding(vertical = 5.dp)) {
                    Row {
                        Text(i.nome, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f),
                            fontWeight = if (conteudoSel == i.id) FontWeight.Bold else FontWeight.Normal)
                        Text(valorPilarTexto(i.valor, modo), style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    }
                    Barra(i.valor.toFloat() / max, corHex(pilar?.corHex ?: "#64748b"), Modifier.padding(top = 3.dp))
                }
            }
        }
        if (p == "tatico" && modo != ModoPilar.TEMPO) {
            val subs = submomentosTaticos(s, conteudoSel)
            Row(verticalAlignment = Alignment.CenterVertically) {
                RotuloSecao("Submomentos" + (conteudoSel?.let { id -> itens.firstOrNull { it.id == id }?.nome?.let { " · $it" } } ?: ""), Modifier.weight(1f))
                if (conteudoSel != null) TextButton(onClick = { conteudoSel = null }) { Text("Limpar filtro") }
            }
            Cartao {
                if (subs.isEmpty()) Text("Nenhum submomento marcado nas atividades táticas.", style = TactiPlan.tipos.corpo15, color = c.tinta2)
                val tot = subs.sumOf { it.valor }.coerceAtLeast(1)
                subs.forEach { i ->
                    Row(Modifier.padding(vertical = 4.dp)) {
                        Text(i.nome, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f))
                        Text("${Math.round(i.valor * 100.0 / tot)}% · ${i.valor}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    }
                }
            }
        }
    }
    Distancia(s)
    // Top atividades
    RotuloSecao("Top atividades · mais usadas")
    Cartao {
        if (modo == ModoPilar.SESSOES) {
            Text("Atividades não se contam por sessão.", style = TactiPlan.tipos.corpo15, color = c.tinta)
            Text("Troque pra Nº atividades ou Tempo pra ver o ranking.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
        } else {
            val top = s.topTitles.sortedByDescending { if (modo == ModoPilar.TEMPO) it.minutes else it.count }
            if (top.isEmpty()) Text("Sem atividades no período.", style = TactiPlan.tipos.corpo15, color = c.tinta2)
            top.forEachIndexed { i, t ->
                Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${i + 1}.", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.width(22.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.title ?: "", style = TactiPlan.tipos.corpo15, color = c.tinta, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(Modifier.size(7.dp).clip(CircleShape).background(corHex(pilarDe(t.dimension)?.corHex ?: "#64748b")))
                            Text(listOfNotNull(pilarDe(t.dimension)?.rotulo, t.conteudo).joinToString(" · "), style = TactiPlan.tipos.legenda11, color = c.tinta2)
                        }
                    }
                    Text(if (modo == ModoPilar.TEMPO) formatarMinutos(t.minutes) else "${t.count}x", style = TactiPlan.tipos.corpo13,
                        fontWeight = FontWeight.SemiBold, color = c.tinta)
                }
            }
        }
    }
}

@Composable
private fun Distancia(s: StatsTreino) {
    val d = s.distance ?: return
    if (d.daysWithData <= 0) return
    val c = TactiPlan.cores
    RotuloSecao("Distância ideal · ${if (d.granularity == "week") "média por semana" else "por dia de treino"} · km")
    Cartao {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(Triple("Média", "${km(d.avgKm)} km", plural(d.daysWithData, "dia com registro", "dias com registro")),
                Triple("Acumulado", "${km(d.totalKm)} km", "por jogador no período"), Triple("Maior dia", "${km(d.maxKm)} km", null)).forEach { (r, v, sub) ->
                Column(Modifier.weight(1f)) {
                    Text(r, style = TactiPlan.tipos.legenda11, color = c.tinta2)
                    Text(v, style = TactiPlan.tipos.corpo17, fontWeight = FontWeight.SemiBold, color = c.tinta)
                    sub?.let { Text(it, style = TactiPlan.tipos.legenda11, color = c.tinta2) }
                }
            }
        }
        val max = (d.series.maxOfOrNull { it.avgKm ?: 0.0 } ?: 0.0).coerceAtLeast(0.01)
        d.series.forEach { p ->
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(p.label ?: "", style = TactiPlan.tipos.legenda11, color = c.tinta2, modifier = Modifier.width(44.dp))
                Barra(((p.avgKm ?: 0.0) / max).toFloat(), corHex("#f59e0b"), Modifier.weight(1f))
                Text(km(p.avgKm), style = TactiPlan.tipos.legenda11, color = c.tinta, modifier = Modifier.width(36.dp), textAlign = TextAlign.End)
            }
        }
    }
}

// ---------------------------------------------------------------- Jogos

@Composable
private fun ConteudoJogos(s: StatsJogos, verTodas: () -> Unit) {
    val c = TactiPlan.cores
    if (s.totalMatches == 0) {
        EstadoVazio(Icones.trofeu, "Nenhum jogo encontrado", "Não há jogos registrados no período selecionado.")
        return
    }
    val k = cardsJogos(s)
    val v = corHex("#22c55e"); val e = corHex("#f59e0b"); val d = corHex("#ef4444")
    // Pontuação
    Cartao(Modifier.semantics(mergeDescendants = true) {}.testTag("stats:pontuacao")) {
        Text("Pontuação", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, modifier = Modifier.semantics { heading() })
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
                val trilho = c.acao.copy(alpha = 0.16f); val cor = c.acao
                Canvas(Modifier.size(84.dp)) {
                    val w = 9.dp.toPx()
                    val tam = Size(size.width - w, size.height - w)
                    drawArc(trilho, 0f, 360f, false, Offset(w / 2, w / 2), tam, style = Stroke(w))
                    drawArc(cor, -90f, 360f * k.pct / 100f, false, Offset(w / 2, w / 2), tam, style = Stroke(w, cap = StrokeCap.Round))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${k.pct}%", style = TactiPlan.tipos.corpo17, fontWeight = FontWeight.Bold, color = c.tinta)
                    Text("APROV.", style = TactiPlan.tipos.legenda11, color = c.tinta2)
                }
            }
            Column(Modifier.weight(1f)) {
                Text("${k.pts}/${k.ptsMax}", style = TactiPlan.tipos.titulo20, color = c.tinta)
                Text(k.pontosTexto, style = TactiPlan.tipos.corpo13, color = c.tinta2)
                Row(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(4.dp))) {
                    listOf(s.wins to v, s.draws to e, s.losses to d).filter { it.first > 0 }.forEach { (n, cor) ->
                        Box(Modifier.weight(n.toFloat()).heightIn(min = 8.dp).background(cor))
                    }
                }
            }
        }
        Text(k.vedText, style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(top = 8.dp))
    }
    // Momento
    Cartao(Modifier.semantics(mergeDescendants = true) {}) {
        Text("Momento", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
        Text("Últimos jogos", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(top = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
            if (s.form.isEmpty()) Text("—", color = c.tinta2)
            s.form.take(5).forEach { f ->
                val (cor, letra) = when (f.result) { "win" -> v to "V"; "draw" -> e to "E"; else -> d to "D" }
                Box(Modifier.size(26.dp).clip(CircleShape).background(cor).semantics {
                    contentDescription = "${f.date?.let(::dataBR) ?: ""} · ${f.opponent ?: ""} · ${f.feitos}×${f.sofridos}"
                }, contentAlignment = Alignment.Center) {
                    Text(letra, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.White)
                }
            }
        }
        LinhaInfo("Sequência", k.sequencia)
        LinhaInfo("Maior vitória", k.maiorVitoria)
        LinhaInfo("Maior derrota", k.maiorDerrota)
    }
    // Gols
    Cartao(Modifier.semantics(mergeDescendants = true) {}) {
        Text("Gols", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("${s.totalGoalsScored} × ${s.totalGoalsConceded}", style = TactiPlan.tipos.titulo20, color = c.tinta)
                Text("feitos × sofridos", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
            Column(horizontalAlignment = Alignment.End) {
                val saldo = s.goalDifference ?: 0
                Text(k.saldo, style = TactiPlan.tipos.titulo20, color = if (saldo > 0) v else if (saldo < 0) d else c.tinta)
                Text("saldo", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
        }
        LinhaInfo("Média por jogo", k.media)
        LinhaInfo("Jogos sem sofrer", "${s.cleanSheets}")
    }
    // Jogo a jogo
    Cartao(Modifier.semantics(mergeDescendants = true) {}) {
        Text("Jogo a jogo", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
        val futsal = s.modality == "futsal"
        if (!futsal) {
            LinhaInfo("Substituições", "${s.substitutionsTotal}" + if (s.substitutionsTotal > 0) " · ${decimalWeb(s.avgSubstitutionsPerGame)}/jogo" else "")
            s.avgSubstitutionMinute?.let { LinhaInfo("Minuto médio da troca", "${Math.round(it)}'") }
        }
        LinhaInfo("Cartões", "${s.yellowCards} amarelo${if (s.yellowCards == 1) "" else "s"} · ${s.redCards} vermelho${if (s.redCards == 1) "" else "s"}")
        if (futsal) {
            LinhaInfo("Faltas acumuladas", "${s.accumulatedFouls ?: 0}")
            LinhaInfo("6ª falta", "${s.sixthFouls ?: 0}")
        }
        if (s.assists > 0) LinhaInfo("Assistências", "${s.assists}")
    }
    Ranking("Artilheiros", "#22c55e", s.topScorers, { it.goals }, { plural(it.goals, "gol", "gols") }, "Sem gols no período")
    Ranking("Assistências", "#3b82f6", s.topAssisters, { it.assists }, { if (it.assists == 1) "1 assist." else "${it.assists} assists." }, "Sem assistências no período")
    Ranking("Minutagem", "#a855f7", s.topMinutes, { it.minutes }, {
        "${it.minutes} min" + if (it.appearances > 0) " · ${plural(it.appearances, "jogo", "jogos")}" else ""
    }, "Registre escalações e substituições pra calcular minutagem", verTodas.takeIf { s.playerStats.isNotEmpty() })
    if (s.topSubEntries.isNotEmpty()) Ranking("Mais acionados do banco", "#0ea5e9", s.topSubEntries, { it.subEntries }, { plural(it.subEntries, "entrada", "entradas") }, "")
}

@Composable
private fun LinhaInfo(rotulo: String, valor: String) {
    val c = TactiPlan.cores
    Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Text(rotulo, style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.weight(1f))
        Text(valor, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta, textAlign = TextAlign.End)
    }
}

@Composable
private fun Ranking(titulo: String, cor: String, lista: List<JogadorStats>, valor: (JogadorStats) -> Int, texto: (JogadorStats) -> String,
                    vazio: String, verTodas: (() -> Unit)? = null) {
    val c = TactiPlan.cores
    Cartao(Modifier.testTag("stats:ranking:$titulo")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(corHex(cor)))
            Text(titulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                modifier = Modifier.weight(1f).padding(start = 8.dp).semantics { heading() })
            if (verTodas != null) TextButton(onClick = verTodas, modifier = Modifier.testTag("stats:ver-todas")) { Text("Ver todas") }
        }
        if (lista.isEmpty()) Text(vazio, style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(top = 6.dp))
        val max = lista.firstOrNull()?.let(valor)?.coerceAtLeast(1) ?: 1
        lista.take(8).forEachIndexed { i, j ->
            Column(Modifier.padding(top = 8.dp).semantics(mergeDescendants = true) {}) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${i + 1}", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.width(16.dp))
                    Box(Modifier.size(24.dp).clip(CircleShape).background(c.acaoSuave), contentAlignment = Alignment.Center) {
                        Text(j.camisa?.toString() ?: "—", style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold, color = c.acaoTinta)
                    }
                    Text(j.name ?: "", style = TactiPlan.tipos.corpo15, fontWeight = if (i == 0) FontWeight.SemiBold else FontWeight.Normal,
                        color = c.tinta, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(texto(j), style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
                Barra(valor(j).toFloat() / max, corHex(cor), Modifier.padding(top = 4.dp, start = 24.dp))
            }
        }
    }
}

/** "Ver todas" da minutagem: tabela ordenável (Jogador, Min, Jogos, % poss., Tit., Entrou). */
@Composable
fun MinutagemCompletaTela(s: StatsJogos, voltar: () -> Unit) {
    val c = TactiPlan.cores
    var ordem by remember { mutableStateOf(OrdemMinutagem()) }
    val linhas = ordenarMinutagem(s.playerStats, s.minutesPossible, ordem)
    TelaRaiz("Minutagem completa", aoVoltar = voltar, pequena = true) {
        Text(subtituloMinutagem(linhas.size, s.totalMatches, s.minutesPossible), style = TactiPlan.tipos.corpo13, color = c.tinta2)
        Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(8.dp)) {
            Column(Modifier.horizontalScroll(rememberScrollState())) {
                Row {
                    COLUNAS_MINUTAGEM.forEach { (k, r) ->
                        val ativo = ordem.chave == k
                        Text(r + if (ativo) (if (ordem.asc) " ▲" else " ▼") else "", style = TactiPlan.tipos.legenda11,
                            fontWeight = FontWeight.Bold, color = if (ativo) c.acaoTinta else c.tinta2,
                            modifier = Modifier.width(if (k == "name") 150.dp else 64.dp).clickable(role = Role.Button) { ordem = alternarOrdem(ordem, k) }
                                .padding(vertical = 10.dp).testTag("minutagem:col:$k")
                                .semantics { contentDescription = "Ordenar por $r" })
                    }
                }
                HorizontalDivider(color = c.borda)
                if (linhas.isEmpty()) Text("Sem escalações registradas no período.", style = TactiPlan.tipos.corpo15, color = c.tinta2, modifier = Modifier.padding(12.dp))
                linhas.forEach { l ->
                    val j = l.jogador
                    Row(Modifier.heightIn(min = 44.dp).testTag("minutagem:linha:${j.id}"), verticalAlignment = Alignment.CenterVertically) {
                        Text(j.name ?: "", style = TactiPlan.tipos.corpo13, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(150.dp))
                        listOf("${j.minutes}'", "${j.appearances}/${j.calledUp}", "${l.pct}%", "${j.starts}", "${j.subEntries}").forEach {
                            Text(it, style = TactiPlan.tipos.corpo13, color = c.tinta, modifier = Modifier.width(64.dp))
                        }
                    }
                }
            }
        }
        Text(RODAPE_MINUTAGEM, style = TactiPlan.tipos.corpo13, color = c.tinta2)
    }
}

