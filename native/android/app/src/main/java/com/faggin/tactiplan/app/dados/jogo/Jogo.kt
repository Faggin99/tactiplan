package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.treino.IntFlex
import com.faggin.tactiplan.app.dados.treino.dataBR
import com.faggin.tactiplan.app.dados.treino.lerData
import com.faggin.tactiplan.app.dados.treino.nomeArquivoSeguro
import com.faggin.tactiplan.app.dados.treino.rotuloDiaCurto
import com.faggin.tactiplan.app.dados.treino.somarDias
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

// Contrato das rotas de JOGO do web, usadas pelo app com o próprio token (T2):
//   GET/POST /api/games/:sessionId · GET /api/sessions/:id · GET /api/stats/games (matchesHistory)
//   GET /api/athletes?status=active&club_id= · GET /api/competitions?clubId=
// Tolerante (campo novo nunca quebra; número pode vir como texto). Paridade: TactiPlanKit/Jogo.swift.

const val STATUS_TITULAR = "starter"
const val STATUS_RESERVA = "substitute"

private fun primitivo(d: Decoder): JsonPrimitive? {
    val e = (d as? JsonDecoder)?.decodeJsonElement() ?: return null
    if (e is JsonNull) return null
    return e as? JsonPrimitive
}

/** Texto OU número ("7" ou 7 → "7"); null/objeto → null. */
object TextoFlex : KSerializer<String?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("TextoFlex", PrimitiveKind.STRING).nullable
    override fun deserialize(decoder: Decoder): String? {
        val p = primitivo(decoder) ?: return null
        if (p.isString) return p.content
        val d = p.content.toDoubleOrNull() ?: return null
        return if (d == Math.floor(d)) d.toLong().toString() else p.content
    }
    override fun serialize(encoder: Encoder, value: String?) { if (value == null) encoder.encodeNull() else encoder.encodeString(value) }
}

/** Data "YYYY-MM-DD" (corta "…T00:00:00.000Z"). */
object DataFlex : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("DataFlex", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String = primitivo(decoder)?.content?.take(10) ?: ""
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}

/** Inteiro arredondado (minuto). */
object IntArredondado : KSerializer<Int?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("IntArredondado", PrimitiveKind.INT).nullable
    override fun deserialize(decoder: Decoder): Int? = primitivo(decoder)?.content?.trim()?.toDoubleOrNull()?.let { Math.round(it).toInt() }
    override fun serialize(encoder: Encoder, value: Int?) { if (value == null) encoder.encodeNull() else encoder.encodeInt(value) }
}

/** Inteiro tolerante com 0 quando falta/lixo. */
object IntOuZero : KSerializer<Int> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("IntOuZero", PrimitiveKind.INT)
    override fun deserialize(decoder: Decoder): Int = primitivo(decoder)?.content?.trim()?.toDoubleOrNull()?.toInt() ?: 0
    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)
}

/** Booleano tolerante (null → false). */
object BoolOuFalso : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("BoolOuFalso", PrimitiveKind.BOOLEAN)
    override fun deserialize(decoder: Decoder): Boolean = primitivo(decoder)?.content == "true"
    override fun serialize(encoder: Encoder, value: Boolean) = encoder.encodeBoolean(value)
}

/** id em texto; número vira "local-N"; ausente → "local-<uuid>". */
object IdEvento : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("IdEvento", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String {
        val p = primitivo(decoder) ?: return "local-${UUID.randomUUID()}"
        if (p.isString) return p.content
        return p.content.toDoubleOrNull()?.let { "local-${it.toLong()}" } ?: "local-${UUID.randomUUID()}"
    }
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}

@Serializable
data class AtletaResumo(
    val id: String,
    @SerialName("name") val nome: String = "",
    @Serializable(with = IntFlex::class) @SerialName("jersey_number") val camisa: Int? = null,
    @SerialName("position") val posicao: String? = null,
    @SerialName("photo_url") val fotoUrl: String? = null,
)

