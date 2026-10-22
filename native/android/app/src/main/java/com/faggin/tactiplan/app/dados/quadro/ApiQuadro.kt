package com.faggin.tactiplan.app.dados.quadro

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ContextoClube
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.codificarComponente
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// QUADRO TÁTICO (T5): /api/plays do web com o token do app (X-Workspace-Id). As jogadas são da
// CONTA; `club_id` é só "criada em". Ver = tactical:view, mudar = tactical:edit; conta só leitura
// → 402 READ_ONLY (só assistir). Paridade: TactiPlanKit/ApiQuadro.swift.

object CaminhosQuadro {
    const val jogadas = "/plays"
    fun jogada(id: String) = "/plays/${codificarComponente(id)}"
}

interface ApiQuadro {
    suspend fun listar(): List<Jogada>
    suspend fun abrir(id: String): Jogada
    suspend fun criar(corpo: JsonObject): Jogada
    suspend fun atualizar(id: String, corpo: JsonObject): Jogada
    suspend fun excluir(id: String)
}

class ApiQuadroHttp(private val api: Api, private val token: String, private val workspaceId: String) : ApiQuadro {
    private suspend fun j(caminho: String, metodo: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(caminho, metodo, corpo, token, mapOf("X-Workspace-Id" to workspaceId))

    private fun jogada(e: JsonElement) = Jogada((e as? JsonObject) ?: JsonObject(emptyMap()))

    override suspend fun listar() = jogadasDaResposta(j(CaminhosQuadro.jogadas))
    override suspend fun abrir(id: String) = jogada(j(CaminhosQuadro.jogada(id)))
    override suspend fun criar(corpo: JsonObject) = jogada(j(CaminhosQuadro.jogadas, "POST", corpo))
    override suspend fun atualizar(id: String, corpo: JsonObject) = jogada(j(CaminhosQuadro.jogada(id), "PUT", corpo))
    override suspend fun excluir(id: String) { j(CaminhosQuadro.jogada(id), "DELETE") }
}

data class PermissoesQuadro(val ver: Boolean, val editar: Boolean)

/** Clube arquivado NÃO trava jogada (é da conta); conta só leitura trava. */
fun permissoesQuadro(ctx: ContextoClube): PermissoesQuadro {
    val contaLeitura = ctx.conta.somenteLeitura ?: true
    val ver = "tactical:view" in ctx.permissoes
    return PermissoesQuadro(ver, ver && !contaLeitura && "tactical:edit" in ctx.permissoes)
}

/** Mesmo corpo que o web manda ao salvar a jogada com outro nome (renomear, duplicar). */
fun corpoDaJogada(j: Jogada, nome: String, descricao: String? = null, clubeId: String?): JsonObject =
    EditorQuadro().abrir(j.bruto).corpoSalvar(nome, descricao ?: j.descricao, clubeId)

fun nomeDaCopia(nome: String) = "$nome (cópia)"

fun nomeValidoJogada(nome: String): String? = nome.trim().ifEmpty { null }

fun mensagemErroQuadro(e: Throwable): String = when {
    e is ErroApi && e.status == 403 -> "Você não tem permissão para editar o quadro tático."
    e is ErroApi -> e.mensagem
    else -> ErroApi.MSG_FALHA
}
