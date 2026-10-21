package com.faggin.tactiplan.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.onAllNodesWithText
import com.faggin.tactiplan.app.dados.ApiFalsa
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.ConfigApp
import com.faggin.tactiplan.app.dados.CofreSessaoMemoria
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.EstadoApp
import com.faggin.tactiplan.app.dados.RespostaLogin
import com.faggin.tactiplan.app.dados.TEXTO_SO_LEITURA
import com.faggin.tactiplan.app.dados.clube
import com.faggin.tactiplan.app.dados.conta
import com.faggin.tactiplan.app.dados.me
import com.faggin.tactiplan.app.ui.casca.TAG_CONFIRMAR_SAIR
import com.faggin.tactiplan.app.ui.casca.TAG_SAIR
import com.faggin.tactiplan.app.ui.entrar.TAG_GOOGLE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TelasTest {
    @get:Rule val regra = createComposeRule()

    private val api = ApiFalsa()
    private val controle = ControleSessao(api, CofreSessaoMemoria())

    private fun montar() = regra.setContent {
        App(controle, api, Aparelho("android"), google = { "idt" }, trava = null, versaoInstalada = "1.0.0")
    }

    @Test fun `Entrar - sem Google por padrao, sem criar conta, e entra com e-mail e senha`() {
        montar()
        regra.onNodeWithText("E-mail").performTextInput("marcos@exemplo.com")
        regra.onNodeWithText("Senha").performTextInput("segredo")
        assertTrue(regra.onAllNodesWithText("Criar conta").fetchSemanticsNodes().isEmpty())
        assertTrue(regra.onAllNodesWithText("Continuar com o Google").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithText("Entrar").performClick()
        regra.waitUntil(5_000) { controle.estado.value is EstadoApp.NoClube }
        regra.onNodeWithTag("aba:semana").assertIsDisplayed()
    }

    @Test fun `Entrar - Google aparece quando o servidor liga`() {
        api.config = ConfigApp(google = ConfigApp.Google(true, null, "web.apps"))
        montar()
        regra.waitUntil(5_000) { regra.onAllNodesWithText("Continuar com o Google").fetchSemanticsNodes().isNotEmpty() }
        regra.onNodeWithTag(TAG_GOOGLE).performScrollTo().performClick()
        regra.waitForIdle()
        assertTrue(api.chamadas.toString() + " " + controle.estado.value, controle.estado.value is EstadoApp.NoClube)
        assertTrue("google:idt" in api.chamadas)
    }

    @Test fun `Mais - perfil, so leitura e sair com confirmacao`() {
        controle.entrou(RespostaLogin("tpa_1", null, me(conta("w1", clubes = listOf(clube("c1", "Demo FC")), leitura = true))))
        montar()
        regra.onNodeWithTag("aba:mais").performClick()
        regra.onNodeWithText("Marcos Andrade").assertIsDisplayed()
        regra.onNodeWithText(TEXTO_SO_LEITURA).assertIsDisplayed()
        assertTrue(regra.onAllNodesWithText("Assinatura").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithTag(TAG_SAIR).performScrollTo().performClick()
        regra.onNodeWithTag(TAG_CONFIRMAR_SAIR).performClick()
        regra.waitUntil(5_000) { controle.estado.value == EstadoApp.Entrar }
        assertEquals(EstadoApp.Entrar, controle.estado.value)
    }

    @Test fun `Quadro some sem permissao tatica`() {
        controle.entrou(RespostaLogin("tpa_1", null, me(conta("w1", clubes = listOf(clube("c1")), permissoes = listOf("training:view")))))
        montar()
        assertTrue(regra.onAllNodesWithText("Quadro").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithText("Elenco").assertIsDisplayed()
    }
}