@Serializable
data class JogadorJogo(
    @SerialName("athlete_id") val atletaId: String,
    val status: String = STATUS_TITULAR,
    @Serializable(with = IntFlex::class) @SerialName("slot") val vaga: Int? = null,
    @Serializable(with = IntOuZero::class) @SerialName("minutes_played") val minutosJogados: Int = 0,
    @Serializable(with = BoolOuFalso::class) @SerialName("minutes_manual") val minutosManual: Boolean = false,
    @Serializable(with = IntFlex::class) @SerialName("jersey_number") val camisa: Int? = null,
    @SerialName("athlete") val atleta: AtletaResumo? = null,
    @SerialName("name") val nome: String? = null,
) {
    val titular: Boolean get() = status == STATUS_TITULAR
    val reserva: Boolean get() = status == STATUS_RESERVA
    /** p.name || p.athlete?.name */
    val nomeExibido: String? get() = nome?.takeIf { it.isNotEmpty() } ?: atleta?.nome?.takeIf { it.isNotEmpty() }

    companion object {
        fun de(atletaId: String, status: String, vaga: Int? = null, minutosJogados: Int = 0, minutosManual: Boolean = false,
               camisa: Int? = null, atleta: AtletaResumo? = null, nome: String? = null) =
            JogadorJogo(atletaId, status, vaga, minutosJogados, minutosManual, camisa, atleta, nome)
    }
}

@Serializable
data class AtletaDoEvento(val id: String? = null, @SerialName("name") val nome: String? = null)

/** Evento (match_events). Substituição: jogadorId = quem ENTRA, jogador2Id = quem SAI. Gol: jogador2Id = assistência. */
@Serializable
data class EventoJogo(
    @Serializable(with = IdEvento::class) val id: String = "local-${UUID.randomUUID()}",
    @SerialName("event_type") val tipo: String = "",
    @SerialName("team") val time: String? = null,
    @SerialName("goal_type") val tipoGol: String? = null,
    @Serializable(with = IntArredondado::class) @SerialName("minute") val minuto: Int? = null,
    @SerialName("player_id") val jogadorId: String? = null,
    @SerialName("secondary_player_id") val jogador2Id: String? = null,
    @SerialName("player") val jogador: AtletaDoEvento? = null,
    @SerialName("secondary_player") val jogador2: AtletaDoEvento? = null,
    @SerialName("notes") val notas: String? = null,
) {
    val doNossoTime: Boolean get() = time.isNullOrEmpty() || time == "own"
}

@Serializable
data class DadosDoJogo(
    @SerialName("formation") val formacao: String? = null,
    @SerialName("players") val jogadores: List<JogadorJogo> = emptyList(),
    @SerialName("events") val eventos: List<EventoJogo> = emptyList(),
)

@Serializable
data class DiaDoJogo(
    val id: String,
    @Serializable(with = DataFlex::class) @SerialName("date") val data: String = "",
    @SerialName("day_name") val nomeDia: String? = null,
    @SerialName("session_type") val tipoBruto: String? = "match",
    @SerialName("opponent_name") val adversario: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("match_duration") val duracao: Int? = null,
    @SerialName("competition_id") val campeonatoId: String? = null,
    @Serializable(with = TextoFlex::class) @SerialName("match_round") val rodada: String? = null,
    @SerialName("match_location") val local: String? = null,
    @SerialName("video_full_url") val video: String? = null,
    @SerialName("formation") val formacao: String? = null,
    @SerialName("match_kickoff") val horario: String? = null,
    @SerialName("match_venue") val localDoJogo: String? = null,
    @SerialName("match_meet_time") val apresentacao: String? = null,
)

@Serializable
data class Campeonato(
    val id: String,
    @SerialName("name") val nome: String = "",
    @Serializable(with = TextoFlex::class) @SerialName("season") val temporada: String? = null,
) {
    val rotulo: String get() = if (temporada.isNullOrEmpty()) nome else "$nome · $temporada"
}

// ---------- configuração por modalidade (lib/sportConfig.js) ----------

data class OpcaoRotulo(val valor: String, val rotulo: String)

data class ConfigEsporte(
    val modalidade: String,
    val duracaoPadrao: Int,
    val rastreiaMinutos: Boolean,
    val subtiposBolaParada: List<OpcaoRotulo>,
)

