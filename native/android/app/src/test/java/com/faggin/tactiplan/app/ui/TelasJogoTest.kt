package com.faggin.tactiplan.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import com.faggin.tactiplan.app.dados.ApiFalsa
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.CofreSessaoMemoria
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.RespostaLogin
import com.faggin.tactiplan.app.dados.clube
import com.faggin.tactiplan.app.dados.conta
import com.faggin.tactiplan.app.dados.jogo.ApiJogo
import com.faggin.tactiplan.app.dados.jogo.AtletaResumo
import com.faggin.tactiplan.app.dados.jogo.Campeonato
import com.faggin.tactiplan.app.dados.jogo.DadosDoJogo
import com.faggin.tactiplan.app.dados.jogo.DiaDoJogo
import com.faggin.tactiplan.app.dados.jogo.JogoDaLista
import com.faggin.tactiplan.app.dados.jogo.PLANTEL
import com.faggin.tactiplan.app.dados.jogo.pacoteReal
import com.faggin.tactiplan.app.dados.me
import com.faggin.tactiplan.app.dados.treino.ApiTreinoFalsa
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Rotas de jogo falsas: a aba Jogos e o Jogo nunca saem para a rede nos testes. */
class ApiJogoTela(private val dia: DiaDoJogo, private val jogo: DadosDoJogo) : ApiJogo {
    val salvos = mutableListOf<JsonObject>()
    override suspend fun listarJogos(clubeId: String, inicio: String, fim: String) =
        listOf(JogoDaLista.de("s1", "2026-10-17", "Rival FC", 1, 1, local = "away"))
    override suspend fun dia(sessaoId: String) = dia
    override suspend fun jogo(sessaoId: String) = jogo
    override suspend fun atletas(clubeId: String): List<AtletaResumo> = PLANTEL
    override suspend fun campeonatos(clubeId: String) = emptyList<Campeonato>()
    override suspend fun salvar(sessaoId: String, corpo: JsonObject) { salvos.add(corpo) }
}

@RunWith(RobolectricTestRunner::class)
class TelasJogoTest {
    @get:Rule val regra = createComposeRule()

    private val api = ApiFalsa()
    private val controle = ControleSessao(api, CofreSessaoMemoria())
    private val jogos = pacoteReal().let { (d, j) -> ApiJogoTela(d.copy(data = "2026-10-17"), j) }

    @Test fun `Jogos - lista, abre o jogo, escala na vaga vazia e salva o corpo do web`() {
        controle.entrou(RespostaLogin("tpa_1", null, me(conta("w1", clubes = listOf(clube("c1", "Demo FC")),
            permissoes = listOf("training:view", "training:edit", "games:view", "games:edit", "stats:view")))))
        regra.setContent {
            App(controle, api, Aparelho("android"), google = null, trava = null, versaoInstalada = "1.0.0",
                fabricaTreino = { _, _ -> ApiTreinoFalsa() }, fabricaJogo = { _, _ -> jogos })
        }
        regra.onNodeWithTag("aba:jogos").performClick()
        try {
            regra.waitUntil(5_000) { regra.onAllNodesWithTag("jogos:jogo:s1").fetchSemanticsNodes().isNotEmpty() }
        } catch (e: Throwable) {
            throw AssertionError(regra.onRoot().printToString(), e)
        }
        regra.onNodeWithTag("jogos:jogo:s1").performScrollTo().performClick()
        try {
            regra.waitUntil(5_000) { regra.onAllNodesWithTag("jogo:placar").fetchSemanticsNodes().isNotEmpty() }
        } catch (e: Throwable) {
            throw AssertionError(regra.onRoot().printToString(), e)
        }
        regra.onNodeWithTag("jogo:placar").assertIsDisplayed()
        // a vaga fica embaixo do "+ Evento" na tela pequena do teste: toque pela semântica
        regra.onNodeWithTag("jogo:vaga:4").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        try {
            regra.waitUntil(5_000) { regra.onAllNodesWithTag("jogo:atleta:a5").fetchSemanticsNodes().isNotEmpty() }
        } catch (e: Throwable) {
            throw AssertionError(regra.onAllNodes(androidx.compose.ui.test.isRoot()).printToString(maxDepth = 60), e)
        }
        regra.onNodeWithTag("jogo:atleta:a5").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        regra.waitForIdle()
        regra.onNodeWithTag("jogo:salvar").performClick()
        regra.waitUntil(5_000) { jogos.salvos.isNotEmpty() }
        val ps = jogos.salvos.first()["players"] as JsonArray
        val caio = ps.map { it as JsonObject }.first { it["athlete_id"] == JsonPrimitive("a5") }
        assertEquals(JsonPrimitive(4), caio["slot"])
        assertEquals(JsonPrimitive(true), jogos.salvos.first()["subs_check"])
        assertTrue(ps.size == 5)
    }
}
