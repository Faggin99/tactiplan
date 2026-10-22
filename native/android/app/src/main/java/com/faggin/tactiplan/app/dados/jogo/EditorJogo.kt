package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.JsonApp
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// O estado da tela do Jogo e as operações do GameModal do web, sem tela (testado na JVM).
// Imutável: cada operação devolve um editor novo (o Compose guarda num estado).
// Paridade: TactiPlanKit/EditorJogo.swift.

@Serializable
data class DadosGerais(
    val adversario: String = "",
    val duracao: Int = 90,
    val campeonatoId: String = "",
    val rodada: String = "",
    /** "home" | "away" | "neutral" | "" */
    val local: String = "",
    val video: String = "",
)

enum class ProblemaSubstituicao { INCOMPLETA, TITULAR }

/** JSON com chaves em ordem (saída determinística, como o `.sortedKeys` do iPhone). */
fun textoCanonico(e: JsonElement): String = when (e) {
    is JsonObject -> e.keys.sorted().joinToString(",", "{", "}") { k ->
        JsonApp.encodeToString(JsonElement.serializer(), JsonPrimitive(k)) + ":" + textoCanonico(e.getValue(k))
    }
    is JsonArray -> e.joinToString(",", "[", "]") { textoCanonico(it) }
    else -> JsonApp.encodeToString(JsonElement.serializer(), e)
}

