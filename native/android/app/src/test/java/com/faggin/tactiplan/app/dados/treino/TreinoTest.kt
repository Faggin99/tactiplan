package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.TEXTO_CLUBE_ARQUIVADO
import com.faggin.tactiplan.app.dados.TEXTO_NAO_EDITA
import java.io.ByteArrayInputStream
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// Porte de TactiPlanKitTests/TreinoTests.swift (paridade).

private fun erro(status: Int, codigo: String?, msg: String = "x") = ErroApi(status, codigo, msg)
private fun s(v: String) = JsonPrimitive(v)

class ModelosTreinoTest {
    @Test fun `microciclo real decodifica com numero em texto e dias em ordem`() {
        val m = microcicloReal()
        assertEquals("2026-40", m.semana)
        assertEquals("2026-09-28", m.inicio)
        assertEquals(2, m.dias.size)
        val seg = m.dias[0]
        assertEquals("2026-09-28", seg.data)
        assertEquals(1, seg.diaDaSemana)
        assertEquals(TipoDia.TREINO, seg.tipo)
        assertEquals(5.2, seg.distanciaKm!!, 1e-9)
        assertEquals(listOf(1, 2, 3), seg.blocos.map { it.ordem })
        val a = seg.blocos[0].atividade!!
        assertEquals(25, a.minutos)
        assertEquals(2, a.anexos)
        assertEquals("Regenerativo + alongamento", a.tituloNome)
        assertEquals("fisico", a.pilar)
        assertEquals("Aeróbio", a.conteudos?.first()?.nome)
        assertEquals(TipoDia.JOGO, m.dias[1].tipo)
        assertEquals("Atlético Serrano", m.dias[1].adversario)
    }

    @Test fun `campos estranhos nao derrubam`() {
        val j = """{"id":"d","date":"2026-10-21T00:00:00.000Z","day_of_week":"3","session_type":"outro","avg_distance_km":"abc","blocks":[{"name":"X","order":"2","activity":{"id":"a","duration_minutes":"15","files_count":null}}]}"""
        val d = JsonApp.decodeFromString(Dia.serializer(), j).normalizado()
        assertEquals("2026-10-21", d.data)
        assertEquals(3, d.diaDaSemana)
        assertEquals(TipoDia.TREINO, d.tipo)
        assertNull(d.distanciaKm)
        assertEquals(2, d.blocos[0].ordem)
        assertEquals(15, d.blocos[0].atividade?.minutos)
        assertNull(d.blocos[0].atividade?.anexos)
    }

    @Test fun `anexo real do upload`() {
        val j = """{"id":"0d5e","session_id":"s","activity_id":"a1","title":"Foto renomeada","file_name":"foto-teste.jpg","file_path":"/uploads/session-files/x.jpg","mime_type":"image/jpeg","file_size":"8229","url":"/uploads/session-files/x.jpg"}"""
        val a = JsonApp.decodeFromString(Anexo.serializer(), j)
        assertEquals(8229, a.tamanho)
        assertEquals("/uploads/session-files/x.jpg", a.caminho)
        assertEquals(EspecieAnexo.FOTO, a.especie)
        assertEquals("Foto renomeada", a.rotulo)
        assertEquals(EspecieAnexo.VIDEO, especieDoAnexo(null, "treino.MOV"))
        assertEquals(EspecieAnexo.PDF, especieDoAnexo("application/pdf", null))
        assertEquals("a.pdf", Anexo("x", titulo = "  ", nomeArquivo = "a.pdf").rotulo)
    }

    @Test fun `cadastros filtram inativos e arquivados`() {
        val c = CadastrosTreino(
            listOf(ConteudoCadastro("c1", "A", dimensao = "fisico"), ConteudoCadastro("c2", "B", dimensao = "fisico", ativo = false)),
            listOf(EtapaCadastro("e1", "E", "c1", ativo = false)),
            listOf(TituloCadastro("t1", "T", "c1", arquivado = true), TituloCadastro("t2", "U", "c1")),
        )
        assertEquals(listOf("c1"), c.conteudos.map { it.id })
        assertTrue(c.etapas.isEmpty())
        assertEquals(listOf("t2"), c.titulos.map { it.id })
    }

