package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ArmazemMemoria
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.TEXTO_CLUBE_ARQUIVADO
import com.faggin.tactiplan.app.dados.TEXTO_NAO_EDITA
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// Jogo (T2): modelos, editor, formulário do evento, corpo do POST, lista, rotas, fila offline.
// Paridade: JogoTests.swift.

const val JOGO_REAL = """
{"formation":"4-3-3","players":[
{"id":"mp1","session_id":"s1","athlete_id":"a1","status":"starter","minutes_played":90,"jersey_number":null,"slot":0,"minutes_manual":false,"athlete":{"id":"a1","name":"Gabriel Lima","jersey_number":1,"position":"GOL","photo_url":null}},
{"id":"mp2","athlete_id":"a2","status":"starter","minutes_played":"67","jersey_number":"5","slot":5,"minutes_manual":false,"athlete":{"id":"a2","name":"Lucas Martins","jersey_number":8,"position":"VOL"}},
{"id":"mp3","athlete_id":"a3","status":"starter","minutes_played":90,"jersey_number":null,"slot":14,"athlete":{"id":"a3","name":"Rafael Souza","jersey_number":9,"position":"CA"}},
{"id":"mp4","athlete_id":"a4","status":"substitute","minutes_played":23,"jersey_number":null,"slot":null,"athlete":{"id":"a4","name":"Pedro Alves","jersey_number":17,"position":"MEI"}}],
"events":[
{"id":"e1","event_type":"goal_scored","team":"own","goal_type":"bp_off_corner","minute":12,"player_id":"a3","secondary_player_id":"a2","player":{"id":"a3","name":"Rafael Souza","jersey_number":9},"secondary_player":{"id":"a2","name":"Lucas Martins","jersey_number":8},"campo_novo":1},
{"id":"e2","event_type":"substitution","team":"own","goal_type":null,"minute":67,"player_id":"a4","secondary_player_id":"a2","player":null,"secondary_player":null},
{"id":"e3","event_type":"goal_conceded","team":"opponent","goal_type":"org_def","minute":"80","player_id":null,"secondary_player_id":null}]}
"""

const val DIA_REAL = """
{"id":"s1","date":"2026-10-24","day_name":"Sábado","session_type":"match","opponent_name":"Rival FC","match_duration":90,"competition_id":"c1","match_round":"7","match_location":"away","video_full_url":null,"formation":"4-3-3","blocks":[]}
"""

fun pacoteReal(): Pair<DiaDoJogo, DadosDoJogo> =
    JsonApp.decodeFromString(DiaDoJogo.serializer(), DIA_REAL) to JsonApp.decodeFromString(DadosDoJogo.serializer(), JOGO_REAL)

fun editorReal(modalidade: String = "football_11"): EditorJogo {
    val (d, j) = pacoteReal()
    return EditorJogo.carregar(d, j, modalidade)
}

val PLANTEL = listOf(
    AtletaResumo("a1", "Gabriel Lima", 1, "GOL"),
    AtletaResumo("a2", "Lucas Martins", 8, "VOL"),
    AtletaResumo("a3", "Rafael Souza", 9, "CA"),
    AtletaResumo("a4", "Pedro Alves", 17, "MEI"),
    AtletaResumo("a5", "Caio Rocha", 2, "LD"),
    AtletaResumo("a6", "Diego Nunes", 8, "ZAG"),
)

private fun obj(vararg p: Pair<String, Any?>) = JsonObject(p.associate { (k, v) ->
    k to when (v) {
        null -> JsonNull
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        else -> error("tipo")
    }
})

class ModelosJogoTest {
    @Test fun `jogo real decodifica e o editor carrega como o web`() {
        val ed = editorReal()
        assertEquals("4-3-3", ed.formacao)
        assertEquals("Rival FC", ed.dados.adversario)
        assertEquals("away", ed.dados.local)
        assertEquals("7", ed.dados.rodada)
        assertEquals(4, ed.jogadores.size)
        assertEquals(5, ed.jogador("a2")?.camisa)
        assertEquals(1, ed.jogador("a1")?.camisa)
        assertNull(ed.jogador("a3")?.vaga)
        assertEquals(listOf("a3"), ed.semVaga.map { it.atletaId })
        assertEquals("Lucas Martins", ed.jogador("a2")?.nome)
        assertEquals(1, ed.golsFeitos); assertEquals(1, ed.golsSofridos)
        assertEquals(80, ed.eventos[2].minuto)
        assertEquals(67, ed.minutagem["a2"]?.minutos)
        assertEquals(23, ed.minutagem["a4"]?.minutos)
        assertEquals("↑67'", marcadorMinutagem(ed.minutagem["a4"])?.first)
        assertEquals("↓67'", marcadorMinutagem(ed.minutagem["a2"])?.first)
        assertEquals("Titular · saiu aos 67'", dicaMinutagem(ed.minutagem["a2"]))
    }