@Serializable
data class EditorJogo(
    val sessaoId: String,
    val modalidade: String,
    val dados: DadosGerais,
    val formacao: String,
    val jogadores: List<JogadorJogo> = emptyList(),
    val eventos: List<EventoJogo> = emptyList(),
) {
    val config: ConfigEsporte get() = configEsporte(modalidade)

    companion object {
        /** loadMatchData do GameModal. */
        fun carregar(dia: DiaDoJogo, jogo: DadosDoJogo, modalidade: String?): EditorJogo {
            val cfg = configEsporte(modalidade)
            val f = resolverFormacao(cfg.modalidade, jogo.formacao ?: dia.formacao)
            val total = totalVagas(f)
            val jogadores = jogo.jogadores.map { p ->
                p.copy(
                    vaga = if (p.titular && p.vaga != null && p.vaga >= 0 && p.vaga < total) p.vaga else null,
                    camisa = p.camisa ?: p.atleta?.camisa,
                    nome = p.atleta?.nome,
                )
            }
            val d = DadosGerais(
                adversario = dia.adversario ?: "",
                duracao = dia.duracao?.takeIf { it > 0 } ?: cfg.duracaoPadrao,
                campeonatoId = dia.campeonatoId ?: "", rodada = dia.rodada ?: "", local = dia.local ?: "", video = dia.video ?: "",
            )
            val eventos = jogo.eventos.map { e ->
                e.copy(jogadorId = e.jogadorId ?: e.jogador?.id, jogador2Id = e.jogador2Id ?: e.jogador2?.id)
            }
            return EditorJogo(dia.id, cfg.modalidade, d, f, jogadores, eventos)
        }
    }

    // ---------- leitura ----------

    val vagas: List<Vaga> get() = vagasDa(formacao)
    fun ocupante(vaga: Int): JogadorJogo? = jogadores.firstOrNull { it.titular && it.vaga == vaga }
    fun jogador(atletaId: String?): JogadorJogo? = jogadores.firstOrNull { it.atletaId == atletaId }

    val titulares: List<JogadorJogo>
        get() = jogadores.withIndex().filter { it.value.titular }
            .sortedWith(compareBy<IndexedValue<JogadorJogo>> { it.value.vaga ?: 99 }.thenBy { it.index }).map { it.value }
    val semVaga: List<JogadorJogo> get() = titulares.filter { it.vaga == null }
    val reservas: List<JogadorJogo> get() = jogadores.filter { it.reserva }
    val vagasLivres: Int get() = vagas.size - (titulares.size - semVaga.size)

    val golsFeitos: Int get() = eventos.count { it.tipo == EVENTO_GOL }
    val golsSofridos: Int get() = eventos.count { it.tipo == EVENTO_GOL_SOFRIDO }

    val minutagem: Map<String, EstadoMinutagem> get() = calcularMinutagem(jogadores, eventos, dados.duracao)

    fun camisaRepetida(atletaId: String): Boolean {
        val n = jogador(atletaId)?.camisa ?: return false
        return jogadores.count { it.camisa == n } > 1
    }

    fun nome(id: String?, reserva: AtletaDoEvento? = null, plantel: List<AtletaResumo> = emptyList()): String? {
        if (id.isNullOrEmpty()) return reserva?.nome
        jogador(id)?.nomeExibido?.let { return it }
        reserva?.nome?.takeIf { it.isNotEmpty() }?.let { return it }
        return plantel.firstOrNull { it.id == id }?.nome
    }

    fun problemaDaSubstituicao(e: EventoJogo): ProblemaSubstituicao? {
        if (e.tipo != EVENTO_SUBSTITUICAO) return null
        if (e.jogadorId.isNullOrEmpty() || e.jogador2Id.isNullOrEmpty()) return ProblemaSubstituicao.INCOMPLETA
        if (jogador(e.jogadorId)?.titular == true) return ProblemaSubstituicao.TITULAR
        return null
    }

    fun detalheDoEvento(e: EventoJogo, plantel: List<AtletaResumo> = emptyList()): String? {
        val p1 = nome(e.jogadorId, e.jogador, plantel)
        val p2 = nome(e.jogador2Id, e.jogador2, plantel)
        when (problemaDaSubstituicao(e)) {
            ProblemaSubstituicao.INCOMPLETA ->
                return "⇄ Substituição (incompleta)${p2?.let { ": sai $it" } ?: ""}${p1?.let { ": entra $it" } ?: ""}. Toque para completar."
            ProblemaSubstituicao.TITULAR -> return "⇄ ${p1 ?: ""} é titular e está como \"quem entrou\". Toque para corrigir."
            null -> {}
        }
        if (e.tipo == EVENTO_SUBSTITUICAO) return "↓ Sai ${p2 ?: "—"} · ↑ Entra ${p1 ?: "—"}"
        if (e.tipo == EVENTO_GOL) {
            if (p1 == null && p2 == null) return null
            return (p1 ?: "Sem autor") + (p2?.let { " · assist. $it" } ?: "")
        }
        return p1
    }

    val eventosOrdenados: List<EventoJogo>
        get() = eventos.withIndex().sortedWith(compareBy<IndexedValue<EventoJogo>> { it.value.minuto ?: 0 }.thenBy { it.index }).map { it.value }

    // ---------- escalação ----------

    /** placeAthlete: devolve (editor, aviso "X foi para as reservas"?). */
    fun colocar(atleta: AtletaResumo, vaga: Int): Pair<EditorJogo, String?> {
        val ocup = ocupante(vaga)
        val existente = jogador(atleta.id)
        if (existente != null && existente.titular && existente.vaga == vaga) return this to null
        val deVaga = if (existente?.titular == true) existente.vaga else null
        var novos = jogadores.map { p ->
            when {
                p.atletaId == atleta.id -> p.copy(status = STATUS_TITULAR, vaga = vaga)
                ocup != null && p.atletaId == ocup.atletaId ->
                    if (deVaga != null) p.copy(vaga = deVaga) else p.copy(status = STATUS_RESERVA, vaga = null)
                else -> p
            }
        }
        if (existente == null) novos = novos + JogadorJogo.de(atleta.id, STATUS_TITULAR, vaga, 0, false, atleta.camisa, atleta, atleta.nome)
        val aviso = if (ocup != null && deVaga == null) "${ocup.nomeExibido ?: "Atleta"} foi para as reservas" else null
        return copy(jogadores = novos) to aviso
    }

    fun mover(atletaId: String, vaga: Int): EditorJogo {
        val m = jogador(atletaId) ?: return this
        if (m.vaga == vaga) return this
        val ocup = ocupante(vaga)
        val deVaga = if (m.titular) m.vaga else null
        return copy(jogadores = jogadores.map { p ->
            when {
                p.atletaId == m.atletaId -> p.copy(status = STATUS_TITULAR, vaga = vaga)
                ocup != null && p.atletaId == ocup.atletaId -> p.copy(vaga = deVaga)
                else -> p
            }
        })
    }

    fun tirarDoCampo(atletaId: String) =
        copy(jogadores = jogadores.map { if (it.atletaId == atletaId) it.copy(status = STATUS_RESERVA, vaga = null) else it })

    fun tirarDoJogo(atletaId: String) = copy(jogadores = jogadores.filter { it.atletaId != atletaId })

    fun trocarFormacao(nova: String): Pair<EditorJogo, String?> {
        if (nova == formacao) return this to null
        val (js, desl) = remapearFormacao(jogadores, formacao, nova)
        val ed = copy(jogadores = js, formacao = nova)
        if (desl.isEmpty()) return ed to null
        val nomes = desl.mapNotNull { it.nomeExibido }.joinToString(", ")
        val quem = if (desl.size == 1) "1 atleta ficou" else "${desl.size} atletas ficaram"
        return ed to "$quem sem vaga na $nova: $nomes. Toque no atleta destacado para reposicionar."
    }

    fun encaixarSugestao(): Pair<EditorJogo, String?> {
        val antes = semVaga.size
        val ed = copy(jogadores = sugerirVagas(jogadores, formacao))
        val n = antes - ed.semVaga.size
        return ed to if (n > 0) "$n encaixado(s) pela posição cadastrada. Confira e ajuste se precisar." else null
    }

    // ---------- relacionados ----------

    fun confirmarRelacionados(selecao: List<Pair<String, String>>, plantel: List<AtletaResumo>): EditorJogo =
        copy(jogadores = selecao.map { (id, status) ->
            val antes = jogador(id)
            val atleta = antes?.atleta ?: plantel.firstOrNull { it.id == id }
            JogadorJogo.de(id, status, if (status == STATUS_TITULAR) antes?.vaga else null,
                antes?.minutosJogados ?: 0, antes?.minutosManual ?: false,
                if (antes != null) antes.camisa else atleta?.camisa, atleta, antes?.nome ?: atleta?.nome)
        })

    fun mudarCamisa(atletaId: String, valor: Int?): EditorJogo {
        val v = valor?.coerceIn(1, 99)
        return copy(jogadores = jogadores.map { if (it.atletaId == atletaId) it.copy(camisa = v) else it })
    }

    fun ajustarMinutos(atletaId: String, valor: Int): EditorJogo {
        val v = valor.coerceIn(0, 200)
        return copy(jogadores = jogadores.map { if (it.atletaId == atletaId) it.copy(minutosManual = true, minutosJogados = v) else it })
    }

    fun voltarAoAutomatico(atletaId: String) =
        copy(jogadores = jogadores.map { if (it.atletaId == atletaId) it.copy(minutosManual = false) else it })

    // ---------- eventos ----------

    fun adicionarEvento(e: EventoJogo) = copy(eventos = eventos + e)
    fun atualizarEvento(e: EventoJogo) = copy(eventos = eventos.map { if (it.id == e.id) e else it })
    fun removerEvento(id: String) = copy(eventos = eventos.filter { it.id != id })

    // ---------- salvar ----------

    /** O corpo do POST /api/games/:id — o mesmo do `saveAllMatchData` do web (com `subs_check`). */
    fun corpoSalvar(): JsonObject {
        val rastreia = config.rastreiaMinutos
        val mins = minutagem
        fun ouNulo(s: String): JsonElement = if (s.isEmpty()) JsonNull else JsonPrimitive(s)
        val ps = jogadores.map { p ->
            val o = linkedMapOf<String, JsonElement>(
                "athlete_id" to JsonPrimitive(p.atletaId),
                "status" to JsonPrimitive(p.status),
                "slot" to (p.vaga?.let { JsonPrimitive(it) } ?: JsonNull),
                "minutes_played" to JsonPrimitive(if (rastreia) mins[p.atletaId]?.minutos ?: 0 else 0),
                "minutes_manual" to JsonPrimitive(if (rastreia) p.minutosManual else false),
                "jersey_number" to (p.camisa?.let { JsonPrimitive(it) } ?: JsonPrimitive("")),
            )
            p.nomeExibido?.let { o["name"] = JsonPrimitive(it) }
            JsonObject(o)
        }
        val es = eventos.map { e ->
            val o = linkedMapOf<String, JsonElement>(
                "event_type" to JsonPrimitive(e.tipo),
                "team" to (e.time?.let { JsonPrimitive(it) } ?: JsonNull),
                "goal_type" to (e.tipoGol?.let { JsonPrimitive(it) } ?: JsonNull),
                "minute" to (e.minuto?.let { JsonPrimitive(it) } ?: JsonNull),
                "player_id" to (e.jogadorId?.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull),
                "secondary_player_id" to (e.jogador2Id?.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull),
            )
            e.notas?.takeIf { it.isNotEmpty() }?.let { o["notes"] = JsonPrimitive(it) }
            JsonObject(o)
        }
        return JsonObject(linkedMapOf(
            "formation" to JsonPrimitive(formacao),
            "opponent_name" to JsonPrimitive(dados.adversario),
            "match_duration" to JsonPrimitive(dados.duracao),
            "players" to JsonArray(ps),
            "events" to JsonArray(es),
            "competition_id" to ouNulo(dados.campeonatoId),
            "match_round" to ouNulo(dados.rodada),
            "match_location" to ouNulo(dados.local),
            "video_full_url" to ouNulo(dados.video),
            "subs_check" to JsonPrimitive(true),
        ))
    }

    val assinatura: String get() = textoCanonico(corpoSalvar())

    /** lineupSig do web: o que sai na convocação. */
    val assinaturaConvocacao: String
        get() = textoCanonico(JsonArray(listOf(
            JsonPrimitive(formacao), JsonPrimitive(dados.adversario), JsonPrimitive(dados.campeonatoId),
            JsonPrimitive(dados.rodada), JsonPrimitive(dados.local),
            JsonArray(jogadores.map { p ->
                JsonArray(listOf(JsonPrimitive(p.atletaId), JsonPrimitive(p.status), p.vaga?.let { JsonPrimitive(it) } ?: JsonNull,
                    JsonPrimitive(p.camisa?.toString() ?: "")))
            }),
        )))

    /** Assinatura para comparar com o servidor: sem nomes, jogadores e eventos em ordem estável. */
    val assinaturaServidor: String
        get() {
            val o = corpoSalvar().toMutableMap()
            o["players"] = JsonArray((o["players"] as JsonArray).map { p -> JsonObject((p as JsonObject) - "name") }
                .sortedBy { ((it["athlete_id"] as? JsonPrimitive)?.content) ?: "" })
            o["events"] = JsonArray((o["events"] as JsonArray).sortedBy { textoCanonico(it) })
            return textoCanonico(JsonObject(o))
        }

    fun conferirAntesDeSalvar(): String? {
        if (dados.duracao < 1) return "Informe a duração do jogo."
        return checarSubstituicoes(jogadores, eventos)
    }
}