    @Test fun `tema do mes`() {
        assertNull(TemaDoMes(false).frase)
        assertEquals("Tema do mês: Saída de pressão · 62%", TemaDoMes(true, TemaDoMes.Conteudo("Saída de pressão"), 62).frase)
    }
}

class SemanaTest {
    @Test fun `semana ISO igual ao web`() {
        assertEquals("2026-43", SemanaISO.de("2026-10-21").identificador)
        assertEquals("2026-10-19", SemanaISO.de("2026-10-21").segunda)
        assertEquals("2026-43", SemanaISO.de("2026-10-25").identificador)
        assertEquals("2026-44", SemanaISO.de("2026-10-26").identificador)
        assertEquals("2026-01", SemanaISO.de("2026-01-01").identificador)
        assertEquals("2026-53", SemanaISO.de("2027-01-01").identificador)
        assertEquals("2025-01", SemanaISO.de("2024-12-30").identificador)
        assertEquals("2026-42", SemanaISO.de("2026-10-21").somando(-1).identificador)
        assertEquals("2027-01", SemanaISO.de("2026-12-31").somando(1).identificador)
    }

    @Test fun `rotulos de periodo e dia`() {
        assertEquals("19–25 out", rotuloPeriodo(SemanaISO.de("2026-10-21")))
        assertEquals("28 set – 4 out", rotuloPeriodo(SemanaISO.de("2026-09-30")))
        assertEquals("Quarta, 21/10", rotuloDiaCurto("2026-10-21"))
        assertEquals("quarta, 21/10", rotuloDiaMinusculo("2026-10-21"))
        assertEquals("SÁB" to "24", siglaEDia("2026-10-24"))
        assertEquals("21/10/2026", dataBR("2026-10-21"))
        assertTrue(dataPassada("2026-10-20", "2026-10-21"))
        assertFalse(dataPassada("2026-10-21", "2026-10-21"))
    }

    @Test fun `hoje no fuso de Brasilia`() {
        val ms = 1_792_548_000_000L
        assertEquals("2026-10-20", hojeBrasilia(ms))
        assertEquals("2026-10-21", hojeBrasilia(ms + 4 * 3_600_000))
    }

    @Test fun `sete dias com vazios onde falta`() {
        val dias = diasDaSemana(microcicloReal(), SemanaISO.de("2026-09-28"))
        assertEquals(7, dias.size)
        assertNotNull(dias[0].id)
        assertNull(dias[1].id)
        assertEquals("Terça", dias[1].nomeDia)
        assertEquals(2, dias[1].diaDaSemana)
        assertEquals(NOMES_BLOCOS, dias[1].blocos.map { it.nome })
        assertEquals(listOf(1, 2, 3, 4, 5, 6), dias[1].blocos.map { it.ordem })
        assertEquals(TipoDia.JOGO, dias[5].tipo)
        val semNada = diasDaSemana(null, SemanaISO.de("2026-10-21"))
        assertEquals("2026-10-19", semNada.first().data)
        assertTrue(semNada.all { it.id == null })
    }

    private var seq = 0
    private fun atv(min: Int?, dims: List<String>, anexos: Int = 0) =
        Atividade("a${seq++}", minutos = min, anexos = anexos, conteudos = dims.map { ConteudoDaAtividade(it, it, dimensao = it) })

    private fun dia(ats: List<Atividade?>, tipo: String? = null, km: Double? = null) =
        Dia("d", "2026-10-21", null, 3, tipo, null, km, ats.mapIndexed { i, a -> Bloco("b$i", "B", i + 1, a) })

    @Test fun `pilar predominante POR TEMPO`() {
        val r = resumoDoDia(dia(listOf(atv(10, listOf("tatico")), atv(10, listOf("tatico")), atv(30, listOf("fisico"), 2), null)))
        assertEquals(listOf("fisico"), r.pilares)
        assertEquals(50, r.minutos)
        assertEquals(3, r.atividades)
        assertEquals(2, r.anexos)
        assertEquals(listOf("tatico" to 20, "fisico" to 30), r.minutosPorPilar)
        assertEquals("Treino · Físico", tituloDaLinha(r))
        assertEquals("Pilar predominante Físico · 3 atividades · 2 anexos", fraseDoHeroi(r))
    }

