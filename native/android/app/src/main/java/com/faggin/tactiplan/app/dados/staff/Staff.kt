package com.faggin.tactiplan.app.dados.staff

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.ehSomenteLeitura
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// Staff (comissão técnica) do clube aberto, como o TeamConfigPage/MemberEditPanel do web:
// papéis, as 16 permissões por grupo, categorias, convites. Só o DONO gerencia (o servidor exige
// members:manage + dono). Textos sem "plano" (Apple 3.1.3). Paridade: TactiPlanKit/Staff.swift.

val PERMISSOES = listOf(
    "training:view", "training:edit", "training:delete", "games:view", "games:edit",
    "athletes:view", "athletes:edit", "injuries:manage", "tactical:view", "tactical:edit",
    "stats:view", "library:edit", "categories:manage", "members:manage", "club_settings:manage", "billing:manage",
)

val ROTULOS_PERMISSAO = mapOf(
    "training:view" to "Ver treinos", "training:edit" to "Editar treinos", "training:delete" to "Apagar treinos",
    "games:view" to "Ver jogos", "games:edit" to "Editar jogos",
    "athletes:view" to "Ver atletas", "athletes:edit" to "Editar atletas", "injuries:manage" to "Gerenciar lesões",
    "tactical:view" to "Ver quadro tático", "tactical:edit" to "Editar quadro tático",
    "stats:view" to "Ver estatísticas", "library:edit" to "Editar biblioteca (conteúdos/atividades)",
    "categories:manage" to "Gerenciar categorias", "members:manage" to "Gerenciar equipe (convidar/remover)",
    "club_settings:manage" to "Configurações do clube", "billing:manage" to "Gerenciar assinatura",
)

data class GrupoPermissao(val rotulo: String, val itens: List<String>)

val GRUPOS_PERMISSAO = listOf(
    GrupoPermissao("Treinos", listOf("training:view", "training:edit", "training:delete")),
    GrupoPermissao("Jogos", listOf("games:view", "games:edit")),
    GrupoPermissao("Atletas", listOf("athletes:view", "athletes:edit", "injuries:manage")),
    GrupoPermissao("Quadro Tático", listOf("tactical:view", "tactical:edit")),
    GrupoPermissao("Estatísticas e Biblioteca", listOf("stats:view", "library:edit")),
    GrupoPermissao("Administração", listOf("categories:manage", "members:manage", "club_settings:manage", "billing:manage")),
)

/** Permissões que o app mostra no convite (a de assinatura nunca aparece no app — Apple 3.1.3). */
val GRUPOS_PERMISSAO_APP: List<GrupoPermissao> =
    GRUPOS_PERMISSAO.map { g -> g.copy(itens = g.itens.filter { it != "billing:manage" }) }

/** Papéis que se convidam (owner/manager/viewer só aparecem em quem já tem). */
val PAPEIS_CONVITE = listOf("head_coach", "assistant_coach", "specialist", "other")

val ROTULOS_PAPEL = mapOf(
    "owner" to "Proprietário", "manager" to "Gerente", "head_coach" to "Treinador Principal",
    "assistant_coach" to "Treinador Auxiliar", "specialist" to "Especialista (Fisio/PF/Analista)",
    "viewer" to "Somente leitura", "other" to "Outros",
)

val DESCRICOES_PAPEL = mapOf(
    "manager" to "Faz quase tudo, menos billing e gestão de membros",
    "head_coach" to "Treinador principal — treinos, jogos, atletas, táticas",
    "assistant_coach" to "Auxiliar — edita treinos, vê jogos/atletas/táticas",
    "specialist" to "Fisio/PF/Analista — gerencia lesões, vê stats, edita biblioteca",
    "viewer" to "Apenas leitura",
    "other" to "Outra função: escolha abaixo o que a pessoa pode ver e editar",
)

fun rotuloPapelStaff(p: String?): String = ROTULOS_PAPEL[p] ?: (p ?: "")

/** Descrição do papel no app: sem a palavra "billing" (texto neutro). */
fun descricaoPapel(p: String?): String = (DESCRICOES_PAPEL[p] ?: "").replace("billing e ", "")

private val VER = listOf("training:view", "games:view", "athletes:view", "tactical:view", "stats:view")

