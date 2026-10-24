package com.faggin.tactiplan.app.ui

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.printToString
import com.faggin.tactiplan.app.dados.ApiFalsa
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.CofreSessaoMemoria
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.RespostaLogin
import com.faggin.tactiplan.app.dados.cadastros.ApiCadastros
import com.faggin.tactiplan.app.dados.cadastros.AtividadeCad
import com.faggin.tactiplan.app.dados.cadastros.CampeonatoCad
import com.faggin.tactiplan.app.dados.cadastros.ClubeCad
import com.faggin.tactiplan.app.dados.cadastros.ConteudoCad
import com.faggin.tactiplan.app.dados.cadastros.LimiteClubes
import com.faggin.tactiplan.app.dados.cadastros.SubmomentoCad
import com.faggin.tactiplan.app.dados.clube
import com.faggin.tactiplan.app.dados.conta
import com.faggin.tactiplan.app.dados.elenco.ApiElenco
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.CategoriaCadastro
import com.faggin.tactiplan.app.dados.elenco.Lesao
import com.faggin.tactiplan.app.dados.estatisticas.ApiStats
import com.faggin.tactiplan.app.dados.estatisticas.JogadorStats
import com.faggin.tactiplan.app.dados.estatisticas.PeriodoStats
import com.faggin.tactiplan.app.dados.estatisticas.StatsJogos
import com.faggin.tactiplan.app.dados.estatisticas.StatsTreino
import com.faggin.tactiplan.app.dados.estatisticas.TotaisTreino
import com.faggin.tactiplan.app.dados.me
import com.faggin.tactiplan.app.dados.staff.ApiStaff
import com.faggin.tactiplan.app.dados.staff.DonoEquipe
import com.faggin.tactiplan.app.dados.staff.Equipe
import com.faggin.tactiplan.app.dados.staff.Membro
import com.faggin.tactiplan.app.dados.treino.ApiTreinoFalsa
import com.faggin.tactiplan.app.dados.treino.ArquivoUpload
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Rotas falsas da T3: as telas nunca saem para a rede nos testes. */
class FalsasT3 : ApiElenco, ApiStaff, ApiStats, ApiCadastros {
    val chamadas = mutableListOf<String>()
    val corpos = mutableListOf<JsonObject>()
    var atletasLista = mutableListOf(
        Atleta("a1", "Gabriel Rocha", "GOL", 1, grupo = "1", nascimento = "2009-03-01"),
        Atleta("a2", "Lucas Martins", "VOL", 5, grupo = "1"),
        Atleta("a3", "Kauã Lima", "ZAG", 3, grupo = "DM"),
    )
    override suspend fun atletas(clubeId: String) = atletasLista.toList()
    override suspend fun criar(corpo: JsonObject): Atleta { chamadas += "criar"; corpos += corpo
        return Atleta("novo", (corpo["name"] as JsonPrimitive).content, (corpo["position"] as JsonPrimitive).content).also { atletasLista.add(it) } }
    override suspend fun atualizar(id: String, corpo: JsonObject): Atleta { chamadas += "atualizar:$id"; corpos += corpo; return atletasLista.first { it.id == id } }
    override suspend fun remover(id: String) { chamadas += "remover:$id" }
    override suspend fun moverGrupo(ids: List<String>, grupo: String?) { chamadas += "mover:${ids.joinToString()}:$grupo" }
    override suspend fun enviarFoto(id: String, arquivo: ArquivoUpload) = atletasLista.first()
    override suspend fun removerFoto(id: String) = atletasLista.first()
    override suspend fun lesoes(atletaId: String) = if (atletaId == "a3") listOf(Lesao("l1", "a3", "Lesão muscular", "Coxa", "medium", "2026-10-07", "2026-10-30")) else emptyList()
    override suspend fun lesoesAtivas() = listOf(Lesao("l1", "a3", "Lesão muscular", "Coxa", "medium", "2026-10-07", "2026-10-30"))
    override suspend fun registrarLesao(atletaId: String, corpo: JsonObject): Lesao { chamadas += "lesao:$atletaId"; return Lesao("l2") }
    override suspend fun darAlta(lesaoId: String, hoje: String) { chamadas += "alta:$lesaoId" }
    override suspend fun removerLesao(lesaoId: String) { chamadas += "remover-lesao:$lesaoId" }
    override suspend fun categorias(clubeId: String) = listOf(CategoriaCadastro("k1", "Sub-17", "Sub-17", atletas = 3, clubeId = clubeId))
    // staff
    override suspend fun equipe(clubeId: String) = Equipe(DonoEquipe("u1", "Marcos Andrade"),
        listOf(Membro("m1", "u2", "ana@x.com", "assistant_coach", aceitoEm = "2026-10-01", nome = "Ana Ribeiro"), Membro("m2", null, "pendente@x.com", "other")),
        ehDono = true, limite = 5)
    override suspend fun convidar(clubeId: String, corpo: JsonObject): String? { chamadas += "convidar"; corpos += corpo; return null }
    override suspend fun atualizar(clubeId: String, membroId: String, corpo: JsonObject) { chamadas += "membro:$membroId"; corpos += corpo }
    override suspend fun remover(clubeId: String, membroId: String) { chamadas += "remover-membro:$membroId" }
    override suspend fun reenviar(clubeId: String, membroId: String): String? { chamadas += "reenviar:$membroId"; return null }
    // stats
    override suspend fun treino(clubeId: String, p: PeriodoStats): StatsTreino { chamadas += "stats-treino:${p.inicio}:${p.fim}"; return StatsTreino(TotaisTreino(12, 600, 4)) }
    override suspend fun jogos(clubeId: String, p: PeriodoStats, campeonato: String?) = StatsJogos(totalMatches = 2, wins = 1, draws = 1, pointsWon = 4, pointsPlayed = 6,
        playerStats = listOf(JogadorStats("a1", "Gabriel Rocha", minutes = 180, appearances = 2, calledUp = 2)), minutesPossible = 180,
        topMinutes = listOf(JogadorStats("a1", "Gabriel Rocha", minutes = 180, appearances = 2)))
    // cadastros
    override suspend fun campeonatos(clubeId: String) = listOf(CampeonatoCad("k1", "Estadual Sub-17", "2026", "Pontos corridos"))
    override suspend fun salvarCampeonato(id: String?, corpo: JsonObject) { chamadas += "campeonato:$id"; corpos += corpo }
    override suspend fun removerCampeonato(id: String) {}
    override suspend fun salvarCategoria(id: String?, corpo: JsonObject) {}
    override suspend fun removerCategoria(id: String) {}
    override suspend fun clubes() = listOf(ClubeCad("c1", "Demo FC", modality = "football_11"))
    override suspend fun limiteClubes() = LimiteClubes(1, 1)
    override suspend fun salvarClube(id: String?, corpo: JsonObject) {}
    override suspend fun arquivarClube(id: String, arquivar: Boolean) {}
    override suspend fun removerClube(id: String) {}
    override suspend fun conteudos() = listOf(ConteudoCad("oo", "Organização Ofensiva", "OO", dimension = "tatico"))
    override suspend fun salvarConteudo(id: String?, corpo: JsonObject) {}
    override suspend fun ativarConteudo(id: String, ativo: Boolean) { chamadas += "ativo:$id:$ativo" }
    override suspend fun removerConteudo(id: String) {}
    override suspend fun submomentos(modalidade: String?) = listOf(SubmomentoCad("s1", "Criação", conteudoId = "oo"))
    override suspend fun salvarSubmomento(id: String?, corpo: JsonObject) {}
    override suspend fun ativarSubmomento(id: String, ativo: Boolean) {}
    override suspend fun removerSubmomento(id: String) {}
    override suspend fun atividades() = listOf(AtividadeCad("t1", "Rondo 5v2", "oo", "Organização Ofensiva"))
    override suspend fun salvarAtividade(id: String?, corpo: JsonObject) {}
    override suspend fun usoAtividade(id: String) = 0
    override suspend fun arquivarAtividade(id: String, arquivar: Boolean) {}

