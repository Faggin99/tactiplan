package com.faggin.tactiplan.app.dados

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EntrarModeloTest {
    private val api = ApiFalsa()
    private var entrou: RespostaLogin? = null
    private val modelo = EntrarModelo(api, Aparelho(PLATAFORMA_ANDROID, "Pixel", "1.0.0")) { entrou = it }

    @Test fun `valida antes de chamar o servidor`() = runTest {
        modelo.mudarEmail("ana@exemplo")
        modelo.mudarSenha("x")
        modelo.entrar()
        assertEquals(MSG_EMAIL_INVALIDO, modelo.estado.value.erro)
        modelo.mudarEmail("ana@exemplo.com")
        assertNull(modelo.estado.value.erro)
        modelo.mudarSenha("")
        modelo.entrar()
        assertEquals(MSG_SENHA_VAZIA, modelo.estado.value.erro)
        assertTrue(api.chamadas.isEmpty())
    }

    @Test fun `entrar com sucesso apaga a senha e entrega a sessao`() = runTest {
        modelo.mudarEmail(" ana@exemplo.com ")
        modelo.mudarSenha("segredo")
        modelo.entrar()
        assertEquals("tpa_1", entrou?.token)
        assertEquals("", modelo.estado.value.senha)
        assertFalse(modelo.estado.value.carregando)
        assertEquals(listOf("entrar:ana@exemplo.com"), api.chamadas)
    }

    @Test fun `erros do servidor viram a frase da tela`() = runTest {
        modelo.mudarEmail("ana@exemplo.com"); modelo.mudarSenha("x")
        api.login = { throw ErroApi(401, "CREDENCIAIS", "E-mail ou senha incorretos.") }
        modelo.entrar()
        assertEquals("E-mail ou senha incorretos.", modelo.estado.value.erro)
        api.login = { throw ErroApi.offline() }
        modelo.entrar()
        assertEquals(ErroApi.MSG_OFFLINE, modelo.estado.value.erro)
        api.login = { throw ErroApi(502, null, "Bad gateway") }
        modelo.entrar()
        assertEquals(ErroApi.MSG_FALHA, modelo.estado.value.erro)
        assertNull(entrou)
    }

    @Test fun `config do servidor e falha social`() = runTest {
        api.config = ConfigApp(google = ConfigApp.Google(true, null, "web"), esqueciSenhaUrl = "https://e")
        modelo.carregarConfig()
        assertEquals("https://e", modelo.estado.value.esqueciSenhaUrl)
        modelo.falhaSocial(null)
        assertNull(modelo.estado.value.erro)
        modelo.falhaSocial(MSG_SOCIAL_FALHOU)
        assertEquals(MSG_SOCIAL_FALHOU, modelo.estado.value.erro)
        modelo.entrarComGoogle("idt")
        assertEquals("tpa_1", entrou?.token)
        assertTrue("google:idt" in api.chamadas)
    }

    @Test fun `sem config usa os links padrao`() {
        assertEquals(ESQUECI_SENHA_URL_PADRAO, EstadoEntrar().esqueciSenhaUrl)
        assertFalse(EstadoEntrar().podeEntrar)
    }
}
