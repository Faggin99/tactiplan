package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.jogo.MidiaAnalise
import com.faggin.tactiplan.app.dados.executarChamada
import com.faggin.tactiplan.app.dados.respostaOuErro
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink

// As rotas de TREINO do web que o app chama com o token dele (T1). Toda chamada leva
// `X-Workspace-Id`: o servidor aplica só leitura (402), clube arquivado (409) e permissões (403)
// iguais ao web. Paridade: TactiPlanKit/ApiTreino.swift.

object CaminhosTreino {
    fun microciclo(semana: String, clube: String) =
        "/microcycles?week=${codificarComponente(semana)}&club_id=${codificarComponente(clube)}"
    const val garantir = "/microcycles/ensure"
    const val conteudos = "/contents"
    fun etapas(modalidade: String?) =
        if (modalidade.isNullOrEmpty()) "/stages" else "/stages?modality=${codificarComponente(modalidade)}"
    const val titulos = "/titles"
    const val atividades = "/activities"
    fun atividade(id: String) = "/activities/${codificarComponente(id)}"
    fun atividadeDoBloco(blocoId: String) = "/activities/block/${codificarComponente(blocoId)}"
    fun tipoDoDia(id: String) = "/sessions/${codificarComponente(id)}/type"
    fun distancia(id: String) = "/sessions/${codificarComponente(id)}/distance"
    fun periodos(id: String) = "/sessions/${codificarComponente(id)}/periodos"
    fun periodo(id: String) = "/sessions/${codificarComponente(id)}/periodo"
    fun anexosDoDia(id: String) = "/files/session/${codificarComponente(id)}"
    const val enviarAnexo = "/files/upload"
    fun anexo(id: String) = "/files/${codificarComponente(id)}"
    fun relatorio(tipo: String) = "/reports/${codificarComponente(tipo)}"
    fun tema(mes: String, clube: String) = "/themes/adherence?month=${codificarComponente(mes)}&club_id=${codificarComponente(clube)}"
}

const val CAMPO_ANEXO = "file"
const val TIMEOUT_UPLOAD_S = 120L
const val TIMEOUT_RELATORIO_S = 90L
const val MSG_PDF_FALHOU = "Não foi possível gerar o PDF agora. Tente de novo."

/**
 * Arquivo pronto para subir. `abrir` lê do começo (foto reduzida em memória, vídeo/PDF direto do
 * content:// sem carregar tudo na memória). `tamanho` < 0 = desconhecido.
 */
class ArquivoUpload(val nome: String, val tipo: String, val tamanho: Long, val abrir: () -> InputStream) {
    companion object {
        fun deBytes(nome: String, tipo: String, bytes: ByteArray) =
            ArquivoUpload(nome, tipo, bytes.size.toLong()) { ByteArrayInputStream(bytes) }
    }
}

/** RequestBody que lê o arquivo em pedaços e conta o progresso (0…1). */
class CorpoComProgresso(
    private val arquivo: ArquivoUpload,
    private val progresso: (Double) -> Unit,
) : RequestBody() {
    override fun contentType(): MediaType? = arquivo.tipo.toMediaTypeOrNull()
    override fun contentLength(): Long = arquivo.tamanho
    override fun writeTo(sink: BufferedSink) {
        val buf = ByteArray(64 * 1024)
        var enviados = 0L
        arquivo.abrir().use { ent ->
            while (true) {
                val n = ent.read(buf)
                if (n < 0) break
                sink.write(buf, 0, n)
                enviados += n
                if (arquivo.tamanho > 0) progresso((enviados.toDouble() / arquivo.tamanho).coerceAtMost(1.0))
            }
        }
        progresso(1.0)
    }
}

@Serializable
data class FotoRelatorio(
    val id: String,
    @SerialName("date") val data: String? = null,
    val dia: String? = null,
    val dd: String? = null,
    val titulo: String? = null,
    val origem: String? = null,
    val thumb: String? = null,
    /** Período da foto no dia com 2+ períodos ("manha"…; null = período único). */
    val periodo: String? = null,
    val periodoRotulo: String? = null,
)

