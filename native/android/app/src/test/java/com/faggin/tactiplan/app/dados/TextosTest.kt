package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertTrue
import org.junit.Test

// Apple 3.1.3 / política das lojas: nenhum texto do app fala de plano, preço, assinatura, site ou compra.
class TextosTest {
    private val textos = listOf(
        TEXTO_SO_LEITURA, TEXTO_NAO_EDITA, DICA_CONVITE_ENTRAR, MSG_SOCIAL_FALHOU, TITULO_SEM_EQUIPE, TEXTO_SEM_EQUIPE,
        TEXTO_TROCAR_DEPOIS, TEXTO_EM_BREVE, TEXTO_ATUALIZAR_APP, TEXTO_TEMA, TITULO_DESBLOQUEIO, TEXTO_BLOQUEIO,
        ABA_SEMANA.emBreve, ABA_JOGOS.emBreve, ABA_ELENCO.emBreve, ABA_QUADRO.emBreve,
    )

    @Test fun `nenhum texto lembra compra`() {
        for (t in textos) assertTrue(t, textoNeutro(t))
    }

    @Test fun `mensagem de erro de so leitura e sempre a neutra`() {
        val e = ErroApi(402, "READ_ONLY", "Esta conta está sem assinatura ativa. Assine em https://...")
        assertTrue(mensagemDeErro(e) == TEXTO_NAO_EDITA)
        assertTrue(ehSomenteLeitura(ErroApi(402, null, "x", extras = mapOf("read_only" to "true"))))
    }
}