    @Test fun `jogo sem formacao usa a padrao e duracao padrao da modalidade`() {
        val d = DiaDoJogo("s", "2026-10-24", duracao = null)
        val ed = EditorJogo.carregar(d, DadosDoJogo(), "futsal")
        assertEquals("2-2", ed.formacao)
        assertEquals(40, ed.dados.duracao)
        assertFalse(ed.config.rastreiaMinutos)
        assertEquals("2-3-1", EditorJogo.carregar(d, DadosDoJogo(formacao = "4-4-2"), "football_7").formacao)
    }

    @Test fun `rotulos de evento detalhe e substituicao incompleta`() {
        var ed = editorReal()
        val gol = ed.eventos[0]
        assertEquals("Gol", rotuloDoEvento(gol))
        assertEquals("Bola parada · Escanteio", rotuloTipoGol(gol.tipoGol))
        assertEquals("Rafael Souza · assist. Lucas Martins", ed.detalheDoEvento(gol))
        assertEquals("↓ Sai Lucas Martins · ↑ Entra Pedro Alves", ed.detalheDoEvento(ed.eventos[1]))
        assertEquals("Amarelo (adv.)", rotuloDoEvento(EventoJogo(id = "x", tipo = EVENTO_AMARELO, time = "opponent")))
        ed = ed.adicionarEvento(EventoJogo(id = "e9", tipo = EVENTO_SUBSTITUICAO, time = "own", minuto = 50, jogador2Id = "a1"))
        val inc = ed.eventos.last()
        assertEquals(ProblemaSubstituicao.INCOMPLETA, ed.problemaDaSubstituicao(inc))
        assertEquals("⇄ Substituição (incompleta): sai Gabriel Lima. Toque para completar.", ed.detalheDoEvento(inc))
        ed = ed.adicionarEvento(EventoJogo(id = "e10", tipo = EVENTO_SUBSTITUICAO, time = "own", minuto = 50, jogadorId = "a1", jogador2Id = "a2"))
        assertEquals(ProblemaSubstituicao.TITULAR, ed.problemaDaSubstituicao(ed.eventos.last()))
        assertEquals(listOf("e1", "e9", "e10", "e2", "e3"), ed.eventosOrdenados.map { it.id })
    }
}

class EditorJogoTest {
    @Test fun `colocar na vaga vazia troca de vaga e manda o ocupante para as reservas`() {
        var ed = editorReal()
        var r = ed.colocar(PLANTEL[4], 4); ed = r.first
        assertNull(r.second)
        assertEquals(4, ed.jogador("a5")?.vaga)
        assertEquals(2, ed.jogador("a5")?.camisa)
        r = ed.colocar(PLANTEL[4], 0); ed = r.first
        assertNull(r.second)
        assertEquals(0, ed.jogador("a5")?.vaga); assertEquals(4, ed.jogador("a1")?.vaga)
        r = ed.colocar(PLANTEL[3], 0); ed = r.first
        assertEquals("Caio Rocha foi para as reservas", r.second)
        assertTrue(ed.jogador("a4")!!.titular)
        assertTrue(ed.jogador("a5")!!.reserva && ed.jogador("a5")!!.vaga == null)
        val antes = ed
        r = ed.colocar(PLANTEL[3], 0)
        assertNull(r.second); assertEquals(antes, r.first)
    }

    @Test fun `mover tirar do campo e tirar do jogo`() {
        var ed = editorReal().mover("a3", 9)
        assertEquals(9, ed.jogador("a3")?.vaga)
        ed = ed.mover("a3", 0)
        assertEquals(0, ed.jogador("a3")?.vaga); assertEquals(9, ed.jogador("a1")?.vaga)
        ed = ed.tirarDoCampo("a3")
        assertTrue(ed.jogador("a3")!!.reserva && ed.jogador("a3")!!.vaga == null)
        ed = ed.tirarDoJogo("a3")
        assertNull(ed.jogador("a3"))
    }

