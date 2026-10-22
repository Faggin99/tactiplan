package com.faggin.tactiplan.app.dados

import com.faggin.tactiplan.app.dados.cadastros.ApiCadastrosHttp
import com.faggin.tactiplan.app.dados.cadastros.FormCampeonato
import com.faggin.tactiplan.app.dados.cadastros.LimiteClubes
import com.faggin.tactiplan.app.dados.cadastros.MSG_LIMITE_CATEGORIAS
import com.faggin.tactiplan.app.dados.cadastros.MSG_LIMITE_CLUBES
import com.faggin.tactiplan.app.dados.cadastros.corpoCampeonato
import com.faggin.tactiplan.app.dados.cadastros.mensagemErroCadastro
import com.faggin.tactiplan.app.dados.cadastros.podeCriarClube
import com.faggin.tactiplan.app.dados.cadastros.textoLimiteClubes
import com.faggin.tactiplan.app.dados.elenco.ApiElencoHttp
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.elenco.CATEGORIA_SEM
import com.faggin.tactiplan.app.dados.elenco.FormAtleta
import com.faggin.tactiplan.app.dados.elenco.MSG_ALTURA
import com.faggin.tactiplan.app.dados.elenco.MSG_CAMISA
import com.faggin.tactiplan.app.dados.elenco.MSG_NOME_OBRIGATORIO
import com.faggin.tactiplan.app.dados.elenco.MSG_POSICAO_OBRIGATORIA
import com.faggin.tactiplan.app.dados.elenco.agruparElenco
import com.faggin.tactiplan.app.dados.elenco.corpoAtleta
import com.faggin.tactiplan.app.dados.elenco.erroAtleta
import com.faggin.tactiplan.app.dados.elenco.erroLesao
import com.faggin.tactiplan.app.dados.elenco.idadeEm
import com.faggin.tactiplan.app.dados.estatisticas.ModoPilar
import com.faggin.tactiplan.app.dados.estatisticas.StatsTreino
import com.faggin.tactiplan.app.dados.estatisticas.alternarOrdem
import com.faggin.tactiplan.app.dados.estatisticas.OrdemMinutagem
import com.faggin.tactiplan.app.dados.estatisticas.distribuicaoPilares
import com.faggin.tactiplan.app.dados.estatisticas.maisUsadosPorPilar
import com.faggin.tactiplan.app.dados.estatisticas.nomePdfEstatisticas
import com.faggin.tactiplan.app.dados.staff.ApiStaffHttp
import com.faggin.tactiplan.app.dados.staff.MSG_LIMITE_EQUIPE
import com.faggin.tactiplan.app.dados.staff.MSG_SO_DONO_EQUIPE
import com.faggin.tactiplan.app.dados.staff.corpoMembro
import com.faggin.tactiplan.app.dados.staff.mensagemErroStaff
import com.faggin.tactiplan.app.dados.staff.podeConvidar
import com.faggin.tactiplan.app.dados.staff.resumoPermissoes
import com.faggin.tactiplan.app.dados.staff.textoLimiteEquipe
import com.faggin.tactiplan.app.dados.treino.ArquivoUpload
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Regras e clientes HTTP da T3 (Elenco, Staff, Estatísticas, Cadastros). Paridade: T3Tests.swift.
class T3Test {
    private val srv = MockWebServer().apply { start() }
    private val base = Api(srv.url("/api").toString())
    @After fun fim() = srv.shutdown()
    private fun corpo(): JsonObject = JsonApp.parseToJsonElement(srv.takeRequest().body.readUtf8()) as JsonObject
    private fun neutro(t: String) = assertTrue(t, textoNeutro(t))

    // ---------- Elenco

    @Test fun `erroAtleta na ordem do web`() {
        assertEquals(MSG_NOME_OBRIGATORIO, erroAtleta("  ", "GOL", null, null))
        assertEquals(MSG_POSICAO_OBRIGATORIA, erroAtleta("Ana", null, null, null))
        assertEquals(MSG_CAMISA, erroAtleta("Ana", "GOL", 100, null))
        assertEquals(MSG_ALTURA, erroAtleta("Ana", "GOL", 10, 90))
        assertNull(erroAtleta("Ana", "GOL", 10, 180))
        assertEquals("Informe o tipo da lesão.", erroLesao(" "))
    }