// ---------- remapFormation / suggestSlots ----------

private fun papelCasa(de: String, para: String) =
    de == para || (de != "GOL" && para != "GOL" && (de == "LIN" || para == "LIN"))

fun remapearFormacao(jogadores: List<JogadorJogo>, de: String, para: String): Pair<List<JogadorJogo>, List<JogadorJogo>> {
    val origem = vagasDa(de)
    val destino = vagasDa(para)
    val livres = destino.map { it.indice }.toMutableList()
    val novaVaga = HashMap<String, Int?>()
    val deslocados = mutableListOf<JogadorJogo>()
    val comVaga = jogadores.withIndex().filter { it.value.titular && it.value.vaga != null }
        .sortedWith(compareBy<IndexedValue<JogadorJogo>> { it.value.vaga!! }.thenBy { it.index }).map { it.value }
    for (p in comVaga) {
        val v = p.vaga!!
        val papel = if (v < origem.size) origem[v].papel else null
        val i = if (papel == null) -1 else livres.indexOfFirst { papelCasa(papel, destino[it].papel) }
        if (i >= 0) novaVaga[p.atletaId] = livres.removeAt(i)
        else { novaVaga[p.atletaId] = null; deslocados.add(p) }
    }
    return jogadores.map { p -> if (novaVaga.containsKey(p.atletaId)) p.copy(vaga = novaVaga[p.atletaId]) else p } to deslocados
}

fun sugerirVagas(jogadores: List<JogadorJogo>, formacao: String): List<JogadorJogo> {
    val vs = vagasDa(formacao)
    val ocupadas = jogadores.filter { it.titular && it.vaga != null }.mapNotNull { it.vaga }.toSet()
    val livres = vs.filter { it.indice !in ocupadas }.toMutableList()
    val semVaga = jogadores.filter { it.titular && it.vaga == null }
    val escolha = HashMap<String, Int>()
    for (p in semVaga) {
        val papel = PAPEL_POR_POSICAO[p.atleta?.posicao ?: ""] ?: continue
        val i = livres.indexOfFirst { it.papel == papel }
        if (i >= 0) escolha[p.atletaId] = livres.removeAt(i).indice
    }
    for (p in semVaga) {
        if (escolha.containsKey(p.atletaId) || livres.isEmpty()) continue
        val i = livres.indexOfFirst { it.papel != "GOL" }
        if (i >= 0) escolha[p.atletaId] = livres.removeAt(i).indice
    }
    return jogadores.map { p -> escolha[p.atletaId]?.let { p.copy(vaga = it) } ?: p }
}
