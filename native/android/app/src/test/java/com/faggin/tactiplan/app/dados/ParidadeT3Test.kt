package com.faggin.tactiplan.app.dados

import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.ORDEM_POSICAO
import com.faggin.tactiplan.app.dados.elenco.formatarNome
import com.faggin.tactiplan.app.dados.elenco.ordenarAtletas
import com.faggin.tactiplan.app.dados.elenco.posicoesDaModalidade
import com.faggin.tactiplan.app.dados.estatisticas.JogadorStats
import com.faggin.tactiplan.app.dados.estatisticas.JogoPlacar
import com.faggin.tactiplan.app.dados.estatisticas.OrdemMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.StatsJogos
import com.faggin.tactiplan.app.dados.estatisticas.cardsJogos
import com.faggin.tactiplan.app.dados.estatisticas.fimAoMudarInicio
import com.faggin.tactiplan.app.dados.estatisticas.formatarMinutos
import com.faggin.tactiplan.app.dados.estatisticas.ordenarMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.periodoDoFiltro
import com.faggin.tactiplan.app.dados.estatisticas.semanaVizinha
import com.faggin.tactiplan.app.dados.jogo.arquivoDoRepo
import com.faggin.tactiplan.app.dados.staff.DESCRICOES_PAPEL
import com.faggin.tactiplan.app.dados.staff.GRUPOS_PERMISSAO
import com.faggin.tactiplan.app.dados.staff.PADROES_PAPEL
import com.faggin.tactiplan.app.dados.staff.PERMISSOES
import com.faggin.tactiplan.app.dados.staff.ROTULOS_PAPEL
import com.faggin.tactiplan.app.dados.staff.ROTULOS_PERMISSAO
import com.faggin.tactiplan.app.dados.staff.permissoesEfetivas
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// PARIDADE T3 com o web: native/paridade/t3.json é gerado do código do web
// (node native/paridade/gerar-t3.mjs; o npm test do backend falha se ficar desatualizado).
// O iPhone lê o mesmo arquivo (ParidadeT3Tests.swift).

