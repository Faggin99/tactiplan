package com.faggin.tactiplan.app.dados.estatisticas

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.elenco.compararNome
import com.faggin.tactiplan.app.dados.treino.PILARES
import com.faggin.tactiplan.app.dados.treino.SemanaISO
import com.faggin.tactiplan.app.dados.treino.nomeArquivoSeguro
import com.faggin.tactiplan.app.dados.treino.somarDias
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

// Estatísticas (T3): Treino e Jogos do web (TrainingStatsPage, TrainingDashboard, GameStatsContent)
// sobre as MESMAS rotas /api/stats. As contas do servidor não se repetem aqui; só o que a tela do
// web calcula (períodos, formatos, cards, ordenações), testado contra native/paridade/t3.json.
// Paridade: TactiPlanKit/Estatisticas.swift.

// ---------- filtros de período ----------

data class FiltroPeriodo(val id: String, val rotulo: String)

val FILTROS_PERIODO = listOf(
    FiltroPeriodo("1-micro", "1 Microciclo"),
    FiltroPeriodo("4-micros", "4 Microciclos"),
    FiltroPeriodo("semester", "Semestre"),
    FiltroPeriodo("1-year", "1 Ano"),
    FiltroPeriodo("custom", "Personalizado"),
)

fun rotuloFiltro(id: String): String = FILTROS_PERIODO.firstOrNull { it.id == id }?.rotulo ?: id

data class PeriodoStats(val inicio: String, val fim: String, val semana: String? = null)

/** Semana: segunda → domingo; 4 microciclos: segunda + 27 dias. `base` = um dia da (1ª) semana. */
fun periodoDaSemana(filtro: String, base: String): PeriodoStats {
    val s = SemanaISO.de(base)
    return PeriodoStats(s.segunda, somarDias(s.segunda, if (filtro == "4-micros") 27 else 6), s.identificador)
}

/** O período padrão de cada filtro em `hoje` (Personalizado = null: a pessoa escolhe). */
fun periodoDoFiltro(filtro: String, hoje: String): PeriodoStats? {
    val y = hoje.take(4)
    val mes = hoje.substring(5, 7).toInt() - 1
    return when (filtro) {
        "1-micro", "4-micros" -> periodoDaSemana(filtro, hoje)
        "semester" -> if (mes < 6) PeriodoStats("$y-01-01", "$y-06-30") else PeriodoStats("$y-07-01", "$y-12-31")
        "1-year" -> PeriodoStats("$y-01-01", "$y-12-31")
        else -> null
    }
}

/** Semestre/ano: mudar a data inicial recalcula o fim (como o web). */
fun fimAoMudarInicio(filtro: String, inicio: String): String? = when (filtro) {
    "semester" -> if (inicio.substring(5, 7).toInt() - 1 < 6) "${inicio.take(4)}-06-30" else "${inicio.take(4)}-12-31"
    "1-year" -> "${inicio.take(4)}-12-31"
    else -> null
}

/** As setas ‹ › da semana: ±7 dias. */
fun semanaVizinha(segunda: String, delta: Int): SemanaISO = SemanaISO.de(somarDias(segunda, 7 * delta))

// ---------- formatos ----------

/** 0 → "0min"; 59 → "59min"; 60 → "1h"; 65 → "1h 5min". */
fun formatarMinutos(min: Int?): String {
    val m = min ?: 0
    if (m == 0) return "0min"
    val h = m / 60
    val r = m % 60
    if (h == 0) return "${r}min"
    if (r == 0) return "${h}h"
    return "${h}h ${r}min"
}

/** O `dec` do web: String(v).replace('.', ',') — 2.5 → "2,5", 1 → "1". */
fun decimalWeb(v: Double?): String {
    val x = v ?: 0.0
    val s = if (x == Math.floor(x) && !x.isInfinite()) x.toLong().toString() else x.toString()
    return s.replace('.', ',')
}

