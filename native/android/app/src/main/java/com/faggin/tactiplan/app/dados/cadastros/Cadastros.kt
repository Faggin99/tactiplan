package com.faggin.tactiplan.app.dados.cadastros

import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.codificarComponente
import com.faggin.tactiplan.app.dados.ehSomenteLeitura
import com.faggin.tactiplan.app.dados.elenco.CategoriaCadastro
import com.faggin.tactiplan.app.dados.elenco.compararNome
import com.faggin.tactiplan.app.dados.elenco.dobrar
import com.faggin.tactiplan.app.dados.jogo.TextoFlex
import com.faggin.tactiplan.app.dados.treino.IntFlex
import com.faggin.tactiplan.app.dados.treino.listaOuData
import com.faggin.tactiplan.app.dados.treino.mensagemErroTreino
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// Mais › Cadastros (T3): Campeonatos, Categorias, Clubes, Conteúdos, Submomentos e Atividades,
// com as MESMAS rotas e validações do web (CompetitionsConfigPage, CategoriesConfigPage,
// ClubsConfigPage, ContentsConfigPage, ActivitiesConfigPage). Textos sem preço nem "plano"
// (Apple 3.1.3). Paridade: TactiPlanKit/Cadastros.swift.

private fun texto(v: String?): JsonElement = if (v.isNullOrBlank()) JsonNull else JsonPrimitive(v.trim())

// ---------- Campeonatos ----------

@Serializable
data class CampeonatoCad(
    val id: String,
    val name: String = "",
    @Serializable(with = TextoFlex::class) val season: String? = null,
    val format: String? = null,
    @SerialName("start_date") val inicio: String? = null,
    @SerialName("end_date") val fim: String? = null,
    @SerialName("club_id") val clubeId: String? = null,
    @SerialName("is_archived") val arquivado: Boolean? = false,
)

val FORMATOS_CAMPEONATO = listOf("Pontos corridos", "Mata-mata", "Grupos + playoffs", "Liga + Copa", "Amistosos")
const val MSG_NOME_CAMPEONATO = "Nome é obrigatório"

data class FormCampeonato(
    val nome: String = "", val temporada: String = "", val formato: String = "",
    val inicio: String? = null, val fim: String? = null, val arquivado: Boolean = false,
) {
    companion object {
        fun de(c: CampeonatoCad) = FormCampeonato(c.name, c.season.orEmpty(), c.format.orEmpty(), c.inicio?.take(10), c.fim?.take(10), c.arquivado == true)
        fun novo(ano: String) = FormCampeonato(temporada = ano)
    }
}

fun erroCampeonato(f: FormCampeonato): String? = if (f.nome.isBlank()) MSG_NOME_CAMPEONATO else null

/** POST/PUT SEMPRE com o objeto completo (o PUT do servidor zera o que faltar). */
fun corpoCampeonato(f: FormCampeonato, clubeId: String): JsonObject = buildJsonObject {
    put("club_id", clubeId)
    put("name", f.nome.trim())
    put("season", texto(f.temporada))
    put("format", texto(f.formato))
    put("start_date", texto(f.inicio))
    put("end_date", texto(f.fim))
    put("is_archived", f.arquivado)
}

/** "Pontos corridos · 01/03/2026 – 30/11/2026". */
fun detalheCampeonato(c: CampeonatoCad): String {
    fun br(d: String?) = d?.take(10)?.split('-')?.takeIf { it.size == 3 }?.let { "${it[2]}/${it[1]}/${it[0]}" }
    val datas = listOfNotNull(br(c.inicio), br(c.fim)).joinToString(" – ")
    return listOfNotNull(c.format?.takeIf { it.isNotBlank() }, datas.takeIf { it.isNotEmpty() }).joinToString(" · ")
}

fun textoRemoverCampeonato(nome: String) = "Remover $nome? Os jogos vinculados ficarão sem campeonato (não serão apagados)."

// ---------- Categorias ----------

val FAIXAS_ETARIAS = listOf("Sub-6", "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12", "Sub-13", "Sub-14", "Sub-15", "Sub-17", "Sub-20", "Profissional", "Master")
const val MSG_NOME_CATEGORIA = "Informe um nome"
const val MSG_LIMITE_CATEGORIAS = "Não é possível adicionar mais categorias neste clube agora. Fale com o responsável pela equipe."

fun corpoCategoria(clubeId: String, nome: String, faixa: String, ordem: Int?, notas: String): JsonObject = buildJsonObject {
    put("club_id", clubeId)
    put("name", nome.trim())
    put("age_group", texto(faixa))
    put("display_order", ordem?.let { JsonPrimitive(it) } ?: JsonNull)
    put("notes", texto(notas))
}