private fun t3(): JsonObject = JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/t3.json").readText()) as JsonObject
private fun JsonElement?.o() = this as JsonObject
private fun JsonElement?.l() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.s(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
private fun JsonElement?.i(): Int? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.doubleOrNull?.toInt()
private fun JsonElement?.d(): Double? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.doubleOrNull
private fun JsonElement?.strs(): List<String> = l().map { it.s()!! }

class ParidadeT3Test {
    private val d = t3()

    @Test fun `formatarNome igual ao web`() {
        val casos = d["elenco"].o()["formatarNome"].l()
        assertTrue(casos.size >= 10)
        casos.forEach { c -> assertEquals(c.o()["entrada"].s(), c.o()["saida"].s(), formatarNome(c.o()["entrada"].s()!!)) }
    }

    @Test fun `posicoes, modalidades e ordem por posicao`() {
        val e = d["elenco"].o()
        e["posicoes"].o().forEach { (mod, lista) ->
            assertEquals(mod, lista.l().map { it.o()["code"].s() to it.o()["name"].s() },
                posicoesDaModalidade(mod).map { it.codigo to it.nome })
        }
        assertEquals(e["ordemPosicao"].o().mapValues { it.value.i() }, ORDEM_POSICAO)
        assertEquals(e["modalidades"].o().mapValues { it.value.s() }, com.faggin.tactiplan.app.dados.cadastros.MODALIDADES.toMap())
        val atletas = e["atletas"].l().mapIndexed { i, a -> Atleta("a$i", a.o()["name"].s()!!, a.o()["position"].s()) }
        assertEquals(e["porPosicao"].strs(), ordenarAtletas(atletas, porPosicao = true).map { it.nome })
        assertEquals(e["porNome"].strs(), ordenarAtletas(atletas, porPosicao = false).map { it.nome })
    }

    @Test fun `papeis, permissoes e efetivas`() {
        val s = d["staff"].o()
        assertEquals(s["permissoes"].strs(), PERMISSOES)
        assertEquals(s["rotulos"].o().mapValues { it.value.s() }, ROTULOS_PERMISSAO)
        assertEquals(s["grupos"].l().map { it.o()["label"].s() to it.o()["items"].strs() }, GRUPOS_PERMISSAO.map { it.rotulo to it.itens })
        assertEquals(s["rotulosPapel"].o().mapValues { it.value.s() }, ROTULOS_PAPEL)
        assertEquals(s["descricoesPapel"].o().mapValues { it.value.s() }, DESCRICOES_PAPEL)
        assertEquals(s["padroes"].o().mapValues { it.value.strs() }, PADROES_PAPEL)
        s["efetivas"].l().forEach { c ->
            val m = c.o()
            val perms = (m["permissions"] as? JsonArray)?.map { it.s()!! }
            assertEquals(m.toString(), m["efetivas"].strs(), permissoesEfetivas(m["role"].s(), perms).sorted())
        }
    }

    @Test fun `periodos, ajustes e navegacao da semana`() {
        val e = d["estatisticas"].o()
        e["periodos"].l().forEach { c ->
            val p = periodoDoFiltro(c.o()["filtro"].s()!!, c.o()["hoje"].s()!!)!!
            assertEquals(c.toString(), c.o()["inicio"].s(), p.inicio)
            assertEquals(c.toString(), c.o()["fim"].s(), p.fim)
            c.o()["semana"].s()?.let { assertEquals(c.toString(), it, p.semana) }
        }
        e["ajustes"].l().forEach { c ->
            assertEquals(c.o()["semestre"].s(), fimAoMudarInicio("semester", c.o()["inicio"].s()!!))
            assertEquals(c.o()["ano"].s(), fimAoMudarInicio("1-year", c.o()["inicio"].s()!!))
        }
        e["navegacao"].l().forEach { c ->
            val seg = c.o()["segunda"].s()!!
            assertEquals(c.o()["semana"].s(), SemanaISO.de(seg).identificador)
            assertEquals(c.o()["anterior"].s(), semanaVizinha(seg, -1).identificador)
            assertEquals(c.o()["seguinte"].s(), semanaVizinha(seg, 1).identificador)
        }
    }

    @Test fun `formatMinutes do web`() {
        d["estatisticas"].o()["formatMinutes"].l().forEach { c -> assertEquals(c.o()["texto"].s(), formatarMinutos(c.o()["min"].i())) }
    }

    @Test fun `cards de jogos iguais ao GameSummaryCards`() {
        d["estatisticas"].o()["cards"].l().forEach { c ->
            val en = c.o()["entrada"].o()
            val bw = en["biggestWin"] as? JsonObject
            val st = StatsJogos(
                totalMatches = en["totalMatches"].i() ?: 0, wins = en["wins"].i() ?: 0, draws = en["draws"].i() ?: 0, losses = en["losses"].i() ?: 0,
                pointsWon = en["pointsWon"].i(), pointsPlayed = en["pointsPlayed"].i(), winStreak = en["winStreak"].i(),
                unbeatenStreak = en["unbeatenStreak"].i(), goalDifference = en["goalDifference"].i(),
                avgGoalsScored = en["avgGoalsScored"].d(), avgGoalsConceded = en["avgGoalsConceded"].d(),
                biggestWin = bw?.let { JogoPlacar(it["goals_scored"].i()!!, it["goals_conceded"].i()!!, it["opponent"].s()) },
            )
            val r = cardsJogos(st)
            val sa = c.o()["saida"].o()
            assertEquals(sa["pct"].i(), r.pct)
            assertEquals(sa["pts"].i(), r.pts)
            assertEquals(sa["ptsMax"].i(), r.ptsMax)
            assertEquals(sa["sequencia"].s(), r.sequencia)
            assertEquals(sa["vedText"].s(), r.vedText)
            assertEquals(sa["saldo"].s(), r.saldo)
            assertEquals(sa["media"].s(), r.media)
            assertEquals(sa["maiorVitoria"].s(), r.maiorVitoria)
            assertEquals(sa["pontosTexto"].s(), r.pontosTexto)
        }
    }

    @Test fun `minutagem completa ordenavel igual ao web`() {
        val m = d["estatisticas"].o()["minutagem"].o()
        val js = m["jogadores"].l().map { p ->
            val o = p.o()
            JogadorStats(o["athlete_id"].s()!!, o["name"].s(), minutes = o["minutes"].i()!!, appearances = o["appearances"].i()!!,
                starts = o["starts"].i()!!, subEntries = o["sub_entries"].i()!!, calledUp = o["called_up"].i()!!)
        }
        val possiveis = m["minutesPossible"].i()!!
        m["ordens"].l().forEach { c ->
            val o = c.o()
            val r = ordenarMinutagem(js, possiveis, OrdemMinutagem(o["key"].s()!!, o["dir"].s() == "asc"))
            assertEquals(o.toString(), o["ordem"].l().map { it.o()["id"].s() to it.o()["pct"].i() }, r.map { it.jogador.id to it.pct })
        }
    }
}