@Serializable
data class ListaFotosRelatorio(
    val fotos: List<FotoRelatorio> = emptyList(),
    val total: Int? = null,
    val semana: Boolean? = null,
    val limite: Int? = null,
    val padrao: Padrao? = null,
) {
    @Serializable
    data class Padrao(val ids: List<String>? = null, val layout: String? = null, val proporcao: String? = null)
}

interface ApiTreino {
    suspend fun microciclo(semana: String, clubeId: String): Microciclo?
    suspend fun garantirMicrociclo(semana: String, clubeId: String): Microciclo
    suspend fun cadastros(modalidade: String?): CadastrosTreino
    suspend fun criarTitulo(titulo: String, conteudoId: String, descricao: String?): TituloCadastro
    suspend fun anexosDoDia(diaId: String): List<Anexo>
    suspend fun criarAtividade(corpo: JsonObject): String
    suspend fun atualizarAtividade(id: String, corpo: JsonObject)
    suspend fun apagarAtividadeDoBloco(blocoId: String)
    /** PUT /api/sessions/:id/type — `avaliacao` só no tipo AVALIACAO (os outros tipos limpam os campos). */
    suspend fun mudarTipo(diaId: String, tipo: TipoDia, adversario: String?, avaliacao: EscolhaAvaliacao? = null)
    suspend fun mudarDistancia(diaId: String, km: Double?)
    /** POST /api/sessions/:id/periodos — `atual` só no dia de 1 período. Devolve o id do novo. */
    /** `avaliacao` não-nula = o período novo já nasce de avaliação (tipo 'assessment'). */
    suspend fun adicionarPeriodo(diaId: String, novo: Periodo, atual: Periodo?, avaliacao: EscolhaAvaliacao? = null): String
    /** DELETE /api/sessions/:id/periodo — devolve quantos anexos foram apagados. */
    suspend fun removerPeriodo(periodoId: String): Int
    /** PUT /api/sessions/:id/periodo — troca o horário (Manhã/Tarde/Noite) do período. */
    suspend fun trocarPeriodo(periodoId: String, para: Periodo)
    suspend fun enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String, progresso: (Double) -> Unit): Anexo
    suspend fun renomearAnexo(id: String, titulo: String): Anexo
    suspend fun apagarAnexo(id: String)
    suspend fun temaDoMes(mes: String, clubeId: String): TemaDoMes
    suspend fun fotosDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): ListaFotosRelatorio
    suspend fun htmlDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): String
    suspend fun pdfDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): ByteArray
    /** PowerPoint da análise do adversário (com os vídeos): POST /api/reports/analise { formato: 'pptx' }. */
    suspend fun pptxDaAnalise(sessaoId: String): ByteArray = throw UnsupportedOperationException("PowerPoint da análise")
    /** Escudo do adversário e vídeos por seção: GET .../analise (midias), POST/DELETE .../analise/midia. */
    suspend fun midiasDaAnalise(sessaoId: String): List<MidiaAnalise> = emptyList()
    suspend fun enviarMidiaAnalise(sessaoId: String, tipo: String, secao: String?, titulo: String?, arquivo: ArquivoUpload, progresso: (Double) -> Unit): List<MidiaAnalise> =
        throw UnsupportedOperationException("mídia da análise")
    suspend fun apagarMidiaAnalise(sessaoId: String, midiaId: String): List<MidiaAnalise> = throw UnsupportedOperationException("mídia da análise")
    /** Vídeo grande por link: POST .../analise/link { secao, titulo, url }. */
    suspend fun adicionarLinkAnalise(sessaoId: String, secao: String, titulo: String?, url: String): List<MidiaAnalise> =
        throw UnsupportedOperationException("link da análise")
}

fun clienteUpload(): OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(TIMEOUT_UPLOAD_S, TimeUnit.SECONDS)
    .writeTimeout(TIMEOUT_UPLOAD_S, TimeUnit.SECONDS)
    // Vídeo grande em rede lenta: sem teto total; o que trava é ficar 120 s sem andar.
    .build()

fun clienteRelatorios(): OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(TIMEOUT_RELATORIO_S, TimeUnit.SECONDS)
    .writeTimeout(TIMEOUT_RELATORIO_S, TimeUnit.SECONDS)
    .callTimeout(TIMEOUT_RELATORIO_S, TimeUnit.SECONDS)
    .build()