    @Test fun `empate mostra os dois e sem tempo conta atividades`() {
        val e = resumoDoDia(dia(listOf(atv(20, listOf("fisico")), atv(20, listOf("tatico")))))
        assertEquals(listOf("tatico", "fisico"), e.pilares)
        assertEquals("Tático e Físico", e.rotuloPilares)
        val st = resumoDoDia(dia(listOf(atv(null, listOf("tecnico")), atv(null, listOf("tecnico")), atv(null, listOf("mental")))))
        assertEquals(listOf("tecnico"), st.pilares)
        assertEquals(0, st.minutos)
    }

    @Test fun `linha do dia para jogo descanso e vazio`() {
        assertEquals("Jogo", tituloDaLinha(resumoDoDia(dia(listOf(null), "match"))))
        assertEquals("Jogo vs Rival FC", tituloDaLinha(resumoDoDia(dia(listOf(null), "match").copy(adversario = "Rival FC"))))
        assertEquals("Descanso", tituloDaLinha(resumoDoDia(dia(emptyList(), "rest"))))
        val vazio = resumoDoDia(dia(listOf(null, null), km = 6.2))
        assertEquals("Treino", tituloDaLinha(vazio))
        assertEquals("6,2 km · Sem atividades", detalheDaLinha(vazio))
        assertEquals("Nenhuma atividade planejada", fraseDoHeroi(vazio))
        assertNull(resumoDoDia(dia(listOf(null), "match", 5.0)).distanciaKm)
        assertEquals("88 min · 5,8 km", detalheDaLinha(resumoDoDia(dia(listOf(atv(88, listOf("tatico"))), km = 5.8))))
    }

    @Test fun `distancia igual ao utils do web`() {
        assertEquals("5,2", formatarKm(5.2))
        assertEquals("5,25", formatarKm(5.25))
        assertEquals("5", formatarKm(5.0))
        assertEquals("5,05", formatarKm(5.05))
        assertEquals("", formatarKm(null))
        assertEquals(ResultadoKm.Ok(5.2), lerKm("5,2"))
        assertEquals(ResultadoKm.Ok(5.25), lerKm(" 5.25 "))
        assertEquals(ResultadoKm.Ok(null), lerKm(""))
        assertEquals(ResultadoKm.Erro(MSG_KM_INVALIDO), lerKm("5,255"))
        assertEquals(ResultadoKm.Erro(MSG_KM_INVALIDO), lerKm("abc"))
        assertEquals(ResultadoKm.Erro(MSG_KM_GRANDE), lerKm("100"))
    }
}

class EditarAtividadeTest {
    private val cad = CadastrosTreino(
        listOf(
            ConteudoCadastro("to", "Transição Ofensiva", dimensao = "tatico"),
            ConteudoCadastro("oo", "Org. Ofensiva", dimensao = "tatico"),
            ConteudoCadastro("aer", "Aeróbio", dimensao = "fisico"),
        ),
        listOf(EtapaCadastro("ca", "Contra-ataque", "to"), EtapaCadastro("ar", "Ataque rápido", "to"), EtapaCadastro("sa", "Saída de bola", "oo")),
        listOf(TituloCadastro("t-to", "Saída de pressão", "to"), TituloCadastro("t-oo", "8v8", "oo"), TituloCadastro("t-aer", "Corrida", "aer")),
    )

    @Test fun `carrega da atividade salva como o web`() {
        val a = Atividade("a", tituloId = "t-to", descricao = "Desc", grupos = listOf("G1"), minutos = 20,
            conteudos = listOf(ConteudoDaAtividade("to", "Transição Ofensiva", dimensao = "tatico")),
            etapas = listOf(EtapaDaAtividade(stageId = "ca", nome = "Contra-ataque"), EtapaDaAtividade(stageId = null, nome = "Ataque rápido"),
                EtapaDaAtividade(stageId = "sumiu", nome = "Nada")))
        val f = FormAtividade.de(a, cad)
        assertEquals("tatico", f.pilar)
        assertEquals("to", f.conteudoId)
        assertEquals(listOf("ca", "ar"), f.etapas)
        assertEquals("20", f.minutos)
        assertTrue(f.preenchido)
        assertTrue(f.mostraEtapas)
        assertEquals("Momento do Jogo", f.rotuloConteudo)
        assertEquals(listOf("t-to"), f.titulosDisponiveis(cad).map { it.id })
        assertEquals(listOf("ca", "ar"), f.etapasDisponiveis(cad).map { it.id })
        assertFalse(FormAtividade.de(null, cad).preenchido)
    }

