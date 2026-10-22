package com.faggin.tactiplan.app.dados.treino

// Período de AVALIAÇÃO (session_type "assessment", migration 059 do servidor).
// Sem blocos de atividade: a ÚNICA informação é o tipo de avaliação (lista fixa, seleção múltipla)
// + "Outra" com texto curto (até 60). Pode ficar ao lado de treino ou jogo, ou sozinho no dia.
// NÃO entra nas estatísticas (minutos, pilares, sessões). Regras iguais a frontend/src/lib/periodos.js
// (paridade: native/paridade/avaliacao.json). Paridade iOS: TactiPlanKit/Avaliacao.swift.

enum class TipoAvaliacao(val bruto: String, val rotulo: String) {
    FISICA("fisica", "Física"),
    TECNICA("tecnica", "Técnica"),
    TATICA("tatica", "Tática"),
    FISIOLOGICA("fisiologica", "Fisiológica/Médica"),
    ANTROPOMETRICA("antropometrica", "Antropométrica"),
    PSICOLOGICA("psicologica", "Psicológica"),
    OUTRA("outra", "Outra");

    companion object {
        fun de(s: String?): TipoAvaliacao? = entries.firstOrNull { it.bruto == s }
    }
}

const val MAX_OUTRA_AVALIACAO = 60

/** Resultado da conferência da escolha (mesma regra do servidor). */
data class EscolhaAvaliacao(val ok: Boolean, val tipos: List<String>, val outra: String?, val erro: String?)

/** Só tipos da lista, sem repetir, na ordem da lista; "Outra" só com texto (aparado, até 60). */
fun normalizarAvaliacao(tipos: List<String>?, outra: String?): EscolhaAvaliacao {
    val lista = tipos.orEmpty().map { it.trim() }
    lista.firstOrNull { it.isNotEmpty() && TipoAvaliacao.de(it) == null }?.let {
        return EscolhaAvaliacao(false, emptyList(), null, "Tipo de avaliação inválido: $it")
    }
    val texto = (outra ?: "").trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
    if (texto.length > MAX_OUTRA_AVALIACAO) {
        return EscolhaAvaliacao(false, emptyList(), null, "\"Outra\" aceita até $MAX_OUTRA_AVALIACAO caracteres")
    }
    val set = lista.filter { it.isNotEmpty() }.toMutableSet()
    if (texto.isNotEmpty()) set += "outra"
    if ("outra" in set && texto.isEmpty()) return EscolhaAvaliacao(false, emptyList(), null, "Diga qual é a outra avaliação")
    return EscolhaAvaliacao(true, TipoAvaliacao.entries.map { it.bruto }.filter { it in set }, texto.ifEmpty { null }, null)
}

/** "Física", "Técnica", "Yo-Yo" — "Outra" vira o texto digitado. */
fun rotulosAvaliacao(d: Dia): List<String> = d.tiposAvaliacao.orEmpty().mapNotNull { t ->
    if (t == "outra") (d.outraAvaliacao?.trim()).takeUnless { it.isNullOrEmpty() } ?: "Outra"
    else TipoAvaliacao.de(t)?.rotulo
}

/** "Física, Técnica" ("" sem tipo). */
fun textoAvaliacao(d: Dia): String = rotulosAvaliacao(d).joinToString(", ")

/** 1ª linha da coluna / carrossel do web: "Manhã · Avaliação", "Tarde · Jogo", "Manhã · Tático | Físico". */
fun rotuloLinhaPeriodo(d: Dia, pilares: List<String> = emptyList()): String {
    val per = periodoEfetivo(d)?.rotulo
    val resto = when (d.tipo) {
        TipoDia.AVALIACAO -> listOf("Avaliação")
        TipoDia.JOGO -> listOf("Jogo")
        else -> pilares
    }.joinToString(" | ")
    if (per == null) return resto
    return if (resto.isEmpty()) per else "$per · $resto"
}

/** Minutos do período (avaliação = 0; atividades antigas de quando era treino não contam). */
fun minutosDoPeriodo(d: Dia): Int = resumoDoDia(d).minutos
