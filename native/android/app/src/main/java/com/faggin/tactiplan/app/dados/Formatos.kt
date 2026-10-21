package com.faggin.tactiplan.app.dados

import java.util.Calendar
import java.util.TimeZone

// Formatadores pt-BR puros (sem relógio nem fuso escondidos — testáveis na JVM).
// Paridade: TactiPlanKit/Formatos.swift.

fun agoraMs(): Long = System.currentTimeMillis()

/** "football_11" → "Futebol 11". Desconhecido/vazio → "". */
fun rotuloModalidade(m: String?): String = when (m) {
    "football_11" -> "Futebol 11"
    "football_7" -> "Futebol 7"
    "futsal" -> "Futsal"
    else -> ""
}

/** "Marcos Andrade" → "MA"; "ana" → "A"; vazio → "?". */
fun iniciais(nome: String?): String {
    val partes = (nome ?: "").split(' ', '\t').filter { it.isNotEmpty() }
    val primeira = partes.firstOrNull()?.firstOrNull() ?: return "?"
    var s = primeira.toString()
    if (partes.size > 1) partes.last().firstOrNull()?.let { s += it }
    return s.uppercase()
}

/** Primeiro nome para a saudação ("Olá, Marcos."). Vazio → null. */
fun primeiroNome(nome: String?): String? = (nome ?: "").split(' ').firstOrNull()?.takeIf { it.isNotEmpty() }

/** Lista curta: até `maximo` itens separados por vírgula; o resto vira "+N". */
fun listaCurta(itens: List<String>, maximo: Int = 3): String {
    val limpos = itens.map { it.trim() }.filter { it.isNotEmpty() }
    if (limpos.size <= maximo || maximo <= 0) return limpos.joinToString(", ")
    return limpos.take(maximo).joinToString(", ") + " +${limpos.size - maximo}"
}

/** "1 convite" / "2 convites". */
fun contagem(n: Int, singular: String, plural: String): String = "$n ${if (n == 1) singular else plural}"

/** Rodapé do Mais: "TactiPlan · versão 1.0.0 (7)". Sem build → só a versão. */
fun rotuloVersao(versao: String?, build: String?): String {
    val v = (versao ?: "").trim()
    val b = (build ?: "").trim()
    if (v.isEmpty()) return "TactiPlan"
    return if (b.isEmpty() || b == v) "TactiPlan · versão $v" else "TactiPlan · versão $v ($b)"
}

/** Compara versões "1.2.10" × "1.10" numericamente: -1, 0 ou 1. Parte não numérica conta 0. */
fun compararVersoes(a: String, b: String): Int {
    fun partes(s: String) = s.split('.').filter { it.isNotEmpty() }.map { p -> p.takeWhile { it.isDigit() }.toIntOrNull() ?: 0 }
    val pa = partes(a)
    val pb = partes(b)
    for (i in 0 until maxOf(pa.size, pb.size)) {
        val x = pa.getOrElse(i) { 0 }
        val y = pb.getOrElse(i) { 0 }
        if (x != y) return if (x < y) -1 else 1
    }
    return 0
}

/** O app instalado é mais velho que a versão mínima do servidor? */
fun precisaAtualizar(instalada: String?, minima: String?): Boolean {
    if (instalada.isNullOrEmpty() || minima.isNullOrEmpty()) return false
    return compararVersoes(instalada, minima) < 0
}

/** Carimbo relativo ("atualizado há X"). `em` e `agora` em ms desde 1970. */
fun tempoDesde(em: Long, agora: Long = agoraMs()): String {
    val dif = agora - em
    val min = if (dif >= 0) dif / 60_000 else -((-dif + 59_999) / 60_000)
    if (min < 1) return "agora há pouco"
    if (min < 60) return "há $min min"
    val horas = min / 60
    if (horas < 24) return "há $horas h"
    val dias = horas / 24
    return "há $dias dia${if (dias > 1) "s" else ""}"
}

/** Faixa âmbar de quando o app mostra o último dado por falta de rede. */
fun textoSemConexao(em: Long?, agora: Long = agoraMs()): String {
    if (em == null) return "Sem conexão — mostrando o que foi visto por último."
    return "Sem conexão — mostrando o que foi visto por último · atualizado ${tempoDesde(em, agora)}"
}

private val MESES = listOf("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
    "setembro", "outubro", "novembro", "dezembro")
private val DIAS = listOf("domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado")

/** "quarta, 21 de outubro" no fuso de Brasília. */
fun dataPorExtenso(ms: Long = agoraMs()): String {
    val c = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    c.timeInMillis = ms
    val dia = DIAS[c.get(Calendar.DAY_OF_WEEK) - 1]
    val mes = MESES[c.get(Calendar.MONTH)]
    return "$dia, ${c.get(Calendar.DAY_OF_MONTH)} de $mes"
}

/** "e-mail com cara de e-mail" (só para não mandar o que é obviamente errado). */
fun emailPlausivel(s: String): Boolean {
    val t = s.trim()
    if (t.count { it == '@' } != 1 || t.contains(' ')) return false
    val local = t.substringBefore('@')
    val dominio = t.substringAfter('@')
    return local.isNotEmpty() && dominio.contains('.') && !dominio.startsWith('.') && !dominio.endsWith('.')
}