    fun servicos() = ServicosT3(this, this, this, this)
}

@RunWith(RobolectricTestRunner::class)
class TelasT3Test {
    @get:Rule val regra = createComposeRule()
    private val api = ApiFalsa()
    private val controle = ControleSessao(api, CofreSessaoMemoria())
    private val falsas = FalsasT3()

    private fun abrir(permissoes: List<String>) {
        controle.entrou(RespostaLogin("tpa_1", null, me(conta("w1", clubes = listOf(clube("c1", "Demo FC", cats = listOf("Sub-17"))), permissoes = permissoes))))
        regra.setContent {
            App(controle, api, Aparelho("android"), google = null, trava = null, versaoInstalada = "1.0.0",
                fabricaTreino = { _, _ -> ApiTreinoFalsa() }, fabricaT3 = { _, _ -> falsas.servicos() })
        }
    }

    private fun esperar(tag: String) = try {
        regra.waitUntil(5_000) { regra.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    } catch (e: Throwable) { throw AssertionError(regra.onRoot().printToString(), e) }

    private val TODAS = listOf("training:view", "training:edit", "games:view", "athletes:view", "athletes:edit", "injuries:manage",
        "stats:view", "members:manage", "library:edit", "categories:manage", "club_settings:manage", "tactical:view")

    @Test fun `Elenco - grupos em acordeao, DM com resumo, mover e novo atleta com nome formatado`() {
        abrir(TODAS)
        regra.onNodeWithTag("aba:elenco").performClick()
        esperar("elenco:atleta:a1")
        assertTrue(regra.onAllNodesWithTag("elenco:grupo:DM").fetchSemanticsNodes().isNotEmpty())
        assertTrue(regra.onAllNodesWithText("Kauã: lesão muscular · volta ~30/10").fetchSemanticsNodes().isNotEmpty())
        regra.onNodeWithTag("elenco:mover:a1").performSemanticsAction(SemanticsActions.OnClick)
        esperar("elenco:mover:a1:2")
        regra.onNodeWithTag("elenco:mover:a1:2").performClick()
        regra.waitUntil(5_000) { falsas.chamadas.contains("mover:a1:2") }
        regra.onNodeWithTag("elenco:novo").performClick()
        esperar("atleta:nome")
        regra.onNodeWithTag("atleta:nome").performTextInput("joão da silva")
        regra.onNodeWithTag("atleta:posicao").performSemanticsAction(SemanticsActions.OnClick)
        esperar("atleta:posicao:VOL")
        regra.onNodeWithTag("atleta:posicao:VOL").performClick()
        regra.onNodeWithTag("atleta:salvar").performSemanticsAction(SemanticsActions.OnClick)
        regra.waitUntil(5_000) { falsas.chamadas.contains("criar") }
        val c = falsas.corpos.last()
        assertEquals(JsonPrimitive("João da Silva"), c["name"])
        assertEquals(JsonPrimitive("c1"), c["club_id"])
    }

    @Test fun `Staff - dono ve limite, membro, pendente e reenvia`() {
        abrir(TODAS)
        regra.onNodeWithTag("aba:elenco").performClick()
        regra.onNodeWithTag("elenco:aba:1").performClick()
        esperar("staff:membro:m1")
        assertTrue(regra.onAllNodesWithText("Responsável + 5 convidados · 2 em uso, contando convites pendentes").fetchSemanticsNodes().isNotEmpty())
        regra.onNodeWithTag("staff:reenviar:m2").performSemanticsAction(SemanticsActions.OnClick)
        regra.waitUntil(5_000) { falsas.chamadas.contains("reenviar:m2") }
    }

    @Test fun `Estatisticas - atalho da Semana abre o Treino com os cards`() {
        abrir(TODAS)
        esperar("semana:estatisticas")
        regra.onNodeWithTag("semana:estatisticas").performClick()
        regra.waitUntil(5_000) { regra.onAllNodesWithText("Tempo total").fetchSemanticsNodes().isNotEmpty() }
        assertTrue(regra.onAllNodesWithText("10h").fetchSemanticsNodes().isNotEmpty())
        assertTrue(falsas.chamadas.any { it.startsWith("stats-treino:") })
        regra.onNodeWithTag("stats:aba:1").performClick()
        esperar("stats:pontuacao")
        regra.onNodeWithTag("stats:ver-todas").performSemanticsAction(SemanticsActions.OnClick)
        esperar("minutagem:linha:a1")
    }

    @Test fun `Sem stats view o atalho some`() {
        abrir(listOf("training:view", "athletes:view"))
        esperar("aba:semana")
        regra.waitForIdle()
        assertTrue(regra.onAllNodesWithTag("semana:estatisticas").fetchSemanticsNodes().isEmpty())
    }

    @Test fun `Mais - Cadastros - Campeonatos edita mandando o objeto completo`() {
        abrir(TODAS)
        regra.onNodeWithTag("aba:mais").performClick()
        regra.waitUntil(5_000) { regra.onAllNodesWithText("Campeonatos").fetchSemanticsNodes().isNotEmpty() }
        regra.onAllNodesWithText("Campeonatos")[0].performSemanticsAction(SemanticsActions.OnClick)
        esperar("cad:campeonato:k1")
        regra.onNodeWithTag("cad:campeonato:k1").performSemanticsAction(SemanticsActions.OnClick)
        esperar("cad:salvar")
        regra.onNodeWithTag("cad:salvar").performSemanticsAction(SemanticsActions.OnClick)
        regra.waitUntil(5_000) { falsas.chamadas.contains("campeonato:k1") }
        val c = falsas.corpos.last()
        listOf("club_id", "name", "season", "format", "start_date", "end_date", "is_archived").forEach { assertTrue(it, c.containsKey(it)) }
    }
}
