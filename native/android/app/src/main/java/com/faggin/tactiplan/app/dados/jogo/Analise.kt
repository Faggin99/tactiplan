package com.faggin.tactiplan.app.dados.jogo

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

// Análise do adversário do jogo (GET/PUT /api/games/:id/analise, migration 062), no app.
// O formulário é gerado por um ESQUEMA (seções → campos), o mesmo do web
// (frontend/src/components/training/OpponentAnalysisModal.jsx). Os dados ficam como JSON cru;
// o servidor normaliza ao salvar (backend-node/src/services/analiseAdversario.js) e o PDF mostra
// só o que foi preenchido. Paridade das chaves: native/paridade/analise.json (AnaliseTest).
// Paridade: TactiPlanKit/Analise.swift.

/** Campo do formulário. `caminho` é absoluto (ex.: ["campanha", "vitorias"]). Itens de `Repetir`
 *  usam caminhos RELATIVOS ao item. */
sealed class CampoAnalise {
    abstract val rotulo: String
    abstract val caminho: List<String>
    data class Texto(override val rotulo: String, override val caminho: List<String>, val dica: String = "", val max: Int = 200) : CampoAnalise()
    data class TextoLongo(override val rotulo: String, override val caminho: List<String>, val dica: String = "") : CampoAnalise()
    data class Numero(override val rotulo: String, override val caminho: List<String>, val max: Int = 999) : CampoAnalise()
    /** Lista de tópicos: uma linha por item. */
    data class Lista(override val rotulo: String, override val caminho: List<String>, val dica: String = "Um item por linha") : CampoAnalise()
    data class Escolha(override val rotulo: String, override val caminho: List<String>, val opcoes: List<Pair<String, String>>) : CampoAnalise()
    data class Repetir(override val rotulo: String, override val caminho: List<String>, val item: String, val max: Int,
                       val campos: List<CampoAnalise>) : CampoAnalise()
    /** Formação do rival + nº/nome por vaga (vagasLivres). */
    data class Escalacao(override val rotulo: String, override val caminho: List<String>) : CampoAnalise()
    data class Aviso(override val rotulo: String) : CampoAnalise() { override val caminho: List<String> = emptyList() }
}

data class SecaoAnalise(val chave: String, val titulo: String, val campos: List<CampoAnalise>)

private val FREQ = listOf("" to "—", "predominante" to "Predominante", "frequente" to "Frequente", "pontual" to "Pontual", "raro" to "Raro")
private val PERDER = listOf("" to "—", "pressionam" to "Pressionam (contrapressão)", "temporizam" to "Temporizam", "recuam" to "Recuam e recompõem o bloco")
private val RECUPERAR = listOf("" to "—", "verticais" to "Passes verticais (contra-ataque)", "laterais" to "Passes laterais", "tras" to "Passes para trás (retêm a posse)")

private fun fonte(k: String) = CampoAnalise.Texto("Fontes (opcional)", listOf("fontes", k), "Ex.: CONMEBOL, vídeo do último jogo")
private fun t(r: String, vararg c: String, dica: String = "", max: Int = 200) = CampoAnalise.Texto(r, c.toList(), dica, max)
private fun n(r: String, vararg c: String, max: Int = 999) = CampoAnalise.Numero(r, c.toList(), max)
private fun l(r: String, vararg c: String, dica: String = "Um item por linha") = CampoAnalise.Lista(r, c.toList(), dica)