fun textoRemoverCategoria(c: CategoriaCadastro): String {
    val n = c.atletas ?: 0
    return "Remover ${c.name}?" + if (n > 0) " Os $n atletas vinculados ficarão sem categoria." else ""
}

// ---------- Clubes ----------

@Serializable
data class ClubeCad(
    val id: String,
    val name: String = "",
    val description: String? = null,
    val modality: String? = null,
    @SerialName("archived_at") val arquivadoEm: String? = null,
    @SerialName("workspace_id") val workspaceId: String? = null,
    @SerialName("is_owner") val ehDono: Boolean? = null,
) {
    val arquivado: Boolean get() = arquivadoEm != null
}

@Serializable
data class LimiteClubes(
    @Serializable(with = IntFlex::class) val limit: Int? = null,
    @Serializable(with = IntFlex::class) val current: Int? = null,
    @SerialName("plan_limit") @Serializable(with = IntFlex::class) val doPacote: Int? = null,
    @SerialName("extra_slots") @Serializable(with = IntFlex::class) val extras: Int? = null,
    @SerialName("can_create") val podeCriar: Boolean? = null,
)

val MODALIDADES = listOf("football_11" to "Futebol 11", "football_7" to "Futebol 7", "futsal" to "Futsal")

/** Sem preço (Apple 3.1.3). -1 = sem limite. */
fun textoLimiteClubes(l: LimiteClubes?, ativos: Int): String {
    val lim = l?.limit
    val atual = l?.current ?: ativos
    if (lim == null || lim < 0) return "$atual ${if (atual == 1) "clube ativo" else "clubes ativos"} · sem limite nesta conta"
    return "Clubes ativos: $atual de $lim · clubes arquivados não contam."
}

fun podeCriarClube(l: LimiteClubes?, ativos: Int): Boolean {
    val lim = l?.limit ?: return true
    return lim < 0 || (l.current ?: ativos) < lim
}

const val MSG_NOME_CLUBE = "Informe o nome do clube"
const val MSG_LIMITE_CLUBES = "O limite de clubes ativos foi atingido. Arquive um clube ativo para liberar a vaga."
const val AVISO_MODALIDADE = "Trocar a modalidade apaga a posição de todos os atletas do clube (as posições mudam entre futebol e futsal)."

fun corpoClube(nome: String, modalidade: String, descricao: String): JsonObject = buildJsonObject {
    put("name", nome.trim())
    put("modality", modalidade)
    put("description", texto(descricao))
}

fun textoArquivarClube(nome: String) = "Arquivar \"$nome\"?\n\nO clube fica guardado em só leitura: o histórico de treinos, jogos e atletas e os relatórios continuam disponíveis, mas não dá para editar. Ele sai do seletor de clube e deixa de contar no limite de clubes ativos."
fun textoDesarquivarClube(nome: String) = "Desarquivar \"$nome\"?\n\nEle volta a ser um clube ativo (editável) e passa a contar no limite de clubes ativos."
fun textoRemoverClube(nome: String, ativo: Boolean) =
    "Remover $nome? Esta ação remove permanentemente atletas, treinos e estatísticas do clube. Não pode ser desfeita." +
        if (ativo) " Para guardar o histórico, prefira Arquivar." else ""

// ---------- Conteúdos e submomentos ----------

@Serializable
data class ConteudoCad(
    val id: String,
    val name: String = "",
    val abbreviation: String? = null,
    val description: String? = null,
    val dimension: String? = null,
    val active: Boolean? = true,
    @SerialName("workspace_id") val workspaceId: String? = null,
) {
    /** "Próprio" = da conta (workspace_id), não tenant_id (o web erra aqui). */
    val proprio: Boolean get() = workspaceId != null
    val ativo: Boolean get() = active != false
}

@Serializable
data class SubmomentoCad(
    val id: String,
    val name: String = "",
    val description: String? = null,
    @SerialName("content_id") val conteudoId: String? = null,
    @SerialName("content_name") val conteudoNome: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("display_order") val ordem: Int? = null,
    val active: Boolean? = true,
    @SerialName("workspace_id") val workspaceId: String? = null,
) {
    val proprio: Boolean get() = workspaceId != null
    val ativo: Boolean get() = active != false
}

data class PilarCad(val id: String, val rotulo: String, val corHex: String, val descricao: String)