fun plural(n: Int, um: String, varios: String) = "$n ${if (n == 1) um else varios}"

// ---------- Jogos: os 4 cards ----------

data class CardsJogos(
    val pct: Int, val pts: Int, val ptsMax: Int, val sequencia: String, val vedText: String,
    val saldo: String, val media: String, val maiorVitoria: String, val maiorDerrota: String, val pontosTexto: String,
)

fun cardsJogos(s: StatsJogos): CardsJogos {
    val jogos = s.totalMatches
    val pts = s.pointsWon ?: 0
    val ptsMax = s.pointsPlayed?.takeIf { it > 0 } ?: (jogos * 3)
    val pct = if (ptsMax > 0) Math.round(pts.toDouble() / ptsMax * 100).toInt() else 0
    val seq = when {
        (s.winStreak ?: 0) > 1 -> "${s.winStreak} vitórias seguidas"
        (s.unbeatenStreak ?: 0) > 0 -> "Invicto há ${plural(s.unbeatenStreak!!, "jogo", "jogos")}"
        else -> "Sem vencer no último jogo"
    }
    val saldo = s.goalDifference ?: 0
    return CardsJogos(
        pct = pct, pts = pts, ptsMax = ptsMax, sequencia = seq,
        vedText = "${plural(s.wins, "vitória", "vitórias")} · ${plural(s.draws, "empate", "empates")} · ${plural(s.losses, "derrota", "derrotas")}",
        saldo = if (saldo > 0) "+$saldo" else if (saldo < 0) "−${-saldo}" else "0",
        media = "${decimalWeb(s.avgGoalsScored)} × ${decimalWeb(s.avgGoalsConceded)}",
        maiorVitoria = s.biggestWin?.let { "${it.feitos}×${it.sofridos} vs ${it.adversario}" } ?: "Sem vitórias",
        maiorDerrota = s.biggestLoss?.let { "${it.feitos}×${it.sofridos} vs ${it.adversario}" } ?: "Sem derrotas",
        pontosTexto = "pontos · ${plural(jogos, "jogo", "jogos")}",
    )
}

/** Últimos jogos (até 5), do mais novo ao mais antigo, como o "Momento" do web. */
fun formaRecente(s: StatsJogos): List<JogoForma> = s.form.take(5)

// ---------- Minutagem completa ----------

data class LinhaMinutagem(val jogador: JogadorStats, val pct: Int)

val COLUNAS_MINUTAGEM = listOf(
    "name" to "Jogador", "minutes" to "Min", "appearances" to "Jogos", "pct" to "% poss.", "starts" to "Tit.", "sub_entries" to "Entrou",
)

data class OrdemMinutagem(val chave: String = "minutes", val asc: Boolean = false)

/** Mesma chave inverte; chave nova = asc para o nome, desc para as outras. */
fun alternarOrdem(atual: OrdemMinutagem, chave: String): OrdemMinutagem =
    if (atual.chave == chave) atual.copy(asc = !atual.asc) else OrdemMinutagem(chave, chave == "name")

fun ordenarMinutagem(jogadores: List<JogadorStats>, minutosPossiveis: Int, ordem: OrdemMinutagem): List<LinhaMinutagem> {
    val linhas = jogadores.filter { it.calledUp > 0 || it.minutes > 0 }
        .map { LinhaMinutagem(it, if (minutosPossiveis > 0) Math.round(it.minutes.toDouble() / minutosPossiveis * 100).toInt() else 0) }
    val mul = if (ordem.asc) 1 else -1
    fun valor(l: LinhaMinutagem): Int = when (ordem.chave) {
        "minutes" -> l.jogador.minutes
        "appearances" -> l.jogador.appearances
        "pct" -> l.pct
        "starts" -> l.jogador.starts
        "sub_entries" -> l.jogador.subEntries
        else -> 0
    }
    return linhas.sortedWith { a, b ->
        if (ordem.chave == "name") mul * compararNome(a.jogador.name, b.jogador.name)
        else (mul * (valor(a) - valor(b))).takeIf { it != 0 } ?: compararNome(a.jogador.name, b.jogador.name)
    }
}

