package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.ehSomenteLeitura
import com.faggin.tactiplan.app.dados.treino.listaOuData
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// As rotas de JOGO do web que o app chama com o token dele (T2), sempre com X-Workspace-Id.
// Paridade: TactiPlanKit/ApiJogo.swift.

object CaminhosJogo {
    fun jogo(sessaoId: String) = "/games/${codificarComponente(sessaoId)}"
    fun dia(sessaoId: String) = "/sessions/${codificarComponente(sessaoId)}"
    fun lista(clube: String, inicio: String, fim: String) =
        "/stats/games?clubId=${codificarComponente(clube)}&start_date=${codificarComponente(inicio)}&end_date=${codificarComponente(fim)}"
    fun atletas(clube: String) = "/athletes?status=active&club_id=${codificarComponente(clube)}"
    fun campeonatos(clube: String) = "/competitions?clubId=${codificarComponente(clube)}"
}

interface ApiJogo {
    suspend fun listarJogos(clubeId: String, inicio: String, fim: String): List<JogoDaLista>
    suspend fun dia(sessaoId: String): DiaDoJogo
    suspend fun jogo(sessaoId: String): DadosDoJogo
    suspend fun atletas(clubeId: String): List<AtletaResumo>
    suspend fun campeonatos(clubeId: String): List<Campeonato>
    /** POST /api/games/:id com o corpo do editor. */
    suspend fun salvar(sessaoId: String, corpo: JsonObject)
}

class ApiJogoHttp(private val api: Api, private val token: String, private val workspaceId: String) : ApiJogo {
    private val json = JsonApp
    private suspend fun j(caminho: String, metodo: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(caminho, metodo, corpo, token, mapOf("X-Workspace-Id" to workspaceId))

    override suspend fun listarJogos(clubeId: String, inicio: String, fim: String): List<JogoDaLista> {
        val r = j(CaminhosJogo.lista(clubeId, inicio, fim))
        val l = (r as? JsonObject)?.get("matchesHistory") as? JsonArray ?: JsonArray(emptyList())
        return json.decodeFromJsonElement(ListSerializer(JogoDaLista.serializer()), l)
    }

    override suspend fun dia(sessaoId: String): DiaDoJogo = json.decodeFromJsonElement(DiaDoJogo.serializer(), j(CaminhosJogo.dia(sessaoId)))
    override suspend fun jogo(sessaoId: String): DadosDoJogo = json.decodeFromJsonElement(DadosDoJogo.serializer(), j(CaminhosJogo.jogo(sessaoId)))
    override suspend fun atletas(clubeId: String): List<AtletaResumo> =
        json.decodeFromJsonElement(ListSerializer(AtletaResumo.serializer()), listaOuData(j(CaminhosJogo.atletas(clubeId))))
    override suspend fun campeonatos(clubeId: String): List<Campeonato> =
        json.decodeFromJsonElement(ListSerializer(Campeonato.serializer()), listaOuData(j(CaminhosJogo.campeonatos(clubeId))))
    override suspend fun salvar(sessaoId: String, corpo: JsonObject) { j(CaminhosJogo.jogo(sessaoId), "POST", corpo) }
}

// ---------- mensagens ----------

const val MSG_SEM_PERMISSAO_JOGO = "Você não tem permissão para editar jogos. Peça ao responsável pela equipe."
const val MSG_SALVE_ANTES = "Salve o jogo antes de exportar: o PDF usa a convocação salva."
const val MSG_SALVE_ANTES_JOGO = "Salve o jogo antes de exportar: o relatório usa o jogo salvo."
const val MSG_SELECIONE_ANTES = "Selecione jogadores antes de exportar"
const val MSG_ENVIE_ANTES = "Envie as alterações guardadas no aparelho antes de exportar: o PDF usa a convocação salva."
const val MSG_CRIAR_SEM_REDE = "Sem conexão. Para criar um jogo é preciso internet."

/** 403 → aviso de permissão; 402/409 → frases neutras; 400 → a do servidor. */
fun mensagemErroJogo(e: Throwable): String {
    val erro = e as? ErroApi
    if (erro != null && erro.status == 403 && !ehSomenteLeitura(e)) return MSG_SEM_PERMISSAO_JOGO
    return mensagemErroTreino(e)
}

// ---------- pacote da tela ----------

@Serializable
data class PacoteJogo(
    val dia: DiaDoJogo,
    val jogo: DadosDoJogo,
    val atletas: List<AtletaResumo> = emptyList(),
    val campeonatos: List<Campeonato> = emptyList(),
)

class ServicoJogo(val api: ApiJogo, val clubeId: String, val modalidade: String?) {
    /** Carrega a tela (em paralelo). Plantel/campeonatos com erro viram lista vazia. */
    suspend fun carregar(sessaoId: String): PacoteJogo = coroutineScope {
        val d = async { api.dia(sessaoId) }
        val j = async { api.jogo(sessaoId) }
        val a = async { runCatching { api.atletas(clubeId) }.getOrDefault(emptyList()) }
        val c = async { runCatching { api.campeonatos(clubeId) }.getOrDefault(emptyList()) }
        PacoteJogo(d.await(), j.await(), a.await(), c.await())
    }

    /** A "versão" do jogo no servidor: a assinatura do corpo que o editor montaria agora. */
    suspend fun assinaturaNoServidor(sessaoId: String): String = coroutineScope {
        val d = async { api.dia(sessaoId) }
        val j = async { api.jogo(sessaoId) }
        EditorJogo.carregar(d.await(), j.await(), modalidade).assinaturaServidor
    }
}