private val BP_FUTEBOL_11 = listOf("falta_frontal" to "Falta Frontal", "falta_lateral" to "Falta Lateral", "escanteio" to "Escanteio",
    "lateral" to "Lateral", "penalti" to "Pênalti")
private val BP_FUTEBOL_7 = listOf("falta_frontal" to "Falta Frontal", "falta_lateral" to "Falta Lateral", "escanteio" to "Escanteio",
    "lateral" to "Lateral", "shootout" to "Shootout")
private val BP_FUTSAL = listOf("falta" to "Falta", "escanteio" to "Escanteio", "lateral" to "Lateral", "penalti" to "Pênalti",
    "tiro_livre" to "Tiro Livre (10m)", "falta_acumulada" to "Falta Acumulada")

val CHAVE_SUBTIPO: Map<String, String> = mapOf(
    "falta_frontal" to "falta_frontal", "falta_lateral" to "falta_lateral", "falta" to "falta", "escanteio" to "corner",
    "lateral" to "lateral", "penalti" to "penalty", "shootout" to "shootout", "tiro_livre" to "tiro_livre", "falta_acumulada" to "falta_acumulada",
)

fun configEsporte(modalidade: String?): ConfigEsporte {
    val m = if (modalidade in listOf("football_11", "football_7", "futsal")) modalidade!! else MODALIDADE_PADRAO
    val bp = when (m) { "futsal" -> BP_FUTSAL; "football_7" -> BP_FUTEBOL_7; else -> BP_FUTEBOL_11 }
    return ConfigEsporte(m, when (m) { "futsal" -> 40; "football_7" -> 50; else -> 90 }, m != "futsal",
        bp.map { OpcaoRotulo(CHAVE_SUBTIPO[it.first] ?: it.first, it.second) })
}

// ---------- tipos de evento ----------

data class TipoEvento(val valor: String, val rotulo: String, val corHex: String)

const val EVENTO_GOL = "goal_scored"
const val EVENTO_GOL_SOFRIDO = "goal_conceded"
const val EVENTO_AMARELO = "yellow_card"
const val EVENTO_VERMELHO = "red_card"
const val EVENTO_SUBSTITUICAO = "substitution"
const val EVENTO_FALTA_ACUMULADA = "accumulated_foul"
const val EVENTO_SEXTA_FALTA = "sixth_foul"

fun tiposDeEvento(modalidade: String?): List<TipoEvento> {
    val base = listOf(
        TipoEvento(EVENTO_GOL, "Gol Feito", "#22c55e"),
        TipoEvento(EVENTO_GOL_SOFRIDO, "Gol Tomado", "#ef4444"),
        TipoEvento(EVENTO_AMARELO, "Amarelo", "#eab308"),
        TipoEvento(EVENTO_VERMELHO, "Vermelho", "#dc2626"),
        TipoEvento(EVENTO_SUBSTITUICAO, "Substituição", "#3b82f6"),
    )
    if (modalidade != "futsal") return base
    return base.filter { it.valor != EVENTO_SUBSTITUICAO } + listOf(
        TipoEvento(EVENTO_FALTA_ACUMULADA, "Falta Acum.", "#f59e0b"),
        TipoEvento(EVENTO_SEXTA_FALTA, "6ª Falta", "#b91c1c"),
    )
}

fun rotuloDoEvento(e: EventoJogo): String {
    val nosso = e.doNossoTime
    return when (e.tipo) {
        EVENTO_GOL -> "Gol"
        EVENTO_GOL_SOFRIDO -> "Gol sofrido"
        EVENTO_AMARELO -> if (nosso) "Amarelo" else "Amarelo (adv.)"
        EVENTO_VERMELHO -> if (nosso) "Expulsão" else "Expulsão (adv.)"
        EVENTO_SUBSTITUICAO -> "Substituição"
        EVENTO_FALTA_ACUMULADA -> "Falta acumulada"
        EVENTO_SEXTA_FALTA -> "6ª falta"
        else -> e.tipo.ifEmpty { "Evento" }
    }
}

// ---------- tipo de gol ----------

data class MomentoGol(val momento: String, val subtipoBP: String)

