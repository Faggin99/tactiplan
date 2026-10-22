package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.agoraMs
import com.faggin.tactiplan.app.dados.contagem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToLong

// A SEMANA de treinos no celular: lista de 7 dias. Regras puras, as mesmas do web
// (TrainingPage.jsx): semana ISO "YYYY-WW" no fuso de Brasília; pilar predominante POR TEMPO;
// dia que não existe vira o dia "vazio" com os 6 blocos. Paridade: TactiPlanKit/Semana.swift.

val NOMES_BLOCOS = listOf("Aquecimento", "Preparatório", "Atividade 1", "Atividade 2", "Atividade 3", "Complementos")
val NOMES_DIAS = listOf("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")
val SIGLAS_DIAS = listOf("SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM")
private val MESES_CURTOS = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

data class Pilar(val id: String, val rotulo: String, val corHex: String)

val PILARES = listOf(
    Pilar("tatico", "Tático", "#3b82f6"),
    Pilar("fisico", "Físico", "#f59e0b"),
    Pilar("tecnico", "Técnico", "#a855f7"),
    Pilar("mental", "Mental", "#10b981"),
)

fun pilarDe(id: String?): Pilar? = PILARES.firstOrNull { it.id == id }
fun rotuloPilar(id: String?): String = pilarDe(id)?.rotulo ?: (id ?: "")

private val FUSO_BRASILIA: ZoneId = ZoneId.of("America/Sao_Paulo")

private fun dataDe(s: String): LocalDate? = try { LocalDate.parse(s.take(10)) } catch (_: Exception) { null }

data class DataPartes(val ano: Int, val mes: Int, val dia: Int)

fun lerData(s: String): DataPartes? = dataDe(s)?.let { DataPartes(it.year, it.monthValue, it.dayOfMonth) }

fun somarDias(s: String, n: Int): String = dataDe(s)?.plusDays(n.toLong())?.toString() ?: s

/** Hoje no fuso de Brasília ("YYYY-MM-DD"). */
fun hojeBrasilia(ms: Long = agoraMs()): String = Instant.ofEpochMilli(ms).atZone(FUSO_BRASILIA).toLocalDate().toString()

/** 1 = segunda … 7 = domingo. */
fun diaDaSemanaISO(s: String): Int = dataDe(s)?.dayOfWeek?.value ?: 1

fun segundaDaSemana(s: String): String = somarDias(s, -(diaDaSemanaISO(s) - 1))

/** Semana ISO: ano da quinta-feira + número. */
data class SemanaISO(val ano: Int, val numero: Int, val segunda: String) {
    val identificador: String get() = "%04d-%02d".format(ano, numero)
    val domingo: String get() = somarDias(segunda, 6)
    val datas: List<String> get() = (0 until 7).map { somarDias(segunda, it) }

    fun somando(semanas: Int): SemanaISO = de(somarDias(segunda, 7 * semanas))
    fun contem(data: String): Boolean = data.take(10) in datas

    companion object {
        fun de(data: String): SemanaISO {
            val seg = segundaDaSemana(data)
            val quinta = somarDias(seg, 3)
            val q = dataDe(quinta) ?: LocalDate.of(1970, 1, 1)
            val dias = ChronoUnit.DAYS.between(LocalDate.of(q.year, 1, 1), q).toInt()
            return SemanaISO(q.year, dias / 7 + 1, seg)
        }
    }
}

/** "19–25 out" · "28 set – 4 out". */
fun rotuloPeriodo(s: SemanaISO): String {
    val a = lerData(s.segunda) ?: return s.identificador
    val b = lerData(s.domingo) ?: return s.identificador
    if (a.mes == b.mes) return "${a.dia}–${b.dia} ${MESES_CURTOS[b.mes - 1]}"
    return "${a.dia} ${MESES_CURTOS[a.mes - 1]} – ${b.dia} ${MESES_CURTOS[b.mes - 1]}"
}

/** "Quarta, 21/10". */
fun rotuloDiaCurto(data: String): String {
    val d = lerData(data) ?: return data
    return "%s, %02d/%02d".format(NOMES_DIAS[diaDaSemanaISO(data) - 1], d.dia, d.mes)
}

fun rotuloDiaMinusculo(data: String): String = rotuloDiaCurto(data).lowercase()

fun siglaEDia(data: String): Pair<String, String> =
    SIGLAS_DIAS[diaDaSemanaISO(data) - 1] to (lerData(data)?.dia?.toString() ?: "")

fun dataBR(data: String): String {
    val d = lerData(data) ?: return data
    return "%02d/%02d/%04d".format(d.dia, d.mes, d.ano)
}

fun dataPassada(data: String, hoje: String): Boolean = data.take(10) < hoje

// ---------- os 7 dias ----------

fun diaVazio(data: String): Dia {
    val dow = diaDaSemanaISO(data)
    return Dia(null, data, NOMES_DIAS[dow - 1], dow, null,
        blocos = NOMES_BLOCOS.mapIndexed { i, n -> Bloco(null, n, i + 1) })
}

fun diasDaSemana(m: Microciclo?, s: SemanaISO): List<Dia> = s.datas.map { data ->
    val d = m?.dias?.firstOrNull { it.data == data }
    when {
        d == null -> diaVazio(data)
        d.blocos.isEmpty() -> d.copy(blocos = diaVazio(data).blocos)
        else -> d
    }
}

// ---------- resumo do dia ----------