val PADROES_PAPEL: Map<String, List<String>> = mapOf(
    "owner" to PERMISSOES,
    "manager" to listOf("training:view", "training:edit", "training:delete", "games:view", "games:edit", "athletes:view",
        "athletes:edit", "injuries:manage", "tactical:view", "tactical:edit", "stats:view", "library:edit", "categories:manage"),
    "head_coach" to listOf("training:view", "training:edit", "training:delete", "games:view", "games:edit", "athletes:view",
        "athletes:edit", "tactical:view", "tactical:edit", "stats:view", "library:edit"),
    "assistant_coach" to listOf("training:view", "training:edit", "games:view", "athletes:view", "tactical:view", "stats:view"),
    "specialist" to listOf("training:view", "games:view", "athletes:view", "athletes:edit", "injuries:manage", "stats:view", "library:edit"),
    "viewer" to VER,
    "other" to VER,
)

/** owner = todas; lista própria substitui; senão o padrão do papel; papel desconhecido = vazio. */
fun permissoesEfetivas(papel: String?, permissoes: List<String>?): Set<String> = when {
    papel == "owner" -> PERMISSOES.toSet()
    permissoes != null -> permissoes.toSet()
    else -> PADROES_PAPEL[papel]?.toSet() ?: emptySet()
}

/** "Treinos: ver e editar" (resumo legível por grupo, só os grupos com alguma permissão). */
fun resumoPermissoes(efetivas: Set<String>): List<String> = GRUPOS_PERMISSAO_APP.mapNotNull { g ->
    val tem = g.itens.filter { it in efetivas }
    if (tem.isEmpty()) return@mapNotNull null
    val verbos = tem.map { ROTULOS_PERMISSAO[it]!!.substringBefore(' ').lowercase() }
    "${g.rotulo}: ${if (verbos.size == 1) verbos[0] else verbos.dropLast(1).joinToString(", ") + " e " + verbos.last()}"
}

// ---------- limite ----------

/** -1 = sem limite. "Responsável + 5 convidados · 2 em uso, contando convites pendentes". */
fun textoLimiteEquipe(usados: Int, limite: Int?): String? {
    if (limite == null) return null
    if (limite < 0) return "Sem limite de convidados"
    return "Responsável + $limite ${if (limite == 1) "convidado" else "convidados"} · $usados em uso, contando convites pendentes"
}

fun podeConvidar(usados: Int, limite: Int?): Boolean = limite != null && (limite < 0 || usados < limite)

const val MSG_LIMITE_EQUIPE = "A equipe já está no limite de pessoas. Remova um membro ou convite pendente para convidar outra pessoa."
const val MSG_SO_DONO_EQUIPE = "Só o responsável pela conta convida, edita e remove pessoas da comissão."
const val MSG_SEM_PERMISSAO_EQUIPE = "Você não tem permissão para gerenciar a equipe neste clube. Peça ao responsável pelo clube para liberar em Staff."
const val MSG_CONVITE_INDISPONIVEL = "Não é possível convidar pessoas agora. Fale com o responsável pela equipe."
const val MSG_EMAIL_CONVITE = "Informe o e-mail de quem você quer convidar."
const val MSG_CATEGORIAS_CONVITE = "Escolha pelo menos uma categoria."

/** Erros do Staff em frase neutra (o 402 do servidor fala de plano). */
fun mensagemErroStaff(e: Throwable): String {
    val erro = e as? ErroApi ?: return mensagemErroTreino(e)
    return when {
        erro.codigo == "MEMBER_LIMIT" -> MSG_LIMITE_EQUIPE
        erro.status == 402 && !ehSomenteLeitura(e) -> MSG_CONVITE_INDISPONIVEL
        erro.status == 403 && !ehSomenteLeitura(e) ->
            if (erro.mensagem.startsWith("Apenas o dono")) MSG_SO_DONO_EQUIPE else MSG_SEM_PERMISSAO_EQUIPE
        else -> mensagemErroTreino(e, MSG_SEM_PERMISSAO_EQUIPE)
    }
}

fun textoConvite(clube: String, url: String) = "Convite para a comissão do $clube no TactiPlan: $url"

fun emailValido(e: String): Boolean = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(e.trim())

// ---------- modelos ----------

@Serializable
data class DonoEquipe(val id: String, val name: String? = null, val email: String? = null)