/** Algumas rotas embrulham a lista em `{ data: [...] }`; as de treino devolvem a lista. */
internal fun listaOuData(j: JsonElement): JsonElement = when {
    j is JsonArray -> j
    j is JsonObject && j["data"] is JsonArray -> j["data"]!!
    else -> JsonArray(emptyList())
}

class ApiTreinoHttp(
    private val api: Api,
    private val token: String,
    private val workspaceId: String,
    private val upload: OkHttpClient = clienteUpload(),
    private val relatorios: OkHttpClient = clienteRelatorios(),
    private val fronteira: () -> String = { "tactiplan-${UUID.randomUUID()}" },
) : ApiTreino {
    private val cab get() = mapOf("X-Workspace-Id" to workspaceId)
    private val json = JsonApp

    private suspend fun j(caminho: String, metodo: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(caminho, metodo, corpo, token, cab)

    override suspend fun microciclo(semana: String, clubeId: String): Microciclo? {
        val r = j(CaminhosTreino.microciclo(semana, clubeId))
        if (r is JsonNull || (r is JsonObject && r.isEmpty())) return null
        return json.decodeFromJsonElement(Microciclo.serializer(), r).normalizado()
    }

    override suspend fun garantirMicrociclo(semana: String, clubeId: String): Microciclo =
        json.decodeFromJsonElement(Microciclo.serializer(), j(CaminhosTreino.garantir, "POST", buildJsonObject {
            put("week", semana); put("club_id", clubeId)
        })).normalizado()

    override suspend fun cadastros(modalidade: String?): CadastrosTreino {
        val c = listaOuData(j(CaminhosTreino.conteudos))
        val e = listaOuData(j(CaminhosTreino.etapas(modalidade)))
        val t = listaOuData(j(CaminhosTreino.titulos))
        return CadastrosTreino(
            json.decodeFromJsonElement(ListSerializer(ConteudoCadastro.serializer()), c),
            json.decodeFromJsonElement(ListSerializer(EtapaCadastro.serializer()), e),
            json.decodeFromJsonElement(ListSerializer(TituloCadastro.serializer()), t),
        )
    }

    override suspend fun criarTitulo(titulo: String, conteudoId: String, descricao: String?): TituloCadastro =
        json.decodeFromJsonElement(TituloCadastro.serializer(), j(CaminhosTreino.titulos, "POST", buildJsonObject {
            put("title", titulo); put("content_id", conteudoId)
            if (!descricao.isNullOrEmpty()) put("description", descricao)
        }))

    override suspend fun anexosDoDia(diaId: String): List<Anexo> =
        json.decodeFromJsonElement(ListSerializer(Anexo.serializer()), listaOuData(j(CaminhosTreino.anexosDoDia(diaId))))

    override suspend fun criarAtividade(corpo: JsonObject): String {
        val r = j(CaminhosTreino.atividades, "POST", corpo)
        return ((r as? JsonObject)?.get("id") as? JsonPrimitive)?.contentOrNull
            ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
    }

    override suspend fun atualizarAtividade(id: String, corpo: JsonObject) { j(CaminhosTreino.atividade(id), "PUT", corpo) }

    override suspend fun apagarAtividadeDoBloco(blocoId: String) { j(CaminhosTreino.atividadeDoBloco(blocoId), "DELETE") }

    override suspend fun mudarTipo(diaId: String, tipo: TipoDia, adversario: String?, avaliacao: EscolhaAvaliacao?) {
        val a = adversario?.trim().orEmpty()
        val corpo = mutableMapOf<String, JsonElement>(
            "session_type" to JsonPrimitive(tipo.bruto),
            "opponent_name" to if (tipo == TipoDia.JOGO && a.isNotEmpty()) JsonPrimitive(a) else JsonNull,
        )
        if (tipo == TipoDia.AVALIACAO) {
            corpo["assessment_types"] = JsonArray(avaliacao?.tipos.orEmpty().map { JsonPrimitive(it) })
            corpo["assessment_other"] = avaliacao?.outra?.let { JsonPrimitive(it) } ?: JsonNull
        }
        j(CaminhosTreino.tipoDoDia(diaId), "PUT", JsonObject(corpo))
    }

    override suspend fun mudarDistancia(diaId: String, km: Double?) {
        j(CaminhosTreino.distancia(diaId), "PUT", JsonObject(mapOf("avg_distance_km" to (km?.let { JsonPrimitive(it) } ?: JsonNull))))
    }

    override suspend fun adicionarPeriodo(diaId: String, novo: Periodo, atual: Periodo?, avaliacao: EscolhaAvaliacao?): String {
        val r = j(CaminhosTreino.periodos(diaId), "POST", buildJsonObject {
            put("novo", novo.bruto)
            if (atual != null) put("atual", atual.bruto)
            if (avaliacao != null) {
                put("tipo", TipoDia.AVALIACAO.bruto)
                put("assessment_types", JsonArray(avaliacao.tipos.map { JsonPrimitive(it) }))
                put("assessment_other", avaliacao.outra?.let { JsonPrimitive(it) } ?: JsonNull)
            }
        })
        return ((r as? JsonObject)?.get("id") as? JsonPrimitive)?.contentOrNull
            ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
    }

    override suspend fun trocarPeriodo(periodoId: String, para: Periodo) {
        j(CaminhosTreino.periodo(periodoId), "PUT", buildJsonObject { put("periodo", para.bruto) })
    }

    override suspend fun removerPeriodo(periodoId: String): Int {
        val r = j(CaminhosTreino.periodo(periodoId), "DELETE")
        return ((r as? JsonObject)?.get("anexos_apagados") as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt() ?: 0
    }

    /** O multipart: activity_id e title ANTES do arquivo (o multer lê na ordem). */
    internal fun montarUpload(atividadeId: String, arquivo: ArquivoUpload, titulo: String, progresso: (Double) -> Unit): Request {
        val corpo = MultipartBody.Builder(fronteira())
            .setType(MultipartBody.FORM)
            .addFormDataPart("activity_id", atividadeId)
            .addFormDataPart("title", titulo)
            .addFormDataPart(CAMPO_ANEXO, arquivo.nome, CorpoComProgresso(arquivo, progresso))
            .build()
        return Request.Builder().url((api.base + CaminhosTreino.enviarAnexo).toHttpUrl()).post(corpo)
            .header("authorization", "Bearer $token")
            .header("X-Workspace-Id", workspaceId)
            .build()
    }

    override suspend fun enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String, progresso: (Double) -> Unit): Anexo {
        val call = try {
            upload.newCall(montarUpload(atividadeId, arquivo, titulo, progresso))
        } catch (e: IllegalArgumentException) {
            throw ErroApi.offline()
        }
        val r = respostaOuErro(executarChamada(call), json)
        return json.decodeFromJsonElement(Anexo.serializer(), r)
    }

    override suspend fun renomearAnexo(id: String, titulo: String): Anexo =
        json.decodeFromJsonElement(Anexo.serializer(), j(CaminhosTreino.anexo(id), "PATCH", buildJsonObject { put("title", titulo) }))

    override suspend fun apagarAnexo(id: String) { j(CaminhosTreino.anexo(id), "DELETE") }

    override suspend fun temaDoMes(mes: String, clubeId: String): TemaDoMes =
        json.decodeFromJsonElement(TemaDoMes.serializer(), j(CaminhosTreino.tema(mes, clubeId)))

    private fun pedidoRelatorio(tipo: String, corpo: Map<String, JsonElement>): Request =
        Request.Builder().url((api.base + CaminhosTreino.relatorio(tipo)).toHttpUrl())
            .post(json.encodeToString(JsonElement.serializer(), JsonObject(corpo)).toRequestBody("application/json".toMediaType()))
            .header("authorization", "Bearer $token")
            .header("X-Workspace-Id", workspaceId)
            .build()

    private suspend fun relatorioJson(tipo: String, corpo: Map<String, JsonElement>): JsonElement {
        val call = try { relatorios.newCall(pedidoRelatorio(tipo, corpo)) } catch (e: IllegalArgumentException) { throw ErroApi.offline() }
        return respostaOuErro(executarChamada(call), json)
    }

    override suspend fun fotosDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): ListaFotosRelatorio =
        json.decodeFromJsonElement(ListaFotosRelatorio.serializer(), relatorioJson(tipo, corpo + ("formato" to JsonPrimitive("fotos"))))

    override suspend fun htmlDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): String =
        ((relatorioJson(tipo, corpo) as? JsonObject)?.get("html") as? JsonPrimitive)?.contentOrNull ?: ""

    override suspend fun pdfDoRelatorio(tipo: String, corpo: Map<String, JsonElement>): ByteArray {
        val call = try { relatorios.newCall(pedidoRelatorio(tipo, corpo - "formato")) } catch (e: IllegalArgumentException) { throw ErroApi.offline() }
        val (status, bytes) = executarBytes(call)
        if (status !in 200..299) {
            respostaOuErro(status to String(bytes, Charsets.UTF_8), json)
        }
        if (bytes.size <= 4 || String(bytes, 0, 4, Charsets.ISO_8859_1) != "%PDF") throw ErroApi(0, null, MSG_PDF_FALHOU)
        return bytes
    }

    private fun midias(r: JsonElement): List<MidiaAnalise> =
        json.decodeFromJsonElement(ListSerializer(MidiaAnalise.serializer()), (r as? JsonObject)?.get("midias") as? JsonArray ?: JsonArray(emptyList()))

    override suspend fun midiasDaAnalise(sessaoId: String): List<MidiaAnalise> =
        midias(j("/games/${codificarComponente(sessaoId)}/analise"))

    override suspend fun enviarMidiaAnalise(
        sessaoId: String, tipo: String, secao: String?, titulo: String?, arquivo: ArquivoUpload, progresso: (Double) -> Unit,
    ): List<MidiaAnalise> {
        val corpo = MultipartBody.Builder(fronteira()).setType(MultipartBody.FORM).addFormDataPart("tipo", tipo)
        if (!secao.isNullOrEmpty()) corpo.addFormDataPart("secao", secao)
        if (!titulo.isNullOrEmpty()) corpo.addFormDataPart("titulo", titulo)
        corpo.addFormDataPart(CAMPO_ANEXO, arquivo.nome, CorpoComProgresso(arquivo, progresso))
        val call = try {
            upload.newCall(Request.Builder().url((api.base + "/games/${codificarComponente(sessaoId)}/analise/midia").toHttpUrl())
                .post(corpo.build()).header("authorization", "Bearer $token").header("X-Workspace-Id", workspaceId).build())
        } catch (e: IllegalArgumentException) {
            throw ErroApi.offline()
        }
        return midias(respostaOuErro(executarChamada(call), json))
    }

    override suspend fun adicionarLinkAnalise(sessaoId: String, secao: String, titulo: String?, url: String): List<MidiaAnalise> =
        midias(j("/games/${codificarComponente(sessaoId)}/analise/link", "POST", buildJsonObject {
            put("secao", secao); put("url", url); if (!titulo.isNullOrBlank()) put("titulo", titulo)
        }))

    override suspend fun apagarMidiaAnalise(sessaoId: String, midiaId: String): List<MidiaAnalise> =
        midias(j("/games/${codificarComponente(sessaoId)}/analise/midia/${codificarComponente(midiaId)}", "DELETE"))

    override suspend fun pptxDaAnalise(sessaoId: String): ByteArray {
        val corpo = mapOf("session_id" to JsonPrimitive(sessaoId), "formato" to JsonPrimitive("pptx"))
        val call = try { relatorios.newCall(pedidoRelatorio("analise", corpo)) } catch (e: IllegalArgumentException) { throw ErroApi.offline() }
        val (status, bytes) = executarBytes(call)
        if (status !in 200..299) {
            respostaOuErro(status to String(bytes, Charsets.UTF_8), json)
        }
        // .pptx é um zip: começa com "PK"
        if (bytes.size <= 4 || bytes[0] != 'P'.code.toByte() || bytes[1] != 'K'.code.toByte()) throw ErroApi(0, null, "Não foi possível gerar o PowerPoint. Tente de novo.")
        return bytes
    }
}

/** Como o executarChamada, mas devolve os BYTES (PDF). */
internal suspend fun executarBytes(call: Call): Pair<Int, ByteArray> = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(ErroApi.offline())
        }

        override fun onResponse(call: Call, response: Response) {
            val r = try {
                response.use { it.code to (it.body?.bytes() ?: ByteArray(0)) }
            } catch (e: IOException) {
                if (cont.isActive) cont.resumeWithException(ErroApi.offline())
                return
            }
            if (cont.isActive) cont.resume(r)
        }
    })
}
