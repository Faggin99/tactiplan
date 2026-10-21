package com.faggin.tactiplan.app.dados.treino

import java.util.Base64
import kotlin.math.roundToInt
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// "Fotos do relatório": a mesma regra do ReportPhotosModal do web, pura.
// Paridade: TactiPlanKit/FotosRelatorio.swift.

data class OpcaoLayout(val id: String, val rotulo: String, val dica: String)

val LAYOUTS_FOTOS = listOf(
    OpcaoLayout("grande", "Grande", "1 por linha"),
    OpcaoLayout("medio", "Médio", "2 por linha"),
    OpcaoLayout("compacto", "Compacto", "3 por linha"),
    OpcaoLayout("mosaico", "Mosaico", "1 destaque + menores"),
)

val PROPORCOES_FOTOS = listOf("4:3" to "Paisagem 4:3", "1:1" to "Quadrada 1:1", "original" to "Original")

const val MAX_LEGENDA_FOTO = 120
const val TAMANHO_FOTO_MIN = 50
const val TAMANHO_FOTO_MAX = 100

@Serializable
data class PreferenciasFotos(
    val layout: String? = null,
    val proporcao: String? = null,
    val legendas: Boolean? = null,
    val agrupar: Boolean? = null,
    val posicao: String? = null,
    val tamanho: Int? = null,
)

fun chavePreferenciasFotos(usuarioId: String?): String = "tp.relatorio.fotos.v1.${usuarioId ?: "anon"}"

data class GrupoFotos(val id: String, val rotulo: String?, val ids: List<String>)

