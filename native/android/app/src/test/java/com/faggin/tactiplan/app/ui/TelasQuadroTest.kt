package com.faggin.tactiplan.app.ui

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.printToString
import com.faggin.tactiplan.app.dados.ApiFalsa
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.CofreSessaoMemoria
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.RespostaLogin
import com.faggin.tactiplan.app.dados.clube
import com.faggin.tactiplan.app.dados.conta
import com.faggin.tactiplan.app.dados.me
import com.faggin.tactiplan.app.dados.quadro.ApiQuadro
import com.faggin.tactiplan.app.dados.quadro.Jogada
import com.faggin.tactiplan.app.dados.quadro.texto
import com.faggin.tactiplan.app.dados.treino.ApiTreinoFalsa
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** /api/plays de mentira: guarda o que foi criado/atualizado/excluído. */
class QuadroFalso : ApiQuadro {
    val chamadas = mutableListOf<String>()
    val corpos = mutableListOf<JsonObject>()
    private val base = JsonObject(mapOf(
        "id" to JsonPrimitive("p1"), "name" to JsonPrimitive("Saída de bola"), "field_type" to JsonPrimitive("football_11"),
        "field_view" to JsonPrimitive("full"), "club_name" to JsonPrimitive("Demo FC"), "updated_at" to JsonPrimitive("2026-10-22T12:00:00.000Z"),
        "keyframes" to JsonArray(listOf(
            JsonObject(mapOf("index" to JsonPrimitive(0), "elements" to JsonArray(listOf(JsonObject(mapOf("id" to JsonPrimitive("a1"), "type" to JsonPrimitive("player"),
                "team" to JsonPrimitive("A"), "x" to JsonPrimitive(30), "y" to JsonPrimitive(50), "jerseyNumber" to JsonPrimitive(9))))), "drawings" to JsonArray(emptyList()))),
            JsonObject(mapOf("index" to JsonPrimitive(1), "elements" to JsonArray(listOf(JsonObject(mapOf("id" to JsonPrimitive("a1"), "type" to JsonPrimitive("player"),
                "team" to JsonPrimitive("A"), "x" to JsonPrimitive(60), "y" to JsonPrimitive(40), "jerseyNumber" to JsonPrimitive(9))))), "drawings" to JsonArray(emptyList()))),
        )),
    ))
    var lista = mutableListOf(Jogada(base))
    override suspend fun listar() = lista.toList().also { chamadas += "listar" }
    override suspend fun abrir(id: String) = lista.first { it.id == id }.also { chamadas += "abrir:$id" }
    override suspend fun criar(corpo: JsonObject): Jogada { chamadas += "criar"; corpos += corpo; return Jogada(JsonObject(corpo + ("id" to JsonPrimitive("novo")))).also { lista.add(it) } }
    override suspend fun atualizar(id: String, corpo: JsonObject): Jogada { chamadas += "atualizar:$id"; corpos += corpo; return Jogada(JsonObject(corpo + ("id" to JsonPrimitive(id)))) }
    override suspend fun excluir(id: String) { chamadas += "excluir:$id"; lista.removeAll { it.id == id } }
}

@RunWith(RobolectricTestRunner::class)
class TelasQuadroTest {
    @get:Rule val regra = createComposeRule()
    private val api = ApiFalsa()
    private val controle = ControleSessao(api, CofreSessaoMemoria())
    private val quadro = QuadroFalso()

    private fun abrir(permissoes: List<String>, leitura: Boolean = false) {
        controle.entrou(RespostaLogin("tpa_1", null, me(conta("w1", clubes = listOf(clube("c1", "Demo FC")), permissoes = permissoes, leitura = leitura))))
        regra.setContent {
            App(controle, api, Aparelho("android"), google = null, trava = null, versaoInstalada = "1.0.0",
                fabricaTreino = { _, _ -> ApiTreinoFalsa() }, fabricaQuadro = { _, _ -> quadro })
        }
        regra.onNodeWithTag("aba:quadro").performClick()
        esperar("quadro:jogada:p1")
    }