    @Test fun `soltar arrastando titular troca de vaga e reserva manda o ocupante para as reservas`() {
        var ed = editorReal().mover("a3", 9)
        ed = ed.soltar("a3", 0).let { (n, aviso) -> assertNull(aviso); n }
        assertEquals(0, ed.jogador("a3")?.vaga); assertEquals(9, ed.jogador("a1")?.vaga)
        val reserva = ed.jogadores.first { it.reserva }
        val (e2, aviso) = ed.soltar(reserva.atletaId, 0)
        assertTrue(e2.jogador(reserva.atletaId)!!.titular); assertEquals(0, e2.jogador(reserva.atletaId)?.vaga)
        assertTrue(e2.jogador("a3")!!.reserva); assertTrue(aviso!!.endsWith("foi para as reservas"))
        assertEquals(e2, e2.soltar(reserva.atletaId, 0).first)
    }

    @Test fun `mascara de hora e corpo da convocacao com a letra`() {
        assertEquals("16:30", mascaraHora("1630")); assertEquals("9", mascaraHora("9")); assertEquals("09:3", mascaraHora("09:3x"))
        assertEquals(mapOf("session_id" to JsonPrimitive("s1")), corpoConvocacao("s1"))
        assertEquals(JsonPrimitive("grande"), corpoConvocacao("s1", "grande")["tamanho_fonte"])
    }

    @Test fun `trocar formacao avisa quem ficou sem vaga e encaixar sugestao`() {
        var ed = editorReal().colocar(PLANTEL[4], 8).first.colocar(PLANTEL[5], 9).first
        val (e2, aviso) = ed.trocarFormacao("4-5-1"); ed = e2
        assertEquals("1 atleta ficou sem vaga na 4-5-1: Diego Nunes. Toque no atleta destacado para reposicionar.", aviso)
        assertEquals("4-5-1", ed.formacao)
        assertNull(ed.trocarFormacao("4-5-1").second)
        val n = ed.semVaga.size
        val (e3, msg) = ed.encaixarSugestao(); ed = e3
        assertEquals("$n encaixado(s) pela posição cadastrada. Confira e ajuste se precisar.", msg)
        assertTrue(ed.semVaga.isEmpty())
        assertEquals("DEF", papelDaVaga("4-5-1", ed.jogador("a6")?.vaga))
    }

    @Test fun `relacionados mantem vaga camisa e manual de quem ja estava`() {
        val ed = editorReal().ajustarMinutos("a2", 70)
            .confirmarRelacionados(listOf("a1" to STATUS_TITULAR, "a2" to STATUS_RESERVA, "a6" to STATUS_TITULAR), PLANTEL)
        assertEquals(listOf("a1", "a2", "a6"), ed.jogadores.map { it.atletaId })
        assertEquals(0, ed.jogador("a1")?.vaga)
        assertNull(ed.jogador("a2")?.vaga)
        assertEquals(5, ed.jogador("a2")?.camisa)
        assertTrue(ed.jogador("a2")!!.minutosManual)
        assertEquals(8, ed.jogador("a6")?.camisa)
        assertEquals("Diego Nunes", ed.jogador("a6")?.nome)
    }

    @Test fun `camisa repetida e limites da camisa e dos minutos`() {
        var ed = editorReal().mudarCamisa("a1", 5)
        assertTrue(ed.camisaRepetida("a1") && ed.camisaRepetida("a2"))
        assertFalse(ed.camisaRepetida("a3"))
        ed = ed.mudarCamisa("a1", 150)
        assertEquals(99, ed.jogador("a1")?.camisa)
        ed = ed.mudarCamisa("a1", null)
        assertTrue(ed.jogador("a1")?.camisa == null && !ed.camisaRepetida("a1"))
        ed = ed.ajustarMinutos("a1", 500)
        assertEquals(200, ed.minutagem["a1"]?.minutos); assertTrue(ed.minutagem["a1"]!!.manual)
        ed = ed.voltarAoAutomatico("a1")
        assertEquals(90, ed.minutagem["a1"]?.minutos); assertFalse(ed.minutagem["a1"]!!.manual)
    }

