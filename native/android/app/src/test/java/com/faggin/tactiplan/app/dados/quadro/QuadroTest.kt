package com.faggin.tactiplan.app.dados.quadro

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.Conta
import com.faggin.tactiplan.app.dados.ContextoClube
import com.faggin.tactiplan.app.dados.ErroApi
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuadroTest {
    private val srv = MockWebServer().apply { start() }
    private val api = ApiQuadroHttp(Api(srv.url("/api").toString()), "tpa_1", "ws-1")

    @After fun fim() = srv.shutdown()

    @Test fun `rotas do quadro com token e conta`() = runTest {
        srv.enqueue(MockResponse().setBody("""[{"id":"p1","name":"Saída","keyframes":[{"index":0,"elements":[],"drawings":[]}],"club_name":"Sub-17"}]"""))
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"p2","name":"Nova"}"""))
        srv.enqueue(MockResponse().setBody("""{"id":"p1","name":"Renomeada"}"""))
        srv.enqueue(MockResponse().setBody("""{"message":"ok"}"""))
        val l = api.listar()
        assertEquals(listOf("p1"), l.map { it.id }); assertEquals(1, l[0].totalQuadros); assertEquals("Sub-17", l[0].clubeNome)
        assertEquals("p2", api.criar(JsonObject(mapOf("name" to txt("Nova")))).id)
        assertEquals("Renomeada", api.atualizar("p1", JsonObject(mapOf("name" to txt("Renomeada")))).nome)
        api.excluir("p1")
        val ps = (1..4).map { srv.takeRequest() }
        assertEquals(listOf("GET /api/plays", "POST /api/plays", "PUT /api/plays/p1", "DELETE /api/plays/p1"), ps.map { "${it.method} ${it.path}" })
        assertTrue(ps.all { it.getHeader("X-Workspace-Id") == "ws-1" && it.getHeader("authorization") == "Bearer tpa_1" })
    }

    @Test fun `erro do servidor vira mensagem`() = runTest {
        srv.enqueue(MockResponse().setResponseCode(402).setBody("""{"error":"Esta conta está em modo só leitura","code":"READ_ONLY"}"""))
        try { api.criar(JsonObject(emptyMap())); error("devia falhar") } catch (e: ErroApi) {
            assertEquals("Esta conta está em modo só leitura", mensagemErroQuadro(e))
        }
        assertEquals("Você não tem permissão para editar o quadro tático.", mensagemErroQuadro(ErroApi(403, null, "Sem permissão")))
    }

    @Test fun `busca e resumo da lista`() {
        val js = listOf(
            Jogada(JsonObject(mapOf("id" to txt("1"), "name" to txt("Saída de bola"), "keyframes" to JsonArray(List(3) { JsonObject(emptyMap()) }),
                "club_name" to txt("Sub-17"), "updated_at" to txt("2026-10-22T02:00:00.000Z")))),
            Jogada(JsonObject(mapOf("id" to txt("2"), "name" to txt("Escanteio curto"), "description" to txt("bola parada"), "keyframes" to JsonArray(listOf(JsonObject(emptyMap())))))),
        )
        assertEquals(listOf("1"), filtrarJogadas(js, "SAIDA").map { it.id })
        assertEquals(listOf("2"), filtrarJogadas(js, "parada").map { it.id })
        assertEquals(2, filtrarJogadas(js, "  ").size)
        val brt = ZoneId.of("America/Sao_Paulo")
        assertEquals("3 quadros · 21/10/2026 · criada em Sub-17", resumoJogada(js[0], brt))
        assertEquals("1 quadro", resumoJogada(js[1], brt))
    }

    @Test fun `duplicar e renomear mandam o mesmo corpo do salvar do web`() {
        val j = Jogada(JsonObject(mapOf("id" to txt("1"), "name" to txt("Saída"), "description" to txt("d"), "field_type" to txt("futsal"),
            "keyframes" to JsonArray(listOf(JsonObject(mapOf("index" to num(0), "elements" to JsonArray(emptyList()))))))))
        val c = corpoDaJogada(j, nomeDaCopia(j.nome), clubeId = "c1")
        assertEquals("Saída (cópia)", c["name"].texto()); assertEquals("d", c["description"].texto())
        assertEquals("c1", c["club_id"].texto()); assertEquals("futsal", c["field_type"].texto())
        assertEquals("""[{"index":0,"elements":[],"drawings":[]}]""", c["keyframes"].toString())
        assertNull(nomeValidoJogada("  ")); assertEquals("A", nomeValidoJogada(" A "))
    }

    @Test fun `permissoes do quadro`() {
        fun ctx(perms: List<String>, leitura: Boolean, arquivado: Boolean = false) = ContextoClube(
            Conta(id = "w", nome = "W", permissoes = perms, somenteLeitura = leitura), null, perms.toSet(), leitura || arquivado, "")
        assertEquals(PermissoesQuadro(true, true), permissoesQuadro(ctx(listOf("tactical:view", "tactical:edit"), false)))
        assertEquals(PermissoesQuadro(true, false), permissoesQuadro(ctx(listOf("tactical:view", "tactical:edit"), true)))
        assertEquals(PermissoesQuadro(true, false), permissoesQuadro(ctx(listOf("tactical:view"), false)))
        assertTrue(permissoesQuadro(ctx(listOf("tactical:view", "tactical:edit"), false, arquivado = true)).editar)
    }

    @Test fun `play avanca pelo relogio e para no ultimo quadro`() {
        assertNull(Reproducao.iniciar(0, 1))
        var r = Reproducao.iniciar(2, 3)!!
        assertEquals(0, r.quadro)
        r = r.avancar(750.0, 1.0)
        assertEquals(0, r.quadro); assertEquals(0.5, r.t, 1e-9)
        r = r.avancar(750.0, 1.0)
        assertEquals(1, r.quadro); assertFalse(r.terminou)
        r = r.avancar(750.0, 2.0)
        assertTrue(r.terminou); assertEquals(2, r.quadro)
        val q = Reproducao.iniciar(0, 4)!!.avancar(10_000.0, 0.5)
        assertTrue(q.terminou); assertEquals(3, q.quadro)
    }

    @Test fun `toque acha a peca e o desenho de cima`() {
        val d = DimensoesCanvas(800.0, 500.0, 48.0, 30.0, 700.0, 450.0)
        val ps = listOf(Peca(mapOf("id" to txt("a"), "type" to txt("player"), "x" to num(50), "y" to num(50))),
            Peca(mapOf("id" to txt("b"), "type" to txt("ball"), "x" to num(51), "y" to num(50))))
        assertEquals("b", pecaNoPonto(ps, 357.0, 225.0, d)?.id)
        assertEquals("a", pecaNoPonto(ps, 340.0, 225.0, d)?.id)
        assertNull(pecaNoPonto(ps, 10.0, 10.0, d))
        val ds = listOf(
            Desenho(mapOf("id" to txt("s"), "drawType" to txt("arrow_straight"), "x1" to num(0), "y1" to num(0), "x2" to num(100), "y2" to num(0))),
            Desenho(mapOf("id" to txt("z"), "drawType" to txt("zone_rect"), "x" to num(10), "y" to num(10), "w" to num(20), "h" to num(20))),
        )
        assertEquals("s", desenhoNoPonto(ds, 350.0, 5.0, d)?.id)
        assertEquals("z", desenhoNoPonto(ds, 140.0, 90.0, d)?.id)
        assertNull(desenhoNoPonto(ds, 600.0, 400.0, d))
    }

    @Test fun `rascunho de desenho vira o mesmo objeto do web`() {
        val d = dimensoesCanvas(844.0, 390.0, "football_11", "full", 64.0)
        val z = RascunhoDesenho("zone_rect", "#ef4444", emptyList(), inicioX = 40.0, inicioY = 30.0).mover(20.0, 60.0).terminar(20.0, 60.0, d)!!
        assertEquals("""{"drawType":"zone_rect","x":20,"y":30,"w":20,"h":30,"color":"rgba(239,68,68,0.15)","strokeColor":"rgba(239,68,68,0.5)"}""", JsonObject(z).toString())
        val l = RascunhoDesenho("free_draw", "#fff", emptyList(), inicioX = 1.0, inicioY = 1.0)
        assertNull(l.terminar(1.0, 1.0, d))
        val lv = l.mover(2.0, 2.0).terminar(2.0, 2.0, d)!!
        assertEquals("[1,1,2,2]", lv["points"].toString()); assertNull(lv["dash"]); assertEquals("2.5", lv["strokeWidth"].toString())
        assertNull(dadosTexto("  ", 1.0, 1.0, "#fff"))
        assertEquals("Oi", dadosTexto(" Oi ", 1.0, 2.0, "#fff")!!["text"].texto())
        val s = RascunhoDesenho("arrow_straight", "#fff", listOf(8.0, 5.0), inicioX = 50.0, inicioY = 50.0).mover(500.0, 50.0).terminar(500.0, 50.0, d)!!
        assertEquals(limitesArrasto(d, 4.0).maxX, numeroDoJs(s["x2"]), 1e-9)
        assertEquals("[8,5]", s["dash"].toString())
    }

    @Test fun `cores css do desenho nativo`() {
        assertEquals(CorRGBA(1.0, 0.0, 0.0, 1.0), corCss("#ff0000"))
        assertEquals(0x99 / 255.0, corCss("#3b82f699")!!.a, 1e-9)
        assertEquals(CorRGBA(250 / 255.0, 204 / 255.0, 21 / 255.0, 0.15), corCss("rgba(250, 204, 21, 0.15)"))
        assertEquals(CorRGBA(1.0, 1.0, 1.0), corCss("white"))
        assertNull(corCss("bogus"))
        assertEquals(0xFFFF0000.toInt(), corCss("#ff0000")!!.argb())
    }

    @Test fun `nome do video e subtitulo`() {
        assertEquals("Saída_de_bola_4_3_3_2026-10-22.mp4", nomeArquivoVideo("Saída de bola 4-3-3", "2026-10-22"))
        assertEquals("jogada_2026-10-22.mp4", nomeArquivoVideo("", "2026-10-22"))
        assertEquals("Futebol 11 · campo inteiro · quadro 2 de 3", subtituloEditor("football_11", "full", 1, 3))
        assertEquals("40 × 20 m", rotuloMedidas("futsal"))
    }

    @Test fun `caminho do desenho livre passa por todos os pontos`() {
        val c = caminhoLivre(listOf(0.0, 0.0, 10.0, 0.0, 20.0, 10.0, 30.0, 10.0))
        assertEquals(PassoCaminho.Mover(0.0, 0.0), c.first())
        assertTrue(c[1] is PassoCaminho.Quadratica)
        val ult = c.last() as PassoCaminho.Quadratica
        assertEquals(30.0, ult.x, 0.0); assertEquals(10.0, ult.y, 0.0)
        assertEquals(listOf(PassoCaminho.Mover(0.0, 0.0), PassoCaminho.Linha(5.0, 5.0)), caminhoLivre(listOf(0.0, 0.0, 5.0, 5.0)))
    }

    @Test fun `jogador do plantel, goleiro, bola e objeto`() {
        val at = dadosJogadorAtleta("B", "at1", "Lia", null, 4.0) { 0.5 }
        assertEquals("4", at["jerseyNumber"].toString()); assertEquals("at1", at["athleteId"].texto()); assertEquals("50", at["x"].toString())
        assertEquals(JsonPrimitive(false), at["isGoalkeeper"])
        assertEquals("9", dadosJogadorAtleta("A", "x", "x", 9, 2.0) { 0.0 }["jerseyNumber"].toString())
        assertEquals("95", dadosGoleiro("B")["x"].toString()); assertEquals("GOL", dadosGoleiro("A")["name"].texto())
        assertEquals(JsonNull, dadosBola()["team"])
        assertEquals("65", dadosObjeto("cone") { 1.0 }["x"].toString())
    }
}