/** Estado imutável da tela; cada ação devolve um novo. */
data class EscolhaFotos(
    val fotos: List<FotoRelatorio>,
    val semana: Boolean,
    val limite: Int,
    val layout: String,
    val proporcao: String,
    val legendas: Boolean,
    val tamanho: Int,
    val agrupar: Boolean,
    val posicao: String,
    val ordem: List<String>,
    val selecionadas: Set<String>,
    val legendasEditadas: Map<String, String> = emptyMap(),
) {
    val preferencias get() = PreferenciasFotos(layout, proporcao, legendas, agrupar, posicao, tamanho)

    private fun foto(id: String) = fotos.firstOrNull { it.id == id }
    private val agrupada get() = semana && agrupar

    val grupos: List<GrupoFotos>
        get() {
            if (!agrupada) return listOf(GrupoFotos("all", null, ordem))
            val mapa = linkedMapOf<String, Pair<String, MutableList<String>>>()
            for (id in ordem) {
                val f = foto(id)
                val k = f?.data ?: "sem-data"
                val rotulo = f?.dia?.let { "$it · ${f.dd ?: ""}" } ?: "Sem data"
                mapa.getOrPut(k) { rotulo to mutableListOf() }.second += id
            }
            return mapa.keys.sorted().map { GrupoFotos(it, mapa[it]!!.first, mapa[it]!!.second) }
        }

    val ordemExibida: List<String> get() = grupos.flatMap { it.ids }

    fun marcada(id: String) = id in selecionadas

    /** (novo estado, aviso) */
    fun alternar(id: String): Pair<EscolhaFotos, String?> {
        if (id in selecionadas) return copy(selecionadas = selecionadas - id) to null
        if (selecionadas.size >= limite) return this to "No máximo $limite fotos por relatório."
        return copy(selecionadas = selecionadas + id) to null
    }

    fun selecionarTodas(): Pair<EscolhaFotos, String?> {
        val ids = ordemExibida
        return copy(selecionadas = ids.take(limite).toSet()) to
            (if (ids.size > limite) "Selecionadas as primeiras $limite (máximo por relatório)." else null)
    }

    fun nenhuma() = copy(selecionadas = emptySet())

    private fun grupoDe(id: String) = if (agrupada) (foto(id)?.data ?: "sem-data") else "all"

    fun podeMover(id: String, direcao: Int): Boolean {
        val seq = ordemExibida
        val i = seq.indexOf(id)
        if (i < 0) return false
        val j = i + direcao
        return j in seq.indices && grupoDe(seq[j]) == grupoDe(id)
    }

    fun mover(id: String, direcao: Int): EscolhaFotos {
        if (!podeMover(id, direcao)) return this
        val seq = ordemExibida.toMutableList()
        val i = seq.indexOf(id)
        val t = seq[i]; seq[i] = seq[i + direcao]; seq[i + direcao] = t
        return copy(ordem = seq)
    }

    fun legenda(id: String): String = legendasEditadas[id] ?: foto(id)?.titulo ?: ""
    fun editarLegenda(id: String, texto: String) = copy(legendasEditadas = legendasEditadas + (id to texto.take(MAX_LEGENDA_FOTO)))
    fun legendaEditada(id: String): Boolean {
        val l = legendasEditadas[id] ?: return false
        return l != (foto(id)?.titulo ?: "")
    }
    fun restaurarLegenda(id: String) = copy(legendasEditadas = legendasEditadas - id)

    val quantasSelecionadas: Int get() = ordemExibida.count { it in selecionadas }

    val configuracao: JsonObject
        get() {
            val ids = ordemExibida.filter { it in selecionadas }
            val custom = ids.filter { legendaEditada(it) }.associateWith { JsonPrimitive(legendasEditadas[it]!!) as JsonElement }
            val o = linkedMapOf<String, JsonElement>(
                "ids" to JsonArray(ids.map { JsonPrimitive(it) }), "layout" to JsonPrimitive(layout),
                "proporcao" to JsonPrimitive(proporcao), "legendas" to JsonPrimitive(legendas),
                "agrupar" to JsonPrimitive(agrupar), "tamanho" to JsonPrimitive(tamanho),
                "legendasCustom" to JsonObject(custom),
            )
            if (!semana) o["posicao"] = JsonPrimitive(posicao)
            return JsonObject(o)
        }

    val rotuloPrevia: String get() = if (!semana && posicao == "blocos") "Ficha" else "Fotos"

    fun mudarTamanho(v: Double) =
        copy(tamanho = ((v / 10).roundToInt() * 10).coerceIn(TAMANHO_FOTO_MIN, TAMANHO_FOTO_MAX))

    companion object {
        fun de(lista: ListaFotosRelatorio, p: PreferenciasFotos? = null): EscolhaFotos {
            val padrao = lista.padrao
            val ids = lista.fotos.map { it.id }.toSet()
            return EscolhaFotos(
                fotos = lista.fotos,
                semana = lista.semana ?: false,
                limite = lista.limite ?: 24,
                layout = p?.layout?.takeIf { l -> LAYOUTS_FOTOS.any { it.id == l } } ?: (padrao?.layout ?: "medio"),
                proporcao = p?.proporcao?.takeIf { x -> PROPORCOES_FOTOS.any { it.first == x } } ?: (padrao?.proporcao ?: "4:3"),
                legendas = p?.legendas ?: true,
                tamanho = (p?.tamanho ?: TAMANHO_FOTO_MAX).coerceIn(TAMANHO_FOTO_MIN, TAMANHO_FOTO_MAX),
                agrupar = p?.agrupar ?: true,
                posicao = if (p?.posicao == "blocos") "blocos" else "fim",
                ordem = lista.fotos.map { it.id },
                selecionadas = padrao?.ids.orEmpty().filter { it in ids }.toSet(),
            )
        }
    }
}

enum class ModoExportarFotos { ESCOLHIDAS, AUTOMATICO, SEM_FOTOS }

private val SEM_FOTOS = JsonObject(mapOf("ids" to JsonArray(emptyList())))

fun corpoComFotos(base: Map<String, JsonElement>, e: EscolhaFotos, modo: ModoExportarFotos): Map<String, JsonElement> = when (modo) {
    ModoExportarFotos.AUTOMATICO -> base
    ModoExportarFotos.SEM_FOTOS -> base + ("fotos" to SEM_FOTOS)
    ModoExportarFotos.ESCOLHIDAS -> base + ("fotos" to if (e.quantasSelecionadas == 0) SEM_FOTOS else e.configuracao)
}

/** Põe um viewport que caiba a folha A4 (794 px) na largura do celular. */
fun htmlParaWebView(html: String, largura: Int = 820): String {
    val meta = "<meta name=\"viewport\" content=\"width=$largura\">"
    val i = html.indexOf("<head>", ignoreCase = true)
    if (i >= 0) return html.substring(0, i) + "<head>" + meta + html.substring(i + 6)
    return meta + html
}

fun bytesDaMiniatura(thumb: String?): ByteArray? {
    if (thumb == null || !thumb.startsWith("data:")) return null
    val v = thumb.indexOf(',')
    if (v < 0 || !thumb.substring(0, v).endsWith(";base64")) return null
    return try { Base64.getDecoder().decode(thumb.substring(v + 1)) } catch (_: Exception) { null }
}