    @Test fun `trocar conteudo limpa atividade e submomentos que nao sao dele`() {
        var f = FormAtividade("tatico", "to", listOf("ca"), "t-to").escolherConteudo("oo", cad)
        assertNull(f.tituloId)
        assertTrue(f.etapas.isEmpty())
        f = f.copy(tituloId = "t-oo").alternarEtapa("sa").escolherConteudo("oo", cad)
        assertEquals("t-oo", f.tituloId)
        assertEquals(listOf("sa"), f.etapas)
    }

    @Test fun `tocar pilar troca ou desmarca e sempre limpa o conteudo`() {
        var f = FormAtividade("tatico", "to", listOf("ca"), "t-to").tocarPilar("fisico", cad)
        assertEquals("fisico", f.pilar)
        assertNull(f.conteudoId)
        assertNull(f.tituloId)
        assertTrue(f.etapas.isEmpty())
        assertFalse(f.mostraEtapas)
        assertEquals(listOf("aer"), f.conteudosDoPilar(cad).map { it.id })
        f = f.tocarPilar("fisico", cad)
        assertNull(f.pilar)
        assertTrue(f.conteudosDoPilar(cad).isEmpty())
    }

    @Test fun `grupos tempo e corpo do POST`() {
        var f = FormAtividade("tatico", "to", listOf("ca"), "t-to", "D").alternarTodosOsGrupos()
        assertEquals(listOf("G1", "G2", "G3", "Transição"), f.grupos)
        assertTrue(f.todosOsGrupos)
        f = f.alternarTodosOsGrupos()
        assertTrue(f.grupos.isEmpty())
        f = f.alternarGrupo("G2").alternarGrupo("G1").alternarGrupo("G2")
        assertEquals(listOf("G1"), f.grupos)
        f = f.somarMinutos(5).somarMinutos(5)
        assertEquals("10", f.minutos)
        assertEquals("", f.somarMinutos(-20).minutos)
        val corpo = f.copy(minutos = "20").corpo("b1")
        assertEquals(s("b1"), corpo["block_id"])
        assertEquals(s("t-to"), corpo["title_id"])
        assertEquals(s("20"), corpo["duration_minutes"])
        assertEquals(JsonArray(listOf(s("to"))), corpo["selectedContents"])
        assertEquals(JsonArray(listOf(s("ca"))), corpo["selectedStages"])
        assertEquals(JsonArray(listOf(s("G1"))), corpo["groups"])
        assertEquals(JsonPrimitive(false), corpo["is_rest"])
        val vazio = FormAtividade().corpo()
        assertEquals(JsonNull, vazio["title_id"])
        assertEquals(JsonNull, vazio["description"])
        assertEquals(JsonNull, vazio["duration_minutes"])
        assertNull(vazio["block_id"])
        assertEquals("20", limparMinutos("2a0 min"))
    }

    @Test fun `regras de anexo`() {
        val vazio = FormAtividade()
        val cheio = FormAtividade(descricao = "x")
        assertEquals(MSG_PREENCHA_ANTES, motivoParaNaoAnexar(vazio, 0, 0))
        assertNull(motivoParaNaoAnexar(cheio, 3, 1))
        assertEquals(MSG_MAX_ANEXOS, motivoParaNaoAnexar(cheio, 3, 2))
        assertEquals(MSG_ANEXO_TIPO, problemaDoArquivo("image/heic", 10))
        assertEquals(MSG_ANEXO_GRANDE, problemaDoArquivo("video/quicktime", MAX_BYTES_ANEXO + 1L))
        assertNull(problemaDoArquivo("application/pdf", 100))
        assertEquals(MSG_ANEXO_ORFAO, validarSalvar(vazio, 1, 0, null))
        assertEquals(MSG_KM_INVALIDO, validarSalvar(cheio, 1, 0, "abc"))
        assertNull(validarSalvar(vazio, 0, 0, "5,2"))
        assertEquals("IMG_2231", tituloDoArquivo("IMG_2231.HEIC"))
        assertEquals("saida", AnexoNovo.de("saida.pdf", "application/pdf", 1, titulo = "  ").tituloFinal)
    }
}

