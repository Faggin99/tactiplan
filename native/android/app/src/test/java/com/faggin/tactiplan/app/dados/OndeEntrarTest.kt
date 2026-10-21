package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Paridade: OndeEntrarTests (Swift).
class OndeEntrarTest {
    @Test fun `uma linha por clube, ativos antes dos arquivados, com modalidade e categorias`() {
        val m = me(conta("w1", "Demo FC", listOf(
            clube("c2", "Antigo", arquivado = true),
            clube("c1", "Demo FC", cats = listOf("Sub-15", "Sub-17", "Sub-20", "Sub-11")),
        )))
        val o = opcoesDeEntrada(m)
        assertEquals(listOf("Demo FC", "Antigo"), o.map { it.titulo })
        assertEquals("Futebol 11 · Sub-15, Sub-17, Sub-20 +1", o[0].subtitulo)
        assertFalse(o[0].somenteLeitura)
        assertTrue(o[1].arquivado)
        assertTrue(o[1].somenteLeitura)
        assertEquals("Futebol 11 · só leitura", o[1].subtitulo)
        assertEquals("Dono", o[0].papelRotulo)
    }

    @Test fun `secoes - ativos e contas sem clube numa, arquivados na outra, na mesma ordem`() {
        val m = me(
            conta("w1", "Demo FC", listOf(clube("c2", "Antigo", arquivado = true), clube("c1", "Demo FC"))),
            conta("w2", "Sem clube"),
            conta("w3", "Outra", listOf(clube("c9", "Velho", arquivado = true), clube("c8", "Novo"))),
        )
        val (ativas, arquivadas) = secoesDeEntrada(m)
        assertEquals(listOf("Demo FC", "Sem clube", "Novo"), ativas.map { it.titulo })
        assertEquals(listOf("Antigo", "Velho"), arquivadas.map { it.titulo })
        assertTrue(arquivadas.all { it.somenteLeitura && !it.subtitulo.contains("arquivado") })
        assertEquals(opcoesDeEntrada(m).filter { it.arquivado }, arquivadas)
    }

    @Test fun `conta sem clube vira uma linha e mais de uma conta mostra o nome da conta`() {
        val m = me(conta("w1", "Minha conta"), conta("w2", "Escolinha", listOf(clube("c9", "Bola de Ouro")), leitura = true, papel = "assistant_coach", dono = false))
        val o = opcoesDeEntrada(m)
        assertEquals("Minha conta", o[0].titulo)
        assertEquals(Escolha("w1", null), o[0].escolha)
        assertEquals("Sem clube cadastrado", o[0].subtitulo)
        assertEquals("Futebol 11 · só leitura · Escolinha", o[1].subtitulo)
        assertEquals("Treinador auxiliar", o[1].papelRotulo)
    }

    @Test fun `escolha automatica - um clube so entra direto`() {
        val m = me(conta("w1", clubes = listOf(clube("c1"))))
        assertEquals(Escolha("w1", "c1"), escolhaAutomatica(m, null, null))
    }

    @Test fun `escolha automatica - uma ativa e o resto arquivado entra na ativa`() {
        val m = me(conta("w1", clubes = listOf(clube("c1"), clube("c2", arquivado = true))))
        assertEquals(Escolha("w1", "c1"), escolhaAutomatica(m, null, null))
    }

    @Test fun `escolha automatica - convite pendente sempre mostra a tela`() {
        val m = me(conta("w1", clubes = listOf(clube("c1"))), convites = listOf(Convite("ab")))
        assertNull(escolhaAutomatica(m, Escolha("w1", "c1"), null))
    }

    @Test fun `escolha automatica - atual valida, depois a ultima, senao pergunta`() {
        val m = me(conta("w1", clubes = listOf(clube("c1"), clube("c2"))))
        assertEquals(Escolha("w1", "c2"), escolhaAutomatica(m, Escolha("w1", "c2"), Escolha("w1", "c1")))
        assertEquals(Escolha("w1", "c1"), escolhaAutomatica(m, Escolha("w1", "sumiu"), Escolha("w1", "c1")))
        assertNull(escolhaAutomatica(m, null, null))
        assertFalse(escolhaValida(Escolha("w9", "c1"), m))
    }

    @Test fun `contexto - permissoes, so leitura da conta e do clube arquivado`() {
        val m = me(conta("w1", clubes = listOf(clube("c1"), clube("c2", arquivado = true)), permissoes = listOf("training:view", "training:edit")))
        val ctx = contextoDe(m, Escolha("w1", "c1"))!!
        assertTrue(ctx.pode("training:view"))
        assertTrue(ctx.podeEditar("training:edit"))
        assertFalse(ctx.podeEditar("games:edit"))
        assertTrue(ctx.editaAlgo)
        val arq = contextoDe(m, Escolha("w1", "c2"))!!
        assertTrue(arq.somenteLeitura)
        assertFalse(arq.podeEditar("training:edit"))
        assertTrue(arq.pode("training:view"))
        val ro = contextoDe(me(conta("w1", clubes = listOf(clube("c1")), leitura = true)), Escolha("w1", "c1"))!!
        assertTrue(ro.somenteLeitura)
        assertFalse(ro.editaAlgo)
        assertNull(contextoDe(m, Escolha("w1", "nao-existe")))
        assertNull(contextoDe(m, null))
    }

    @Test fun `abas - quadro some sem tactical view`() {
        val com = contextoDe(me(conta("w1", clubes = listOf(clube("c1")))), Escolha("w1", "c1"))
        assertEquals(listOf("semana", "jogos", "elenco", "quadro", "mais"), abasDoContexto(com).map { it.id })
        val sem = contextoDe(me(conta("w1", clubes = listOf(clube("c1")), permissoes = listOf("training:view"))), Escolha("w1", "c1"))
        assertEquals(listOf("semana", "jogos", "elenco", "mais"), abasDoContexto(sem).map { it.id })
    }

    @Test fun `texto de so leitura e sempre neutro`() {
        assertEquals(TEXTO_SO_LEITURA, textoSomenteLeitura(null))
        val vendedor = me().copy(mensagemSomenteLeitura = "Assine o plano Clube no site")
        assertEquals(TEXTO_SO_LEITURA, textoSomenteLeitura(vendedor))
        assertEquals("Só para ver.", textoSomenteLeitura(me().copy(mensagemSomenteLeitura = "Só para ver.")))
        assertFalse(textoNeutro("Faça upgrade"))
        assertFalse(textoNeutro("Veja em https://x"))
    }

    @Test fun `rotulos de papel`() {
        assertEquals("Dono", rotuloPapel("owner"))
        assertEquals("Especialista", rotuloPapel("specialist"))
        assertEquals("Comissão", rotuloPapel("novo"))
        assertEquals("Comissão", rotuloPapel(null))
    }
}
