package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ApiAppHttp
import com.faggin.tactiplan.app.dados.ApiFalsa
import com.faggin.tactiplan.app.dados.CofreSessaoMemoria
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.Convite
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.EstadoApp
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.ME_REAL
import com.faggin.tactiplan.app.dados.RespostaLogin
import com.faggin.tactiplan.app.dados.clube
import com.faggin.tactiplan.app.dados.conta
import com.faggin.tactiplan.app.dados.me
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// O cliente das rotas de treino contra um servidor de mentira (paridade: ApiTreinoHttpTests do Swift).
class ApiTreinoHttpTest {
    private val srv = MockWebServer().apply { start() }
    private val api = ApiTreinoHttp(Api(srv.url("/api").toString()), "tpa_abc", "ws-1", fronteira = { "FRONTEIRA" })

    @After fun fim() = srv.shutdown()

    private fun corpo(): JsonObject = JsonApp.parseToJsonElement(srv.takeRequest().body.readUtf8()) as JsonObject

    @Test fun `toda chamada leva token e X-Workspace-Id`() = runBlocking {
        srv.enqueue(MockResponse().setBody("null"))
        assertNull(api.microciclo("2026-43", "c 1"))
        val r = srv.takeRequest()
        assertEquals("/api/microcycles?week=2026-43&club_id=c%201", r.path)
        assertEquals("Bearer tpa_abc", r.getHeader("authorization"))
        assertEquals("ws-1", r.getHeader("x-workspace-id"))
    }

    @Test fun `microciclo real vem normalizado`() = runBlocking {
        srv.enqueue(MockResponse().setBody(MICROCICLO_REAL))
        val m = api.microciclo("2026-40", "c1")!!
        assertEquals(5.2, m.dias[0].distanciaKm!!, 1e-9)
    }

    @Test fun `cadastros aceitam lista ou data`() = runBlocking {
        srv.enqueue(MockResponse().setBody("""[{"id":"c1","name":"Aeróbio","dimension":"fisico","active":true}]"""))
        srv.enqueue(MockResponse().setBody("""{"data":[{"id":"e1","name":"Contra-ataque","content_id":"to","display_order":"2"}]}"""))
        srv.enqueue(MockResponse().setBody("""[{"id":"t1","title":"Rondo","content_id":"c1","is_archived":false}]"""))
        val c = api.cadastros("football_11")
        assertEquals(listOf("Aeróbio"), c.conteudos.map { it.nome })
        assertEquals(2, c.etapas.first().ordem)
        assertEquals("Rondo", c.titulos.first().titulo)
        val caminhos = (1..3).map { srv.takeRequest().path }
        assertTrue("/api/stages?modality=football_11" in caminhos)
    }

