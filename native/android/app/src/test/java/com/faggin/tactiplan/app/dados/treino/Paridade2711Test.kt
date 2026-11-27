package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.elenco.Ancora
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.FormAtleta
import com.faggin.tactiplan.app.dados.elenco.corpoAtleta
import com.faggin.tactiplan.app.dados.elenco.montarCampograma
import com.faggin.tactiplan.app.dados.elenco.posicaoComLado
import com.faggin.tactiplan.app.dados.estatisticas.StatsTreino
import com.faggin.tactiplan.app.dados.jogo.arquivoDoRepo
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// Paridade com o web de 21–27/11/2026 (spec native/PARIDADE-27-11.md): transição, contagem de atividades,
// goleiro, sessões salvas, arquivos da semana, anexos da sessão, escudos, fotos, goleiros nas estatísticas,
// lado do zagueiro e campograma. iOS: Paridade2711Tests.swift.

private fun dia(json: String): Dia = JsonApp.decodeFromString(Dia.serializer(), json).normalizado()
private fun bloco(nome: String, ordem: Int, min: Int?, dim: String? = "tatico") =
    """{"id":"b$ordem","name":"$nome","order":$ordem,"activity":{"id":"a$ordem","duration_minutes":${min ?: "null"},"files_count":1,"contents":[{"name":"X","dimension":"$dim"}]}}"""

class Paridade2711Test {
    private val srv = MockWebServer().apply { start() }
    private val api = ApiTreinoHttp(Api(srv.url("/api").toString()), "tpa_abc", "ws-1", fronteira = { "FRONTEIRA" })

    @After fun fim() = srv.shutdown()

    @Test fun `atividades nao contam academia, ativacao nem goleiro, goleiro a parte`() {
        val d = dia("""{"id":"s","date":"2026-11-20","session_type":"training","blocks":[
            ${bloco("Academia", 1, 20)},${bloco("Ativação", 2, 15)},${bloco("Atividade 1", 3, 30)},${bloco("Atividade 2", 4, 25)},
            ${bloco("Treino de goleiro", 6, 40)}]}""")
        val r = resumoDoDia(d)
        assertEquals(2, r.atividades)
        assertEquals(5, r.blocosComAtividade)
        assertEquals(90, r.minutos)
        assertEquals(40, r.minutosGoleiro)
        assertEquals(5, r.anexos)
        assertEquals("90 min · +40′ gol", detalheDaLinha(r))
    }

    @Test fun `treino de transicao fica fora do total do dia`() {
        val d = dia("""{"id":"m","date":"2026-11-20","session_type":"training","periodo":"manha","blocks":[${bloco("Atividade 1", 3, 60)}],
            "periodos":[
             {"id":"m","date":"2026-11-20","session_type":"training","periodo":"manha","blocks":[${bloco("Atividade 1", 3, 60)}]},
             {"id":"t","date":"2026-11-20","session_type":"training","periodo":"tarde","treino_transicao":true,"blocks":[${bloco("Atividade 1", 3, 45, "fisico")}]}]}""")
        assertTrue(d.listaPeriodos[1].transicao)
        val r = resumoDoDiaInteiro(d)
        assertEquals(60, r.minutos)
        assertEquals(2, r.atividades)
        assertEquals(listOf("tatico"), r.pilares)
        assertNull(divisaoMinutos(d))
        assertEquals("Manhã · Tático + Tarde · Transição", tituloDaLinhaDoDia(d))
        val so = d.listaPeriodos[1].copy(periodos = null)
        assertEquals("Manhã · Transição".replace("Manhã", "Tarde"), tituloDaLinhaDoDia(so))
        assertTrue(resumoDoDia(so).transicao)
        assertEquals("Transição · fora do total", detalheDaLinha(resumoDoDia(so)))
        // em jogo o campo não vale
        assertFalse(dia("""{"id":"j","date":"2026-11-20","session_type":"match","treino_transicao":true}""").transicao)
    }