fun lerTipoGol(gt: String?): MomentoGol {
    if (gt.isNullOrEmpty()) return MomentoGol("org", "falta")
    val antigos = mapOf(
        "offensive_org" to MomentoGol("org", "falta"),
        "offensive_transition" to MomentoGol("trans", "falta"),
        "free_kick" to MomentoGol("bp", "falta"),
        "corner" to MomentoGol("bp", "corner"),
        "penalty" to MomentoGol("bp", "penalty"),
    )
    antigos[gt]?.let { return it }
    if (gt.startsWith("org_")) return MomentoGol("org", "falta")
    if (gt.startsWith("trans_")) return MomentoGol("trans", "falta")
    if (gt.startsWith("bp_")) {
        val sub = gt.split("_").drop(2).joinToString("_")
        return MomentoGol("bp", sub.ifEmpty { "falta" })
    }
    return MomentoGol("org", "falta")
}

fun gravarTipoGol(momento: String, subtipoBP: String?, tipoEvento: String): String {
    val orient = if (tipoEvento == EVENTO_GOL_SOFRIDO) "def" else "off"
    return when (momento) {
        "trans" -> "trans_$orient"
        "bp" -> "bp_${orient}_${if (subtipoBP.isNullOrEmpty()) "falta" else subtipoBP}"
        else -> "org_$orient"
    }
}

data class OpcaoMomento(val valor: String, val rotulo: String, val curto: String)

fun momentosDoGol(tipoEvento: String): List<OpcaoMomento> =
    if (tipoEvento == EVENTO_GOL_SOFRIDO) listOf(
        OpcaoMomento("org", "Organização Defensiva", "Org. Def."), OpcaoMomento("trans", "Transição Defensiva", "Trans. Def."),
        OpcaoMomento("bp", "Bola Parada Defensiva", "BP Def."))
    else listOf(
        OpcaoMomento("org", "Organização Ofensiva", "Org. Of."), OpcaoMomento("trans", "Transição Ofensiva", "Trans. Of."),
        OpcaoMomento("bp", "Bola Parada Ofensiva", "BP Of."))

private val REGEX_TIPO_GOL = Regex("^(org|trans|bp)_(off|def)(?:_(.+))?$")

/** getGoalTypeLabel do GameModal ("" sem tipo). */
fun rotuloTipoGol(gt: String?): String {
    if (gt.isNullOrEmpty()) return ""
    val antigos = mapOf("offensive_org" to "Org. ofensiva", "offensive_transition" to "Transição of.", "free_kick" to "Falta",
        "corner" to "Escanteio", "penalty" to "Pênalti")
    antigos[gt]?.let { return it }
    val m = REGEX_TIPO_GOL.find(gt) ?: return ""
    val of = m.groupValues[2] == "off"
    if (m.groupValues[1] == "org") return if (of) "Org. ofensiva" else "Org. defensiva"
    if (m.groupValues[1] == "trans") return if (of) "Transição of." else "Transição def."
    val bp = mapOf("falta" to "Falta", "falta_frontal" to "Falta frontal", "falta_lateral" to "Falta lateral", "corner" to "Escanteio",
        "lateral" to "Lateral", "penalty" to "Pênalti", "shootout" to "Shootout", "tiro_livre" to "Tiro livre",
        "falta_acumulada" to "Falta acumulada")
    val r = bp[m.groupValues[3]]
    return if (r != null) "Bola parada · $r" else "Bola parada"
}

// ---------- minuto do evento ----------

data class MinutoDoJogo(val tempo: Int, val minutoNoTempo: Int, val acrescimo: Int)

fun fimDo1oTempo(duracao: Int) = duracao / 2
fun duracaoDo2oTempo(duracao: Int) = duracao - duracao / 2

fun minutoTotal(m: MinutoDoJogo, duracao: Int): Int {
    val h1 = fimDo1oTempo(duracao)
    if (m.tempo == 1) return if (m.acrescimo > 0) h1 + m.acrescimo else m.minutoNoTempo
    return if (m.acrescimo > 0) duracao + m.acrescimo else h1 + m.minutoNoTempo
}

