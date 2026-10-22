package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.contagem
import kotlin.math.roundToLong

// Períodos do dia (Manhã · Tarde · Noite) — migration 057 do servidor.
// Cada período é uma sessão da mesma data; dia de 1 período (a maioria) tem periodo = null e fica
// como antes. Regras iguais às do servidor (backend-node/src/services/periodos.js): máximo 3, nomes
// fixos, descanso é do dia inteiro, no máximo 1 período de jogo por dia. Ao adicionar o 1º extra,
// o treino que já existia ganha um nome (padrão: atual = Manhã, novo = Tarde).
// Paridade: TactiPlanKit/Periodos.swift.

enum class Periodo(val bruto: String, val rotulo: String) {
    MANHA("manha", "Manhã"),
    TARDE("tarde", "Tarde"),
    NOITE("noite", "Noite");

    val ordem: Int get() = ordinal + 1

    companion object {
        fun de(s: String?): Periodo? = entries.firstOrNull { it.bruto == s }
    }
}

const val MAX_PERIODOS = 3

/** 0 = período único, 1 = manhã, 2 = tarde, 3 = noite. */
fun ordemDoPeriodo(p: String?): Int = Periodo.de(p)?.ordem ?: 0

/** "Manhã" (null no período único ou valor desconhecido). */
fun rotuloDoPeriodo(p: String?): String? = Periodo.de(p)?.rotulo

/** Os períodos do dia (o próprio dia quando é único). */
val Dia.listaPeriodos: List<Dia> get() = periodos?.takeIf { it.size > 1 } ?: listOf(this)

/** Tem 2 ou mais períodos? */
val Dia.temPeriodos: Boolean get() = listaPeriodos.size > 1

/** Selo do card do dia na Semana: "2 períodos" (null no dia de 1 período). */
fun seloPeriodos(d: Dia): String? = d.listaPeriodos.size.takeIf { it > 1 }?.let { "$it períodos" }

/** Divisão dos minutos: "90+60" (null no dia de 1 período). */
fun divisaoMinutos(d: Dia): String? =
    if (!d.temPeriodos) null else d.listaPeriodos.joinToString("+") { resumoDoDia(it).minutos.toString() }

/** Distância do dia = soma dos períodos de TREINO com registro (null sem nenhum). */
fun distanciaDoDia(d: Dia): Double? {
    var total: Double? = null
    for (p in d.listaPeriodos) {
        if (p.tipo != TipoDia.TREINO) continue
        val km = p.distanciaKm ?: continue
        if (km.isFinite()) total = (total ?: 0.0) + km
    }
    return total?.let { (it * 100).roundToLong() / 100.0 }
}

/** Resumo do DIA inteiro (períodos somados). Dia de 1 período = `resumoDoDia`. Com jogo, o dia aparece como jogo. */
fun resumoDoDiaInteiro(d: Dia): ResumoDia {
    if (!d.temPeriodos) return resumoDoDia(d)
    val ps = d.listaPeriodos
    val jogo = ps.firstOrNull { it.tipo == TipoDia.JOGO }
    val r = resumoDoDia(d.copy(tipoBruto = TipoDia.TREINO.bruto, blocos = ps.flatMap { it.blocos }, periodos = null))
    return r.copy(
        tipo = if (jogo != null) TipoDia.JOGO else TipoDia.TREINO,
        distanciaKm = distanciaDoDia(d),
        adversario = jogo?.adversario,
    )
}

/** Os nomes que ainda cabem (vazio = não dá: descanso ou já tem 3). Dia de 1 período: os 3. */
fun periodosDisponiveis(d: Dia): List<Periodo> {
    val ps = d.listaPeriodos
    if (ps.any { it.tipo == TipoDia.DESCANSO } || ps.size >= MAX_PERIODOS) return emptyList()
    if (!d.temPeriodos) return Periodo.entries.toList()
    val usados = ps.mapNotNull { it.periodo }.toSet()
    return Periodo.entries.filter { it.bruto !in usados }
}

/** Sugestão ao abrir "Adicionar período": dia único → (Manhã, Tarde); senão (null, 1º livre). */
fun sugestaoNovoPeriodo(d: Dia): Pair<Periodo?, Periodo>? {
    val livres = periodosDisponiveis(d)
    if (livres.isEmpty()) return null
    return if (!d.temPeriodos) Periodo.MANHA to Periodo.TARDE else null to livres[0]
}

const val MSG_PERIODO_DESCANSO = "Dia de descanso não tem períodos. Mude o tipo do dia antes."
const val MSG_PERIODO_MAXIMO = "O dia já tem 3 períodos (o máximo)."
const val MSG_PERIODO_IGUAL = "O novo período precisa ser diferente do atual."

/** Confere o pedido antes de mandar (o servidor confere de novo). null = ok. */
fun erroNovoPeriodo(d: Dia, atual: Periodo?, novo: Periodo): String? {
    val ps = d.listaPeriodos
    if (ps.any { it.tipo == TipoDia.DESCANSO }) return MSG_PERIODO_DESCANSO
    if (ps.size >= MAX_PERIODOS) return MSG_PERIODO_MAXIMO
    if (!d.temPeriodos) {
        if (atual == null) return "Diga qual é o período do treino que já existe."
        return if (atual == novo) MSG_PERIODO_IGUAL else null
    }
    if (ps.any { it.periodo == novo.bruto }) return "O dia já tem o período ${novo.rotulo}."
    return null
}

/** Texto da confirmação de "Remover período". */
fun textoRemoverPeriodo(p: Dia): String {
    val r = resumoDoDia(p)
    val sb = StringBuilder("Remover o período ${rotuloDoPeriodo(p.periodo) ?: ""}? ")
    if (p.tipo == TipoDia.JOGO) sb.append("O jogo deste período (escalação e eventos) também será apagado. ")
    if (r.atividades > 0 || r.anexos > 0) {
        sb.append("Serão apagados ${contagem(r.atividades, "atividade", "atividades")}")
        if (r.anexos > 0) sb.append(" e ${contagem(r.anexos, "anexo", "anexos")}")
        sb.append(". ")
    }
    return sb.append("Não dá para desfazer.").toString()
}
