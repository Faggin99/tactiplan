package com.faggin.tactiplan.app.dados.elenco

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.ehSomenteLeitura
import com.faggin.tactiplan.app.dados.executarChamada
import com.faggin.tactiplan.app.dados.respostaOuErro
import com.faggin.tactiplan.app.dados.treino.ArquivoUpload
import com.faggin.tactiplan.app.dados.treino.CorpoComProgresso
import com.faggin.tactiplan.app.dados.treino.clienteUpload
import com.faggin.tactiplan.app.dados.treino.listaOuData
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import java.util.UUID
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request

// Rotas do Plantel/DM do web com o token do app (T3), sempre com X-Workspace-Id.
// Paridade: TactiPlanKit/ApiElenco.swift.

object CaminhosElenco {
    fun atletas(clube: String) = "/athletes?club_id=${codificarComponente(clube)}"
    const val criar = "/athletes"
    fun atleta(id: String) = "/athletes/${codificarComponente(id)}"
    fun foto(id: String) = "/athletes/${codificarComponente(id)}/photo"
    const val grupos = "/athletes/batch-groups"
    fun lesoesDoAtleta(id: String) = "/athletes/${codificarComponente(id)}/injuries"
    fun lesao(id: String) = "/injuries/${codificarComponente(id)}"
    const val lesoesAtivas = "/injuries/active"
    fun categorias(clube: String) = "/categories?clubId=${codificarComponente(clube)}"
}

const val CAMPO_FOTO_ATLETA = "photo"

interface ApiElenco {
    suspend fun atletas(clubeId: String): List<Atleta>
    suspend fun criar(corpo: JsonObject): Atleta
    suspend fun atualizar(id: String, corpo: JsonObject): Atleta
    suspend fun remover(id: String)
    suspend fun moverGrupo(ids: List<String>, grupo: String?)
    suspend fun enviarFoto(id: String, arquivo: ArquivoUpload): Atleta
    suspend fun removerFoto(id: String): Atleta
    suspend fun lesoes(atletaId: String): List<Lesao>
    suspend fun lesoesAtivas(): List<Lesao>
    suspend fun registrarLesao(atletaId: String, corpo: JsonObject): Lesao
    suspend fun darAlta(lesaoId: String, hoje: String)
    suspend fun removerLesao(lesaoId: String)
    suspend fun categorias(clubeId: String): List<CategoriaCadastro>
}