/** "{n} atletas · {N} jogos · {M} min possíveis". */
fun subtituloMinutagem(n: Int, jogos: Int, possiveis: Int) =
    "${plural(n, "atleta", "atletas")} · ${plural(jogos, "jogo", "jogos")} · $possiveis min possíveis"

const val RODAPE_MINUTAGEM = "Jogos = jogou/relacionado. % = minutos ÷ minutos possíveis do período. Minutagem pelas substituições e expulsões (ou ajuste manual no jogo)."

// ---------- Treino ----------

/** Modos da distribuição por pilar: Por sessão (predominância), Nº atividades, Tempo. */
enum class ModoPilar(val rotulo: String, val descricao: String) {
    SESSOES("Por sessão", "Frequência: em quantas sessões cada conteúdo apareceu (1× por sessão, mesmo que repita dentro do dia)."),
    ATIVIDADES("Nº atividades", "Volume: cada atividade conta individualmente. Uma sessão com 3 atividades de OO contabiliza 3 pra OO."),
    TEMPO("Tempo", "Carga: soma o tempo de todas as atividades. Submomentos não usam tempo (uma atividade pode marcar vários)."),
}

data class FatiaPilar(val pilar: String, val rotulo: String, val corHex: String, val valor: Int, val pct: Int)

fun distribuicaoPilares(s: StatsTreino, modo: ModoPilar): List<FatiaPilar> {
    val brutos = PILARES.map { p ->
        val v = when (modo) {
            ModoPilar.SESSOES -> s.byDimensionPredominance.firstOrNull { it.dimension == p.id }?.sessions ?: 0
            ModoPilar.ATIVIDADES -> s.byDimension.firstOrNull { it.dimension == p.id }?.count ?: 0
            ModoPilar.TEMPO -> s.byDimension.firstOrNull { it.dimension == p.id }?.minutes ?: 0
        }
        p to v
    }.filter { it.second > 0 }
    val total = brutos.sumOf { it.second }
    return brutos.map { (p, v) -> FatiaPilar(p.id, p.rotulo, p.corHex, v, if (total > 0) Math.round(v.toDouble() / total * 100).toInt() else 0) }
}

fun valorPilarTexto(v: Int, modo: ModoPilar): String = when (modo) {
    ModoPilar.TEMPO -> formatarMinutos(v)
    ModoPilar.SESSOES -> plural(v, "sessão", "sessões")
    ModoPilar.ATIVIDADES -> plural(v, "atividade", "atividades")
}

data class ItemConteudo(val id: String?, val nome: String, val valor: Int)

/** Conteúdos do pilar no modo (Por sessão = predominância; senão byContent), maior primeiro. */
fun conteudosDoPilar(s: StatsTreino, modo: ModoPilar, pilar: String): List<ItemConteudo> {
    val itens = if (modo == ModoPilar.SESSOES) {
        s.byContentPredominance.filter { it.dimension == pilar }.map { ItemConteudo(it.contentId, it.name ?: "", it.sessions ?: 0) }
    } else {
        s.byContent.filter { it.dimension == pilar }.map { ItemConteudo(it.contentId, it.name ?: "", if (modo == ModoPilar.TEMPO) it.minutes else it.count) }
    }
    return itens.filter { it.valor > 0 }.sortedByDescending { it.valor }
}

/** Submomentos do Tático (por contagem; filtrados pelo conteúdo escolhido). */
fun submomentosTaticos(s: StatsTreino, conteudoId: String? = null): List<ItemConteudo> =
    s.bySubcontent.filter { it.dimension == "tatico" && (conteudoId == null || it.contentId == conteudoId) }
        .map { ItemConteudo(it.subcontentId, it.name ?: "", it.count) }.sortedByDescending { it.valor }