val PILARES_CADASTRO = listOf(
    PilarCad("tatico", "Tático", "#3b82f6", "Momentos do jogo: OO, OD, transições, bola parada"),
    PilarCad("fisico", "Físico", "#f59e0b", "Capacidades físicas: aeróbio, anaeróbio, força"),
    PilarCad("tecnico", "Técnico", "#a855f7", "Gestos técnicos: passe, recepção, drible, finalização"),
    PilarCad("mental", "Mental", "#10b981", "Aspectos psicossociais e atividades recreativas"),
)

const val MSG_NOME_CONTEUDO = "Informe o nome"

/** Conteúdos do pilar (busca sem acento), por nome. */
fun conteudosDoPilarCad(lista: List<ConteudoCad>, pilar: String, busca: String = "", submomentos: List<SubmomentoCad> = emptyList()): List<ConteudoCad> {
    val q = dobrar(busca.trim())
    return lista.filter { c ->
        c.dimension == pilar && (q.isEmpty() || dobrar(c.name).contains(q) ||
            submomentos.any { it.conteudoId == c.id && dobrar(it.name).contains(q) })
    }.sortedWith { a, b -> compararNome(a.name, b.name) }
}

fun submomentosDe(lista: List<SubmomentoCad>, conteudoId: String): List<SubmomentoCad> =
    lista.filter { it.conteudoId == conteudoId }.sortedWith(compareBy<SubmomentoCad> { it.ordem ?: 999 }.thenComparator { a, b -> compararNome(a.name, b.name) })

fun corpoConteudo(nome: String, abrev: String, descricao: String, pilar: String): JsonObject = buildJsonObject {
    put("name", nome.trim())
    put("abbreviation", texto(abrev))
    put("description", texto(descricao))
    put("dimension", pilar)
}

fun corpoSubmomento(conteudoId: String, nome: String, descricao: String, ordem: Int?): JsonObject = buildJsonObject {
    put("content_id", conteudoId)
    put("name", nome.trim())
    put("description", texto(descricao))
    put("display_order", ordem?.let { JsonPrimitive(it) } ?: JsonNull)
}

fun textoRemoverConteudo(nome: String) = "Remover $nome? Os submomentos personalizados dele também serão removidos."
fun textoRemoverSubmomento(nome: String) = "Remover $nome? Atividades que o usavam perdem a ligação (o resto fica intacto)."

// ---------- Atividades (biblioteca de títulos) ----------

@Serializable
data class AtividadeCad(
    val id: String,
    val title: String = "",
    @SerialName("content_id") val conteudoId: String? = null,
    @SerialName("content_name") val conteudoNome: String? = null,
    val description: String? = null,
    @SerialName("is_archived") val arquivada: Boolean? = false,
) {
    val arquivadaB: Boolean get() = arquivada == true
}

fun filtrarAtividades(lista: List<AtividadeCad>, busca: String, conteudoId: String?, mostrarArquivadas: Boolean): List<AtividadeCad> {
    val q = dobrar(busca.trim())
    return lista.filter { a ->
        (mostrarArquivadas || !a.arquivadaB) && (conteudoId == null || a.conteudoId == conteudoId) &&
            (q.isEmpty() || dobrar(a.title).contains(q))
    }.sortedWith { a, b -> compararNome(a.title, b.title) }
}

fun erroAtividade(pilar: String?, conteudoId: String?, nome: String): String? = when {
    pilar == null -> "Selecione o pilar."
    conteudoId == null -> "Selecione o conteúdo."
    nome.isBlank() -> "Informe o nome da atividade."
    else -> null
}

fun corpoAtividade(nome: String, conteudoId: String, descricao: String): JsonObject = buildJsonObject {
    put("title", nome.trim())
    put("content_id", conteudoId)
    put("description", texto(descricao))
}

fun textoUsoAtividade(usos: Int, arquivar: Boolean): String {
    val base = "Esta atividade foi utilizada em ${usos} treino(s)."
    if (usos <= 0) return base
    return "$base\n\n" + if (arquivar)
        "Esta atividade já foi usada em treinos. Ao arquivá-la, ela não aparecerá mais para seleção em novos treinos, mas os treinos antigos continuarão mostrando o nome original."
    else "Esta atividade já foi usada em treinos. Ao editá-la, o novo nome/descrição será mostrado em TODOS os treinos que usaram esta atividade, incluindo os antigos."
}

fun rodapeAtividades(ativas: Int, arquivadas: Int, mostrar: Boolean) =
    "Mostrando $ativas atividade(s) ativa(s)" + if (mostrar && arquivadas > 0) " e $arquivadas arquivada(s)" else ""