    @Test fun `corpo do POST igual ao do web`() {
        val ed = editorReal().ajustarMinutos("a1", 88).let { it.copy(dados = it.dados.copy(video = "")) }
        val c = ed.corpoSalvar()
        assertEquals(JsonPrimitive("4-3-3"), c["formation"])
        assertEquals(JsonPrimitive("Rival FC"), c["opponent_name"])
        assertEquals(JsonPrimitive(90), c["match_duration"])
        assertEquals(JsonPrimitive("c1"), c["competition_id"])
        assertEquals(JsonPrimitive("7"), c["match_round"])
        assertEquals(JsonPrimitive("away"), c["match_location"])
        assertEquals(JsonNull, c["video_full_url"])
        assertEquals(JsonPrimitive(true), c["subs_check"])
        // horário/local/apresentação (061): vão sempre (vazio = null), o servidor só mexe quando vêm
        assertEquals(JsonNull, c["match_kickoff"]); assertEquals(JsonNull, c["match_venue"]); assertEquals(JsonNull, c["match_meet_time"])
        val c2 = ed.copy(dados = ed.dados.copy(horario = "16:00", localDoJogo = " Parque do Sabiá ", apresentacao = "14:30")).corpoSalvar()
        assertEquals(JsonPrimitive("16:00"), c2["match_kickoff"]); assertEquals(JsonPrimitive("Parque do Sabiá"), c2["match_venue"])
        assertEquals(JsonPrimitive("14:30"), c2["match_meet_time"])
        val ps = c["players"] as JsonArray
        val es = c["events"] as JsonArray
        assertEquals(obj("athlete_id" to "a1", "status" to "starter", "slot" to 0, "minutes_played" to 88, "minutes_manual" to true,
            "jersey_number" to 1, "name" to "Gabriel Lima"), ps[0])
        assertEquals(JsonNull, (ps[2] as JsonObject)["slot"])
        assertEquals(JsonPrimitive(67), (ps[1] as JsonObject)["minutes_played"])
        assertEquals(JsonPrimitive(23), (ps[3] as JsonObject)["minutes_played"])
        assertEquals(obj("event_type" to "substitution", "team" to "own", "goal_type" to null, "minute" to 67,
            "player_id" to "a4", "secondary_player_id" to "a2"), es[1])
        // O texto que vai na rede: números inteiros sem ".0"
        assertTrue(JsonApp.encodeToString(JsonObject.serializer(), c).contains("\"minutes_played\":88"))
        val fps = editorReal("futsal").ajustarMinutos("a1", 30).corpoSalvar()["players"] as JsonArray
        assertEquals(JsonPrimitive(0), (fps[0] as JsonObject)["minutes_played"])
        assertEquals(JsonPrimitive(false), (fps[0] as JsonObject)["minutes_manual"])
    }

    @Test fun `assinaturas mudam com alteracao`() {
        var ed = editorReal()
        val a = ed.assinatura
        val c = ed.assinaturaConvocacao
        ed = ed.copy(dados = ed.dados.copy(video = "https://youtu.be/x"))
        assertTrue(ed.assinatura != a)
        assertEquals(c, ed.assinaturaConvocacao)
        ed = ed.mudarCamisa("a1", 12)
        assertTrue(ed.assinaturaConvocacao != c)
    }

    @Test fun `conferir antes de salvar pega o que o servidor recusa`() {
        var ed = editorReal()
        assertNull(ed.conferirAntesDeSalvar())
        ed = ed.adicionarEvento(EventoJogo(id = "x", tipo = EVENTO_SUBSTITUICAO, time = "own", minuto = 70, jogadorId = "a1", jogador2Id = "a3"))
        assertEquals("Substituição (70'): Gabriel Lima é titular. Quem entra numa substituição precisa ser reserva.", ed.conferirAntesDeSalvar())
    }
}

class FormEventoTest {
    @Test fun `novo evento com os padroes do web`() {
        val f = FormEvento.novo(duracao = 90, modalidade = "football_11")
        assertTrue(f.tipo == EVENTO_GOL && f.time == "own" && f.momento == "org")
        assertEquals("falta_frontal", f.subtipoBP)
        assertEquals("1'", f.minutoTexto)
        assertEquals(listOf(EVENTO_GOL, EVENTO_GOL_SOFRIDO, EVENTO_AMARELO, EVENTO_VERMELHO, EVENTO_SUBSTITUICAO), f.tipos.map { it.valor })
        val fs = FormEvento.novo(duracao = 40, modalidade = "futsal")
        assertFalse(fs.tipos.any { it.valor == EVENTO_SUBSTITUICAO })
        assertEquals(listOf("Falta Acum.", "6ª Falta"), fs.tipos.map { it.rotulo }.takeLast(2))
        assertEquals(listOf("falta", "corner", "lateral", "penalty", "tiro_livre", "falta_acumulada"), fs.subtiposBP.map { it.valor })
    }