    private fun esperar(tag: String) = try {
        regra.waitUntil(5_000) { regra.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    } catch (e: Throwable) { throw AssertionError(regra.onRoot().printToString(), e) }

    private fun esperarTexto(t: String) = try {
        regra.waitUntil(5_000) { regra.onAllNodesWithText(t, substring = true).fetchSemanticsNodes().isNotEmpty() }
    } catch (e: Throwable) { throw AssertionError(regra.onRoot().printToString(), e) }

    @Test fun `lista da conta com criada em, duplicar manda o corpo do web e excluir`() {
        abrir(listOf("training:view", "tactical:view", "tactical:edit"))
        esperarTexto("2 quadros")
        esperarTexto("criada em Demo FC")
        regra.onNodeWithContentDescription("Ações da jogada Saída de bola").performClick()
        regra.onNodeWithText("Duplicar").performClick()
        regra.waitUntil(5_000) { "criar" in quadro.chamadas }
        val c = quadro.corpos.last()
        assertEquals("Saída de bola (cópia)", c["name"].texto())
        assertEquals("c1", c["club_id"].texto())
        assertEquals(2, c["keyframes"]!!.jsonArray.size)
        assertTrue(c["keyframes"]!!.jsonArray[0].jsonObject.containsKey("drawings"))
        regra.onNodeWithContentDescription("Ações da jogada Saída de bola").performClick()
        regra.onNodeWithText("Excluir").performClick()
        regra.onNodeWithTag("quadro:confirmar").performClick()
        regra.waitUntil(5_000) { "excluir:p1" in quadro.chamadas }
    }

    @Test fun `so ver - sem nova jogada nem editar, assistir com play`() {
        abrir(listOf("training:view", "tactical:view"))
        assertTrue(regra.onAllNodesWithTag("quadro:nova").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithTag("quadro:jogada:p1").performClick()
        esperar("quadro:play")
        assertTrue(regra.onAllNodesWithTag("quadro:editar").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithTag("quadro:play").performSemanticsAction(SemanticsActions.OnClick)
        // A animação anda sozinha até o último quadro (1,5 s por transição em 1x).
        try { regra.waitUntil(8_000) { regra.onAllNodesWithContentDescription("Quadro 2, atual").fetchSemanticsNodes().isNotEmpty() } }
        catch (e: Throwable) { throw AssertionError(regra.onRoot().printToString(), e) }
    }

    @Test fun `conta so leitura so assiste`() {
        abrir(listOf("training:view", "tactical:view", "tactical:edit"), leitura = true)
        assertTrue(regra.onAllNodesWithTag("quadro:nova").fetchSemanticsNodes().isEmpty())
        regra.onNodeWithContentDescription("Ações da jogada Saída de bola").performClick()
        assertTrue(regra.onAllNodesWithText("Duplicar").fetchSemanticsNodes().isEmpty())
    }

    @Test fun `editor novo - jogador, novo quadro e salvar com nome cria no formato do web`() {
        abrir(listOf("training:view", "tactical:view", "tactical:edit"))
        regra.onNodeWithTag("quadro:nova").performClick()
        esperar("quadro:campo")
        regra.onNodeWithContentDescription("Jogador do Time A").performSemanticsAction(SemanticsActions.OnClick)
        regra.onNodeWithTag("quadro:novo-quadro").performSemanticsAction(SemanticsActions.OnClick)
        regra.waitForIdle()
        regra.onNodeWithTag("quadro:salvar").performClick()
        esperar("quadro:nome")
        regra.onNodeWithTag("quadro:nome").performTextInput("Contra-ataque")
        regra.onNodeWithTag("quadro:confirmar-salvar").performClick()
        regra.waitUntil(5_000) { "criar" in quadro.chamadas }
        val c = quadro.corpos.last()
        assertEquals("Contra-ataque", c["name"].texto())
        assertEquals("football_11", c["field_type"].texto())
        val kf = c["keyframes"]!!.jsonArray
        assertEquals(2, kf.size)
        val el = kf[1].jsonObject["elements"]!!.jsonArray[0].jsonObject
        assertEquals("player", el["type"].texto()); assertEquals("A", el["team"].texto())
        assertTrue(el["id"].texto()!!.startsWith("player-"))
        assertEquals("2", el["jerseyNumber"].toString())
    }
}