class ApiElencoHttp(
    private val api: Api,
    private val token: String,
    private val workspaceId: String,
    private val upload: OkHttpClient = clienteUpload(),
) : ApiElenco {
    private val json = JsonApp
    private suspend fun j(caminho: String, metodo: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(caminho, metodo, corpo, token, mapOf("X-Workspace-Id" to workspaceId))

    private fun atleta(e: JsonElement) = json.decodeFromJsonElement(Atleta.serializer(), e)

    override suspend fun atletas(clubeId: String): List<Atleta> =
        json.decodeFromJsonElement(ListSerializer(Atleta.serializer()), listaOuData(j(CaminhosElenco.atletas(clubeId))))
    override suspend fun criar(corpo: JsonObject) = atleta(j(CaminhosElenco.criar, "POST", corpo))
    override suspend fun atualizar(id: String, corpo: JsonObject) = atleta(j(CaminhosElenco.atleta(id), "PUT", corpo))
    override suspend fun remover(id: String) { j(CaminhosElenco.atleta(id), "DELETE") }
    override suspend fun moverGrupo(ids: List<String>, grupo: String?) { j(CaminhosElenco.grupos, "PUT", corpoMoverGrupo(ids, grupo)) }

    internal fun montarFoto(id: String, arquivo: ArquivoUpload, fronteira: String = "tactiplan-${UUID.randomUUID()}"): Request {
        val corpo = MultipartBody.Builder(fronteira).setType(MultipartBody.FORM)
            .addFormDataPart(CAMPO_FOTO_ATLETA, arquivo.nome, CorpoComProgresso(arquivo) {})
            .build()
        return Request.Builder().url((api.base + CaminhosElenco.foto(id)).toHttpUrl()).post(corpo)
            .header("authorization", "Bearer $token")
            .header("X-Workspace-Id", workspaceId)
            .build()
    }

    override suspend fun enviarFoto(id: String, arquivo: ArquivoUpload): Atleta {
        val call = try { upload.newCall(montarFoto(id, arquivo)) } catch (e: IllegalArgumentException) { throw ErroApi.offline() }
        return atleta(respostaOuErro(executarChamada(call), json))
    }

    override suspend fun removerFoto(id: String) = atleta(j(CaminhosElenco.foto(id), "DELETE"))
    override suspend fun lesoes(atletaId: String): List<Lesao> =
        json.decodeFromJsonElement(ListSerializer(Lesao.serializer()), listaOuData(j(CaminhosElenco.lesoesDoAtleta(atletaId))))
    override suspend fun lesoesAtivas(): List<Lesao> =
        json.decodeFromJsonElement(ListSerializer(Lesao.serializer()), listaOuData(j(CaminhosElenco.lesoesAtivas)))
    override suspend fun registrarLesao(atletaId: String, corpo: JsonObject): Lesao =
        json.decodeFromJsonElement(Lesao.serializer(), j(CaminhosElenco.lesoesDoAtleta(atletaId), "POST", corpo))
    override suspend fun darAlta(lesaoId: String, hoje: String) { j(CaminhosElenco.lesao(lesaoId), "PUT", corpoAlta(hoje)) }
    override suspend fun removerLesao(lesaoId: String) { j(CaminhosElenco.lesao(lesaoId), "DELETE") }
    override suspend fun categorias(clubeId: String): List<CategoriaCadastro> =
        json.decodeFromJsonElement(ListSerializer(CategoriaCadastro.serializer()), listaOuData(j(CaminhosElenco.categorias(clubeId))))
}

// ---------- mensagens ----------

const val MSG_SEM_PERMISSAO_ATLETAS = "Você não tem permissão para editar atletas neste clube. Peça ao responsável pelo clube para liberar em Staff."
const val MSG_SEM_PERMISSAO_LESOES = "Você não tem permissão para registrar lesões neste clube. Peça ao responsável pelo clube para liberar em Staff."

/** 403 → aviso amigável; 402/409 → frases neutras; o resto = a do servidor. */
fun mensagemErroElenco(e: Throwable, permissao: String = MSG_SEM_PERMISSAO_ATLETAS): String {
    val erro = e as? ErroApi
    if (erro != null && erro.status == 403 && !ehSomenteLeitura(e)) return permissao
    return mensagemErroTreino(e, permissao)
}

/** Salvar = criar ou atualizar; a foto escolhida antes de salvar sobe logo depois do 1º salvamento. */
class ServicoElenco(val api: ApiElenco, val clubeId: String) {
    suspend fun salvar(existente: Atleta?, form: FormAtleta, fotoNova: ArquivoUpload?): Atleta {
        erroAtleta(form.nome, form.posicao, form.camisa, form.altura)?.let { throw ErroApi(0, "VALIDACAO", it) }
        val corpo = corpoAtleta(form, existente?.clubeId ?: clubeId, existente?.fotoUrl)
        var salvo = if (existente == null) api.criar(corpo) else api.atualizar(existente.id, corpo)
        if (fotoNova != null) salvo = api.enviarFoto(salvo.id, fotoNova)
        return salvo
    }

    suspend fun registrarLesao(atletaId: String, tipo: String, local: String, severidade: String, inicio: String, retorno: String?, notas: String): Lesao {
        erroLesao(tipo)?.let { throw ErroApi(0, "VALIDACAO", it) }
        return api.registrarLesao(atletaId, corpoLesao(tipo, local, severidade, inicio, retorno, notas))
    }
}