// ---------- ServicoTreino ----------

class ApiTreinoFalsa : ApiTreino {
    val chamadas = mutableListOf<String>()
    var garantido: Microciclo? = null
    val erroAnexo = mutableMapOf<String, Exception>()
    var erroCriar: Exception? = null
    var microcicloResposta: Microciclo? = null
    var cadastrosResposta = CadastrosTreino()
    var anexosResposta = emptyList<Anexo>()

    override suspend fun microciclo(semana: String, clubeId: String): Microciclo? { chamadas += "microciclo:$semana"; return microcicloResposta }
    override suspend fun garantirMicrociclo(semana: String, clubeId: String): Microciclo {
        chamadas += "ensure:$semana:$clubeId"
        return garantido ?: throw ErroApi.offline()
    }
    override suspend fun cadastros(modalidade: String?): CadastrosTreino { chamadas += "cadastros"; return cadastrosResposta }
    override suspend fun criarTitulo(titulo: String, conteudoId: String, descricao: String?): TituloCadastro {
        chamadas += "titulo:$titulo"; return TituloCadastro("t-novo", titulo, conteudoId)
    }
    override suspend fun anexosDoDia(diaId: String): List<Anexo> { chamadas += "anexos:$diaId"; return anexosResposta }
    override suspend fun criarAtividade(corpo: JsonObject): String {
        chamadas += "criar:${(corpo["block_id"] as? JsonPrimitive)?.content ?: ""}"
        erroCriar?.let { throw it }
        return "a-nova"
    }
    override suspend fun atualizarAtividade(id: String, corpo: JsonObject) { chamadas += "atualizar:$id" }
    override suspend fun apagarAtividadeDoBloco(blocoId: String) { chamadas += "apagar:$blocoId" }
    override suspend fun mudarTipo(diaId: String, tipo: TipoDia, adversario: String?) { chamadas += "tipo:$diaId:${tipo.bruto}:${adversario ?: ""}" }
    override suspend fun mudarDistancia(diaId: String, km: Double?) { chamadas += "km:$diaId:${km ?: "nil"}" }
    override suspend fun adicionarPeriodo(diaId: String, novo: Periodo, atual: Periodo?): String {
        chamadas += "periodo+:$diaId:${novo.bruto}:${atual?.bruto ?: ""}"; return "p-novo"
    }
    override suspend fun removerPeriodo(periodoId: String): Int { chamadas += "periodo-:$periodoId"; return 2 }
    override suspend fun trocarPeriodo(periodoId: String, para: Periodo) { chamadas += "periodo~:$periodoId:${para.bruto}" }
    override suspend fun enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String, progresso: (Double) -> Unit): Anexo {
        chamadas += "anexo:$atividadeId:$titulo"
        erroAnexo[titulo]?.let { throw it }
        progresso(0.5); progresso(1.0)
        return Anexo("f-$titulo", atividadeId, titulo = titulo, url = "/uploads/x", tipo = arquivo.tipo)
    }
    override suspend fun renomearAnexo(id: String, titulo: String): Anexo { chamadas += "renomear:$id:$titulo"; return Anexo(id, titulo = titulo) }
    override suspend fun apagarAnexo(id: String) { chamadas += "apagarAnexo:$id" }
    override suspend fun temaDoMes(mes: String, clubeId: String) = TemaDoMes(false)
    override suspend fun fotosDoRelatorio(tipo: String, corpo: Map<String, JsonElement>) = ListaFotosRelatorio()
    override suspend fun htmlDoRelatorio(tipo: String, corpo: Map<String, JsonElement>) = "<html><head></head><body>ficha</body></html>"
    override suspend fun pdfDoRelatorio(tipo: String, corpo: Map<String, JsonElement>) = "%PDF-1.4".toByteArray()
}