data class ResumoDia(
    val tipo: TipoDia,
    val pilares: List<String>,
    val minutosPorPilar: List<Pair<String, Int>>,
    val minutos: Int,
    val blocosComAtividade: Int,
    val atividades: Int,
    val anexos: Int,
    val distanciaKm: Double?,
    val adversario: String?,
    /** Tipos de avaliação do dia ("Física, Técnica"); null sem período de avaliação. */
    val avaliacao: String? = null,
) {
    val rotuloPilares: String
        get() {
            val r = pilares.map(::rotuloPilar)
            if (r.size <= 1) return r.firstOrNull() ?: ""
            return r.dropLast(1).joinToString(", ") + " e " + r.last()
        }
}

fun resumoDoDia(d: Dia): ResumoDia {
    // avaliação: sem blocos, sem minutos (não entra em nada das estatísticas)
    if (d.tipo == TipoDia.AVALIACAO) {
        return ResumoDia(TipoDia.AVALIACAO, emptyList(), emptyList(), 0, 0, 0, 0, null, null, textoAvaliacao(d))
    }
    val minP = mutableMapOf<String, Int>()
    val cntP = mutableMapOf<String, Int>()
    var total = 0
    var blocos = 0
    var anexos = 0
    for (b in d.blocos) {
        val a = b.atividade ?: continue
        blocos++
        val m = maxOf(0, a.minutos ?: 0)
        total += m
        anexos += maxOf(0, a.anexos ?: 0)
        val dims = a.conteudos.orEmpty().mapNotNull { it.dimensao }.filter { it.isNotEmpty() }.toSet()
        for (dim in dims) {
            minP[dim] = (minP[dim] ?: 0) + m
            cntP[dim] = (cntP[dim] ?: 0) + 1
        }
    }
    val dims = cntP.keys.toList()
    val ordem = PILARES.map { it.id }
    var predominantes = emptyList<String>()
    if (dims.isNotEmpty()) {
        val temTempo = dims.any { (minP[it] ?: 0) > 0 }
        val peso = { k: String -> if (temTempo) (minP[k] ?: 0) else (cntP[k] ?: 0) }
        val maior = dims.maxOf(peso)
        predominantes = dims.filter { peso(it) == maior }
            .sortedWith(compareBy<String>({ ordem.indexOf(it).let { i -> if (i < 0) 99 else i } }, { it }))
    }
    val ordemBarra = ordem + dims.filter { pilarDe(it) == null }.sorted()
    val barra = ordemBarra.mapNotNull { k -> if (cntP[k] == null) null else k to (minP[k] ?: 0) }
    return ResumoDia(d.tipo, predominantes, barra, total, blocos, blocos, anexos,
        if (d.tipo == TipoDia.TREINO) d.distanciaKm else null, d.adversario)
}

fun tituloDaLinha(r: ResumoDia): String = when (r.tipo) {
    TipoDia.JOGO -> r.adversario?.trim()?.takeIf { it.isNotEmpty() }?.let { "Jogo vs $it" } ?: "Jogo"
    TipoDia.DESCANSO -> "Descanso"
    TipoDia.AVALIACAO -> "Avaliação"
    TipoDia.TREINO -> if (r.pilares.isEmpty()) "Treino" else "Treino · ${r.rotuloPilares}"
}

fun detalheDaLinha(r: ResumoDia): String {
    val p = mutableListOf<String>()
    if (r.minutos > 0) p += "${r.minutos} min"
    r.distanciaKm?.let { p += "${formatarKm(it)} km" }
    if (r.tipo == TipoDia.TREINO && r.atividades == 0) p += "Sem atividades"
    r.avaliacao?.let { av -> p += if (av.isEmpty()) "Avaliação" else if (r.tipo == TipoDia.AVALIACAO) av else "Avaliação: $av" }
    return p.joinToString(" · ")
}

fun fraseDoHeroi(r: ResumoDia): String = when (r.tipo) {
    TipoDia.DESCANSO -> "Dia de descanso"
    TipoDia.AVALIACAO -> "Dia de avaliação"
    TipoDia.JOGO -> r.adversario?.trim()?.takeIf { it.isNotEmpty() }?.let { "Jogo vs $it" } ?: "Dia de jogo"
    TipoDia.TREINO -> if (r.atividades == 0) "Nenhuma atividade planejada" else {
        val p = mutableListOf<String>()
        if (r.pilares.isNotEmpty()) p += "Pilar predominante ${r.rotuloPilares}"
        p += contagem(r.atividades, "atividade", "atividades")
        if (r.anexos > 0) p += contagem(r.anexos, "anexo", "anexos")
        p.joinToString(" · ")
    }
}

// ---------- distância ideal (km) ----------

fun formatarKm(km: Double?): String {
    if (km == null || !km.isFinite()) return ""
    val centavos = (km * 100).roundToLong()
    val inteiro = centavos / 100
    val frac = abs(centavos % 100)
    if (frac == 0L) return "$inteiro"
    if (frac % 10 == 0L) return "$inteiro,${frac / 10}"
    return "%d,%02d".format(inteiro, frac)
}

sealed interface ResultadoKm {
    /** null = limpar */
    data class Ok(val km: Double?) : ResultadoKm
    data class Erro(val mensagem: String) : ResultadoKm
}

const val MSG_KM_INVALIDO = "Distância inválida: use um número com até 2 casas decimais (ex.: 5,2)."
const val MSG_KM_GRANDE = "A distância ideal deve ser menor que 100 km."

fun lerKm(texto: String): ResultadoKm {
    val s = texto.trim().replace(",", ".")
    if (s.isEmpty()) return ResultadoKm.Ok(null)
    if (!Regex("""^\d+(\.\d{1,2})?$""").matches(s)) return ResultadoKm.Erro(MSG_KM_INVALIDO)
    val n = s.toDoubleOrNull() ?: return ResultadoKm.Erro(MSG_KM_INVALIDO)
    if (n >= 100) return ResultadoKm.Erro(MSG_KM_GRANDE)
    return ResultadoKm.Ok(n)
}