    @Test fun `corpoAtleta completo, nome formatado e foto mantida`() {
        val c = corpoAtleta(FormAtleta("joão da silva", "VOL", 5, grupo = "1", pe = "left", altura = 172), "c1", "/uploads/athlete-photos/x.jpg")
        assertEquals(JsonPrimitive("João da Silva"), c["name"])
        assertEquals(JsonPrimitive("/uploads/athlete-photos/x.jpg"), c["photo_url"])
        assertEquals(JsonPrimitive("c1"), c["club_id"])
        assertEquals(JsonNull, c["category_id"])
        assertEquals(JsonPrimitive("active"), c["status"])
        listOf("name", "position", "jersey_number", "status", "observation", "group", "photo_url", "club_id", "category_id",
            "birthdate", "height_cm", "preferred_foot", "previous_club").forEach { assertTrue(it, c.containsKey(it)) }
    }

    @Test fun `agruparElenco por grupo, busca sem acento, camisa, categoria, posicao e DM`() {
        val a = listOf(
            Atleta("1", "Álvaro Souza", "MEI", 10, grupo = "1", categoriaId = "k1"),
            Atleta("2", "Bruno", "GOL", 1, grupo = "1"),
            Atleta("3", "Caio", "ZAG", 3, grupo = "DM"),
            Atleta("4", "Davi", "CA", 9, grupo = null),
            Atleta("5", "Edu", "LD", 2, grupo = "xyz"),
        )
        val s = agruparElenco(a, lesoesAtivas = mapOf("3" to "lesão muscular · volta ~30/10"))
        assertEquals(listOf("Grupo 1", "Departamento médico", "Sem grupo"), s.map { it.grupo.rotulo })
        assertEquals(listOf("Bruno", "Álvaro Souza"), s[0].atletas.map { it.nome }, )
        assertEquals("Caio: lesão muscular · volta ~30/10", s[1].resumo)
        assertEquals(listOf("Edu", "Davi"), s[2].atletas.map { it.nome })
        assertEquals(listOf("1"), agruparElenco(a, busca = "alvaro").flatMap { s2 -> s2.atletas.map { it.id } })
        assertEquals(listOf("4"), agruparElenco(a, busca = "9").flatMap { s2 -> s2.atletas.map { it.id } })
        assertEquals(4, agruparElenco(a, categoria = CATEGORIA_SEM).sumOf { it.atletas.size })
        assertEquals(listOf("2"), agruparElenco(a, posicao = "GOL").flatMap { s2 -> s2.atletas.map { it.id } })
        assertEquals(listOf("Álvaro Souza", "Bruno"), agruparElenco(a, porPosicao = false)[0].atletas.map { it.nome })
    }

    @Test fun `idade`() {
        assertEquals(17, idadeEm("2009-04-29", "2026-10-22"))
        assertEquals(16, idadeEm("2009-10-23", "2026-10-22"))
        assertNull(idadeEm(null, "2026-10-22"))
    }

    @Test fun `atleta - rotas, multipart da foto e lesoes`() = runBlocking {
        val api = ApiElencoHttp(base, "tpa_x", "ws-1")
        srv.enqueue(MockResponse().setBody("""[{"id":"a1","name":"Ana","position":"GOL","group":"1","jersey_number":1}]"""))
        assertEquals("Ana", api.atletas("c 1")[0].nome)
        val r1 = srv.takeRequest()
        assertEquals("/api/athletes?club_id=c%201", r1.path)
        assertEquals("ws-1", r1.getHeader("x-workspace-id"))
        srv.enqueue(MockResponse().setBody("""{"id":"a1","name":"Ana","photo_url":"/uploads/athlete-photos/n.jpg"}"""))
        val f = api.enviarFoto("a1", ArquivoUpload.deBytes("foto.jpg", "image/jpeg", byteArrayOf(1, 2, 3)))
        assertEquals("/uploads/athlete-photos/n.jpg", f.fotoUrl)
        val r2 = srv.takeRequest()
        assertEquals("/api/athletes/a1/photo", r2.path)
        assertEquals("POST", r2.method)
        assertTrue(r2.body.readUtf8().contains("name=\"photo\"; filename=\"foto.jpg\""))
        srv.enqueue(MockResponse().setBody("[]"))
        api.moverGrupo(listOf("a1", "a2"), "DM")
        val r3 = srv.takeRequest()
        assertEquals("PUT", r3.method)
        assertEquals("/api/athletes/batch-groups", r3.path)
        assertEquals("""{"athletes":[{"id":"a1","group":"DM"},{"id":"a2","group":"DM"}]}""", r3.body.readUtf8())
        srv.enqueue(MockResponse().setBody("""{"data":[{"id":"l1","injury_type":"Entorse","resolved_at":null}]}"""))
        assertTrue(api.lesoes("a1")[0].ativa)
        assertEquals("/api/athletes/a1/injuries", srv.takeRequest().path)
        srv.enqueue(MockResponse().setBody("{}"))
        api.darAlta("l1", "2026-10-22")
        val r4 = srv.takeRequest()
        assertEquals("/api/injuries/l1", r4.path)
        assertEquals("PUT", r4.method)
        assertEquals("""{"resolved_at":"2026-10-22"}""", r4.body.readUtf8())
    }

