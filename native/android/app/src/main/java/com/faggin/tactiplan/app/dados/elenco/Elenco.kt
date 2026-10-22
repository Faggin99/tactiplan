package com.faggin.tactiplan.app.dados.elenco

import java.text.Normalizer
import java.time.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Elenco (T3): plantel do clube aberto por grupo de treino, como o Plantel do web
// (PlantelPage.jsx, PlayerModal.jsx). Regras puras, testadas contra native/paridade/t3.json
// (gerado do código do web). Paridade: TactiPlanKit/Elenco.swift.

// ---------- nome de pessoa (porte EXATO de frontend/src/lib/formatarNome.js) ----------

val PARTICULAS = setOf("de", "da", "do", "das", "dos", "e", "di", "du", "van", "von")
private val APOSTROFOS = Regex("['’]")
private val ROMANO = Regex("^(?:i{1,3}|iv|vi{0,3}|ix|x)$")
private val CAMEL = Regex("^\\p{Lu}\\p{Ll}+\\p{Lu}\\p{Ll}")
private val PT_BR = java.util.Locale.forLanguageTag("pt-BR")

private fun capitalizar(parte: String): String {
    if (parte.isEmpty()) return parte
    val cp = parte.codePointAt(0)
    val n = Character.charCount(cp)
    return String(Character.toChars(cp)).uppercase(PT_BR) + parte.substring(n)
}

private fun formatarPalavra(palavra: String, meio: Boolean): String {
    val p = palavra.lowercase(PT_BR)
    if (meio && p in PARTICULAS) return p
    if (CAMEL.containsMatchIn(palavra)) return palavra
    if (p.contains('-')) {
        val pedacos = p.split('-')
        return pedacos.mapIndexed { i, pedaco -> formatarPalavra(pedaco, i > 0 && i < pedacos.lastIndex) }.joinToString("-")
    }
    val ap = APOSTROFOS.find(p)
    if (ap != null) {
        val i = ap.range.first
        val antes = p.substring(0, i)
        val depois = p.substring(i + 1)
        val prefixo = if (meio && antes == "d") "d" else capitalizar(antes)
        return prefixo + ap.value + capitalizar(depois)
    }
    return capitalizar(p)
}

/** "alcindo de oliveira neto" → "Alcindo de Oliveira Neto" (o servidor aplica de novo ao salvar). */
fun formatarNome(nome: String): String {
    val texto = nome.replace(Regex("\\s+"), " ").trim()
    if (texto.isEmpty()) return texto
    val palavras = texto.split(' ')
    val ultima = palavras.lastIndex
    return palavras.mapIndexed { i, w ->
        if (i > 0 && i == ultima && ROMANO.matches(w.lowercase(PT_BR))) w.uppercase(PT_BR)
        else formatarPalavra(w, i > 0 && i < ultima)
    }.joinToString(" ")
}

// ---------- ordem e comparação ----------

/** Mapa `positionOrder` do PlantelPage (códigos antigos = sinônimos). Desconhecida/nula = 999. */
val ORDEM_POSICAO: Map<String, Int> = mapOf(
    "GOL" to 1, "GR" to 1,
    "LD" to 2, "DD" to 2,
    "ZAG" to 3, "DC" to 3, "Z" to 3,
    "LE" to 4, "DE" to 4,
    "VOL" to 5, "MC" to 5,
    "MEI" to 6, "MD" to 6, "ME" to 6, "MOF" to 6, "M" to 6,
    "ED" to 7, "EE" to 8,
    "CA" to 9, "PL" to 9, "SA" to 9, "A" to 9,
    "FIX" to 3, "ALA-D" to 5, "ALA-E" to 6, "PIV" to 9,
)

fun ordemDaPosicao(p: String?): Int = p?.let { ORDEM_POSICAO[it] } ?: 999