    @Test fun `tempo de jogo acrescimo e passo`() {
        var f = FormEvento.novo(duracao = 90, modalidade = null).mudarMinuto(60)
        assertTrue(f.minutoNoTempo == 45 && f.minutoTexto == "45'")
        f = f.mudarAcrescimo(3)
        assertTrue(f.minutoTexto == "45+3'" && f.minutoTotalAtual == 48)
        f = f.mudarTempo(2)
        assertTrue(f.acrescimo == 0 && f.minutoTexto == "90'")
        f = f.mudarMinuto(22)
        assertTrue(f.minutoTexto == "67'" && f.minutoTotalAtual == 67)
        assertEquals("46-90", f.faixaDoTempo)
        f = f.passo(-22)
        assertTrue(f.tempo == 1 && f.minutoNoTempo == 45)
        f = f.passo(1)
        assertTrue(f.tempo == 2 && f.minutoNoTempo == 1 && f.minutoTexto == "46'")
        f = f.mudarAcrescimo(20)
        assertEquals(15, f.acrescimo)
        f = f.passo(-1)
        assertEquals("90+14'", f.minutoTexto)
        val e = FormEvento.novo(EventoJogo(id = "x", tipo = EVENTO_AMARELO, time = "opponent", minuto = 47), 90, null)
        assertTrue(e.tempo == 1 && e.acrescimo == 2 && e.time == "opponent" && e.minutoTexto == "45+2'")
    }

    @Test fun `substituicao so com quem esta em campo e reservas nao usados`() {
        val ed = editorReal()
        var f = FormEvento.novo(duracao = 90, modalidade = "football_11").mudarTipo(EVENTO_SUBSTITUICAO).mudarTempo(2).mudarMinuto(30)
        assertEquals(listOf("a1", "a4", "a3"), f.opcoesSai(ed).map { it.id })
        assertTrue(f.opcoesEntra(ed).isEmpty())
        assertEquals("Gabriel Lima · camisa 1", f.opcoesSai(ed).first().rotulo)
        f = f.copy(jogador2Id = "a1")
        assertEquals(ResultadoForm.Erro("Escolha quem entra."), f.montar(ed))
        assertEquals("Sai Gabriel Lima, entra — aos 75'", f.resumo(ed))
        val edicao = FormEvento.novo(ed.eventos[1], 90, null)
        assertEquals(listOf("a4"), edicao.opcoesEntra(ed).map { it.id })
        assertTrue(edicao.opcoesSai(ed).any { it.id == "a2" })
        val ev = (edicao.montar(ed) as ResultadoForm.Ok).evento
        assertTrue(ev.id == "e2" && ev.minuto == 67 && ev.jogadorId == "a4" && ev.jogador2Id == "a2")
    }

    @Test fun `previa da minutagem na substituicao`() {
        var ed = editorReal()
        ed = ed.confirmarRelacionados(ed.jogadores.map { it.atletaId to it.status } + ("a5" to STATUS_RESERVA), PLANTEL)
        val f = FormEvento.novo(duracao = 90, modalidade = null).mudarTipo(EVENTO_SUBSTITUICAO).mudarTempo(2).mudarMinuto(25)
            .copy(jogador2Id = "a1", jogadorId = "a5")
        assertEquals("Minutagem automática: Lima 70' · Rocha 20'. Rocha assume a vaga GOL.", f.previaMinutagem(ed))
        assertEquals("Sai Gabriel Lima, entra Caio Rocha aos 70'", f.resumo(ed))
    }