    // ---------- Staff

    @Test fun `limite da equipe e textos neutros`() {
        assertEquals("Responsável + 5 convidados · 2 em uso, contando convites pendentes", textoLimiteEquipe(2, 5))
        assertEquals("Responsável + 1 convidado · 1 em uso, contando convites pendentes", textoLimiteEquipe(1, 1))
        assertEquals("Sem limite de convidados", textoLimiteEquipe(9, -1))
        assertTrue(podeConvidar(4, 5)); assertFalse(podeConvidar(5, 5)); assertTrue(podeConvidar(50, -1))
        assertFalse(podeConvidar(0, 0)); assertFalse(podeConvidar(0, null))
        val limite = ErroApi(402, "MEMBER_LIMIT", "O seu plano inclui o responsável + 5 convidados.")
        assertEquals(MSG_LIMITE_EQUIPE, mensagemErroStaff(limite))
        assertEquals(MSG_SO_DONO_EQUIPE, mensagemErroStaff(ErroApi(403, null, "Apenas o dono pode convidar")))
        listOf(mensagemErroStaff(limite), mensagemErroStaff(ErroApi(402, "PLAN_REQUIRED", "O plano atual não permite convidar membros.")),
            MSG_SO_DONO_EQUIPE, textoLimiteEquipe(2, 5)!!).forEach(::neutro)
        assertEquals(listOf("Treinos: ver e editar", "Jogos: ver"), resumoPermissoes(setOf("training:view", "training:edit", "games:view")))
    }

