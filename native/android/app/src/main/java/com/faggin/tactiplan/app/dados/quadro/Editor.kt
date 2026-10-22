package com.faggin.tactiplan.app.dados.quadro

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// QUADRO TÁTICO (T5): estado do editor = hooks/useTacticalBoard.js do web, regra por regra
// (peça nova entra no atual e nos seguintes; mover só no atual; identidade e desenhos em todos;
// histórico de 50; "alterado" = posição no histórico ≠ do último salvar ou meta mexida).
// Imutável: cada ação devolve um editor novo (o Compose só recompõe o que mudou).
// Paridade: quadro.json (editor) e TactiPlanKit/QuadroEditor.swift.

const val MAX_HISTORICO_QUADRO = 50

class EditorQuadro private constructor(
    val quadros: List<QuadroJogada>,
    val atual: Int,
    val tipoCampo: String,
    val vista: String,
    val corA: String,
    val corB: String,
    val pecaSelecionada: String?,
    val desenhoSelecionado: String?,
    private val historico: List<List<QuadroJogada>>,
    private val indiceHistorico: Int,
    private val indiceSalvo: Int,
    private val metaAlterada: Boolean,
    private val contador: Int,
    /** Relógio dos ids (`tipo-<ms>-<n>`, como o web). Os testes fixam. */
    val agoraMs: () -> Long,
) {
    constructor(tipoInicial: String? = null, agoraMs: () -> Long = { System.currentTimeMillis() }) : this(
        listOf(QuadroJogada(0)), 0, tipoInicial ?: TipoCampo.FUTEBOL_11, VistaCampo.INTEIRO, "#3b82f6", "#ef4444",
        null, null, listOf(listOf(QuadroJogada(0))), 0, 0, false, 0, agoraMs,
    )

    private fun copia(
        quadros: List<QuadroJogada> = this.quadros, atual: Int = this.atual, tipoCampo: String = this.tipoCampo,
        vista: String = this.vista, corA: String = this.corA, corB: String = this.corB,
        pecaSelecionada: String? = this.pecaSelecionada, desenhoSelecionado: String? = this.desenhoSelecionado,
        historico: List<List<QuadroJogada>> = this.historico, indiceHistorico: Int = this.indiceHistorico,
        indiceSalvo: Int = this.indiceSalvo, metaAlterada: Boolean = this.metaAlterada, contador: Int = this.contador,
    ) = EditorQuadro(quadros, atual, tipoCampo, vista, corA, corB, pecaSelecionada, desenhoSelecionado, historico,
        indiceHistorico, indiceSalvo, metaAlterada, contador, agoraMs)

    // ---------------------------------------------------------------- leitura

    val quadroAtual: QuadroJogada get() = quadros.getOrNull(atual) ?: QuadroJogada(0)
    val proximoQuadro: QuadroJogada? get() = quadros.getOrNull(atual + 1)
    val totalQuadros: Int get() = quadros.size
    val podeDesfazer: Boolean get() = indiceHistorico > 0
    val podeRefazer: Boolean get() = indiceHistorico < historico.size - 1
    val alterado: Boolean get() = indiceHistorico != indiceSalvo || metaAlterada

    fun peca(id: String?): Peca? = id?.let { i -> quadroAtual.elementos.firstOrNull { it.id == i } }
    fun desenho(id: String?): Desenho? = id?.let { i -> quadroAtual.desenhos.firstOrNull { it.id == i } }

    val atletasEmCampo: Set<String>
        get() = quadros.flatMap { q -> q.elementos.filter { it.tipo == "player" && verdadeiroJs(it.dados["athleteId"]) }.mapNotNull { it.atletaId } }.toSet()

    // ---------------------------------------------------------------- histórico

    private fun gravar(novo: List<QuadroJogada>, extra: (EditorQuadro) -> EditorQuadro = { it }, contador: Int = this.contador): EditorQuadro {
        val h = historico.take(indiceHistorico + 1).toMutableList()
        h.add(novo)
        var salvo = indiceSalvo
        if (h.size > MAX_HISTORICO_QUADRO) {
            h.removeAt(0)
            if (salvo >= 0) salvo -= 1
        }
        return extra(copia(quadros = novo, historico = h, indiceHistorico = h.size - 1, indiceSalvo = salvo, contador = contador))
    }

    private fun id(tipo: String, n: Int) = "$tipo-${agoraMs()}-$n"

    // ---------------------------------------------------------------- peças

    /** addElement: entra no quadro atual e nos seguintes. */
    fun adicionarPeca(dadosPeca: Map<String, JsonElement>): Pair<EditorQuadro, String> {
        val n = contador + 1
        val novoId = id(dadosPeca["type"].texto() ?: "undefined", n)
        val p = Peca(dadosPeca + ("id" to txt(novoId)))
        val q = quadros.mapIndexed { i, f -> if (i >= atual) f.copy(elementos = f.elementos + p) else f }
        return gravar(q, contador = n) to novoId
    }

    /** removeElement: sai de todos os quadros. */
    fun removerPeca(id: String): EditorQuadro {
        val q = quadros.map { f -> f.copy(elementos = f.elementos.filter { it.id != id }) }
        return gravar(q, { if (it.pecaSelecionada == id) it.copia(pecaSelecionada = null) else it })
    }

    /** updateElementPosition: só no quadro atual. */
    fun moverPeca(id: String, x: Double, y: Double): EditorQuadro {
        val q = quadros.mapIndexed { i, f ->
            if (i != atual) f else f.copy(elementos = f.elementos.map { if (it.id == id) it.comPosicao(x, y) else it })
        }
        return gravar(q)
    }

    /** updateElementProps: identidade em TODOS os quadros. */
    fun alterarPeca(id: String, patch: Map<String, JsonElement>): EditorQuadro {
        val q = quadros.map { f -> f.copy(elementos = f.elementos.map { if (it.id == id) it.com(patch) else it }) }
        return gravar(q)
    }

    /** nextGenericJersey. */
    fun proximaCamisa(time: String): Double {
        val nums = (quadros.getOrNull(atual)?.elementos.orEmpty()).filter { it.tipo == "player" && it.time == time }.map { ouNumero(it.camisa, 0.0) }
        val maior = if (nums.isEmpty()) 1.0 else nums.max()
        return maxOf(2.0, maior + 1)
    }

    // ---------------------------------------------------------------- formações

    fun aplicarFormacoes(aplicacoes: List<AplicacaoFormacao>): Pair<EditorQuadro, ResultadoFormacao> {
        var repos = 0; var novos = 0; var mantidos = 0
        var n = quadros
        var cont = contador
        for (ap in aplicacoes) {
            val curr = n.getOrNull(atual)?.elementos.orEmpty()
            val doTime = curr.withIndex()
                .filter { it.value.tipo == "player" && it.value.time == ap.time }
                .sortedWith { a, b ->
                    val ga = a.value.goleiro; val gb = b.value.goleiro
                    when {
                        ga != gb -> if (ga) -1 else 1
                        else -> {
                            val na = ouNumero(a.value.camisa, 999.0); val nb = ouNumero(b.value.camisa, 999.0)
                            if (na != nb) na.compareTo(nb) else a.index.compareTo(b.index)
                        }
                    }
                }
                .map { it.value }
            ap.posicoes.forEachIndexed { i, slot ->
                val par = doTime.getOrNull(i)
                if (par != null) {
                    val real = verdadeiroJs(par.dados["athleteId"])
                    n = n.mapIndexed { fi, f ->
                        f.copy(elementos = f.elementos.map { el ->
                            if (el.id != par.id) el else {
                                var e = el
                                if (!real) e = e.com(mapOf("jerseyNumber" to num(slot.camisa), "name" to txt(slot.nome), "isGoalkeeper" to JsonPrimitive(slot.goleiro)))
                                if (fi == atual) e = e.comPosicao(slot.x, slot.y)
                                e
                            }
                        })
                    }
                    repos++
                } else {
                    cont += 1
                    val p = Peca(mapOf(
                        "id" to txt(id("player", cont)), "type" to txt("player"), "team" to txt(ap.time),
                        "jerseyNumber" to num(slot.camisa), "name" to txt(slot.nome), "athleteId" to JsonNull,
                        "isGoalkeeper" to JsonPrimitive(slot.goleiro), "x" to num(slot.x), "y" to num(slot.y),
                    ))
                    n = n.mapIndexed { fi, f -> if (fi >= atual) f.copy(elementos = f.elementos + p) else f }
                    novos++
                }
            }
            mantidos += maxOf(0, doTime.size - ap.posicoes.size)
        }
        return gravar(n, contador = cont) to ResultadoFormacao(repos, novos, mantidos)
    }

    // ---------------------------------------------------------------- desenhos

    fun adicionarDesenho(dadosDesenho: Map<String, JsonElement>): Pair<EditorQuadro, String> {
        val n = contador + 1
        val novoId = id("draw", n)
        val d = Desenho(dadosDesenho + ("id" to txt(novoId)))
        val q = quadros.mapIndexed { i, f -> if (i >= atual) f.copy(desenhos = f.desenhos + d) else f }
        return gravar(q, contador = n) to novoId
    }

    fun removerDesenho(id: String): EditorQuadro {
        val q = quadros.map { f -> f.copy(desenhos = f.desenhos.filter { it.id != id }) }
        return gravar(q, { if (it.desenhoSelecionado == id) it.copia(desenhoSelecionado = null) else it })
    }

    /** updateDrawing: em TODOS os quadros. */
    fun alterarDesenho(id: String, patch: Map<String, JsonElement>): EditorQuadro {
        val q = quadros.map { f -> f.copy(desenhos = f.desenhos.map { if (it.id == id) it.com(patch) else it }) }
        return gravar(q)
    }

    // ---------------------------------------------------------------- seleção

    fun selecionarPeca(id: String?) = copia(pecaSelecionada = id)
    fun selecionarDesenho(id: String?) = copia(desenhoSelecionado = id)

    // ---------------------------------------------------------------- quadros

    fun adicionarQuadro(): EditorQuadro {
        val base = quadroAtual
        val n = quadros.toMutableList()
        n.add(minOf(atual + 1, n.size), QuadroJogada(n.size, base.elementos, base.desenhos))
        val r = n.mapIndexed { i, f -> f.copy(extras = f.extras + ("index" to num(i))) }
        return gravar(r, { it.copia(atual = it.atual + 1) })
    }

    fun excluirQuadro(): EditorQuadro {
        if (quadros.size <= 1) return this
        val r = quadros.filterIndexed { i, _ -> i != atual }.mapIndexed { i, f -> f.copy(extras = f.extras + ("index" to num(i))) }
        return gravar(r, { it.copia(atual = maxOf(0, it.atual - 1)) })
    }

    fun irParaQuadro(i: Int) = copia(atual = maxOf(0, minOf(i, quadros.size - 1)))
    fun proximo() = copia(atual = minOf(atual + 1, quadros.size - 1))
    fun anterior() = copia(atual = maxOf(atual - 1, 0))

    // ---------------------------------------------------------------- desfazer / refazer

    fun desfazer(): EditorQuadro {
        if (indiceHistorico <= 0) return this
        val q = historico[indiceHistorico - 1]
        return copia(quadros = q, indiceHistorico = indiceHistorico - 1, atual = minOf(atual, q.size - 1))
    }

    fun refazer(): EditorQuadro {
        if (indiceHistorico >= historico.size - 1) return this
        val q = historico[indiceHistorico + 1]
        return copia(quadros = q, indiceHistorico = indiceHistorico + 1, atual = minOf(atual, q.size - 1))
    }

    // ---------------------------------------------------------------- abrir / limpar / salvar

    /** loadPlay: a linha de /api/plays (ou qualquer objeto com os mesmos campos). */
    fun abrir(jogada: JsonObject): EditorQuadro {
        val q = ((jogada["keyframes"] as? JsonArray)?.map { QuadroJogada.de(it) }.orEmpty()).ifEmpty { listOf(QuadroJogada(0)) }
        return EditorQuadro(
            q, 0, ouTexto(jogada["field_type"], TipoCampo.FUTEBOL_11), ouTexto(jogada["field_view"], VistaCampo.INTEIRO),
            ouTexto(jogada["team_a_color"], "#3b82f6"), ouTexto(jogada["team_b_color"], "#ef4444"),
            null, null, listOf(q), 0, 0, false, contador, agoraMs,
        )
    }

    /** resetBoard: um quadro vazio (tipo, vista e cores ficam). */
    fun limpar(): EditorQuadro {
        val q = listOf(QuadroJogada(0))
        return copia(quadros = q, atual = 0, pecaSelecionada = null, desenhoSelecionado = null, historico = listOf(q),
            indiceHistorico = 0, indiceSalvo = 0, metaAlterada = false)
    }

    fun marcarSalvo() = copia(indiceSalvo = indiceHistorico, metaAlterada = false)
    fun definirTipoCampo(v: String) = copia(tipoCampo = v, metaAlterada = true)
    fun definirVista(v: String) = copia(vista = v, metaAlterada = true)
    fun definirCorA(v: String) = copia(corA = v, metaAlterada = true)
    fun definirCorB(v: String) = copia(corB = v, metaAlterada = true)

    /** getPlayData. */
    fun dadosDaJogada(): JsonObject = JsonObject(mapOf(
        "field_type" to txt(tipoCampo), "field_view" to txt(vista), "team_a_color" to txt(corA), "team_b_color" to txt(corB),
        "keyframes" to JsonArray(quadros.map { it.json() }),
    ))

    /** Corpo do POST/PUT /api/plays do web (persistPlay). */
    fun corpoSalvar(nome: String, descricao: String, clubeId: String?): JsonObject = JsonObject(
        dadosDaJogada() + mapOf("name" to txt(nome), "description" to txt(descricao), "club_id" to (clubeId?.let(::txt) ?: JsonNull)),
    )
}