class ServicoTreinoTest {
    private val semana = SemanaISO.de("2026-10-21")

    private fun envio(t: String) = EnvioAnexo(AnexoNovo.de("$t.jpg", "image/jpeg", 3, titulo = t),
        ArquivoUpload.deBytes("$t.jpg", "image/jpeg", byteArrayOf(1, 2, 3)))

    private fun garantido() = Microciclo("m", "2026-43", dias = (1..7).map { i ->
        Dia("d$i", somarDias("2026-10-19", i - 1), null, i, blocos = (1..6).map { Bloco("b$i-$it", NOMES_BLOCOS[it - 1], it) })
    })

    @Test fun `dia novo - ensure, cria, distancia e SO ENTAO os anexos`() = runBlocking {
        val api = ApiTreinoFalsa().apply { garantido = garantido() }
        val etapas = mutableListOf<Etapa>()
        val r = ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", diaVazio("2026-10-21"), 3, FormAtividade(descricao = "x"),
            MudarKm(5.2), listOf(envio("um"), envio("dois")))) { etapas += it }
        assertEquals(listOf("ensure:2026-43:c1", "criar:b3-3", "km:d3:5.2", "anexo:a-nova:um", "anexo:a-nova:dois"), api.chamadas)
        assertEquals("d3", r.diaId)
        assertEquals("a-nova", r.atividadeId)
        assertEquals(listOf("f-um", "f-dois"), r.anexosEnviados.map { it.id })
        assertNull(r.mensagemFalhas)
        assertEquals(Etapa.Preparando, etapas.first())
        assertTrue(Etapa.Enviando(1, 2, 1.0) in etapas)
    }

    @Test fun `dia existente com atividade - atualiza sem ensure`() = runBlocking {
        val api = ApiTreinoFalsa()
        val d0 = garantido().dias[2]
        val d = d0.copy(blocos = d0.blocos.mapIndexed { i, b -> if (i == 0) b.copy(atividade = Atividade("a-velha")) else b })
        ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", d, 1, FormAtividade(minutos = "20")))
        assertEquals(listOf("atualizar:a-velha"), api.chamadas)
    }

    @Test fun `bloco esvaziado apaga e bloco vazio sem atividade nao chama nada`() = runBlocking {
        val api = ApiTreinoFalsa()
        val d0 = garantido().dias[2]
        val d = d0.copy(blocos = d0.blocos.mapIndexed { i, b -> if (i == 1) b.copy(atividade = Atividade("a-velha")) else b })
        val r = ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", d, 2, FormAtividade()))
        assertEquals(listOf("apagar:b3-2"), api.chamadas)
        assertNull(r.atividadeId)
        val api2 = ApiTreinoFalsa()
        ServicoTreino(api2).salvar(PedidoSalvar(semana, "c1", d, 3, FormAtividade()))
        assertTrue(api2.chamadas.isEmpty())
    }

    @Test fun `anexo que falha nao desfaz o resto e 401 sobe`() = runBlocking {
        val api = ApiTreinoFalsa()
        api.erroAnexo["dois"] = erro(409, null, "Máximo de 5 anexos por atividade")
        val d = garantido().dias[0]
        val r = ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", d, 1, FormAtividade(descricao = "x"), anexos = listOf(envio("um"), envio("dois"), envio("tres"))))
        assertEquals(2, r.anexosEnviados.size)
        assertEquals(1, r.anexosComFalha.size)
        assertEquals("1 anexo não foi enviado. Abra a atividade e tente de novo.", r.mensagemFalhas)
        api.erroAnexo["um"] = erro(401, "SESSAO_INVALIDA")
        try {
            ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", d, 1, FormAtividade(descricao = "x"), anexos = listOf(envio("um"))))
            fail("esperava 401")
        } catch (e: ErroApi) { assertEquals(401, e.status) }
    }

    @Test fun `erro ao criar para tudo antes dos anexos`() = runBlocking {
        val api = ApiTreinoFalsa().apply { erroCriar = erro(402, "READ_ONLY") }
        try {
            ServicoTreino(api).salvar(PedidoSalvar(semana, "c1", garantido().dias[0], 1, FormAtividade(descricao = "x"), anexos = listOf(envio("um"))))
            fail("esperava erro")
        } catch (_: ErroApi) {}
        assertFalse(api.chamadas.any { it.startsWith("anexo") })
    }

    @Test fun `tipo e distancia criam o dia antes`() = runBlocking {
        val api = ApiTreinoFalsa().apply { garantido = garantido() }
        val sv = ServicoTreino(api)
        assertEquals("d6", sv.mudarTipo(diaVazio("2026-10-24"), TipoDia.JOGO, " Rival ", semana, "c1"))
        sv.mudarDistancia(garantido().dias[0], null, semana, "c1")
        assertEquals(listOf("ensure:2026-43:c1", "tipo:d6:match: Rival ", "km:d1:nil"), api.chamadas)
    }

    @Test fun `mensagens amigaveis`() {
        assertEquals(MSG_SEM_PERMISSAO_TREINO, mensagemErroTreino(erro(403, null, "Sem permissão")))
        assertEquals(MSG_SEM_PERMISSAO_APAGAR, mensagemErroTreino(erro(403, null), MSG_SEM_PERMISSAO_APAGAR))
        assertEquals(TEXTO_NAO_EDITA, mensagemErroTreino(erro(402, "READ_ONLY", "Esta conta está em modo só leitura")))
        assertEquals(TEXTO_CLUBE_ARQUIVADO, mensagemErroTreino(erro(409, "CLUB_ARCHIVED")))
        assertEquals(MSG_NAO_EXPORTA, mensagemErroTreino(erro(402, "PLAN_REQUIRED", "As exportações não estão incluídas no seu plano atual.")))
        assertEquals("Máximo de 5 anexos por atividade", mensagemErroTreino(erro(409, null, "Máximo de 5 anexos por atividade")))
    }

    @Test fun `corpos e nomes dos relatorios`() {
        assertEquals(mapOf("club_id" to s("c1"), "start_date" to s("2026-10-19"), "end_date" to s("2026-10-25"), "filter_type" to s("1-micro")),
            corpoRelatorioSemana(semana, "c1"))
        assertEquals(mapOf("session_id" to s("d1")), corpoFichaDoDia("d1"))
        assertEquals("treino-Terca-20-10-2026.pdf", nomePdfDoDia(Dia(data = "2026-10-20", nomeDia = "Terça", diaDaSemanaBruto = 2)))
        assertEquals("Estatisticas_Treino_Esporte_Clube_Vila_Nova_Semana_43_2026.pdf", nomePdfDaSemana(semana, "Esporte Clube Vila Nova"))
        assertEquals("Sao_PauloFC", nomeArquivoSeguro("São  Paulo/FC"))
    }

    @Test fun `corpo com progresso le em pedacos e chega a 1`() {
        val bytes = ByteArray(200_000) { (it % 7).toByte() }
        val prog = mutableListOf<Double>()
        val corpo = CorpoComProgresso(ArquivoUpload("v.mp4", "video/mp4", bytes.size.toLong()) { ByteArrayInputStream(bytes) }) { prog += it }
        val buf = okio.Buffer()
        corpo.writeTo(buf)
        assertEquals(200_000L, buf.size)
        assertEquals(200_000L, corpo.contentLength())
        assertTrue(prog.size >= 3)
        assertEquals(1.0, prog.last(), 1e-9)
    }
}