@Serializable
data class Membro(
    val id: String,
    @SerialName("user_id") val usuarioId: String? = null,
    @SerialName("invited_email") val emailConvidado: String? = null,
    val role: String = "head_coach",
    @SerialName("category_ids") val categorias: List<String>? = null,
    val permissions: List<String>? = null,
    @SerialName("invited_at") val convidadoEm: String? = null,
    @SerialName("accepted_at") val aceitoEm: String? = null,
    @SerialName("user_name") val nome: String? = null,
    @SerialName("user_email") val email: String? = null,
) {
    val pendente: Boolean get() = aceitoEm == null
    val nomeExibido: String get() = nome?.takeIf { it.isNotBlank() } ?: emailConvidado ?: email ?: ""
    val emailExibido: String get() = email ?: emailConvidado ?: ""
    val efetivas: Set<String> get() = permissoesEfetivas(role, permissions)
}

@Serializable
data class Equipe(
    val owner: DonoEquipe? = null,
    val members: List<Membro> = emptyList(),
    @SerialName("is_owner") val ehDono: Boolean = false,
    @SerialName("workspace_id") val workspaceId: String? = null,
    @SerialName("limite_convidados") val limite: Int? = null,
) {
    val usados: Int get() = members.size
    val pendentes: List<Membro> get() = members.filter { it.pendente }
    val ativos: List<Membro> get() = members.filter { !it.pendente }
}

/** "Todas as categorias" ou os nomes. */
fun escopoDoMembro(m: Membro, nomes: Map<String, String>): String =
    m.categorias?.takeIf { it.isNotEmpty() }?.joinToString(", ") { nomes[it] ?: "—" } ?: "Todas as categorias"

// ---------- corpos ----------

private fun lista(l: List<String>?): JsonElement = l?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull

/** POST /clubs/:id/invite. */
fun corpoConvite(email: String, papel: String, categorias: List<String>?, permissoes: List<String>?): JsonObject = buildJsonObject {
    put("email", email.trim().lowercase())
    put("role", papel)
    put("category_ids", lista(categorias?.takeIf { it.isNotEmpty() }))
    put("permissions", lista(permissoes))
}

/**
 * PUT …/members/:id. `permissoes` só vai quando a pessoa mexeu nos interruptores
 * (`mexeu=false` = omitido = o servidor mantém); `null` com `mexeu` = volta ao padrão do papel.
 */
fun corpoMembro(papel: String, categorias: List<String>?, permissoes: List<String>?, mexeu: Boolean): JsonObject = buildJsonObject {
    put("role", papel)
    put("category_ids", lista(categorias?.takeIf { it.isNotEmpty() }))
    if (mexeu) put("permissions", lista(permissoes))
}

// ---------- API ----------

object CaminhosStaff {
    fun membros(clube: String) = "/clubs/${codificarComponente(clube)}/members"
    fun convidar(clube: String) = "/clubs/${codificarComponente(clube)}/invite"
    fun membro(clube: String, id: String) = "/clubs/${codificarComponente(clube)}/members/${codificarComponente(id)}"
    fun reenviar(clube: String, id: String) = "${membro(clube, id)}/resend"
}

interface ApiStaff {
    suspend fun equipe(clubeId: String): Equipe
    /** Devolve o link do convite (accept_url). */
    suspend fun convidar(clubeId: String, corpo: JsonObject): String?
    suspend fun atualizar(clubeId: String, membroId: String, corpo: JsonObject)
    suspend fun remover(clubeId: String, membroId: String)
    suspend fun reenviar(clubeId: String, membroId: String): String?
}

class ApiStaffHttp(private val api: Api, private val token: String, private val workspaceId: String) : ApiStaff {
    private suspend fun j(caminho: String, metodo: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(caminho, metodo, corpo, token, mapOf("X-Workspace-Id" to workspaceId))

    private fun url(e: JsonElement) = ((e as? JsonObject)?.get("accept_url") as? JsonPrimitive)?.contentOrNull

    override suspend fun equipe(clubeId: String) = JsonApp.decodeFromJsonElement(Equipe.serializer(), j(CaminhosStaff.membros(clubeId)))
    override suspend fun convidar(clubeId: String, corpo: JsonObject) = url(j(CaminhosStaff.convidar(clubeId), "POST", corpo))
    override suspend fun atualizar(clubeId: String, membroId: String, corpo: JsonObject) { j(CaminhosStaff.membro(clubeId, membroId), "PUT", corpo) }
    override suspend fun remover(clubeId: String, membroId: String) { j(CaminhosStaff.membro(clubeId, membroId), "DELETE") }
    override suspend fun reenviar(clubeId: String, membroId: String) = url(j(CaminhosStaff.reenviar(clubeId, membroId), "POST"))
}