    @Test fun `upload multipart com activity_id e title antes do arquivo`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"f1","activity_id":"a1","title":"Foto","mime_type":"image/jpeg","file_size":"3"}"""))
        val prog = mutableListOf<Double>()
        val a = api.enviarAnexo("a1", ArquivoUpload.deBytes("f\"oto.jpg", "image/jpeg", byteArrayOf(1, 2, 3)), "Foto") { prog += it }
        assertEquals("f1", a.id)
        assertEquals(3, a.tamanho)
        assertEquals(1.0, prog.last(), 1e-9)
        val r = srv.takeRequest()
        assertEquals("/api/files/upload", r.path)
        assertEquals("multipart/form-data; boundary=FRONTEIRA", r.getHeader("content-type"))
        assertEquals("ws-1", r.getHeader("x-workspace-id"))
        assertEquals("Bearer tpa_abc", r.getHeader("authorization"))
        val txt = r.body.readUtf8()
        val iA = txt.indexOf("name=\"activity_id\"")
        val iT = txt.indexOf("name=\"title\"")
        val iF = txt.indexOf("name=\"file\"; filename=\"f%22oto.jpg\"")
        assertTrue(txt, iA in 0 until iT && iT < iF)
        assertTrue(txt.contains("Content-Type: image/jpeg"))
    }

    @Test fun `upload recusado vira ErroApi com a mensagem do servidor`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":"Máximo de 5 anexos por atividade"}"""))
        try {
            api.enviarAnexo("a1", ArquivoUpload.deBytes("a.jpg", "image/jpeg", ByteArray(0)), "a") {}
            fail("esperava erro")
        } catch (e: ErroApi) {
            assertEquals(409, e.status)
            assertEquals("Máximo de 5 anexos por atividade", e.mensagem)
        }
    }

    @Test fun `pdf exige bytes de PDF e manda sem formato`() = runBlocking {
        srv.enqueue(MockResponse().setBody("%PDF-1.4 xxx"))
        val d = api.pdfDoRelatorio("sessao", mapOf("session_id" to JsonPrimitive("d1"), "formato" to JsonPrimitive("html")))
        assertEquals(12, d.size)
        val c = corpo()
        assertNull(c["formato"])
        assertEquals(JsonPrimitive("d1"), c["session_id"])
        srv.enqueue(MockResponse().setBody("{}"))
        try { api.pdfDoRelatorio("sessao", emptyMap()); fail() } catch (e: ErroApi) { assertEquals(MSG_PDF_FALHOU, e.mensagem) }
        srv.takeRequest()
        srv.enqueue(MockResponse().setResponseCode(402).setBody("""{"error":"As exportações não estão incluídas no seu plano atual.","code":"PLAN_REQUIRED"}"""))
        try { api.pdfDoRelatorio("sessao", emptyMap()); fail() } catch (e: ErroApi) { assertEquals(MSG_NAO_EXPORTA, mensagemErroTreino(e)) }
        Unit
    }

    @Test fun `fotos pede formato fotos, tipo do dia e distancia`() = runBlocking {
        srv.enqueue(MockResponse().setBody("""{"fotos":[{"id":"f1","date":"2026-10-21","dia":"Quarta-feira","dd":"21/10","titulo":"Foto","thumb":"data:image/jpeg;base64,AQID"}],"total":1,"semana":false,"limite":24,"padrao":{"ids":["f1"],"layout":"medio","proporcao":"4:3"}}"""))
        val l = api.fotosDoRelatorio("sessao", mapOf("session_id" to JsonPrimitive("d1")))
        assertEquals("Quarta-feira", l.fotos.first().dia)
        assertEquals(JsonPrimitive("fotos"), corpo()["formato"])
        srv.enqueue(MockResponse().setBody("{}"))
        api.mudarTipo("d1", TipoDia.TREINO, "Rival")
        val tipo = corpo()
        assertEquals(JsonPrimitive("training"), tipo["session_type"])
        assertEquals(JsonNull, tipo["opponent_name"])
        srv.enqueue(MockResponse().setBody("{}"))
        api.mudarDistancia("d1", 5.2)
        val r = srv.takeRequest()
        assertEquals("PUT", r.method)
        assertEquals("/api/sessions/d1/distance", r.path)
        assertTrue(r.body.readUtf8().contains("\"avg_distance_km\":5.2"))
    }

    @Test fun `criar atividade devolve o id`() = runBlocking {
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"a-1","block_id":"b"}"""))
        assertEquals("a-1", api.criarAtividade(FormAtividade(descricao = "x").corpo("b")))
        val r = srv.takeRequest()
        assertEquals("/api/activities", r.path)
        assertTrue(Buffer().apply { r.body.copyTo(this) }.readUtf8().contains("\"block_id\":\"b\""))
    }
}

class RecusarConviteTest {
    @Test fun `recusar o unico convite com um clube so entra direto`() = runBlocking {
        val api = ApiFalsa()
        val comConvite = me(conta("w1", "Demo FC", listOf(clube("c1", "Demo FC"))), convites = listOf(Convite("ab")))
        api.recusar = { me(conta("w1", "Demo FC", listOf(clube("c1", "Demo FC")))) }
        val c = ControleSessao(api, CofreSessaoMemoria()) { 5 }
        c.entrou(RespostaLogin("tpa_1", null, comConvite))
        assertTrue(c.estado.value is EstadoApp.OndeEntrar)
        c.recusarConvite("ab")
        assertEquals(listOf("recusar:ab"), api.chamadas)
        val e = c.estado.value as EstadoApp.NoClube
        assertTrue(e.sessao.me.convites.isEmpty())
    }

    @Test fun `erro ao recusar sobe e 401 sai da conta`() = runBlocking {
        val api = ApiFalsa()
        api.recusar = { throw ErroApi(403, "CONVITE_OUTRO_EMAIL", "x") }
        val c = ControleSessao(api, CofreSessaoMemoria())
        c.entrou(RespostaLogin("tpa_1", null, me(convites = listOf(Convite("ab")))))
        try { c.recusarConvite("ab"); fail() } catch (_: ErroApi) {}
        api.recusar = { throw ErroApi(401, null, "x") }
        c.recusarConvite("ab")
        assertEquals(EstadoApp.Entrar, c.estado.value)
    }

    @Test fun `api app recusar manda POST e le o me`() = runBlocking {
        val srv = MockWebServer().apply { start() }
        srv.enqueue(MockResponse().setBody("""{"ok":true,"me":$ME_REAL}"""))
        val m = ApiAppHttp(Api(srv.url("/api").toString())).recusarConvite("tpa_t", "ab")
        assertEquals("Teste App T0", m.usuario.nome)
        val r = srv.takeRequest()
        assertEquals("/api/app/convites/ab/recusar", r.path)
        assertEquals("POST", r.method)
        srv.shutdown()
    }
}
