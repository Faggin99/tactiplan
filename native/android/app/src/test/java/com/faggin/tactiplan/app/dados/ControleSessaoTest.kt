package com.faggin.tactiplan.app.dados

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Paridade: ControleSessaoTests (Swift).
class ControleSessaoTest {
    private val api = ApiFalsa()
    private val cofre = CofreSessaoMemoria()
    private fun controle() = ControleSessao(api, cofre) { 1234L }

    private fun login(m: Me, token: String = "tpa_1") = RespostaLogin(token, null, m)

    @Test fun `sem sessao abre no Entrar`() {
        assertEquals(EstadoApp.Entrar, controle().estado.value)
    }

    @Test fun `entrou com um clube so vai direto para as abas e guarda tudo`() {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))))))
        val e = c.estado.value as EstadoApp.NoClube
        assertEquals("c1", e.contexto.clube?.id)
        assertEquals(Escolha("w1", "c1"), cofre.ler()?.escolha)
        assertEquals(1234L, cofre.ler()?.meEm)
        assertEquals(Escolha("w1", "c1"), cofre.lerUltimaEscolha("u1"))
    }

    @Test fun `entrou com varios clubes pergunta, e escolher entra`() {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"), clube("c2"))))))
        assertTrue(c.estado.value is EstadoApp.OndeEntrar)
        c.escolher(Escolha("w1", "c2"))
        assertEquals("c2", (c.estado.value as EstadoApp.NoClube).contexto.clube?.id)
        c.escolher(Escolha("w1", "nao-existe"))
        assertEquals("c2", (c.estado.value as EstadoApp.NoClube).contexto.clube?.id)
    }

    @Test fun `entrar de novo volta no ultimo clube da pessoa`() {
        cofre.guardarUltimaEscolha("u1", Escolha("w1", "c2"))
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"), clube("c2"))))))
        assertEquals("c2", (c.estado.value as EstadoApp.NoClube).contexto.clube?.id)
    }

    @Test fun `abre o app com a sessao do cofre`() {
        cofre.salvar(Sessao("tpa_9", null, me(conta("w1", clubes = listOf(clube("c1"), clube("c2")))), Escolha("w1", "c2")))
        val e = controle().estado.value as EstadoApp.NoClube
        assertEquals("c2", e.contexto.clube?.id)
    }

    @Test fun `trocar de clube e cancelar volta ao atual`() {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"), clube("c2"))))))
        c.escolher(Escolha("w1", "c1"))
        c.abrirTroca()
        val t = c.estado.value as EstadoApp.OndeEntrar
        assertEquals(Escolha("w1", "c1"), t.atual)
        c.cancelarTroca()
        assertEquals("c1", (c.estado.value as EstadoApp.NoClube).contexto.clube?.id)
    }

    @Test fun `sair revoga no servidor, apaga a sessao e volta ao Entrar`() = runTest {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))))))
        c.sair()
        assertEquals(EstadoApp.Entrar, c.estado.value)
        assertNull(cofre.ler())
        assertTrue("sair:tpa_1" in api.chamadas)
    }

    @Test fun `401 so derruba se for o token atual`() {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))))))
        assertFalse(c.tratarErro(ErroApi(401, null, "x"), "tpa_velho"))
        assertTrue(c.estado.value is EstadoApp.NoClube)
        assertFalse(c.tratarErro(ErroApi(500, null, "x"), "tpa_1"))
        assertTrue(c.tratarErro(ErroApi(401, null, "x"), "tpa_1"))
        assertEquals(EstadoApp.Entrar, c.estado.value)
    }

    @Test fun `atualizar me - dados novos, sem rede liga a faixa, 401 sai`() = runTest {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))))))
        api.proximoMe = { me(conta("w1", "Renomeada", listOf(clube("c1", "Clube Novo")))) }
        c.atualizarMe()
        assertEquals("Clube Novo", (c.estado.value as EstadoApp.NoClube).contexto.nome)
        api.proximoMe = { throw ErroApi.offline() }
        c.atualizarMe()
        assertTrue(c.semConexao.value)
        assertTrue(c.estado.value is EstadoApp.NoClube)
        api.proximoMe = { me(conta("w1", clubes = listOf(clube("c1")))) }
        c.atualizarMe()
        assertFalse(c.semConexao.value)
        api.proximoMe = { throw ErroApi(401, "SESSAO_INVALIDA", "x") }
        c.atualizarMe()
        assertEquals(EstadoApp.Entrar, c.estado.value)
    }

    @Test fun `clube removido no servidor manda para o Onde entrar`() = runTest {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"), clube("c2"))))))
        c.escolher(Escolha("w1", "c2"))
        api.proximoMe = { me(conta("w1", clubes = listOf(clube("c1"), clube("c3")))) }
        c.atualizarMe()
        assertTrue(c.estado.value is EstadoApp.OndeEntrar)
    }

    @Test fun `aceitar convite entra direto quando a equipe tem um clube ativo`() = runTest {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))), convites = listOf(Convite("ab12")))))
        assertTrue(c.estado.value is EstadoApp.OndeEntrar)
        api.convite = {
            RespostaConvite("w2", me(conta("w1", clubes = listOf(clube("c1"))),
                conta("w2", clubes = listOf(clube("c9"), clube("c8", arquivado = true)), dono = false, papel = "head_coach")))
        }
        c.aceitarConvite("ab12")
        assertEquals("c9", (c.estado.value as EstadoApp.NoClube).contexto.clube?.id)
        assertTrue("convite:ab12" in api.chamadas)
    }

    @Test fun `aceitar convite com varios clubes fica no Onde entrar com o me novo`() = runTest {
        val c = controle()
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))), convites = listOf(Convite("ab12")))))
        api.convite = {
            RespostaConvite("w2", me(conta("w1", clubes = listOf(clube("c1"))),
                conta("w2", clubes = listOf(clube("c8"), clube("c9")), dono = false, papel = "head_coach")))
        }
        c.aceitarConvite("ab12")
        val e = c.estado.value as EstadoApp.OndeEntrar
        assertTrue(e.sessao.me.convites.isEmpty())
        assertEquals(2, e.sessao.me.workspaces.size)
        assertEquals(2, cofre.ler()?.me?.workspaces?.size)
    }

    @Test fun `aceitar convite com erro sobe para a tela`() = runTest {
        val c = controle()
        c.entrou(login(me(convites = listOf(Convite("ab12")))))
        api.convite = { throw ErroApi(403, "CONVITE_OUTRO_EMAIL", "Este convite é para outro e-mail.") }
        var msg: String? = null
        try { c.aceitarConvite("ab12") } catch (e: ErroApi) { msg = e.mensagem }
        assertEquals("Este convite é para outro e-mail.", msg)
        assertTrue(c.estado.value is EstadoApp.OndeEntrar)
    }

    @Test fun `push so registra com sessao e token`() = runTest {
        val c = controle()
        c.registrarPush("fcm", PLATAFORMA_ANDROID)
        assertTrue(api.chamadas.none { it.startsWith("push") })
        c.entrou(login(me(conta("w1", clubes = listOf(clube("c1"))))))
        c.registrarPush("", PLATAFORMA_ANDROID)
        c.registrarPush("fcm", PLATAFORMA_ANDROID)
        assertEquals(listOf("push:fcm:android"), api.chamadas.filter { it.startsWith("push") })
    }
}
