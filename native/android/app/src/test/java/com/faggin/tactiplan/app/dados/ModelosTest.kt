package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelosTest {
    @Test fun `decodifica o me real de producao`() {
        val m = meReal()
        assertEquals("Teste App T0", m.usuario.nome)
        assertEquals(true, m.usuario.temSenha)
        val w = m.workspaces.single()
        assertEquals("Treinador auxiliar", w.papelRotulo)
        assertEquals(false, w.somenteLeitura)
        assertTrue("training:edit" in w.permissoes!!)
        val c = w.clubes!!.single()
        assertEquals("#15803d", c.personalizacao?.corPrimaria?.claro)
        assertEquals("Sub-17", c.categorias!!.single().nome)
        assertTrue(m.convites.isEmpty())
        // com um clube só, entra direto e o contexto reflete o papel
        val e = escolhaAutomatica(m, null, null)!!
        val ctx = contextoDe(m, e)!!
        assertTrue(ctx.podeEditar("training:edit"))
        assertFalse(ctx.podeEditar("members:manage"))
    }

    @Test fun `campos novos e faltando nao quebram`() {
        val m = JsonApp.decodeFromString(Me.serializer(), """{"usuario":{"id":"u","campo_novo":1},"outra":"x"}""")
        assertEquals("u", m.usuario.id)
        assertTrue(m.workspaces.isEmpty())
        assertNull(m.mensagemSomenteLeitura)
    }

    @Test fun `config do servidor e resposta de login`() {
        val c = JsonApp.decodeFromString(ConfigApp.serializer(),
            """{"google":{"ativo":true,"ios_client_id":null,"android_server_client_id":"web.apps"},"apple":{"ativo":false},"versao_minima":{"ios":null,"android":"1.0.1"},"privacidade_url":"https://p","esqueci_senha_url":"https://e"}""")
        assertEquals("web.apps", googleAndroidServerClientId(c))
        assertNull(googleIOSClientId(c, appleNoBuild = true))
        assertEquals("1.0.1", c.versaoMinima?.android)
        val r = JsonApp.decodeFromString(RespostaLogin.serializer(), """{"token":"tpa_x","expira_em":"2027-04-19T02:57:22.232Z","me":$ME_REAL}""")
        assertEquals("tpa_x", r.token)
        assertEquals("Esporte Clube Vila Nova", r.me.workspaces[0].clubes!![0].nome)
    }

    @Test fun `regras do login social`() {
        val desligado = ConfigApp()
        assertNull(googleAndroidServerClientId(desligado))
        val g = ConfigApp(google = ConfigApp.Google(true, "ios.apps", "web.apps"), apple = ConfigApp.Apple(true))
        assertEquals("web.apps", googleAndroidServerClientId(g))
        assertEquals("ios.apps", googleIOSClientId(g, true))
        // regra 4.8: sem a Apple no build, nada de Google no iPhone
        assertNull(googleIOSClientId(g, false))
        assertFalse(mostrarApple(g, false))
        assertNull(googleAndroidServerClientId(ConfigApp(google = ConfigApp.Google(false, null, "web"))))
    }
}