    @Test fun `gol sem autor pede confirmacao e cartao exige atleta do nosso time`() {
        val ed = editorReal()
        var f = FormEvento.novo(duracao = 90, modalidade = null)
        assertEquals(ResultadoForm.ConfirmarSemAutor, f.montar(ed))
        assertEquals(ResultadoForm.Ok(EventoJogo(id = "n1", tipo = EVENTO_GOL, time = "own", tipoGol = "org_off", minuto = 1)),
            f.montar(ed, confirmouSemAutor = true, novoId = "n1"))
        f = f.copy(momento = "bp", subtipoBP = "corner", jogadorId = "a3", jogador2Id = "a2")
        assertEquals("Gol de Rafael Souza (assist. Lucas Martins) em Bola Parada Ofensiva · Escanteio aos 1'", f.resumo(ed))
        val g2 = (f.montar(ed, novoId = "n2") as ResultadoForm.Ok).evento
        assertTrue(g2.tipoGol == "bp_off_corner" && g2.jogador2Id == "a2")
        f = f.mudarTipo(EVENTO_AMARELO)
        assertEquals(ResultadoForm.Erro("Selecione o atleta que recebeu o cartão."), f.montar(ed))
        f = f.copy(time = "opponent")
        assertEquals("Amarelo (adversário) aos 1'", f.resumo(ed))
        val c = (f.montar(ed, novoId = "n3") as ResultadoForm.Ok).evento
        assertTrue(c.time == "opponent" && c.jogadorId == null && c.tipoGol == null)
        f = f.mudarTipo(EVENTO_GOL_SOFRIDO).copy(momento = "trans")
        assertEquals("Gol sofrido em Transição Defensiva aos 1'", f.resumo(ed))
        val s = (f.montar(ed, novoId = "n4") as ResultadoForm.Ok).evento
        assertTrue(s.time == "opponent" && s.tipoGol == "trans_def")
    }
}

class ListaJogosTest {
    private val jogos = listOf(
        JogoDaLista.de("p1", "2026-10-17", "União EC", 2, 1, local = "home", campeonatoId = "c1"),
        JogoDaLista.de("p2", "2026-10-10", "EC Serra", 1, 1, local = "away"),
        JogoDaLista.de("p3", "2026-10-03", "Real Bairro", 0, 2, local = "home", campeonatoId = "c1"),
        JogoDaLista.de("h", "2026-10-22", "Hoje FC"),
        JogoDaLista.de("f2", "2026-11-07", "Longe FC", campeonatoId = "c1"),
        JogoDaLista.de("f1", "2026-10-24", "Rival FC", rodada = "7", local = "away", campeonatoId = "c1"),
    )

    @Test fun `proximo em destaque passados com V E D`() {
        val l = organizarJogos(jogos, "2026-10-22")
        assertEquals("h", l.proximo?.sessaoId)
        assertEquals(listOf("f1", "f2"), l.proximos.map { it.sessaoId })
        assertEquals(listOf("p1", "p2", "p3"), l.passados.map { it.sessaoId })
        assertEquals(Triple(1, 1, 1), Triple(l.vitorias, l.empates, l.derrotas))
        val c1 = organizarJogos(jogos, "2026-10-22", "c1")
        assertEquals("f1", c1.proximo?.sessaoId)
        assertEquals(Triple(1, 0, 1), Triple(c1.vitorias, c1.empates, c1.derrotas))
        assertFalse(jogoFuturo(JogoDaLista.de("x", "2026-10-22", golsFeitos = 1), "2026-10-22"))
    }

    @Test fun `textos da linha e do heroi`() {
        assertEquals("Demo FC 2 × 1 União EC", placarDaLinha(jogos[0], "Demo FC"))
        assertEquals("EC Serra 1 × 1 Demo FC", placarDaLinha(jogos[1], "Demo FC"))
        assertEquals("Sábado, 24/10 · Fora · Rodada 7 · Estadual", detalheDaLinhaJogo(jogos[5], "Estadual"))
        assertEquals("em 2 dias", emQuantosDias("2026-10-24", "2026-10-22"))
        assertEquals("amanhã", emQuantosDias("2026-10-23", "2026-10-22"))
        assertEquals("hoje", emQuantosDias("2026-10-22", "2026-10-22"))
        assertEquals(Resultado.DERROTA, resultadoDo(0, 2))
        assertEquals("2026-09-21" to "2027-02-19", PeriodoJogos.MES.intervalo("2026-10-22"))
    }

    @Test fun `matchesHistory real decodifica`() {
        val j = """{"session_id":"s1","date":"2026-10-17T00:00:00.000Z","opponent":"União EC","goals_scored":"2","goals_conceded":1,"result":"win","match_round":6,"match_location":"home","competition_id":null}"""
        val x = JsonApp.decodeFromString(JogoDaLista.serializer(), j)
        assertTrue(x.data == "2026-10-17" && x.golsFeitos == 2 && x.rodada == "6" && x.campeonatoId == null)
    }