fun lerMinuto(total: Int, duracao: Int): MinutoDoJogo {
    val h1 = fimDo1oTempo(duracao)
    val h2 = duracaoDo2oTempo(duracao)
    return when {
        total <= h1 -> MinutoDoJogo(1, total, 0)
        total <= h1 + 7 -> MinutoDoJogo(1, h1, total - h1)
        total <= duracao -> MinutoDoJogo(2, total - h1, 0)
        else -> MinutoDoJogo(2, h2, total - duracao)
    }
}

fun textoMinuto(m: MinutoDoJogo, duracao: Int): String {
    val h1 = fimDo1oTempo(duracao)
    if (m.tempo == 1) return if (m.acrescimo > 0) "$h1+${m.acrescimo}'" else "${m.minutoNoTempo}'"
    return if (m.acrescimo > 0) "$duracao+${m.acrescimo}'" else "${h1 + m.minutoNoTempo}'"
}

// ---------- lista de jogos (matchesHistory) ----------

@Serializable
data class JogoDaLista(
    @SerialName("session_id") val sessaoId: String,
    @Serializable(with = DataFlex::class) @SerialName("date") val data: String = "",
    @SerialName("opponent") val adversario: String? = null,
    @Serializable(with = IntOuZero::class) @SerialName("goals_scored") val golsFeitos: Int = 0,
    @Serializable(with = IntOuZero::class) @SerialName("goals_conceded") val golsSofridos: Int = 0,
    @SerialName("result") val resultadoBruto: String? = null,
    @Serializable(with = TextoFlex::class) @SerialName("match_round") val rodada: String? = null,
    @SerialName("match_location") val local: String? = null,
    @SerialName("competition_id") val campeonatoId: String? = null,
    @SerialName("video_full_url") val video: String? = null,
) {
    companion object {
        fun de(sessaoId: String, data: String, adversario: String? = null, golsFeitos: Int = 0, golsSofridos: Int = 0,
               rodada: String? = null, local: String? = null, campeonatoId: String? = null) =
            JogoDaLista(sessaoId, data, adversario, golsFeitos, golsSofridos, null, rodada, local, campeonatoId)
    }
}

enum class Resultado(val letra: String) { VITORIA("V"), EMPATE("E"), DERROTA("D") }

fun resultadoDo(feitos: Int, sofridos: Int): Resultado =
    if (feitos > sofridos) Resultado.VITORIA else if (feitos < sofridos) Resultado.DERROTA else Resultado.EMPATE

/** Jogo ainda por jogar: data futura, ou hoje sem gol lançado. */
fun jogoFuturo(j: JogoDaLista, hoje: String): Boolean {
    if (j.data > hoje) return true
    return j.data == hoje && j.golsFeitos == 0 && j.golsSofridos == 0
}

data class ListaDeJogos(
    val proximo: JogoDaLista?,
    val proximos: List<JogoDaLista>,
    val passados: List<JogoDaLista>,
    val vitorias: Int,
    val empates: Int,
    val derrotas: Int,
)

fun organizarJogos(jogos: List<JogoDaLista>, hoje: String, campeonatoId: String? = null): ListaDeJogos {
    val f = jogos.filter { campeonatoId == null || it.campeonatoId == campeonatoId }
    val futuros = f.filter { jogoFuturo(it, hoje) }.sortedBy { it.data }
    val passados = f.filter { !jogoFuturo(it, hoje) }.sortedByDescending { it.data }
    var v = 0; var e = 0; var d = 0
    for (j in passados) when (resultadoDo(j.golsFeitos, j.golsSofridos)) {
        Resultado.VITORIA -> v++
        Resultado.EMPATE -> e++
        Resultado.DERROTA -> d++
    }
    return ListaDeJogos(futuros.firstOrNull(), futuros.drop(1), passados, v, e, d)
}

fun rotuloLocal(l: String?): String? = when (l) {
    "home" -> "Casa"
    "away" -> "Fora"
    "neutral" -> "Neutro"
    else -> null
}

fun placarDaLinha(j: JogoDaLista, clube: String): String {
    val adv = j.adversario?.takeIf { it.isNotEmpty() } ?: "Adversário"
    if (j.local == "away") return "$adv ${j.golsSofridos} × ${j.golsFeitos} $clube"
    return "$clube ${j.golsFeitos} × ${j.golsSofridos} $adv"
}