// ---------- Relatório do clube ----------

fun corpoRelatorioClube(clubeId: String, ano: String): Map<String, JsonElement> = mapOf(
    "club_id" to JsonPrimitive(clubeId), "start_date" to JsonPrimitive("$ano-01-01"),
    "end_date" to JsonPrimitive("$ano-12-31"), "period_label" to JsonPrimitive(ano),
)

fun nomePdfRelatorioClube(clube: String, ano: String) =
    "Relatorio_${com.faggin.tactiplan.app.dados.treino.nomeArquivoSeguro(clube)}_$ano.pdf"

// ---------- erros ----------

const val MSG_SEM_PERMISSAO_CADASTRO = "Você não tem permissão para mudar este cadastro neste clube. Peça ao responsável pelo clube para liberar em Staff."

/** 402 de limite → frase neutra; 403 → aviso amigável; o resto como no treino. */
fun mensagemErroCadastro(e: Throwable, limite: String? = null): String {
    val erro = e as? ErroApi ?: return mensagemErroTreino(e)
    return when {
        erro.status == 402 && !ehSomenteLeitura(e) && erro.codigo != "PLAN_REQUIRED" -> limite ?: MSG_LIMITE_CLUBES
        erro.status == 402 && erro.codigo == "PLAN_REQUIRED" && limite != null -> limite
        erro.status == 403 && !ehSomenteLeitura(e) -> MSG_SEM_PERMISSAO_CADASTRO
        else -> mensagemErroTreino(e, MSG_SEM_PERMISSAO_CADASTRO)
    }
}

// ---------- API ----------

object CaminhosCadastros {
    fun campeonatos(clube: String) = "/competitions?clubId=${codificarComponente(clube)}&includeArchived=true"
    const val novoCampeonato = "/competitions"
    fun campeonato(id: String) = "/competitions/${codificarComponente(id)}"
    fun categorias(clube: String) = "/categories?clubId=${codificarComponente(clube)}"
    const val novaCategoria = "/categories"
    fun categoria(id: String) = "/categories/${codificarComponente(id)}"
    const val clubes = "/clubs"
    const val limiteClubes = "/clubs/limit"
    fun clube(id: String) = "/clubs/${codificarComponente(id)}"
    fun arquivarClube(id: String) = "/clubs/${codificarComponente(id)}/archive"
    fun desarquivarClube(id: String) = "/clubs/${codificarComponente(id)}/unarchive"
    const val conteudos = "/contents"
    fun conteudo(id: String) = "/contents/${codificarComponente(id)}"
    fun conteudoAtivo(id: String) = "/contents/${codificarComponente(id)}/active"
    fun submomentos(modalidade: String?) = if (modalidade.isNullOrEmpty()) "/stages" else "/stages?modality=${codificarComponente(modalidade)}"
    const val novoSubmomento = "/stages"
    fun submomento(id: String) = "/stages/${codificarComponente(id)}"
    fun submomentoAtivo(id: String) = "/stages/${codificarComponente(id)}/active"
    const val atividades = "/titles/with-content?includeArchived=true"
    const val novaAtividade = "/titles"
    fun atividade(id: String) = "/titles/${codificarComponente(id)}"
    fun usoAtividade(id: String) = "/titles/${codificarComponente(id)}/usage-count"
    fun arquivarAtividade(id: String) = "/titles/${codificarComponente(id)}/archive"
    fun desarquivarAtividade(id: String) = "/titles/${codificarComponente(id)}/unarchive"
}

interface ApiCadastros {
    suspend fun campeonatos(clubeId: String): List<CampeonatoCad>
    suspend fun salvarCampeonato(id: String?, corpo: JsonObject)
    suspend fun removerCampeonato(id: String)
    suspend fun categorias(clubeId: String): List<CategoriaCadastro>
    suspend fun salvarCategoria(id: String?, corpo: JsonObject)
    suspend fun removerCategoria(id: String)
    suspend fun clubes(): List<ClubeCad>
    suspend fun limiteClubes(): LimiteClubes
    suspend fun salvarClube(id: String?, corpo: JsonObject)
    suspend fun arquivarClube(id: String, arquivar: Boolean)
    suspend fun removerClube(id: String)
    suspend fun conteudos(): List<ConteudoCad>
    suspend fun salvarConteudo(id: String?, corpo: JsonObject)
    suspend fun ativarConteudo(id: String, ativo: Boolean)
    suspend fun removerConteudo(id: String)
    suspend fun submomentos(modalidade: String?): List<SubmomentoCad>
    suspend fun salvarSubmomento(id: String?, corpo: JsonObject)
    suspend fun ativarSubmomento(id: String, ativo: Boolean)
    suspend fun removerSubmomento(id: String)
    suspend fun atividades(): List<AtividadeCad>
    suspend fun salvarAtividade(id: String?, corpo: JsonObject)
    suspend fun usoAtividade(id: String): Int
    suspend fun arquivarAtividade(id: String, arquivar: Boolean)
}

