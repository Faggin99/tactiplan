package com.faggin.tactiplan.app.dados.jogo

import java.text.Collator
import java.util.Locale
import java.util.UUID

// A folha "Novo evento" (EventModal do web), sem tela. Imutável (cada mudança devolve outro form).
// Paridade: TactiPlanKit/FormEvento.swift.

data class OpcaoAtleta(val id: String, val nome: String, val camisa: Int?) {
    val rotulo: String get() = camisa?.let { "$nome · camisa $it" } ?: nome
}

sealed class ResultadoForm {
    data class Erro(val mensagem: String) : ResultadoForm()
    /** Gol sem autor: "Salvar gol sem atribuir ao atleta?". */
    data object ConfirmarSemAutor : ResultadoForm()
    data class Ok(val evento: EventoJogo) : ResultadoForm()
}

private val COLLATOR_BR: Collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"))

data class FormEvento(
    val tipo: String,
    val time: String,
    val momento: String,
    val subtipoBP: String,
    val tempo: Int,
    val minutoNoTempo: Int,
    val acrescimo: Int,
    val jogadorId: String,
    val jogador2Id: String,
    val editando: String?,
    val duracao: Int,
    val modalidade: String,
) {
    companion object {
        const val SEM_RESERVA = "Nenhum reserva disponível: todos já entraram ou não há reservas relacionados. Use \"Selecionar\" no jogo para relacionar reservas."

        /** Novo evento (padrões do web) ou edição. */
        fun novo(editando: EventoJogo? = null, duracao: Int, modalidade: String?): FormEvento {
            val cfg = configEsporte(modalidade)
            val dur = maxOf(1, duracao)
            if (editando != null) {
                val g = lerTipoGol(editando.tipoGol)
                val m = lerMinuto(editando.minuto ?: 0, dur)
                return FormEvento(
                    tipo = editando.tipo.ifEmpty { EVENTO_GOL }, time = editando.time?.takeIf { it.isNotEmpty() } ?: "own",
                    momento = g.momento, subtipoBP = g.subtipoBP, tempo = m.tempo, minutoNoTempo = m.minutoNoTempo,
                    acrescimo = m.acrescimo, jogadorId = editando.jogadorId ?: editando.jogador?.id ?: "",
                    jogador2Id = editando.jogador2Id ?: editando.jogador2?.id ?: "", editando = editando.id,
                    duracao = dur, modalidade = cfg.modalidade)
            }
            return FormEvento(EVENTO_GOL, "own", "org", cfg.subtiposBolaParada.firstOrNull()?.valor ?: "falta", 1, 1, 0, "", "",
                null, dur, cfg.modalidade)
        }
    }

    val tipos: List<TipoEvento> get() = tiposDeEvento(modalidade)
    val subtiposBP: List<OpcaoRotulo> get() = configEsporte(modalidade).subtiposBolaParada
    val ehGol: Boolean get() = tipo == EVENTO_GOL || tipo == EVENTO_GOL_SOFRIDO
    val ehCartao: Boolean get() = tipo == EVENTO_AMARELO || tipo == EVENTO_VERMELHO
    val ehSubstituicao: Boolean get() = tipo == EVENTO_SUBSTITUICAO
    val mostraTime: Boolean get() = ehCartao
    val mostraJogador: Boolean get() = tipo == EVENTO_GOL || (ehCartao && time == "own")
    val mostraAssistencia: Boolean get() = tipo == EVENTO_GOL
    val momentos: List<OpcaoMomento> get() = momentosDoGol(tipo)

    val timeFinal: String
        get() = when (tipo) {
            EVENTO_GOL, EVENTO_SUBSTITUICAO -> "own"
            EVENTO_GOL_SOFRIDO -> "opponent"
            else -> time
        }

    // ---------- tempo de jogo ----------

    val fim1oTempo: Int get() = fimDo1oTempo(duracao)
    val maxNoTempo: Int get() = if (tempo == 1) fim1oTempo else duracaoDo2oTempo(duracao)
    val minuto: MinutoDoJogo get() = MinutoDoJogo(tempo, minutoNoTempo, acrescimo)
    val minutoTotalAtual: Int get() = minutoTotal(minuto, duracao)
    val minutoTexto: String get() = textoMinuto(minuto, duracao)
    val faixaDoTempo: String get() = if (tempo == 1) "0-$fim1oTempo" else "${fim1oTempo + 1}-$duracao"

    fun mudarTipo(t: String) = copy(tipo = t, jogadorId = "", jogador2Id = "")

    fun mudarTempo(t: Int): FormEvento {
        val n = copy(tempo = if (t == 2) 2 else 1, acrescimo = 0)
        return if (n.minutoNoTempo > n.maxNoTempo) n.copy(minutoNoTempo = n.maxNoTempo) else n
    }

    fun mudarMinuto(v: Int) = copy(minutoNoTempo = v.coerceIn(1, maxOf(1, maxNoTempo)), acrescimo = 0)

    fun mudarAcrescimo(v: Int): FormEvento {
        val n = copy(acrescimo = v.coerceIn(0, 15))
        return if (v > 0) n.copy(minutoNoTempo = maxNoTempo) else n
    }

    /** No acréscimo, o −/+ mexe no acréscimo; fora dele, anda pelo tempo normal. */
    fun passo(delta: Int): FormEvento {
        if (acrescimo > 0) return copy(acrescimo = (acrescimo + delta).coerceIn(0, 15))
        val total = (minutoTotalAtual + delta).coerceIn(1, duracao)
        return if (total <= fim1oTempo) copy(tempo = 1, minutoNoTempo = total) else copy(tempo = 2, minutoNoTempo = total - fim1oTempo)
    }

    // ---------- opções ----------

    private fun opcao(p: JogadorJogo) = OpcaoAtleta(p.atletaId, p.nomeExibido ?: "—", p.camisa ?: p.atleta?.camisa)
    private fun porNome(l: List<OpcaoAtleta>) = l.sortedWith { a, b -> COLLATOR_BR.compare(a.nome, b.nome) }

    fun relacionados(ed: EditorJogo) = porNome(ed.jogadores.filter { it.atletaId.isNotEmpty() }.map(::opcao))

    fun opcoesSai(ed: EditorJogo) =
        porNome(emCampo(ed.jogadores, ed.eventos, ed.dados.duracao, minutoTotalAtual, editando).map(::opcao))

    fun opcoesEntra(ed: EditorJogo) = porNome(reservasDisponiveis(ed.jogadores, ed.eventos, editando).map(::opcao))

    fun opcoesJogador(ed: EditorJogo) = relacionados(ed).filter { it.id != jogador2Id }
    fun opcoesAssistencia(ed: EditorJogo) = relacionados(ed).filter { it.id != jogadorId }

    fun semNinguemEmCampo() = "Ninguém em campo aos $minutoTexto"

    // ---------- resumo e validação ----------

    fun resumo(ed: EditorJogo): String {
        val todos = relacionados(ed)
        val n1 = todos.firstOrNull { it.id == jogadorId }?.nome
        val n2 = todos.firstOrNull { it.id == jogador2Id }?.nome
        val mom = momentos.firstOrNull { it.valor == momento }?.rotulo ?: ""
        val bp = subtiposBP.firstOrNull { it.valor == subtipoBP }?.rotulo ?: ""
        val momTexto = if (ehGol) " em $mom${if (momento == "bp") " · $bp" else ""}" else ""
        val min = minutoTexto
        return when (tipo) {
            EVENTO_GOL -> "Gol ${n1?.let { "de $it" } ?: ""}${n2?.let { " (assist. $it)" } ?: ""}$momTexto aos $min"
            EVENTO_GOL_SOFRIDO -> "Gol sofrido$momTexto aos $min"
            EVENTO_AMARELO -> "Amarelo ${if (time == "own") n1?.let { "pra $it" } ?: "(nosso time)" else "(adversário)"} aos $min"
            EVENTO_VERMELHO -> "Vermelho ${if (time == "own") n1?.let { "pra $it" } ?: "(nosso time)" else "(adversário)"} aos $min"
            EVENTO_SUBSTITUICAO -> "Sai ${n2 ?: "—"}, entra ${n1 ?: "—"} aos $min"
            else -> ""
        }
    }

    fun previaMinutagem(ed: EditorJogo): String? {
        if (!ehSubstituicao || !ed.config.rastreiaMinutos || jogadorId.isEmpty() || jogador2Id.isEmpty()) return null
        val e = (montar(ed, confirmouSemAutor = true) as? ResultadoForm.Ok)?.evento ?: return null
        val simulado = if (editando != null) ed.atualizarEvento(e) else ed.adicionarEvento(e)
        val m = simulado.minutagem
        val sai = ed.jogador(jogador2Id)
        val entra = ed.jogador(jogadorId)
        val ms = m[jogador2Id] ?: return null
        val me = m[jogadorId] ?: return null
        var t = "Minutagem automática: ${nomeCurto(sai?.nomeExibido)} ${ms.minutos}' · ${nomeCurto(entra?.nomeExibido)} ${me.minutos}'."
        val v = sai?.vaga
        if (v != null && sai.titular) {
            etiquetaDaVaga(ed.formacao, v, ed.modalidade)?.let { t += " ${nomeCurto(entra?.nomeExibido)} assume a vaga $it." }
        }
        return t
    }

    /** handleAdd: valida e monta o evento (com o id do evento em edição). */
    fun montar(ed: EditorJogo, confirmouSemAutor: Boolean = false, novoId: String = "local-${UUID.randomUUID()}"): ResultadoForm {
        // O web exige o atleta em todo cartão, mas o seletor só aparece para o nosso time.
        if (ehCartao && time == "own" && jogadorId.isEmpty()) return ResultadoForm.Erro("Selecione o atleta que recebeu o cartão.")
        if (ehSubstituicao) {
            validarSubstituicao(ed.jogadores, ed.eventos, ed.dados.duracao, minutoTotalAtual, jogadorId, jogador2Id, editando)
                ?.let { return ResultadoForm.Erro(it) }
        }
        if (tipo == EVENTO_GOL && jogadorId.isEmpty() && !confirmouSemAutor) return ResultadoForm.ConfirmarSemAutor
        val comAtleta = mostraJogador || ehSubstituicao
        return ResultadoForm.Ok(EventoJogo(
            id = editando ?: novoId, tipo = tipo, time = timeFinal,
            tipoGol = if (ehGol) gravarTipoGol(momento, subtipoBP, tipo) else null,
            minuto = minutoTotalAtual,
            jogadorId = if (comAtleta && jogadorId.isNotEmpty()) jogadorId else null,
            jogador2Id = if ((ehGol || ehSubstituicao) && jogador2Id.isNotEmpty()) jogador2Id else null,
        ))
    }
}