fun detalheDaLinhaJogo(j: JogoDaLista, campeonato: String? = null): String {
    val partes = mutableListOf(rotuloDiaCurto(j.data))
    rotuloLocal(j.local)?.let { partes.add(it) }
    if (!j.rodada.isNullOrEmpty()) partes.add("Rodada ${j.rodada}")
    if (!campeonato.isNullOrEmpty()) partes.add(campeonato)
    return partes.joinToString(" · ")
}

fun emQuantosDias(data: String, hoje: String): String {
    if (lerData(hoje) == null || lerData(data) == null) return ""
    val n = ChronoUnit.DAYS.between(LocalDate.parse(hoje.take(10)), LocalDate.parse(data.take(10))).toInt()
    return when {
        n == 0 -> "hoje"
        n == 1 -> "amanhã"
        n == -1 -> "ontem"
        n < 0 -> "há ${-n} dias"
        else -> "em $n dias"
    }
}

enum class PeriodoJogos(val rotulo: String, val dias: Int) {
    MES("Último mês", 31), TRES_MESES("3 meses", 92), SEMESTRE("Semestre", 183), ANO("1 ano", 365);

    fun intervalo(hoje: String): Pair<String, String> = somarDias(hoje, -dias) to somarDias(hoje, 120)
}

fun corpoRelatorioJogos(clubeId: String, inicio: String, fim: String, rotulo: String): Map<String, JsonElement> = mapOf(
    "club_id" to JsonPrimitive(clubeId), "start_date" to JsonPrimitive(inicio), "end_date" to JsonPrimitive(fim),
    "filter_type" to JsonPrimitive("custom"), "period_label" to JsonPrimitive(rotulo),
)

fun nomePdfJogos(clube: String, rotulo: String): String =
    "Desempenho_${nomeArquivoSeguro(clube)}_${nomeArquivoSeguro(rotulo.ifEmpty { "periodo" })}.pdf"

/** tamanho: letra dos nomes no PDF — "normal" | "grande" | "muito_grande". */
fun corpoConvocacao(sessaoId: String, tamanho: String = "normal"): Map<String, JsonElement> =
    mapOf("session_id" to JsonPrimitive(sessaoId)) + (if (tamanho != "normal") mapOf("tamanho_fonte" to JsonPrimitive(tamanho)) else emptyMap())

/** Letra do PDF da convocação (menu Exportar do jogo): valor → rótulo. */
val TAMANHOS_CONVOCACAO = listOf("normal" to "Convocação (PDF)", "grande" to "Convocação · letra grande (PDF)",
    "muito_grande" to "Convocação · letra muito grande (PDF)")

/** Hora digitada → "HH:MM" enquanto digita ("1630" → "16:30", "9" → "9"). Só dígitos, até 4. */
fun mascaraHora(s: String): String {
    val d = s.filter { it.isDigit() }.take(4)
    return if (d.length <= 2) d else "${d.take(2)}:${d.drop(2)}"
}

/** Relatório de UM jogo (POST /api/reports/jogo): placar, lances e atletas com minutos/gols/cartões. */
fun corpoRelatorioJogo(sessaoId: String): Map<String, JsonElement> = mapOf("session_id" to JsonPrimitive(sessaoId))

fun nomePdfRelatorioJogo(adversario: String?, data: String): String {
    val adv = if (adversario.isNullOrBlank()) "Adversário" else adversario
    val base = "Jogo_${adv.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString("_")}_${dataBR(data).replace("/", "-")}"
    return nomeArquivoSeguro(base) + ".pdf"
}

/** Análise do adversário (POST /api/reports/analise; preenchida no web). */
fun nomePdfAnalise(adversario: String?, data: String): String {
    val adv = if (adversario.isNullOrBlank()) "Adversário" else adversario
    val base = "Analise_${adv.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString("_")}_${dataBR(data).replace("/", "-")}"
    return nomeArquivoSeguro(base) + ".pdf"
}

fun nomePdfConvocacao(adversario: String?, data: String): String {
    val adv = if (adversario.isNullOrBlank()) "Adversário" else adversario
    val base = "Convocacao_${adv.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString("_")}_${dataBR(data).replace("/", "-")}"
    return nomeArquivoSeguro(base) + ".pdf"
}