    @Test fun `transicao vai no PUT do tipo`() = runBlocking {
        srv.enqueue(MockResponse().setBody("{}"))
        api.mudarTransicao("s1", true)
        val r = srv.takeRequest()
        assertEquals("PUT", r.method)
        assertEquals("/api/sessions/s1/type", r.path)
        val o = JsonApp.parseToJsonElement(r.body.readUtf8()).jsonObject
        assertEquals("training", o["session_type"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, o["opponent_name"])
        assertEquals(true, o["treino_transicao"]!!.jsonPrimitive.booleanOrNull)
    }

    @Test fun `sessoes salvas - lista, origem, resumo e pilares`() = runBlocking {
        srv.enqueue(MockResponse().setBody("""{"data":[{"id":"m1","nome":"Rondos","origem_data":"2026-11-20","origem_periodo":"manha",
            "atividades":2,"minutos":"55","goleiro":20,"midias":1,"blocos":[
             {"ordem":3,"nome":"Atividade 1","titulo":"Rondo 4x2","pilar":"tatico","minutos":30,"midias":[{"url":"/uploads/session-files/x.jpg","tipo":"image","nome":"foto"}]},
             {"ordem":2,"nome":"Ativação","conteudo":"Mobilidade","pilar":"fisico","minutos":25,"midias":[]},
             {"ordem":6,"nome":"Treino de goleiro","titulo":"Saídas","pilar":"tecnico","minutos":20},
             {"ordem":4,"nome":"Atividade 2"}]},
            {"id":"m2","nome":"Antiga","atividades":1,"minutos":0,"blocos":[]}]}"""))
        val l = api.sessoesSalvas()
        assertEquals("/api/treinos-modelo", srv.takeRequest().path)
        assertEquals(2, l.size)
        val s = l[0]
        assertEquals("Treino de sexta, 20/11 · Manhã", origemDaSessao(s))
        assertNull(origemDaSessao(l[1]))
        assertEquals("2 atividades · 55 min · +20′ gol · 1 mídia", resumoDaSessaoSalva(s))
        assertEquals(listOf("Ativação", "Atividade 1", "Atividade 2", "Treino de goleiro"), s.blocosEmOrdem.map { it.nome })
        assertEquals(listOf("tatico" to 30, "fisico" to 25), pilaresDaSessaoSalva(s))
        assertEquals("Mobilidade", s.blocos[1].rotulo)
        assertFalse(s.blocos[3].preenchido)
    }

    @Test fun `sessoes salvas - salvar, renomear, aplicar e 409`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"n1","nome":"X"}"""))
        assertEquals("n1", api.salvarSessao("  Treino de sexta  ", "s1"))
        val r1 = srv.takeRequest()
        assertEquals("POST", r1.method)
        val o1 = JsonApp.parseToJsonElement(r1.body.readUtf8()).jsonObject
        assertEquals("Treino de sexta", o1["nome"]!!.jsonPrimitive.content)
        assertEquals("s1", o1["session_id"]!!.jsonPrimitive.content)

        srv.enqueue(MockResponse().setBody("""{"id":"n1"}"""))
        api.renomearSessaoSalva("n1", "Novo")
        val r2 = srv.takeRequest()
        assertEquals("PATCH", r2.method); assertEquals("/api/treinos-modelo/n1", r2.path)

        srv.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":"Esse treino já tem 3 atividades.","code":"TEM_ATIVIDADES","atividades":3}"""))
        try { api.aplicarSessaoSalva("n1", "s9", false); fail("devia pedir confirmação") } catch (e: ErroApi) {
            assertEquals(3, atividadesQueSeraoSubstituidas(e))
        }
        val r3 = srv.takeRequest()
        assertEquals("/api/treinos-modelo/n1/aplicar", r3.path)
        assertFalse(JsonApp.parseToJsonElement(r3.body.readUtf8()).jsonObject.containsKey("substituir"))
        srv.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.aplicarSessaoSalva("n1", "s9", true)
        assertEquals(true, JsonApp.parseToJsonElement(srv.takeRequest().body.readUtf8()).jsonObject["substituir"]!!.jsonPrimitive.booleanOrNull)
        assertEquals("Esse treino já tem 1 atividade. Substituir pelas da sessão salva?", textoSubstituir(1))
        assertNull(atividadesQueSeraoSubstituidas(ErroApi(400, "X", "y")))
    }

    @Test fun `nome sugerido ao salvar`() {
        val d = dia("""{"id":"s","date":"2026-11-20","session_type":"training","periodo":"tarde"}""")
        assertEquals("Treino de sexta, 20/11 · Tarde", nomeSugeridoSessao(d, true))
        assertEquals("Treino de sexta, 20/11", nomeSugeridoSessao(d, false))
    }

    @Test fun `anexo da sessao - multipart com session_id antes do arquivo e sem activity_id`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"f1","activity_id":null,"title":"Carga","mime_type":"text/csv","file_size":3}"""))
        val a = api.enviarAnexoDaSessao("s1", ArquivoUpload.deBytes("carga.csv", "text/csv", byteArrayOf(1, 2, 3)), "Carga") {}
        assertNull(a.atividadeId)
        val r = srv.takeRequest()
        assertEquals("/api/files/upload", r.path)
        val txt = r.body.readUtf8()
        assertFalse(txt.contains("activity_id"))
        assertTrue(txt.indexOf("name=\"session_id\"") in 0 until txt.indexOf("name=\"file\""))
        assertTrue(txt.indexOf("name=\"title\"") in 0 until txt.indexOf("name=\"file\""))
    }

    @Test fun `arquivos da semana - lista, envio e detalhe`() = runBlocking {
        srv.enqueue(MockResponse().setBody("""{"data":[{"id":"w1","title":"Planejamento","url":"/uploads/semana-files/a.xlsx","file_name":"a.xlsx",
            "file_size":"1258291","mime_type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","created_at":"2026-11-26T13:00:00.000Z","enviado_por":"Lauro"}]}"""))
        val l = api.arquivosDaSemana("2026-48", "c 1")
        assertEquals("/api/arquivos-semana?week=2026-48&club_id=c%201", srv.takeRequest().path)
        assertEquals("1,2 MB · Lauro · 26/11", detalheArquivoSemana(l[0]))
        assertEquals("Planejamento", l[0].rotulo)
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"w2","title":"b.pdf","url":"/uploads/semana-files/b.pdf","file_name":"b.pdf"}"""))
        api.enviarArquivoSemana("2026-48", "c1", ArquivoUpload.deBytes("b.pdf", "application/pdf", byteArrayOf(1)), null) {}
        val txt = srv.takeRequest().body.readUtf8()
        assertTrue(txt.indexOf("name=\"week\"") < txt.indexOf("name=\"file\""))
        assertTrue(txt.indexOf("name=\"club_id\"") < txt.indexOf("name=\"file\""))
        assertFalse(txt.contains("name=\"title\""))
        assertEquals("340 KB", tamanhoLegivel(348160))
        assertEquals("", tamanhoLegivel(null))
    }

    @Test fun `tipos de documento aceitos`() {
        assertNull(problemaDoArquivoExtra("text/csv", 10))
        assertNull(problemaDoArquivoExtra(tipoPeloNome("plano.xlsx", "application/octet-stream"), 10))
        assertEquals(MSG_ARQUIVO_TIPO, problemaDoArquivoExtra("application/zip", 10))
        assertEquals(MSG_ANEXO_TIPO, problemaDoArquivo("text/csv", 10)) // atividade continua só foto/vídeo/PDF
    }

    @Test fun `escudos - mandante primeiro e horario`() {
        val casa = dia("""{"id":"j","date":"2026-11-22","session_type":"match","opponent_name":"Vila","opponent_logo":"/uploads/x.png","match_location":"home","match_kickoff":"17:00"}""")
        assertFalse(adversarioPrimeiro(casa))
        assertEquals("17h00", horarioDoJogo(casa))
        assertEquals("/uploads/x.png", casa.escudoAdversario)
        val fora = dia("""{"id":"j","date":"2026-11-22","session_type":"match","match_location":"away","match_kickoff":"9:30"}""")
        assertTrue(adversarioPrimeiro(fora))
        assertEquals("09h30", horarioDoJogo(fora))
        assertNull(horarioDoJogo(dia("""{"id":"j","date":"2026-11-22","session_type":"match"}""")))
    }

    @Test fun `fotos da ficha - esquerda padrao, blocos antigo vira direita`() {
        assertEquals("esquerda", normalizarPosicaoFotos(null))
        assertEquals("esquerda", normalizarPosicaoFotos("lado"))
        assertEquals("direita", normalizarPosicaoFotos("blocos"))
        assertEquals("fim", normalizarPosicaoFotos("fim"))
        assertEquals(listOf("esquerda", "direita", "fim"), POSICOES_FOTOS.map { it.first })
    }

    @Test fun `goleiros nas estatisticas`() {
        val s = JsonApp.decodeFromString(StatsTreino.serializer(), """{"totals":{"activities":3},"goleiros":{"minutes":95,"sessions":3,"activities":4,
            "byContent":[{"content_id":"a","name":"Saídas","minutes":20,"count":2},{"content_id":"b","name":"Reflexo","minutes":75,"count":2}]}}""")
        val g = s.goleiros!!
        assertTrue(g.temDados)
        assertEquals(listOf("Reflexo", "Saídas"), g.principais.map { it.name })
        assertFalse(JsonApp.decodeFromString(StatsTreino.serializer(), """{"goleiros":{"minutes":0,"activities":0}}""").goleiros!!.temDados)
    }

    @Test fun `lado do zagueiro`() {
        assertEquals("ZAG · D", posicaoComLado("ZAG", "direita"))
        assertEquals("ZAG · D/E", posicaoComLado("ZAG", "ambos"))
        assertEquals("ZAG", posicaoComLado("ZAG", null))
        assertEquals("VOL", posicaoComLado("VOL", "direita"))
        val zag = corpoAtleta(FormAtleta("ana", "ZAG", lado = "esquerda"), "c1", null)
        assertEquals("esquerda", zag["lado_preferido"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, corpoAtleta(FormAtleta("ana", "VOL", lado = "esquerda"), "c1", null)["lado_preferido"])
    }

    @Test fun `campograma igual ao servidor`() {
        val d = JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/campograma.json").readText()).jsonObject
        val casos = d["casos"]!!.jsonArray
        assertEquals(2, casos.size)
        casos.forEach { c ->
            val o = c.jsonObject
            val atletas = JsonApp.decodeFromJsonElement(ListSerializer(Atleta.serializer()), o["atletas"]!!)
            val cg = montarCampograma(atletas, o["modalidade"]!!.jsonPrimitive.content)
            val esperado = o["saida"]!!.jsonObject
            val zonas = esperado["zonas"]!!.jsonArray
            assertEquals(zonas.map { it.jsonObject["key"]!!.jsonPrimitive.content }, cg.zonas.map { it.chave })
            zonas.forEachIndexed { i, z ->
                val zo = z.jsonObject
                val mz = cg.zonas[i]
                assertEquals(zo["nome"]!!.jsonPrimitive.content, mz.nome)
                assertEquals(zo["left"]!!.jsonPrimitive.doubleOrNull!!, mz.left, 1e-9)
                assertEquals(zo["top"]!!.jsonPrimitive.doubleOrNull!!, mz.top, 1e-9)
                assertEquals(zo["tx"]!!.jsonPrimitive.content, mz.ax.css)
                assertEquals(zo["ty"]!!.jsonPrimitive.content, mz.ay.css)
                val at = zo["atletas"]!!.jsonArray
                assertEquals(mz.chave, at.map { it.jsonObject["id"]!!.jsonPrimitive.content }, mz.atletas.map { it.id })
                assertEquals(at.map { it.jsonObject["nome"]!!.jsonPrimitive.content }, mz.atletas.map { it.nome })
                assertEquals(at.map { it.jsonObject["dm"]!!.jsonPrimitive.booleanOrNull }, mz.atletas.map { it.dm })
                assertEquals(at.map { it.jsonObject["trans"]!!.jsonPrimitive.booleanOrNull }, mz.atletas.map { it.transicao })
            }
            assertEquals(esperado["semLugar"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }, cg.semLugar.map { it.id })
        }
    }

    @Test fun `excluir conta - senha errada nao derruba a sessao`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Senha incorreta"}"""))
        try { api.excluirConta("x"); fail() } catch (e: ErroApi) {
            assertEquals(400, e.status)
            assertEquals("Senha incorreta.", e.mensagem)
        }
        val r = srv.takeRequest()
        assertEquals("DELETE", r.method); assertEquals("/api/auth/me", r.path)
        assertEquals("x", JsonApp.parseToJsonElement(r.body.readUtf8()).jsonObject["password"]!!.jsonPrimitive.content)
        srv.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Sessão expirada"}"""))
        try { api.excluirConta(null); fail() } catch (e: ErroApi) { assertEquals(401, e.status) }
    }
}