/** As 13 seções, na ordem do web e do PDF. */
val SECOES_ANALISE: List<SecaoAnalise> = listOf(
    SecaoAnalise("capa", "Capa", listOf(
        CampoAnalise.Aviso("Adversário, campeonato, data, horário e local vêm dos dados do jogo."),
        t("Fase", "capa", "fase", dica = "Ex.: Semifinal (volta)"), t("Jogo de ida", "capa", "ida", dica = "Ex.: Estudiantes 0 × 0 Fla"),
        t("Técnico do adversário", "capa", "tecnico"), t("Observação", "capa", "observacao", dica = "Ex.: Dados públicos até 22/10"),
    )),
    SecaoAnalise("campanha", "Campanha", listOf(
        t("Situação na competição", "campanha", "situacao", dica = "Ex.: 1º do Grupo A · invicto"),
        n("Vitórias", "campanha", "vitorias"), n("Empates", "campanha", "empates"), n("Derrotas", "campanha", "derrotas"),
        n("Gols pró", "campanha", "gols_pro"), n("Gols contra", "campanha", "gols_contra"), n("Posse %", "campanha", "posse", max = 100),
        CampoAnalise.Repetir("Últimos jogos (mais antigo → mais recente)", listOf("campanha", "ultimos"), "Jogo", 10, listOf(
            CampoAnalise.Escolha("Resultado", listOf("resultado"), listOf("" to "—", "V" to "Vitória", "E" to "Empate", "D" to "Derrota")),
            CampoAnalise.Texto("Contra", listOf("adversario")),
            CampoAnalise.Escolha("Mando", listOf("mando"), listOf("" to "—", "C" to "Casa", "F" to "Fora", "N" to "Neutro")),
            CampoAnalise.Texto("Placar", listOf("placar"), "2 × 1", 12),
        )),
        n("Em casa · J", "campanha", "casa", "j"), n("Em casa · V", "campanha", "casa", "v"), n("Em casa · E", "campanha", "casa", "e"),
        n("Em casa · D", "campanha", "casa", "d"), n("Em casa · GP", "campanha", "casa", "gp"), n("Em casa · GC", "campanha", "casa", "gc"),
        n("Fora · J", "campanha", "fora", "j"), n("Fora · V", "campanha", "fora", "v"), n("Fora · E", "campanha", "fora", "e"),
        n("Fora · D", "campanha", "fora", "d"), n("Fora · GP", "campanha", "fora", "gp"), n("Fora · GC", "campanha", "fora", "gc"),
        CampoAnalise.TextoLongo("Observação", listOf("campanha", "observacao")), fonte("campanha"),
    )),
    SecaoAnalise("sistema", "Sistema inicial", listOf(
        t("Ofensivo · formação", "sistema", "ofensivo", "formacao", dica = "Ex.: 4-3-3", max = 12),
        t("Ofensivo · descrição", "sistema", "ofensivo", "descricao"), l("Ofensivo · observações", "sistema", "ofensivo", "itens"),
        t("Defensivo · formação", "sistema", "defensivo", "formacao", dica = "Ex.: 4-1-4-1", max = 12),
        t("Defensivo · descrição", "sistema", "defensivo", "descricao"), l("Defensivo · observações", "sistema", "defensivo", "itens"),
        fonte("sistema"),
    )),
    SecaoAnalise("variacoes", "Variações do sistema", listOf(
        CampoAnalise.Repetir("Variações", listOf("variacoes"), "Variação", 6, listOf(
            CampoAnalise.Texto("Situação", listOf("fase"), "Com bola / Sem bola…"), CampoAnalise.Texto("Formação", listOf("formacao"), "2-3-5", 12),
            CampoAnalise.Texto("Quando", listOf("quando")), CampoAnalise.Lista("Observações", listOf("itens")),
        )),
        fonte("variacoes"),
    )),
    SecaoAnalise("escalacao", "Provável escalação", listOf(
        CampoAnalise.Escalacao("Titulares", listOf("escalacao")),
        l("Opções no banco", "escalacao", "banco", dica = "Ex.: 27 Bruno Henrique – atacante"),
        l("Desfalques", "escalacao", "desfalques"), l("Dúvidas", "escalacao", "duvidas"),
        t("Observação", "escalacao", "observacao"), fonte("escalacao"),
    )),
    SecaoAnalise("individuais", "Análise individual", listOf(
        CampoAnalise.Repetir("Jogadores", listOf("individuais"), "Jogador", 8, listOf(
            CampoAnalise.Texto("Nome", listOf("nome")), CampoAnalise.Numero("Nº", listOf("numero"), 99),
            CampoAnalise.Texto("Posição", listOf("posicao"), max = 40), CampoAnalise.Texto("Destaque", listOf("destaque"), "Ex.: artilheiro com 5 gols"),
            CampoAnalise.Lista("Pontos fortes", listOf("fortes")), CampoAnalise.Lista("Pontos fracos", listOf("fracos")),
            CampoAnalise.Lista("Como neutralizar", listOf("neutralizar")),
        )),
        fonte("individuais"),
    )),
    SecaoAnalise("ataque", "Organização ofensiva", listOf(
        l("1 · Construção", "ataque", "construcao"), l("2 · 2ª fase de construção", "ataque", "segunda_fase"),
        l("3 · Criação", "ataque", "criacao"), l("4 · Finalização", "ataque", "finalizacao"), fonte("ataque"),
    )),
    SecaoAnalise("defesa", "Organização defensiva", listOf("alto" to "Bloco alto", "medio" to "Bloco médio", "baixo" to "Bloco baixo").flatMap { (b, r) ->
        listOf(CampoAnalise.Escolha("$r · frequência", listOf("defesa", b, "frequencia"), FREQ), CampoAnalise.Lista("$r · observações", listOf("defesa", b, "itens")))
    } + fonte("defesa")),
    SecaoAnalise("transicoes", "Transições", listOf(
        CampoAnalise.Escolha("Quando perdem a bola", listOf("transicoes", "perder", "comportamento"), PERDER),
        l("Quando perdem · observações", "transicoes", "perder", "itens"),
        CampoAnalise.Escolha("Quando roubam a bola", listOf("transicoes", "recuperar", "comportamento"), RECUPERAR),
        l("Quando roubam · observações", "transicoes", "recuperar", "itens"), fonte("transicoes"),
    )),
    SecaoAnalise("bp_ofensiva", "Bolas paradas ofensivas", listOf(
        CampoAnalise.TextoLongo("Resumo", listOf("bp_ofensiva", "resumo"), "Ex.: 20% dos gols de bola parada…"),
        l("Escanteios", "bp_ofensiva", "escanteios"), l("Faltas", "bp_ofensiva", "faltas"),
        l("Laterais", "bp_ofensiva", "laterais"), l("Pênaltis", "bp_ofensiva", "penaltis"), fonte("bp_ofensiva"),
    )),
    SecaoAnalise("bp_defensiva", "Bolas paradas defensivas", listOf(
        t("Marcação", "bp_defensiva", "marcacao", dica = "zona / individual / mista"), n("Homens na área", "bp_defensiva", "homens_area", max = 11),
        t("Jogador na trave", "bp_defensiva", "trave", dica = "sim / não"), t("Barreira", "bp_defensiva", "barreira", dica = "nº de jogadores"),
        t("Quem fica na frente (contra-ataque)", "bp_defensiva", "contra_ataque"),
        l("Goleiro", "bp_defensiva", "goleiro"), l("Observações", "bp_defensiva", "itens"), fonte("bp_defensiva"),
    )),
    SecaoAnalise("pontos", "Pontos positivos e a explorar", listOf(
        l("Pontos positivos (o que fazem bem)", "pontos", "positivos"), l("Pontos a explorar (fragilidades)", "pontos", "explorar"), fonte("pontos"),
    )),
    SecaoAnalise("final", "Observações finais", listOf(
        l("Observações finais", "final", "observacoes"),
        CampoAnalise.TextoLongo("Mensagem principal para o jogo", listOf("final", "mensagem"), "A ideia principal para o grupo"), fonte("final"),
    )),
)