class ApiCadastrosHttp(private val api: Api, private val token: String, private val workspaceId: String) : ApiCadastros {
    private val json = JsonApp
    private suspend fun j(c: String, m: String = "GET", corpo: JsonElement? = null): JsonElement =
        api.chamarJson(c, m, corpo, token, mapOf("X-Workspace-Id" to workspaceId))
    private fun <T> lista(s: kotlinx.serialization.KSerializer<T>, e: JsonElement): List<T> =
        json.decodeFromJsonElement(ListSerializer(s), listaOuData(e))
    private suspend fun salvar(novo: String, um: (String) -> String, id: String?, corpo: JsonObject) {
        if (id == null) j(novo, "POST", corpo) else j(um(id), "PUT", corpo)
    }

    override suspend fun campeonatos(clubeId: String) = lista(CampeonatoCad.serializer(), j(CaminhosCadastros.campeonatos(clubeId)))
    override suspend fun salvarCampeonato(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.novoCampeonato, CaminhosCadastros::campeonato, id, corpo)
    override suspend fun removerCampeonato(id: String) { j(CaminhosCadastros.campeonato(id), "DELETE") }
    override suspend fun categorias(clubeId: String) = lista(CategoriaCadastro.serializer(), j(CaminhosCadastros.categorias(clubeId)))
    override suspend fun salvarCategoria(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.novaCategoria, CaminhosCadastros::categoria, id, corpo)
    override suspend fun removerCategoria(id: String) { j(CaminhosCadastros.categoria(id), "DELETE") }
    override suspend fun clubes() = lista(ClubeCad.serializer(), j(CaminhosCadastros.clubes))
    override suspend fun limiteClubes() = json.decodeFromJsonElement(LimiteClubes.serializer(), j(CaminhosCadastros.limiteClubes))
    override suspend fun salvarClube(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.clubes, CaminhosCadastros::clube, id, corpo)
    override suspend fun arquivarClube(id: String, arquivar: Boolean) {
        j(if (arquivar) CaminhosCadastros.arquivarClube(id) else CaminhosCadastros.desarquivarClube(id), "POST")
    }
    override suspend fun removerClube(id: String) { j(CaminhosCadastros.clube(id), "DELETE") }
    override suspend fun conteudos() = lista(ConteudoCad.serializer(), j(CaminhosCadastros.conteudos))
    override suspend fun salvarConteudo(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.conteudos, CaminhosCadastros::conteudo, id, corpo)
    override suspend fun ativarConteudo(id: String, ativo: Boolean) {
        j(CaminhosCadastros.conteudoAtivo(id), "PATCH", buildJsonObject { put("active", ativo) })
    }
    override suspend fun removerConteudo(id: String) { j(CaminhosCadastros.conteudo(id), "DELETE") }
    override suspend fun submomentos(modalidade: String?) = lista(SubmomentoCad.serializer(), j(CaminhosCadastros.submomentos(modalidade)))
    override suspend fun salvarSubmomento(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.novoSubmomento, CaminhosCadastros::submomento, id, corpo)
    override suspend fun ativarSubmomento(id: String, ativo: Boolean) {
        j(CaminhosCadastros.submomentoAtivo(id), "PATCH", buildJsonObject { put("active", ativo) })
    }
    override suspend fun removerSubmomento(id: String) { j(CaminhosCadastros.submomento(id), "DELETE") }
    override suspend fun atividades() = lista(AtividadeCad.serializer(), j(CaminhosCadastros.atividades))
    override suspend fun salvarAtividade(id: String?, corpo: JsonObject) = salvar(CaminhosCadastros.novaAtividade, CaminhosCadastros::atividade, id, corpo)
    override suspend fun usoAtividade(id: String): Int =
        ((j(CaminhosCadastros.usoAtividade(id)) as? JsonObject)?.get("count") as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt() ?: 0
    override suspend fun arquivarAtividade(id: String, arquivar: Boolean) {
        j(if (arquivar) CaminhosCadastros.arquivarAtividade(id) else CaminhosCadastros.desarquivarAtividade(id), "PUT")
    }
}
