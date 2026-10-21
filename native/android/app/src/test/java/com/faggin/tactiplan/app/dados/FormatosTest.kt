package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatosTest {
    @Test fun modalidades() {
        assertEquals("Futebol 11", rotuloModalidade("football_11"))
        assertEquals("Futebol 7", rotuloModalidade("football_7"))
        assertEquals("Futsal", rotuloModalidade("futsal"))
        assertEquals("", rotuloModalidade("volei"))
    }

    @Test fun `iniciais e primeiro nome`() {
        assertEquals("MA", iniciais("Marcos Andrade"))
        assertEquals("MS", iniciais("marcos de souza"))
        assertEquals("A", iniciais("ana"))
        assertEquals("?", iniciais("  "))
        assertEquals("Marcos", primeiroNome("Marcos Andrade"))
        assertNull(primeiroNome(""))
    }

    @Test fun `lista curta e contagem`() {
        assertEquals("Sub-15, Sub-17", listaCurta(listOf("Sub-15", " Sub-17 ", "")))
        assertEquals("A, B, C +2", listaCurta(listOf("A", "B", "C", "D", "E"), 3))
        assertEquals("1 convite", contagem(1, "convite", "convites"))
        assertEquals("2 convites", contagem(2, "convite", "convites"))
    }

    @Test fun versoes() {
        assertEquals("TactiPlan · versão 1.0.0 (7)", rotuloVersao("1.0.0", "7"))
        assertEquals("TactiPlan · versão 1.0.0", rotuloVersao("1.0.0", ""))
        assertEquals("TactiPlan", rotuloVersao(null, "3"))
        assertEquals(-1, compararVersoes("1.2.9", "1.10"))
        assertEquals(0, compararVersoes("1.0", "1.0.0"))
        assertEquals(1, compararVersoes("2.0.0-beta", "1.9"))
        assertTrue(precisaAtualizar("1.0.0", "1.0.1"))
        assertFalse(precisaAtualizar("1.0.1", "1.0.1"))
        assertFalse(precisaAtualizar("1.0.0", null))
    }

    @Test fun `tempo desde e faixa sem conexao`() {
        val agora = 10_000_000_000L
        assertEquals("agora há pouco", tempoDesde(agora - 30_000, agora))
        assertEquals("há 5 min", tempoDesde(agora - 5 * 60_000, agora))
        assertEquals("há 3 h", tempoDesde(agora - 3 * 3_600_000, agora))
        assertEquals("há 2 dias", tempoDesde(agora - 2 * 86_400_000, agora))
        assertEquals("Sem conexão — mostrando o que foi visto por último.", textoSemConexao(null, agora))
        assertTrue(textoSemConexao(agora - 60_000, agora).endsWith("atualizado há 1 min"))
    }

    @Test fun `data por extenso no fuso de Brasilia`() {
        // 2026-10-21 12:00 UTC = quarta, 09:00 em Brasília
        assertEquals("quarta, 21 de outubro", dataPorExtenso(1792584000000L))
        // 2026-10-22 02:00 UTC ainda é dia 21 em Brasília
        assertEquals("quarta, 21 de outubro", dataPorExtenso(1792634400000L))
    }

    @Test fun emails() {
        assertTrue(emailPlausivel(" ana@exemplo.com "))
        assertFalse(emailPlausivel("ana@exemplo"))
        assertFalse(emailPlausivel("ana@@x.com"))
        assertFalse(emailPlausivel("ana silva@x.com"))
        assertFalse(emailPlausivel("@x.com"))
    }

    @Test fun `codifica componente como o encodeURIComponent`() {
        assertEquals("abc123-_.!~*'()", codificarComponente("abc123-_.!~*'()"))
        assertEquals("a%20b%2Fc%C3%A7", codificarComponente("a b/cç"))
    }
}