// ---------- Fotos do relatório ----------

class FotosRelatorioTest {
    private fun lista(semana: Boolean) = ListaFotosRelatorio(
        listOf(
            FotoRelatorio("a", "2026-10-22", "Quinta-feira", "22/10", "A"),
            FotoRelatorio("b", "2026-10-21", "Quarta-feira", "21/10", "B"),
            FotoRelatorio("c", "2026-10-22", "Quinta-feira", "22/10", "C"),
        ), 3, semana, 2, ListaFotosRelatorio.Padrao(listOf("a", "x"), "grande", "1:1"),
    )

    @Test fun `padrao do servidor e preferencias lembradas`() {
        val e = EscolhaFotos.de(lista(false))
        assertEquals("grande", e.layout)
        assertEquals("1:1", e.proporcao)
        assertTrue(e.marcada("a") && !e.marcada("b"))
        assertEquals(100, e.tamanho)
        assertEquals("fim", e.posicao)
        val p = EscolhaFotos.de(lista(false), PreferenciasFotos("mosaico", "zzz", posicao = "blocos", tamanho = 30))
        assertEquals("mosaico", p.layout)
        assertEquals("1:1", p.proporcao)
        assertEquals("blocos", p.posicao)
        assertEquals(50, p.tamanho)
        assertEquals("Ficha", p.rotuloPrevia)
    }