// ---------- JSON por caminho ----------

fun lerEm(e: JsonElement?, caminho: List<String>): JsonElement? = caminho.fold(e) { atual, k ->
    when (atual) {
        is JsonObject -> atual[k]
        is JsonArray -> k.toIntOrNull()?.let { atual.getOrNull(it) }
        else -> null
    }
}

fun gravarEm(e: JsonElement?, caminho: List<String>, valor: JsonElement): JsonElement {
    if (caminho.isEmpty()) return valor
    val k = caminho.first()
    val resto = caminho.drop(1)
    val i = k.toIntOrNull()
    return if (e is JsonArray && i != null) {
        val l = e.toMutableList()
        while (l.size <= i) l.add(JsonNull)
        l[i] = gravarEm(l[i], resto, valor)
        JsonArray(l)
    } else {
        val o = (e as? JsonObject)?.toMutableMap() ?: mutableMapOf()
        o[k] = gravarEm(o[k], resto, valor)
        JsonObject(o)
    }
}

fun textoEm(e: JsonElement?, caminho: List<String>): String =
    (lerEm(e, caminho) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull ?: ""

fun numeroEm(e: JsonElement?, caminho: List<String>): Int? = (lerEm(e, caminho) as? JsonPrimitive)?.intOrNull

/** Lista de tópicos → texto (uma linha por item) e de volta (as linhas vazias o servidor tira). */
fun listaComoTexto(e: JsonElement?, caminho: List<String>): String = when (val v = lerEm(e, caminho)) {
    is JsonArray -> v.joinToString("\n") { (it as? JsonPrimitive)?.contentOrNull ?: "" }
    is JsonPrimitive -> v.contentOrNull ?: ""
    else -> ""
}
fun textoComoLista(s: String): JsonArray = JsonArray(s.split("\n").map { JsonPrimitive(it) })

/** Tem algo preenchido? (marca a seção na lista). */
fun temAlgo(e: JsonElement?): Boolean = when (e) {
    null, JsonNull -> false
    is JsonPrimitive -> if (e.isString) e.content.isNotBlank() else true
    is JsonArray -> e.any(::temAlgo)
    is JsonObject -> e.values.any(::temAlgo)
}

fun secaoPreenchida(dados: JsonElement?, chave: String): Boolean =
    temAlgo(lerEm(dados, listOf(chave))) || temAlgo(lerEm(dados, listOf("fontes", chave)))

// ---------- formação livre (= backend-node/src/reports/formacaoLivre.js) ----------

data class VagaLivre(val vaga: Int, val papel: String, val x: Double, val y: Double)

fun linhasDa(formacao: String?): List<Int>? {
    val ns = (formacao ?: "").split(Regex("[^0-9]+")).filter { it.isNotEmpty() }.mapNotNull { it.toIntOrNull() }.filter { it in 1..6 }
    return if (ns.size in 2..5 && ns.sum() <= 10) ns else null
}

fun vagasLivres(formacao: String?): List<VagaLivre> {
    val linhas = linhasDa(formacao) ?: emptyList()
    val out = mutableListOf(VagaLivre(0, "GOL", 50.0, 91.0))
    val n = linhas.size
    var vaga = 1
    linhas.forEachIndexed { i, qtd ->
        val y = if (n == 1) 50.0 else 74.0 - (i * (74.0 - 18.0)) / (n - 1)
        val papel = when (i) { 0 -> "DEF"; n - 1 -> "ATA"; else -> "MEI" }
        repeat(qtd) { k ->
            val x = if (qtd == 1) 50.0 else 12.0 + (k * 76.0) / (qtd - 1)
            out.add(VagaLivre(vaga++, papel, Math.round(x * 10) / 10.0, Math.round(y * 10) / 10.0))
        }
    }
    return out
}

val PAPEL_VAGA = mapOf("GOL" to "Goleiro", "DEF" to "Defesa", "MEI" to "Meio", "ATA" to "Ataque")

/** Jogador da vaga na escalação (nº e nome). */
fun jogadorDaVaga(dados: JsonElement?, vaga: Int): JsonObject? =
    (lerEm(dados, listOf("escalacao", "jogadores")) as? JsonArray)?.firstOrNull {
        ((it as? JsonObject)?.get("vaga") as? JsonPrimitive)?.intOrNull == vaga
    } as? JsonObject

/** Muda nº ou nome de uma vaga (cria o jogador se não existir), ordenado por vaga. */
fun mudarJogadorDaVaga(dados: JsonElement?, vaga: Int, campo: String, valor: JsonElement): JsonElement {
    val lista = (lerEm(dados, listOf("escalacao", "jogadores")) as? JsonArray).orEmpty().filterIsInstance<JsonObject>()
    val atual = lista.firstOrNull { (it["vaga"] as? JsonPrimitive)?.intOrNull == vaga }
        ?: JsonObject(mapOf("vaga" to JsonPrimitive(vaga), "numero" to JsonNull, "nome" to JsonPrimitive("")))
    val novo = JsonObject(atual + (campo to valor))
    val outros = lista.filter { (it["vaga"] as? JsonPrimitive)?.intOrNull != vaga }
    return gravarEm(dados, listOf("escalacao", "jogadores"),
        JsonArray((outros + novo).sortedBy { (it["vaga"] as? JsonPrimitive)?.intOrNull ?: 0 }))
}

/** Folhas do esquema (para a paridade com o servidor): caminhos absolutos; itens de Repetir com "0". */
fun caminhosDoEsquema(): List<List<String>> = SECOES_ANALISE.flatMap { s ->
    s.campos.flatMap { c ->
        when (c) {
            is CampoAnalise.Aviso -> emptyList()
            is CampoAnalise.Repetir -> c.campos.map { c.caminho + "0" + it.caminho }
            is CampoAnalise.Escalacao -> listOf(listOf("escalacao", "formacao"), listOf("escalacao", "jogadores"))
            else -> listOf(c.caminho)
        }
    }
}


// ---------- escudo do adversário e vídeos por seção (migration 063) ----------

/** GET /api/games/:id/analise → `midias`. tipo "escudo" | "video"; url relativa ao servidor. */
@kotlinx.serialization.Serializable
data class MidiaAnalise(val id: String, val tipo: String, val secao: String? = null, val titulo: String? = null, val url: String = "")

const val MAX_VIDEOS_ANALISE = 12
const val MAX_LINKS_ANALISE = 20
const val MAX_BYTES_VIDEO_ANALISE = 50L * 1024 * 1024
const val MAX_BYTES_ESCUDO = 3L * 1024 * 1024
private val TIPOS_ESCUDO = setOf("image/png", "image/jpeg", "image/webp")
private val TIPOS_VIDEO = setOf("video/mp4", "video/quicktime", "video/webm")

/** Antes de subir: o que o servidor recusaria. null = ok. */
fun problemaMidiaAnalise(tipo: String, mime: String, tamanho: Long, videosNaAnalise: Int = 0): String? = when (tipo) {
    "escudo" -> when {
        mime.lowercase() !in TIPOS_ESCUDO -> "O escudo precisa ser uma imagem (JPG, PNG ou WEBP)."
        tamanho > MAX_BYTES_ESCUDO -> "O escudo deve ter até 3 MB."
        else -> null
    }
    else -> when {
        mime.lowercase() !in TIPOS_VIDEO -> "Envie um vídeo (MP4, MOV ou WEBM)."
        tamanho > MAX_BYTES_VIDEO_ANALISE -> MSG_VIDEO_GRANDE
        videosNaAnalise >= MAX_VIDEOS_ANALISE -> "Limite de $MAX_VIDEOS_ANALISE vídeos por análise."
        else -> null
    }
}

const val MSG_VIDEO_GRANDE = "O vídeo deve ter até 50 MB. Para vídeo grande, cole o link (YouTube, Drive…)."

/** Link de vídeo (vídeo grande): http(s) completo, até 500 caracteres. null = ok. */
fun problemaLinkVideo(url: String, linksNaAnalise: Int = 0): String? {
    val u = url.trim()
    if (!Regex("^https?://[^\\s/]+\\.[^\\s]+$", RegexOption.IGNORE_CASE).matches(u) || u.length > 500) return "Link inválido. Cole o endereço completo (https://…)."
    if (linksNaAnalise >= MAX_LINKS_ANALISE) return "Limite de $MAX_LINKS_ANALISE links por análise."
    return null
}

/** Título do vídeo a partir do nome do arquivo ("saida-curta.mp4" → "saida-curta"). */
fun tituloDoVideo(nomeArquivo: String): String = nomeArquivo.replace(Regex("""\.[A-Za-z0-9]+$"""), "").take(120).ifBlank { "Vídeo" }