/** Sem acento e sem caixa (busca e 1ª chave da comparação de nomes). */
fun dobrar(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase(PT_BR)

/** Nome em pt-BR: sem acento/caixa primeiro (Alice < Álvaro < Bruno); empate pelo texto cru. */
fun compararNome(a: String?, b: String?): Int {
    val x = a ?: ""
    val y = b ?: ""
    val c = dobrar(x).compareTo(dobrar(y))
    return if (c != 0) c else x.compareTo(y)
}

/** Ordem do Plantel: por posição (e nome) ou só por nome. */
fun <T> ordenarAtletas(lista: List<T>, porPosicao: Boolean, nome: (T) -> String?, posicao: (T) -> String?): List<T> =
    lista.sortedWith { a, b ->
        if (porPosicao) {
            val o = ordemDaPosicao(posicao(a)) - ordemDaPosicao(posicao(b))
            if (o != 0) return@sortedWith o
        }
        compararNome(nome(a), nome(b))
    }

fun ordenarAtletas(lista: List<Atleta>, porPosicao: Boolean): List<Atleta> =
    ordenarAtletas(lista, porPosicao, { it.nome }, { it.posicao })

// ---------- posições por modalidade (frontend/src/lib/sportConfig.js) ----------

data class Posicao(val codigo: String, val nome: String)

private val POSICOES_CAMPO = listOf(
    Posicao("GOL", "Goleiro"), Posicao("ZAG", "Zagueiro"), Posicao("LD", "Lateral Direito"), Posicao("LE", "Lateral Esquerdo"),
    Posicao("VOL", "Volante"), Posicao("MEI", "Meia"), Posicao("ED", "Extremo Direito"), Posicao("EE", "Extremo Esquerdo"),
    Posicao("CA", "Centroavante"),
)
private val POSICOES_FUTSAL = listOf(
    Posicao("GOL", "Goleiro"), Posicao("FIX", "Fixo"), Posicao("ALA-D", "Ala Direito"), Posicao("ALA-E", "Ala Esquerdo"), Posicao("PIV", "Pivô"),
)

fun posicoesDaModalidade(modalidade: String?): List<Posicao> = if (modalidade == "futsal") POSICOES_FUTSAL else POSICOES_CAMPO

// ---------- grupos ----------

data class GrupoElenco(val chave: String?, val rotulo: String, val sigla: String)

val GRUPOS_ELENCO = listOf(
    GrupoElenco("1", "Grupo 1", "G1"),
    GrupoElenco("2", "Grupo 2", "G2"),
    GrupoElenco("3", "Grupo 3", "G3"),
    GrupoElenco("Transição", "Transição", "TR"),
    GrupoElenco("DM", "Departamento médico", "DM"),
    GrupoElenco(null, "Sem grupo", "—"),
)

/** O grupo do atleta (desconhecido/nulo = "Sem grupo"). */
fun grupoDoAtleta(group: String?): GrupoElenco =
    GRUPOS_ELENCO.firstOrNull { it.chave != null && it.chave == group } ?: GRUPOS_ELENCO.last()

const val CATEGORIA_TODAS = "todas"
const val CATEGORIA_SEM = "sem"

data class SecaoElenco(val grupo: GrupoElenco, val atletas: List<Atleta>, val resumo: String? = null)

/** A busca casa o nome (sem acento/caixa) ou o número da camisa exato. */
fun casaBusca(a: Atleta, busca: String): Boolean {
    val b = busca.trim()
    if (b.isEmpty()) return true
    if (b.toIntOrNull() != null && a.camisa == b.toInt()) return true
    return dobrar(a.nome).contains(dobrar(b))
}

/**
 * Seções do Elenco na ordem de [GRUPOS_ELENCO], só as não vazias. `categoria` = "todas" | "sem" | id;
 * `posicao` = null (todas) ou o código. DM mostra a 1ª lesão ativa como resumo (`lesoesAtivas` = atleta → texto).
 */
fun agruparElenco(
    atletas: List<Atleta>,
    busca: String = "",
    categoria: String = CATEGORIA_TODAS,
    posicao: String? = null,
    porPosicao: Boolean = true,
    lesoesAtivas: Map<String, String> = emptyMap(),
): List<SecaoElenco> {
    val filtrados = atletas.filter { a ->
        casaBusca(a, busca) &&
            when (categoria) {
                CATEGORIA_TODAS -> true
                CATEGORIA_SEM -> a.categoriaId == null
                else -> a.categoriaId == categoria
            } &&
            (posicao == null || a.posicao == posicao)
    }
    return GRUPOS_ELENCO.mapNotNull { g ->
        val doGrupo = ordenarAtletas(filtrados.filter { grupoDoAtleta(it.grupo) == g }, porPosicao)
        if (doGrupo.isEmpty()) return@mapNotNull null
        val resumo = if (g.chave == "DM") doGrupo.firstNotNullOfOrNull { lesoesAtivas[it.id]?.let { t -> "${it.nome.split(' ').first()}: $t" } } else null
        SecaoElenco(g, doGrupo, resumo)
    }
}

/** "Sub-17 · 26 atletas · 2 no DM". */
fun resumoDoElenco(atletas: List<Atleta>, categoriaNome: String?): String {
    val dm = atletas.count { it.grupo == "DM" }
    return listOfNotNull(categoriaNome, "${atletas.size} ${if (atletas.size == 1) "atleta" else "atletas"}", if (dm > 0) "$dm no DM" else null)
        .joinToString(" · ")
}

/** Idade completa em `hoje` (null sem data válida). */
fun idadeEm(nascimento: String?, hoje: String): Int? {
    val n = try { LocalDate.parse(nascimento?.take(10) ?: return null) } catch (_: Exception) { return null }
    val h = try { LocalDate.parse(hoje.take(10)) } catch (_: Exception) { return null }
    var anos = h.year - n.year
    if (h.monthValue < n.monthValue || (h.monthValue == n.monthValue && h.dayOfMonth < n.dayOfMonth)) anos--
    return anos.takeIf { it >= 0 }
}

/** Linha do atleta: "VOL · 17 anos". */
fun detalheDoAtleta(a: Atleta, hoje: String): String =
    listOfNotNull(a.posicao, idadeEm(a.nascimento, hoje)?.let { "$it anos" }, rotuloStatus(a.status).takeIf { a.status != null && a.status != "active" })
        .joinToString(" · ")

// ---------- status, pé ----------

val STATUS_ATLETA = listOf("active" to "Ativo", "injured" to "Lesionado", "suspended" to "Suspenso", "inactive" to "Inativo")
fun rotuloStatus(s: String?): String = STATUS_ATLETA.firstOrNull { it.first == s }?.second ?: "Ativo"

val PES = listOf("right" to "Direito", "left" to "Esquerdo", "both" to "Ambidestro")
fun rotuloPe(p: String?): String? = PES.firstOrNull { it.first == p }?.second

// ---------- validação e corpo do PUT ----------

const val MSG_NOME_OBRIGATORIO = "Nome é obrigatório"
const val MSG_POSICAO_OBRIGATORIA = "Posição é obrigatória"
const val MSG_CAMISA = "Camisa entre 1 e 99"
const val MSG_ALTURA = "Altura entre 100 e 240 cm"

fun erroAtleta(nome: String, posicao: String?, camisa: Int?, altura: Int?): String? = when {
    nome.trim().isEmpty() -> MSG_NOME_OBRIGATORIO
    posicao.isNullOrEmpty() -> MSG_POSICAO_OBRIGATORIA
    camisa != null && camisa !in 1..99 -> MSG_CAMISA
    altura != null && altura !in 100..240 -> MSG_ALTURA
    else -> null
}

/** O que o formulário edita (o resto do atleta vem de [Atleta]). */
data class FormAtleta(
    val nome: String = "",
    val posicao: String? = null,
    val camisa: Int? = null,
    val status: String = "active",
    val grupo: String? = null,
    val categoriaId: String? = null,
    val nascimento: String? = null,
    val altura: Int? = null,
    val pe: String? = null,
    val ultimoClube: String = "",
    val observacao: String = "",
) {
    companion object {
        fun de(a: Atleta) = FormAtleta(a.nome, a.posicao, a.camisa, a.status ?: "active", a.grupo, a.categoriaId,
            a.nascimento?.take(10), a.altura, a.pe, a.ultimoClube.orEmpty(), a.observacao.orEmpty())
    }
}

private fun texto(v: String?) = if (v.isNullOrBlank()) JsonNull else JsonPrimitive(v.trim())

/**
 * Corpo COMPLETO do POST/PUT /api/athletes (o PUT do servidor sobrescreve tudo): nome formatado,
 * mantém `photo_url` do atleta salvo.
 */
fun corpoAtleta(f: FormAtleta, clubeId: String, fotoUrl: String?): JsonObject = buildJsonObject {
    put("name", formatarNome(f.nome))
    put("position", texto(f.posicao))
    put("jersey_number", f.camisa?.let { JsonPrimitive(it) } ?: JsonNull)
    put("status", f.status.ifEmpty { "active" })
    put("observation", texto(f.observacao))
    put("group", texto(f.grupo))
    put("photo_url", texto(fotoUrl))
    put("club_id", clubeId)
    put("category_id", texto(f.categoriaId))
    put("birthdate", texto(f.nascimento))
    put("height_cm", f.altura?.let { JsonPrimitive(it) } ?: JsonNull)
    put("preferred_foot", texto(f.pe))
    put("previous_club", texto(f.ultimoClube))
}

/** PUT /api/athletes/batch-groups. */
fun corpoMoverGrupo(ids: List<String>, grupo: String?): JsonObject = buildJsonObject {
    put("athletes", kotlinx.serialization.json.JsonArray(ids.map { id ->
        buildJsonObject { put("id", id); put("group", grupo?.let { JsonPrimitive(it) } ?: JsonNull) }
    }))
}

// ---------- foto ----------

const val FOTO_MAX_BYTES = 8L * 1024 * 1024
const val MSG_FOTO_GRANDE = "A imagem deve ter no máximo 8 MB."
const val MSG_FOTO_TIPO = "Selecione um arquivo de imagem."

// ---------- lesões ----------

data class Severidade(val id: String, val rotulo: String, val corHex: String)

val SEVERIDADES = listOf(
    Severidade("light", "Leve", "#f59e0b"),
    Severidade("medium", "Moderada", "#ef4444"),
    Severidade("severe", "Grave", "#b91c1c"),
)
fun severidade(id: String?): Severidade = SEVERIDADES.firstOrNull { it.id == id } ?: SEVERIDADES[1]

const val MSG_TIPO_LESAO = "Informe o tipo da lesão."
const val TEXTO_REMOVER_LESAO = "Remover registro de lesão? Esta ação não pode ser desfeita."

fun erroLesao(tipo: String): String? = if (tipo.trim().isEmpty()) MSG_TIPO_LESAO else null

fun corpoLesao(tipo: String, local: String, severidade: String, inicio: String, retorno: String?, notas: String): JsonObject = buildJsonObject {
    put("injury_type", tipo.trim())
    put("body_part", texto(local))
    put("severity", severidade)
    put("started_at", inicio)
    put("expected_return", texto(retorno))
    put("notes", texto(notas))
}

fun corpoAlta(hoje: String): JsonObject = buildJsonObject { put("resolved_at", hoje) }

/** "Distensão · Coxa direita". */
fun tituloLesao(l: Lesao): String = listOfNotNull(l.tipo, l.local?.takeIf { it.isNotBlank() }).joinToString(" · ")

private fun br(d: String?): String? = d?.take(10)?.split('-')?.takeIf { it.size == 3 }?.let { "${it[2]}/${it[1]}/${it[0]}" }

/** "07/10/2026 · retorno previsto 30/10/2026" ou "07/10/2026 → resolvida em 20/10/2026". */
fun detalheLesao(l: Lesao): String {
    val ini = br(l.inicio) ?: "—"
    return when {
        l.resolvida != null -> "$ini → resolvida em ${br(l.resolvida)}"
        l.retorno != null -> "$ini · retorno previsto ${br(l.retorno)}"
        else -> ini
    }
}

/** Resumo do DM: "lesão muscular · volta ~30/10". */
fun resumoLesao(l: Lesao): String =
    listOfNotNull(l.tipo.lowercase(PT_BR), l.retorno?.let { r -> br(r)?.let { "volta ~${it.take(5)}" } }).joinToString(" · ")

// ---------- modelos ----------

@Serializable
data class Atleta(
    val id: String,
    @SerialName("name") val nome: String = "",
    @SerialName("position") val posicao: String? = null,
    @SerialName("jersey_number") val camisa: Int? = null,
    val status: String? = null,
    @SerialName("observation") val observacao: String? = null,
    @SerialName("group") val grupo: String? = null,
    @SerialName("photo_url") val fotoUrl: String? = null,
    @SerialName("club_id") val clubeId: String? = null,
    @SerialName("category_id") val categoriaId: String? = null,
    @SerialName("birthdate") val nascimento: String? = null,
    @SerialName("height_cm") val altura: Int? = null,
    @SerialName("preferred_foot") val pe: String? = null,
    @SerialName("previous_club") val ultimoClube: String? = null,
)

@Serializable
data class Lesao(
    val id: String,
    @SerialName("athlete_id") val atletaId: String? = null,
    @SerialName("injury_type") val tipo: String = "",
    @SerialName("body_part") val local: String? = null,
    val severity: String? = null,
    @SerialName("started_at") val inicio: String? = null,
    @SerialName("expected_return") val retorno: String? = null,
    @SerialName("resolved_at") val resolvida: String? = null,
    val notes: String? = null,
    @SerialName("athlete_name") val atletaNome: String? = null,
) {
    val ativa: Boolean get() = resolvida == null
}

@Serializable
data class CategoriaCadastro(
    val id: String,
    val name: String = "",
    @SerialName("age_group") val faixa: String? = null,
    @SerialName("display_order") val ordem: Int? = null,
    val notes: String? = null,
    @SerialName("club_id") val clubeId: String? = null,
    @SerialName("athletes_count") val atletas: Int? = null,
) {
    val rotulo: String get() = listOfNotNull(name, faixa?.takeIf { it.isNotBlank() }).joinToString(" · ")
}

// ---------- PDF ----------

fun corpoPlantel(clubeId: String): Map<String, kotlinx.serialization.json.JsonElement> = mapOf("club_id" to JsonPrimitive(clubeId))

fun nomePdfPlantel(clube: String, hoje: String): String =
    "Plantel_${com.faggin.tactiplan.app.dados.treino.nomeArquivoSeguro(clube)}_$hoje.pdf"