// ---------------------------------------------------------------- ações da tela que viram peça

fun dadosJogadorGenerico(time: String, camisa: Double, aleatorio: () -> Double): Map<String, JsonElement> {
    val x = 50 + (aleatorio() - 0.5) * 20
    val y = 50 + (aleatorio() - 0.5) * 20
    return mapOf("type" to txt("player"), "team" to txt(time), "jerseyNumber" to num(camisa), "name" to txt(""),
        "athleteId" to JsonNull, "isGoalkeeper" to JsonPrimitive(false), "x" to num(x), "y" to num(y))
}

fun dadosJogadorAtleta(time: String, atletaId: String, nome: String, camisa: Int?, proxima: Double, aleatorio: () -> Double): Map<String, JsonElement> {
    val d = dadosJogadorGenerico(time, proxima, aleatorio).toMutableMap()
    if (camisa != null && camisa != 0) d["jerseyNumber"] = num(camisa)
    d["name"] = txt(nome)
    d["athleteId"] = txt(atletaId)
    return d
}

fun dadosGoleiro(time: String): Map<String, JsonElement> = mapOf(
    "type" to txt("player"), "team" to txt(time), "jerseyNumber" to num(1), "name" to txt("GOL"), "athleteId" to JsonNull,
    "isGoalkeeper" to JsonPrimitive(true), "x" to num(if (time == "A") 5.0 else 95.0), "y" to num(50),
)

fun dadosBola(): Map<String, JsonElement> = mapOf("type" to txt("ball"), "team" to JsonNull, "x" to num(50), "y" to num(50))

fun dadosObjeto(tipo: String, aleatorio: () -> Double): Map<String, JsonElement> = mapOf(
    "type" to txt("marker"), "team" to JsonNull, "markerType" to txt(tipo),
    "x" to num(50 + (aleatorio() - 0.5) * 30), "y" to num(50 + (aleatorio() - 0.5) * 30),
)