/** "Conteúdo mais usado · <Pilar>": por pilar, o de maior count (empate = o 1º). */
data class MaisUsado(val pilar: String, val rotulo: String, val corHex: String, val nome: String, val detalhe: String)

fun maisUsadosPorPilar(s: StatsTreino): List<MaisUsado> = PILARES.mapNotNull { p ->
    var melhor: ConteudoStats? = null
    for (c in s.byContent) if (c.dimension == p.id && (melhor == null || c.count > melhor.count)) melhor = c
    melhor?.let { MaisUsado(p.id, p.rotulo, p.corHex, it.name ?: "", "${plural(it.count, "atividade", "atividades")} · ${formatarMinutos(it.minutes)}") }
}

fun temDadosTreino(s: StatsTreino): Boolean = s.totals.activities > 0 || (s.distance?.daysWithData ?: 0) > 0

/** km no padrão pt-BR (1 casa). */
fun km(v: Double?): String = v?.let { String.format(java.util.Locale.forLanguageTag("pt-BR"), "%.1f", it) } ?: "—"

// ---------- exportar ----------

fun corpoEstatisticas(clubeId: String, p: PeriodoStats, filtro: String): Map<String, JsonElement> = mapOf(
    "club_id" to JsonPrimitive(clubeId), "start_date" to JsonPrimitive(p.inicio), "end_date" to JsonPrimitive(p.fim),
    "filter_type" to JsonPrimitive(filtro), "period_label" to JsonPrimitive(rotuloFiltro(filtro)),
)

fun nomePdfEstatisticas(treino: Boolean, clube: String, filtro: String): String =
    "${if (treino) "Estatisticas_Treino" else "Desempenho"}_${nomeArquivoSeguro(clube)}_${nomeArquivoSeguro(rotuloFiltro(filtro))}.pdf"

// ---------- modelos ----------

@Serializable data class TotaisTreino(val activities: Int = 0, val minutes: Int = 0, val sessions: Int = 0, val uniqueTemplates: Int = 0)
@Serializable data class DimensaoStats(val dimension: String? = null, val label: String? = null, val count: Int = 0, val minutes: Int = 0, val sessions: Int? = null)
@Serializable data class ConteudoStats(@SerialName("content_id") val contentId: String? = null, val name: String? = null, val dimension: String? = null, val count: Int = 0, val minutes: Int = 0, val sessions: Int? = null)
@Serializable data class SubStats(@SerialName("subcontent_id") val subcontentId: String? = null, val name: String? = null, @SerialName("content_id") val contentId: String? = null, val dimension: String? = null, val count: Int = 0, val minutes: Int = 0)
@Serializable data class TituloStats(@SerialName("title_id") val id: String? = null, val title: String? = null, val dimension: String? = null, @SerialName("content_name") val conteudo: String? = null, val count: Int = 0, val minutes: Int = 0)
@Serializable data class SerieDistancia(val label: String? = null, val start: String? = null, val avgKm: Double? = null, val days: Int? = null)
@Serializable data class DistanciaStats(val daysWithData: Int = 0, val avgKm: Double? = null, val totalKm: Double? = null, val maxKm: Double? = null, val minKm: Double? = null, val granularity: String? = null, val series: List<SerieDistancia> = emptyList())
@Serializable data class Sparklines(val activities: List<Int> = emptyList(), val minutes: List<Int> = emptyList())

@Serializable
data class StatsTreino(
    val totals: TotaisTreino = TotaisTreino(),
    val sparklines: Sparklines = Sparklines(),
    val byDimension: List<DimensaoStats> = emptyList(),
    val byContent: List<ConteudoStats> = emptyList(),
    val bySubcontent: List<SubStats> = emptyList(),
    val byDimensionPredominance: List<DimensaoStats> = emptyList(),
    val byContentPredominance: List<ConteudoStats> = emptyList(),
    val topTitles: List<TituloStats> = emptyList(),
    val distance: DistanciaStats? = null,
)