    @Test fun `agrupa por dia so na semana e move dentro do dia`() {
        var e = EscolhaFotos.de(lista(true))
        assertEquals(listOf("Quarta-feira · 21/10", "Quinta-feira · 22/10"), e.grupos.map { it.rotulo })
        assertEquals(listOf("b", "a", "c"), e.ordemExibida)
        assertFalse(e.podeMover("b", 1))
        e = e.mover("a", 1)
        assertEquals(listOf("b", "c", "a"), e.ordemExibida)
        e = e.copy(agrupar = false)
        assertEquals(1, e.grupos.size)
        assertTrue(e.podeMover("b", 1))
        assertEquals(1, EscolhaFotos.de(lista(false)).grupos.size)
    }

    @Test fun `limite de selecao e legendas`() {
        var e = EscolhaFotos.de(lista(false))
        val (e1, a1) = e.alternar("b"); e = e1
        assertNull(a1)
        assertEquals("No máximo 2 fotos por relatório.", e.alternar("c").second)
        assertEquals(2, e.quantasSelecionadas)
        e = e.nenhuma()
        val (e2, a2) = e.selecionarTodas(); e = e2
        assertEquals("Selecionadas as primeiras 2 (máximo por relatório).", a2)
        assertEquals(2, e.quantasSelecionadas)
        e = e.editarLegenda("a", "A")
        assertFalse(e.legendaEditada("a"))
        e = e.editarLegenda("a", "x".repeat(200))
        assertEquals(MAX_LEGENDA_FOTO, e.legenda("a").length)
        assertEquals("A", e.restaurarLegenda("a").legenda("a"))
    }

    @Test fun `configuracao igual ao modal do web`() {
        val e = EscolhaFotos.de(lista(false)).alternar("b").first.editarLegenda("b", "Rondo").mudarTamanho(74.0).copy(posicao = "blocos")
        val c = e.configuracao
        assertEquals(JsonArray(listOf(s("a"), s("b"))), c["ids"])
        assertEquals(JsonObject(mapOf("b" to s("Rondo"))), c["legendasCustom"])
        assertEquals(70, (c["tamanho"] as JsonPrimitive).content.toDouble().toInt())
        assertEquals(s("blocos"), c["posicao"])
        assertEquals(s("grande"), c["layout"])
        assertNull(EscolhaFotos.de(lista(true)).configuracao["posicao"])
        val base = mapOf<String, JsonElement>("session_id" to s("d1"))
        val semFotos = JsonObject(mapOf("ids" to JsonArray(emptyList())))
        assertEquals(base, corpoComFotos(base, e, ModoExportarFotos.AUTOMATICO))
        assertEquals(semFotos, corpoComFotos(base, e, ModoExportarFotos.SEM_FOTOS)["fotos"])
        assertEquals(semFotos, corpoComFotos(base, e.nenhuma(), ModoExportarFotos.ESCOLHIDAS)["fotos"])
        assertEquals(c, corpoComFotos(base, e, ModoExportarFotos.ESCOLHIDAS)["fotos"])
    }

    @Test fun `html para o WebView e miniatura`() {
        assertTrue(htmlParaWebView("<html><head><style></style>").startsWith("<html><head><meta name=\"viewport\" content=\"width=820\">"))
        assertTrue(htmlParaWebView("<p>x</p>").startsWith("<meta name=\"viewport\""))
        assertTrue(bytesDaMiniatura("data:image/jpeg;base64,AQID")!!.contentEquals(byteArrayOf(1, 2, 3)))
        assertNull(bytesDaMiniatura("https://x/y.jpg"))
    }
}
