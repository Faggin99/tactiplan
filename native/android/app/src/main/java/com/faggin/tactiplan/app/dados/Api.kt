package com.faggin.tactiplan.app.dados

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

// Cliente HTTP do app (copiado do Gestsport). Paridade: TactiPlanKit/Api.swift.
// Uploads chegam nas próximas fases com a mesma semântica de erro.

/** JSON do app inteiro: campo novo no servidor nunca quebra o app. */
val JsonApp: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

private val TIPO_JSON = "application/json".toMediaType()

// OkHttp exige corpo nesses métodos; o fetch do Capacitor mandava sem corpo.
private val METODOS_COM_CORPO = setOf("POST", "PUT", "PATCH")

fun clientePadrao(): OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(15, TimeUnit.SECONDS)
    .writeTimeout(15, TimeUnit.SECONDS)
    .callTimeout(15, TimeUnit.SECONDS)
    .build()

/**
 * Cliente da API. `base` = BuildConfig.API_BASE (ex.: "https://app.tactiplan.faggin.com.br/api").
 * Todo erro sai como [ErroApi], com a mesma semântica do `api()` do Capacitor.
 */
class Api(
    val base: String,
    private val cliente: OkHttpClient = clientePadrao(),
    val json: Json = JsonApp,
) {
    /** Chamada crua: devolve o corpo JSON (ou `{}` se o corpo não for JSON). */
    suspend fun chamarJson(
        caminho: String,
        metodo: String = "GET",
        corpo: JsonElement? = null,
        token: String? = null,
        cabecalhos: Map<String, String> = emptyMap(),
    ): JsonElement {
        // Mesma ordem do client.js: content-type, depois os extras (podem
        // sobrescrever), depois o token.
        val headers = linkedMapOf("content-type" to "application/json")
        headers.putAll(cabecalhos)
        if (token != null) headers["authorization"] = "Bearer $token"

        val body = when {
            corpo != null -> json.encodeToString(JsonElement.serializer(), corpo).toRequestBody(TIPO_JSON)
            metodo.uppercase() in METODOS_COM_CORPO -> ByteArray(0).toRequestBody(TIPO_JSON)
            else -> null
        }
        // Como o fetch do JS lançando antes de sair (URL impossível, cabeçalho
        // inválido, método recusado): vira OFFLINE / "Sem conexão.".
        val call = try {
            val req = Request.Builder().url((base + caminho).toHttpUrl()).method(metodo, body).apply {
                headers.forEach { (k, v) -> header(k, v) }
            }.build()
            cliente.newCall(req)
        } catch (e: IllegalArgumentException) {
            throw ErroApi.offline()
        } catch (e: IllegalStateException) {
            throw ErroApi.offline()
        }

        return respostaOuErro(executarChamada(call), json)
    }

    /** Chamada tipada: decodifica o corpo em [T] (campos desconhecidos são ignorados). */
    suspend inline fun <reified T> chamar(
        caminho: String,
        metodo: String = "GET",
        corpo: JsonElement? = null,
        token: String? = null,
        cabecalhos: Map<String, String> = emptyMap(),
    ): T = json.decodeFromJsonElement(chamarJson(caminho, metodo, corpo, token, cabecalhos))

    /** Caminho assinado do servidor → URL absoluta na origem da API. */
    fun urlDoServidor(caminho: String?): String? = urlDoServidor(caminho, base)
}

// ---- compartilhado com o Upload (mesma semântica de erro) ----

/**
 * Corpo → JSON; não-2xx → [ErroApi] com a mensagem do `{error}`, o `{code}` e o
 * `{demo:true}` da conta de demonstração.
 */
internal fun respostaOuErro(resposta: Pair<Int, String>, json: Json): JsonElement {
    val (status, texto) = resposta
    val dados = lerJson(texto, json)
    if (status !in 200..299) {
        val obj = dados as? JsonObject
        val mensagem = (obj?.get("error") as? JsonPrimitive)?.takeIf { it.isString }?.content
        val codigo = (obj?.get("code") as? JsonPrimitive)?.takeIf { it.isString }?.content
        val demo = (obj?.get("demo") as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true
        val extras = obj.orEmpty().filter { (k, v) -> k != "error" && k != "code" && v is JsonPrimitive && v.isString }
            .mapValues { (it.value as JsonPrimitive).content }
        throw ErroApi(status, codigo, mensagem?.takeIf { it.isNotEmpty() } ?: ErroApi.MSG_FALHA, demo, extras)
    }
    return dados
}

// Igual ao `r.json().catch(() => ({}))`: corpo que não é JSON válido vira `{}`.
// (O parser do kotlinx aceita literal solto tipo `ok`; o JSON.parse não.)
private fun lerJson(texto: String, json: Json): JsonElement {
    val vazio = JsonObject(emptyMap())
    if (texto.isBlank()) return vazio
    val e = try { json.parseToJsonElement(texto) } catch (e: Exception) { return vazio }
    if (e is JsonPrimitive && !e.isString && e.content !in setOf("true", "false", "null") &&
        e.content.toDoubleOrNull() == null
    ) return vazio
    return e
}

// Assíncrono de verdade: cancelar a corrotina cancela a chamada HTTP.
// Qualquer IOException (sem rede, DNS, timeout) vira OFFLINE.
internal suspend fun executarChamada(call: Call): Pair<Int, String> = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(ErroApi.offline())
        }

        override fun onResponse(call: Call, response: Response) {
            val r = try {
                response.use { it.code to (it.body?.string() ?: "") }
            } catch (e: IOException) {
                if (cont.isActive) cont.resumeWithException(ErroApi.offline())
                return
            }
            if (cont.isActive) cont.resume(r)
        }
    })
}

/**
 * Caminho do servidor (ex.: "/uploads/comprovantes/x.pdf?t=…", link assinado) →
 * URL absoluta na MESMA origem da API. URL já absoluta passa direto; vazio → null.
 * Base não-absoluta (só no navegador do Capacitor) cai em http://localhost.
 */
fun urlDoServidor(caminho: String?, base: String): String? {
    if (caminho.isNullOrEmpty()) return null
    if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(caminho)) return caminho
    val origem = base.toHttpUrlOrNull() ?: "http://localhost/".toHttpUrl()
    return origem.resolve(caminho)?.toString()
}