    @Test fun `corpos e nomes dos PDFs`() {
        assertEquals(mapOf("session_id" to JsonPrimitive("s1")), corpoConvocacao("s1"))
        assertEquals(mapOf("club_id" to JsonPrimitive("c"), "start_date" to JsonPrimitive("2026-09-21"), "end_date" to JsonPrimitive("2026-10-22"),
            "filter_type" to JsonPrimitive("custom"), "period_label" to JsonPrimitive("Último mês")),
            corpoRelatorioJogos("c", "2026-09-21", "2026-10-22", "Último mês"))
        assertEquals("Convocacao_Rival_FC_24-10-2026.pdf", nomePdfConvocacao("Rival FC", "2026-10-24"))
        assertEquals("Convocacao_Adversario_24-10-2026.pdf", nomePdfConvocacao(null, "2026-10-24"))
        assertEquals("Jogo_Rival_FC_24-10-2026.pdf", nomePdfRelatorioJogo("Rival FC", "2026-10-24"))
        assertEquals("Analise_Rival_FC_24-10-2026.pdf", nomePdfAnalise("Rival FC", "2026-10-24"))
        assertEquals(mapOf("session_id" to kotlinx.serialization.json.JsonPrimitive("s1")), corpoRelatorioJogo("s1"))
        assertEquals("Desempenho_Demo_FC_3_meses.pdf", nomePdfJogos("Demo FC", "3 meses"))
    }
}

class ApiJogoHttpTest {
    @Test fun `rotas cabecalhos e corpo do salvar`() = runBlocking {
        val srv = MockWebServer().apply { start() }
        try {
            srv.enqueue(MockResponse().setBody("""{"totalMatches":1,"matchesHistory":[{"session_id":"s1","date":"2026-10-17","goals_scored":1,"goals_conceded":0}]}"""))
            srv.enqueue(MockResponse().setBody(JOGO_REAL))
            srv.enqueue(MockResponse().setBody("""[{"id":"a1","name":"Gabriel","jersey_number":"1"}]"""))
            srv.enqueue(MockResponse().setBody("""[{"id":"c1","name":"Estadual","season":2026}]"""))
            srv.enqueue(MockResponse().setBody("""{"message":"Game data saved successfully"}"""))
            val api = ApiJogoHttp(Api(srv.url("/api").toString()), "tpa_abc", "ws-1")
            assertEquals(listOf("s1"), api.listarJogos("c 1", "2026-09-21", "2027-02-19").map { it.sessaoId })
            assertEquals(4, api.jogo("s1").jogadores.size)
            assertEquals(1, api.atletas("c1").first().camisa)
            assertEquals("Estadual · 2026", api.campeonatos("c1").first().rotulo)
            api.salvar("s1", obj("subs_check" to true))
            val caminhos = (1..5).map { srv.takeRequest() }
            assertEquals(listOf(
                "/api/stats/games?clubId=c%201&start_date=2026-09-21&end_date=2027-02-19",
                "/api/games/s1",
                "/api/athletes?status=active&club_id=c1",
                "/api/competitions?clubId=c1",
                "/api/games/s1",
            ), caminhos.map { it.path })
            assertTrue(caminhos.all { it.getHeader("X-Workspace-Id") == "ws-1" && it.getHeader("authorization") == "Bearer tpa_abc" })
            assertEquals("POST", caminhos[4].method)
            assertEquals(obj("subs_check" to true), JsonApp.parseToJsonElement(caminhos[4].body.readUtf8()))
        } finally {
            srv.shutdown()
        }
    }

    @Test fun `mensagens amigaveis de escrita`() {
        assertEquals(MSG_SEM_PERMISSAO_JOGO, mensagemErroJogo(ErroApi(403, null, "Sem permissão pra editar jogos")))
        assertEquals(TEXTO_NAO_EDITA, mensagemErroJogo(ErroApi(402, "READ_ONLY", "assine")))
        assertEquals(TEXTO_CLUBE_ARQUIVADO, mensagemErroJogo(ErroApi(409, "CLUB_ARCHIVED", "x")))
        assertEquals("Substituição (3'): …", mensagemErroJogo(ErroApi(400, "INVALID_SUBSTITUTION", "Substituição (3'): …")))
    }
}

// ---------- fila offline ----------

class ApiJogoFalsa(var dia: DiaDoJogo, var jogoAtual: DadosDoJogo) : ApiJogo {
    var erroSalvar: Exception? = null
    var erroLer: Exception? = null
    val salvos = mutableListOf<JsonObject>()
    override suspend fun listarJogos(clubeId: String, inicio: String, fim: String) = emptyList<JogoDaLista>()
    override suspend fun dia(sessaoId: String): DiaDoJogo { erroLer?.let { throw it }; return dia }
    override suspend fun jogo(sessaoId: String): DadosDoJogo { erroLer?.let { throw it }; return jogoAtual }
    override suspend fun atletas(clubeId: String) = PLANTEL
    override suspend fun campeonatos(clubeId: String) = emptyList<Campeonato>()
    override suspend fun salvar(sessaoId: String, corpo: JsonObject) { erroSalvar?.let { throw it }; salvos.add(corpo) }
}