    @Test fun `staff - editar sem mexer omite permissions, convite devolve link, reenviar`() = runBlocking {
        val sem = corpoMembro("assistant_coach", null, null, mexeu = false)
        assertFalse(sem.containsKey("permissions"))
        assertEquals(JsonNull, sem["category_ids"])
        val com = corpoMembro("other", listOf("k1"), listOf("training:view"), mexeu = true)
        assertTrue(com.containsKey("permissions"))
        val volta = corpoMembro("other", null, null, mexeu = true)
        assertEquals(JsonNull, volta["permissions"])
        val api = ApiStaffHttp(base, "tpa_x", "ws-1")
        srv.enqueue(MockResponse().setBody("""{"owner":{"id":"u","name":"Dono"},"members":[{"id":"m1","invited_email":"a@b.c","role":"other","permissions":["games:edit"],"accepted_at":null}],"is_owner":true,"limite_convidados":5}"""))
        val e = api.equipe("c1")
        assertEquals("/api/clubs/c1/members", srv.takeRequest().path)
        assertTrue(e.ehDono); assertEquals(5, e.limite); assertEquals(1, e.pendentes.size)
        assertEquals(setOf("games:edit"), e.members[0].efetivas)
        srv.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"m2","accept_url":"https://app/#/accept-invite/tk"}"""))
        assertEquals("https://app/#/accept-invite/tk", api.convidar("c1", JsonObject(emptyMap())))
        assertEquals("/api/clubs/c1/invite", srv.takeRequest().path)
        srv.enqueue(MockResponse().setBody("""{"ok":true,"accept_url":"https://app/#/accept-invite/tk"}"""))
        assertEquals("https://app/#/accept-invite/tk", api.reenviar("c1", "m2"))
        val r = srv.takeRequest()
        assertEquals("/api/clubs/c1/members/m2/resend", r.path)
        assertEquals("POST", r.method)
    }

    // ---------- Estatísticas

    @Test fun `pilares, mais usado e alternar ordem`() {
        val s = JsonApp.decodeFromString(StatsTreino.serializer(), """{"totals":{"activities":3,"minutes":90,"sessions":2},
            "byDimension":[{"dimension":"tatico","count":2,"minutes":60},{"dimension":"fisico","count":1,"minutes":30},{"dimension":"mental","count":0,"minutes":0}],
            "byDimensionPredominance":[{"dimension":"tatico","sessions":2}],
            "byContent":[{"content_id":"a","name":"OO","dimension":"tatico","count":2,"minutes":60},{"content_id":"b","name":"OD","dimension":"tatico","count":2,"minutes":10},{"content_id":"c","name":"Força","dimension":"fisico","count":1,"minutes":30}]}""")
        assertEquals(listOf(67, 33), distribuicaoPilares(s, ModoPilar.TEMPO).map { it.pct })
        assertEquals(listOf("tatico"), distribuicaoPilares(s, ModoPilar.SESSOES).map { it.pilar })
        val mais = maisUsadosPorPilar(s)
        assertEquals(listOf("OO", "Força"), mais.map { it.nome })
        assertEquals("2 atividades · 1h", mais[0].detalhe)
        assertEquals(OrdemMinutagem("minutes", true), alternarOrdem(OrdemMinutagem(), "minutes"))
        assertEquals(OrdemMinutagem("name", true), alternarOrdem(OrdemMinutagem(), "name"))
        assertEquals(OrdemMinutagem("starts", false), alternarOrdem(OrdemMinutagem(), "starts"))
        assertEquals("Estatisticas_Treino_Esporte_Clube_Vila_Nova_1_Microciclo.pdf", nomePdfEstatisticas(true, "Esporte Clube Vila Nova", "1-micro"))
        assertEquals("Desempenho_EC_Sao_Joao_Semestre.pdf", nomePdfEstatisticas(false, "EC São João", "semester"))
    }

    // ---------- Cadastros

    @Test fun `limite de clubes sem preco e 402 neutro`() {
        assertEquals("Clubes ativos: 1 de 1 · clubes arquivados não contam.", textoLimiteClubes(LimiteClubes(1, 1), 1))
        assertEquals("2 clubes ativos · sem limite nesta conta", textoLimiteClubes(LimiteClubes(-1, 2), 2))
        assertFalse(podeCriarClube(LimiteClubes(1, 1), 1)); assertTrue(podeCriarClube(LimiteClubes(-1, 9), 9))
        val addon = ErroApi(402, "ADDON_REQUIRED", "Seu plano permite 1 clube(s) ativo(s). … (R$20/mês por clube).")
        assertEquals(MSG_LIMITE_CLUBES, mensagemErroCadastro(addon))
        assertEquals(MSG_LIMITE_CATEGORIAS, mensagemErroCadastro(ErroApi(402, "PLAN_REQUIRED", "plano Clube"), MSG_LIMITE_CATEGORIAS))
        listOf(textoLimiteClubes(LimiteClubes(1, 1), 1), MSG_LIMITE_CLUBES, MSG_LIMITE_CATEGORIAS).forEach(::neutro)
        assertEquals(TEXTO_NAO_EDITA, mensagemErroCadastro(ErroApi(402, "READ_ONLY", "modo só leitura")))
    }

    @Test fun `campeonato - PUT sempre com o objeto completo`() = runBlocking {
        val api = ApiCadastrosHttp(base, "tpa_x", "ws-1")
        srv.enqueue(MockResponse().setBody("{}"))
        api.salvarCampeonato("k1", corpoCampeonato(FormCampeonato("Estadual", "2026", "", null, null, arquivado = true), "c1"))
        val r = srv.takeRequest()
        assertEquals("PUT", r.method)
        assertEquals("/api/competitions/k1", r.path)
        val c = JsonApp.parseToJsonElement(r.body.readUtf8()) as JsonObject
        listOf("club_id", "name", "season", "format", "start_date", "end_date", "is_archived").forEach { assertTrue(it, c.containsKey(it)) }
        assertEquals(JsonPrimitive(true), c["is_archived"])
        srv.enqueue(MockResponse().setBody("""[{"id":"x","name":"OO","dimension":"tatico","active":false,"workspace_id":null},{"id":"y","name":"Meu","dimension":"tatico","workspace_id":"ws-1"}]"""))
        val cs = api.conteudos()
        assertFalse(cs[0].proprio); assertFalse(cs[0].ativo); assertTrue(cs[1].proprio)
        srv.takeRequest()
        srv.enqueue(MockResponse().setBody("""{"ok":true,"active":true}"""))
        api.ativarConteudo("x", true)
        val r2 = srv.takeRequest()
        assertEquals("PATCH", r2.method); assertEquals("/api/contents/x/active", r2.path); assertEquals("""{"active":true}""", r2.body.readUtf8())
        srv.enqueue(MockResponse().setBody("""{"count":"3"}"""))
        assertEquals(3, api.usoAtividade("t1"))
        assertEquals("/api/titles/t1/usage-count", srv.takeRequest().path)
        srv.enqueue(MockResponse().setBody("{}"))
        api.arquivarClube("c1", arquivar = false)
        val r3 = srv.takeRequest()
        assertEquals("/api/clubs/c1/unarchive", r3.path); assertEquals("POST", r3.method)
    }
}
