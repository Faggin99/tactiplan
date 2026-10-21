package com.faggin.tactiplan.app.dados

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// O cliente HTTP do BFF contra um servidor de mentira: caminhos, corpo, token e erros.
class ApiAppHttpTest {
    private val srv = MockWebServer().apply { start() }
    private val api = ApiAppHttp(Api(srv.url("/api").toString()))

    @After fun fim() = srv.shutdown()

    @Test fun `entrar manda email, senha e aparelho`() = runTest {
        srv.enqueue(MockResponse().setBody("""{"token":"tpa_x","me":$ME_REAL}"""))
        val r = api.entrar(" ana@x.com ", "s", Aparelho("android", "Pixel", "1.0.0"))
        assertEquals("tpa_x", r.token)
        val req = srv.takeRequest()
        assertEquals("/api/app/auth/entrar", req.path)
        assertEquals("POST", req.method)
        val corpo = req.body.readUtf8()
        assertTrue(corpo, corpo.contains("\"email\":\"ana@x.com\""))
        assertTrue(corpo, corpo.contains("\"versao_app\":\"1.0.0\""))
    }

    @Test fun `me leva o token e o convite e codificado`() = runTest {
        srv.enqueue(MockResponse().setBody(ME_REAL))
        api.me("tpa_t")
        assertEquals("Bearer tpa_t", srv.takeRequest().getHeader("authorization"))
        srv.enqueue(MockResponse().setBody("""{"ok":true,"workspace_id":"w","me":$ME_REAL}"""))
        val r = api.aceitarConvite("tpa_t", "ab cd")
        assertEquals("w", r.workspaceId)
        assertEquals("/api/app/convites/ab%20cd/aceitar", srv.takeRequest().path)
    }

    @Test fun `erro do servidor vira ErroApi com codigo e mensagem`() = runTest {
        srv.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Sem conta.","code":"SEM_CONTA"}"""))
        try {
            api.entrarComGoogle("idt", Aparelho("android"))
            error("devia falhar")
        } catch (e: ErroApi) {
            assertEquals(404, e.status)
            assertEquals("SEM_CONTA", e.codigo)
            assertEquals("Sem conta.", e.mensagem)
        }
    }

    @Test fun `sem servidor e offline`() = runTest {
        srv.shutdown()
        try {
            api.config()
            error("devia falhar")
        } catch (e: ErroApi) {
            assertTrue(semRede(e))
        }
    }
}