class FilaJogosTest {
    private val pac = pacoteReal()
    private val api = ApiJogoFalsa(pac.first, pac.second)
    private val fila = FilaJogos(ArmazemMemoria())
    private val sinc = SincronizadorJogos(ServicoJogo(api, "c1", "football_11"), fila)
    private val ed = EditorJogo.carregar(pac.first, pac.second, "football_11")

    @Test fun `guardar junta alteracoes e mantem a base da primeira vez`() {
        fila.guardar(ed, "B1", 2, 10)
        val p = fila.guardar(ed.copy(dados = ed.dados.copy(video = "v")), "B2", 3, 20)
        assertTrue(p.alteracoes == 5 && p.base == "B1" && p.editor.dados.video == "v")
        assertEquals(listOf("s1"), fila.todas().map { it.sessaoId })
        assertEquals("Sem conexão · 5 alterações para enviar", textoFila(5, true))
        assertEquals("1 alteração para enviar", textoFila(1, false))
        // o editor volta igual do disco
        assertEquals(p.editor, fila.pendencia("s1")?.editor)
    }

    @Test fun `envia sem conflito quando o servidor nao mudou`() = runBlocking {
        val local = ed.adicionarEvento(EventoJogo(id = "local-1", tipo = EVENTO_GOL, time = "own", tipoGol = "org_off", minuto = 88, jogadorId = "a3"))
        fila.guardar(local, ed.assinaturaServidor, 1)
        assertEquals(ResultadoEnvio.Enviado(false), sinc.enviar("s1"))
        assertNull(fila.pendencia("s1"))
        assertEquals(listOf(local.corpoSalvar()), api.salvos)
    }

    @Test fun `conflito vale o local e avisa`() = runBlocking {
        fila.guardar(ed, ed.assinaturaServidor, 1)
        api.jogoAtual = api.jogoAtual.copy(eventos = emptyList())
        assertEquals(ResultadoEnvio.Enviado(true), sinc.enviar("s1"))
        assertEquals(ed.corpoSalvar(), api.salvos.first())
    }

    @Test fun `sem rede fica na fila e recusa fica marcada`() = runBlocking {
        fila.guardar(ed, null, 1)
        api.erroSalvar = ErroApi.offline()
        assertEquals(ResultadoEnvio.SemRede, sinc.enviar("s1"))
        assertNull(fila.pendencia("s1")?.erro)
        api.erroSalvar = ErroApi(402, "READ_ONLY", "x")
        assertEquals(ResultadoEnvio.Recusado(TEXTO_NAO_EDITA), sinc.enviar("s1"))
        assertEquals(TEXTO_NAO_EDITA, fila.pendencia("s1")?.erro)
        api.erroSalvar = ErroApi(401, null, "x")
        if (sinc.enviar("s1") !is ResultadoEnvio.SessaoEncerrada) fail("401 encerra a sessão")
        api.erroSalvar = null
        api.erroLer = ErroApi(503, null, "x")
        fila.remover("s1")
        fila.guardar(ed, "B", 1)
        assertEquals(ResultadoEnvio.SemRede, sinc.enviar("s1"))
        api.erroLer = null
        assertEquals(ResultadoEnvio.NadaAEnviar, sinc.enviar("nada"))
    }

    @Test fun `pendencia que o servidor recusaria nao e enviada`() = runBlocking {
        val ruim = ed.adicionarEvento(EventoJogo(id = "x", tipo = EVENTO_SUBSTITUICAO, time = "own", minuto = 70, jogadorId = "a1", jogador2Id = "a3"))
        fila.guardar(ruim, null, 1)
        val r = sinc.enviar("s1")
        assertTrue(r is ResultadoEnvio.Recusado && r.mensagem.contains("é titular"))
        assertTrue(api.salvos.isEmpty())
    }

    @Test fun `cache do pacote para abrir sem sinal`() {
        fila.guardarCache(PacoteJogo(pac.first, pac.second, PLANTEL, emptyList()))
        assertEquals(pac.second, fila.cache("s1")?.jogo)
        assertEquals(6, fila.cache("s1")?.atletas?.size)
        assertTrue(fila.todas().isEmpty())
    }
}