@Serializable
data class JogoPlacar(
    @SerialName("goals_scored") val feitos: Int = 0,
    @SerialName("goals_conceded") val sofridos: Int = 0,
    @SerialName("opponent") val adversario: String? = null,
    val date: String? = null,
)

@Serializable
data class JogoForma(val result: String? = null, val date: String? = null, val opponent: String? = null,
    @SerialName("goals_scored") val feitos: Int = 0, @SerialName("goals_conceded") val sofridos: Int = 0)

@Serializable
data class JogadorStats(
    @SerialName("athlete_id") val id: String = "",
    val name: String? = null,
    @SerialName("jersey_number") val camisa: Int? = null,
    val goals: Int = 0,
    val assists: Int = 0,
    val minutes: Int = 0,
    val appearances: Int = 0,
    val starts: Int = 0,
    @SerialName("sub_entries") val subEntries: Int = 0,
    @SerialName("called_up") val calledUp: Int = 0,
)

@Serializable
data class StatsJogos(
    val totalMatches: Int = 0,
    val totalGoalsScored: Int = 0,
    val totalGoalsConceded: Int = 0,
    val wins: Int = 0,
    val draws: Int = 0,
    val losses: Int = 0,
    val redCards: Int = 0,
    val yellowCards: Int = 0,
    val assists: Int = 0,
    val accumulatedFouls: Int? = null,
    val sixthFouls: Int? = null,
    val modality: String? = null,
    val pointsPlayed: Int? = null,
    val pointsWon: Int? = null,
    val winStreak: Int? = null,
    val unbeatenStreak: Int? = null,
    val topScorers: List<JogadorStats> = emptyList(),
    val topAssisters: List<JogadorStats> = emptyList(),
    val topMinutes: List<JogadorStats> = emptyList(),
    val topSubEntries: List<JogadorStats> = emptyList(),
    val playerStats: List<JogadorStats> = emptyList(),
    val minutesPossible: Int = 0,
    val substitutionsTotal: Int = 0,
    val avgSubstitutionsPerGame: Double? = null,
    val avgSubstitutionMinute: Double? = null,
    val avgGoalsScored: Double? = null,
    val avgGoalsConceded: Double? = null,
    val cleanSheets: Int = 0,
    val biggestWin: JogoPlacar? = null,
    val biggestLoss: JogoPlacar? = null,
    val form: List<JogoForma> = emptyList(),
    val goalDifference: Int? = null,
)

// ---------- API ----------

object CaminhosStats {
    fun treino(clube: String, ini: String, fim: String) =
        "/stats/training?start_date=${codificarComponente(ini)}&end_date=${codificarComponente(fim)}&clubId=${codificarComponente(clube)}"
    fun jogos(clube: String, ini: String, fim: String) =
        "/stats/games?start_date=${codificarComponente(ini)}&end_date=${codificarComponente(fim)}&clubId=${codificarComponente(clube)}"
}

interface ApiStats {
    suspend fun treino(clubeId: String, p: PeriodoStats): StatsTreino
    suspend fun jogos(clubeId: String, p: PeriodoStats): StatsJogos
}

class ApiStatsHttp(private val api: Api, private val token: String, private val workspaceId: String) : ApiStats {
    private suspend fun j(c: String) = api.chamarJson(c, "GET", null, token, mapOf("X-Workspace-Id" to workspaceId))
    override suspend fun treino(clubeId: String, p: PeriodoStats) =
        JsonApp.decodeFromJsonElement(StatsTreino.serializer(), j(CaminhosStats.treino(clubeId, p.inicio, p.fim)))
    override suspend fun jogos(clubeId: String, p: PeriodoStats) =
        JsonApp.decodeFromJsonElement(StatsJogos.serializer(), j(CaminhosStats.jogos(clubeId, p.inicio, p.fim)))
}

/** Arredonda para o anel/barras sem estourar 0…100. */
fun limitar(p: Int) = p.coerceIn(0, 100)
