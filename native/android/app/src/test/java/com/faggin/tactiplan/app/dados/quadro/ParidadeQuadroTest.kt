package com.faggin.tactiplan.app.dados.quadro

import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.jogo.arquivoDoRepo
import kotlin.math.abs
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// PARIDADE T5 (quadro tático) com o web: native/paridade/quadro.json é gerado do código do web
// (node native/paridade/gerar-quadro.mjs; o npm test do backend falha se ficar desatualizado).
// O iPhone lê o mesmo arquivo (ParidadeQuadroTests.swift).

private val Q: JsonObject by lazy { JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/quadro.json").readText()) as JsonObject }
private fun JsonElement?.o() = this as JsonObject
private fun JsonElement?.l() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.d(): Double = ((this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.doubleOrNull) ?: Double.NaN
private fun JsonElement?.s(): String? = this.texto()
private fun JsonElement?.b(): Boolean? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

private fun perto(a: Double, b: Double) = a == b || abs(a - b) <= 1e-9 * maxOf(1.0, abs(a), abs(b))

/** Igualdade de JSON com folga de 1e-9 nos números (ordem de chaves não importa). */
fun jsonQuase(a: JsonElement?, b: JsonElement?): Boolean {
    val x = a ?: JsonNull; val y = b ?: JsonNull
    return when {
        x is JsonObject && y is JsonObject -> x.keys == y.keys && x.all { (k, v) -> jsonQuase(v, y[k]) }
        x is JsonArray && y is JsonArray -> x.size == y.size && x.indices.all { jsonQuase(x[it], y[it]) }
        x is JsonNull || y is JsonNull -> x is JsonNull && y is JsonNull
        x is JsonPrimitive && y is JsonPrimitive -> when {
            x.isString || y.isString -> x.isString == y.isString && x.content == y.content
            x.booleanOrNull != null || y.booleanOrNull != null -> x.booleanOrNull == y.booleanOrNull
            else -> perto(x.doubleOrNull ?: Double.NaN, y.doubleOrNull ?: Double.NaN)
        }
        else -> false
    }
}

private fun normalizarQuadros(qs: List<QuadroJogada>): Pair<JsonArray, Map<String, String>> {
    val mapa = LinkedHashMap<String, String>()
    fun nome(id: JsonElement?): JsonElement {
        val s = id.texto() ?: return id ?: JsonNull
        return txt(mapa.getOrPut(s) { "#${mapa.size + 1}" })
    }
    val frames = qs.map { q ->
        JsonObject(q.extras + mapOf(
            "elements" to JsonArray(q.elementos.map { JsonObject(it.dados + ("id" to nome(it.dados["id"]))) }),
            "drawings" to JsonArray(q.desenhos.map { JsonObject(it.dados + ("id" to nome(it.dados["id"]))) }),
        ))
    }
    return JsonArray(frames) to mapa
}

private fun estado(e: EditorQuadro): JsonObject {
    val (frames, mapa) = normalizarQuadros(e.quadros)
    fun sel(id: String?): JsonElement = if (id == null) JsonNull else txt(mapa[id] ?: "?")
    return JsonObject(mapOf(
        "frames" to frames, "currentFrameIndex" to num(e.atual), "canUndo" to JsonPrimitive(e.podeDesfazer),
        "canRedo" to JsonPrimitive(e.podeRefazer), "isDirty" to JsonPrimitive(e.alterado), "fieldType" to txt(e.tipoCampo),
        "fieldView" to txt(e.vista), "teamAColor" to txt(e.corA), "teamBColor" to txt(e.corB),
        "selectedElementId" to sel(e.pecaSelecionada), "selectedDrawingId" to sel(e.desenhoSelecionado),
    ))
}

private fun posicoes(j: JsonElement?) = j.l().map { p ->
    PosicaoFormacao(p.o()["x"].d(), p.o()["y"].d(), p.o()["jerseyNumber"].d().toInt(), p.o()["name"].s().orEmpty(), verdadeiroJs(p.o()["isGoalkeeper"]))
}

private fun rodar(nome: String, passos: JsonArray, tipoInicial: String = "football_11") {
    var e = EditorQuadro(tipoInicial) { 1_767_225_600_000 }
    val refs = HashMap<Int, String>()
    passos.forEachIndexed { k, passo ->
        val a = passo.o()["acao"].o()
        val ref = a["ref"]?.takeIf { it !is JsonNull }?.d()?.let { refs[it.toInt()] ?: "?" }
        var resultado: JsonElement = JsonNull
        when (val op = a["op"].s()) {
            "addElement" -> { val (n, id) = e.adicionarPeca(a["data"].o()); e = n; refs[k] = id }
            "removeElement" -> e = e.removerPeca(ref!!)
            "updateElementPosition" -> e = e.moverPeca(ref!!, a["x"].d(), a["y"].d())
            "updateElementProps" -> e = e.alterarPeca(ref!!, a["patch"].o())
            "nextGenericJersey" -> resultado = num(e.proximaCamisa(a["team"].s()!!))
            "applyFormations" -> {
                val (n, r) = e.aplicarFormacoes(a["apps"].l().map { AplicacaoFormacao(it.o()["team"].s()!!, posicoes(it.o()["positions"])) })
                e = n
                resultado = JsonObject(mapOf("repositioned" to num(r.reposicionados), "added" to num(r.adicionados), "kept" to num(r.mantidos)))
            }
            "addDrawing" -> { val (n, id) = e.adicionarDesenho(a["data"].o()); e = n; refs[k] = id }
            "removeDrawing" -> e = e.removerDesenho(ref!!)
            "updateDrawing" -> e = e.alterarDesenho(ref!!, a["patch"].o())
            "selectElement" -> e = e.selecionarPeca(ref)
            "selectDrawing" -> e = e.selecionarDesenho(ref)
            "addFrame" -> e = e.adicionarQuadro()
            "deleteFrame" -> e = e.excluirQuadro()
            "goToFrame" -> e = e.irParaQuadro(a["index"].d().toInt())
            "goToNextFrame" -> e = e.proximo()
            "goToPrevFrame" -> e = e.anterior()
            "undo" -> e = e.desfazer()
            "redo" -> e = e.refazer()
            "markSaved" -> e = e.marcarSalvo()
            "resetBoard" -> e = e.limpar()
            "loadPlay" -> e = e.abrir(a["play"].o())
            "setFieldType" -> e = e.definirTipoCampo(a["value"].s()!!)
            "setFieldView" -> e = e.definirVista(a["value"].s()!!)
            "setTeamAColor" -> e = e.definirCorA(a["value"].s()!!)
            "setTeamBColor" -> e = e.definirCorB(a["value"].s()!!)
            "getPlayData" -> resultado = JsonObject(e.dadosDaJogada() + ("keyframes" to normalizarQuadros(e.quadros).first))
            else -> error("op desconhecida $op")
        }
        val p = passo.o()
        assertTrue("$nome passo $k ${a["op"]} resultado", jsonQuase(resultado, p["resultado"]))
        val est = p["estado"]
        if (est != null) {
            assertTrue("$nome passo $k ${a["op"]} estado\n${estado(e)}\n$est", jsonQuase(estado(e), est))
        } else {
            val m = p["marcas"].o()
            assertEquals("$nome $k atual", m["currentFrameIndex"].d().toInt(), e.atual)
            assertEquals("$nome $k desfazer", m["canUndo"].b(), e.podeDesfazer)
            assertEquals("$nome $k refazer", m["canRedo"].b(), e.podeRefazer)
            assertEquals("$nome $k alterado", m["isDirty"].b(), e.alterado)
            assertEquals("$nome $k peças", m["pecas"].l().map { it.d().toInt() }, e.quadros.map { it.elementos.size })
        }
    }
}

class ParidadeQuadroTest {
    @Test fun `medidas, vistas e conversao iguais ao fieldDimensions`() {
        val c = Q["campo"].o()
        assertEquals(mapOf("FOOTBALL_11" to TipoCampo.FUTEBOL_11, "FOOTBALL_7" to TipoCampo.FUTEBOL_7, "FUTSAL" to TipoCampo.FUTSAL),
            c["tipos"].o().mapValues { it.value.s() })
        assertEquals(VistaCampo.todas.toSet(), c["vistas"].o().values.map { it.s() }.toSet())
        c["medidas"].o().forEach { (tipo, m) ->
            val f = medidasCampo(tipo); val o = m.o()
            assertEquals(tipo, o["length"].d(), f.comprimento, 0.0); assertEquals(o["width"].d(), f.largura, 0.0)
            assertEquals(o["penaltySpot"].d(), f.marcaPenalti, 0.0); assertEquals(o["centerCircle"].d(), f.circuloCentral, 0.0)
            assertEquals(o["cornerRadius"].d(), f.raioEscanteio, 0.0)
            assertEquals(o["goal"].o()["width"].d(), f.gol.largura, 0.0); assertEquals(o["goal"].o()["depth"].d(), f.gol.profundidade, 0.0)
            assertEquals(o["penaltyArea"]?.let { it.o()["depth"].d() }, f.grandeArea?.profundidade)
            assertEquals(o["penaltyArea"]?.let { it.o()["width"].d() }, f.grandeArea?.largura)
            assertEquals(o["goalArea"]?.let { it.o()["depth"].d() }, f.pequenaArea?.profundidade)
            assertEquals(o["goalArea"]?.let { it.o()["width"].d() }, f.pequenaArea?.largura)
            assertEquals(o["penaltyArcRadius"]?.takeIf { it !is JsonNull }?.d(), f.raioMeiaLua)
            assertEquals(o["futsalAreaRadius"]?.d(), f.raioAreaFutsal)
            assertEquals(o["secondPenaltySpot"]?.d(), f.segundoPenalti)
            assertTrue(perto(meiaLuaGraus(tipo), c["meiaLua"].o()[tipo].d()))
        }
        c["conversao"].l().forEach { cv ->
            val o = cv.o()
            assertTrue(perto(paraPixel(o["pct"].d(), o["total"].d()), o["px"].d()))
            assertTrue(perto(paraPercentual(o["px"].d(), o["total"].d()), o["volta"].d()))
        }
        c["clamp"].l().forEach { cl ->
            val o = cl.o(); val l = o["limites"].o()
            val (x, y) = prender(o["x"].d(), o["y"].d(), LimitesArrasto(l["minX"].d(), l["maxX"].d(), l["minY"].d(), l["maxY"].d()))
            assertTrue(perto(x, o["saida"].o()["x"].d()) && perto(y, o["saida"].o()["y"].d()))
        }
    }

    @Test fun `dimensoes do canvas, limites de arrasto e geometria iguais ao web`() {
        Q["campo"].o()["dimensoes"].l().forEach { caso ->
            val en = caso.o()["entrada"].o()
            val d = dimensoesCanvas(en["w"].d(), en["h"].d(), en["tipo"].s(), en["vista"].s(), en["reserva"].d())
            val w = caso.o()["dims"].o()
            assertEquals("$en", listOf(w["stageWidth"].d(), w["stageHeight"].d(), w["fieldX"].d(), w["fieldY"].d(), w["width"].d(), w["height"].d()),
                listOf(d.larguraTela, d.alturaTela, d.campoX, d.campoY, d.largura, d.altura))
            for ((chave, margem) in listOf("limites20" to 20.0, "limites4" to 4.0)) {
                val l = limitesArrasto(d, margem); val e = caso.o()[chave].o()
                assertTrue("$en $chave", perto(l.minX, e["minX"].d()) && perto(l.maxX, e["maxX"].d()) && perto(l.minY, e["minY"].d()) && perto(l.maxY, e["maxY"].d()))
            }
            val g = geometriaCampo(en["tipo"].s(), en["vista"].s(), d); val ge = caso.o()["geometria"].o()
            assertTrue("$en geometria", perto(g.s, ge["s"].d()) && perto(g.ox, ge["ox"].d()) && perto(g.oy, ge["oy"].d()))
            assertTrue("$en", perto(g.x(0.0), ge["x0"].d()) && perto(g.x(g.medidas.comprimento), ge["xL"].d()))
            val clip = ge["clip"].o()
            if (clip.containsKey("clipX")) {
                assertTrue("$en recorte", perto(g.recorte!!.first, clip["clipX"].d()) && perto(g.recorte!!.second, clip["clipWidth"].d()))
            } else assertNull("$en", g.recorte)
        }
    }

    @Test fun `formacoes e espelho iguais ao defaultFormations`() {
        Q["formacoes"].o().forEach { (tipo, fs) ->
            val meus = formacoesDoCampo(tipo); val web = fs.l()
            assertEquals(tipo, web.map { it.o()["chave"].s() }, meus.map { it.chave })
            meus.zip(web).forEach { (m, w) ->
                assertEquals(w.o()["rotulo"].s(), m.rotulo)
                assertEquals("$tipo ${m.chave}", posicoes(w.o()["posicoes"]), m.posicoes)
                assertEquals("$tipo ${m.chave} espelho", posicoes(w.o()["espelho"]), espelharFormacao(m.posicoes))
            }
        }
        val f = FORMACOES_F11[0]
        assertEquals(listOf(espelharFormacao(f.posicoes)), aplicacoesDaFormacao(f, AlvoFormacao.B).map { it.posicoes })
        assertEquals(listOf("A", "B"), aplicacoesDaFormacao(f, AlvoFormacao.AMBOS).map { it.time })
        assertEquals("4-4-2 aplicada aos dois times · 2 jogadores mantidos fora da formação", avisoFormacao(f, AlvoFormacao.AMBOS, ResultadoFormacao(1, 0, 2)))
        assertEquals("4-4-2 aplicada ao Time A · 1 jogador mantido fora da formação", avisoFormacao(f, AlvoFormacao.A, ResultadoFormacao(1, 0, 1)))
    }

    @Test fun `interpolacao igual ao web`() {
        val real = Jogada(Q["jogadaReal"].o()).quadros
        Q["interpolacao"].l().forEach { c ->
            val o = c.o()
            val (a, b) = if (o.containsKey("quadroA")) QuadroJogada.de(o["quadroA"]) to o["quadroB"]?.takeIf { it !is JsonNull }?.let { QuadroJogada.de(it) }
            else real[o["a"].d().toInt()] to real[o["b"].d().toInt()]
            val meu = JsonArray(interpolarPecas(a, b, o["t"].d()).map { JsonObject(it.dados) })
            assertTrue("t=${o["t"]}", jsonQuase(meu, o["saida"]))
        }
    }

    @Test fun `desenho igual ao TacticalCanvas e ao Konva`() {
        val d = Q["desenho"].o()
        d["rgba"].l().forEach { c -> assertEquals("$c", c.o()["saida"].s(), hexParaRgba(c.o()["cor"].s(), c.o()["alfa"].d())) }
        val w = d["dimsDesenho"].o()
        val dims = DimensoesCanvas(w["stageWidth"].d(), w["stageHeight"].d(), w["fieldX"].d(), w["fieldY"].d(), w["width"].d(), w["height"].d())
        d["tracos"].l().forEach { t ->
            val o = t.o(); val x1 = o["x1"].d(); val y1 = o["y1"].d(); val x2 = o["x2"].d(); val y2 = o["y2"].d()
            val (cx, cy) = controleCurva(x1, y1, x2, y2)
            assertTrue(perto(cx, o["curva"].o()["cx"].d()) && perto(cy, o["curva"].o()["cy"].d()))
            assertTrue(perto(raioZonaPct(x1, y1, x2, y2, dims), o["raio"].d()))
            assertTrue(perto(distanciaPx(x1, y1, x2, y2, dims), o["distPx"].d()))
            val r = RascunhoDesenho("arrow_straight", "#fff", emptyList(), inicioX = x1, inicioY = y1).mover(x2, y2)
            assertEquals("$t", o["valido"].b(), r.terminar(x2, y2, dims) != null)
        }
        d["livre"].l().forEach { l ->
            val meu = pontosDeTensao(l.o()["pontos"].l().map { it.d() }, l.o()["tensao"].d())
            val web = l.o()["controle"].l().map { it.d() }
            assertTrue("$l", meu.size == web.size && meu.zip(web).all { (a, b) -> perto(a, b) })
        }
        d["nomeToken"].l().forEach { c -> assertEquals(c.o()["saida"].s(), nomeNoToken(c.o()["nome"].s()!!)) }
        d["camisa"].l().forEach { c ->
            val esperado = c.o()["saida"]?.takeIf { it !is JsonNull }?.d()?.toInt()
            assertEquals("$c", esperado, camisaConfirmada(c.o()["valor"].s()!!, c.o()["atual"]))
        }
        d["nomeSelecao"].l().forEach { c -> assertEquals(c.o()["saida"].s(), nomeConfirmado(c.o()["valor"].s()!!)) }
        d["rotacao"].l().forEach { c -> assertEquals("$c", c.o()["saida"].d(), girar(c.o()["rotacao"].d(), c.o()["delta"].d()), 0.0) }
    }

    @Test fun `catalogos iguais a pagina do quadro`() {
        val c = Q["catalogos"].o()
        assertEquals(c["setas"].l().map { listOf(it.o()["id"].s(), it.o()["mode"].s(), it.o()["label"].s(), it.o()["desc"].s(), it.o()["color"].s()) },
            FERRAMENTAS_SETA.map { listOf(it.id, it.modo, it.rotulo, it.descricao, it.cor) })
        assertEquals(c["setas"].l().map { s -> s.o()["dash"].l().map { it.d() } }, FERRAMENTAS_SETA.map { it.tracejado })
        assertEquals(c["objetos"].l().map { Triple(it.o()["type"].s(), it.o()["label"].s(), it.o()["icon"].s()) }, TIPOS_OBJETO.map { Triple(it.tipo, it.rotulo, it.icone) })
        assertEquals(c["vistas"].l().map { it.o()["view"].s() to it.o()["label"].s() }, VISTAS_CAMPO)
        assertEquals(c["tiposCampo"].l().map { it.o()["type"].s() to it.o()["label"].s() }, TIPOS_CAMPO)
        assertEquals(c["coresDesenho"].l().map { it.s() }, CORES_DESENHO)
        assertEquals(c["velocidades"].l().map { it.d() }, VELOCIDADES_QUADRO)
        assertEquals(c["girar"].l().map { it.s() }.toSet(), OBJETOS_QUE_GIRAM)
    }

    @Test fun `ritmo do play e do video igual ao web`() {
        val r = Q["ritmo"].o()
        assertEquals(r["quadroMs"].d(), QUADRO_MS, 0.0)
        assertEquals(r["video"].o()["fps"].d(), VIDEO_FPS.toDouble(), 0.0)
        assertEquals(r["video"].o()["quadroMs"].d(), VIDEO_QUADRO_MS, 0.0)
        r["video"].o()["linhas"].l().forEach { l ->
            val n = l.o()["quadros"].d().toInt()
            assertEquals("$n", l.o()["total"].d().toInt(), linhaDoVideo(n).size)
            assertTrue(perto(linhaDoVideo(n).size.toDouble() / VIDEO_FPS, l.o()["segundos"].d()))
        }
        val web = r["video"].o()["linha3"].l(); val meu = linhaDoVideo(3)
        assertEquals(web.size, meu.size)
        meu.zip(web).forEach { (m, w) -> assertTrue(m.first == w.l()[0].d().toInt() && perto(m.second, w.l()[1].d())) }
    }

    @Test fun `editor igual ao useTacticalBoard`() {
        for (nome in listOf("pecasEQuadros", "desfazerRefazerESalvo", "limiteDoHistorico", "limiteComSalvo", "desenhos", "formacoes", "abrirESalvar")) {
            rodar(nome, Q["editor"].o()[nome].l())
        }
        rodar("inicialFutsal", Q["editor"].o()["inicialFutsal"].l(), "futsal")
    }

    @Test fun `jogada real abre e salva igual ao web`() {
        Q["salvar"].l().forEach { c ->
            val o = c.o()
            val corpo = EditorQuadro().abrir(o["jogada"].o()).corpoSalvar(o["nome"].s()!!, o["descricao"].s()!!, o["clubeId"].s())
            assertTrue("${o["nome"]}", jsonQuase(corpo, o["corpo"]))
            assertTrue(jsonQuase(corpoDaJogada(Jogada(o["jogada"].o()), o["nome"].s()!!, o["descricao"].s()!!, o["clubeId"].s()), o["corpo"]))
        }
        val real = Q["jogadaReal"].o()
        val e = EditorQuadro().abrir(real)
        assertTrue(jsonQuase(e.dadosDaJogada()["keyframes"], real["keyframes"]))
        assertTrue(!e.alterado)
        val j = Jogada(real)
        assertEquals("Pressão pós-perda (5 segundos)", j.nome)
        assertEquals(2, j.totalQuadros)
        assertEquals("Demo FC", j.clubeNome)
    }
}
